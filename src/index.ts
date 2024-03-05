import dotenv from "dotenv";
import { nip78get, nip78post, send, Count, count } from "./Nostr.js";
import cron from "node-cron";
import { format, startOfMinute, subMinutes, getUnixTime } from "date-fns";
import { relays } from "./relays.js";
import type { Relays } from "./relays.js";
import axios from "axios";
import chartPkg, { ChartItem } from "chart.js";
import { createCanvas, registerFont } from "canvas";
import { writeFileSync } from "fs";
import { logger } from "./log.js";

const { Chart } = chartPkg;

const MODE_DEV = process.argv.includes("--dev");
// const MIGRATE = process.argv.includes("--migrate");

dotenv.config();
const { IMGUR_CLIENT_ID } = process.env;
registerFont("./font.ttf", { family: "CustomFont" });

const updateChart = async (
  tableName: string,
  time: number,
  count: number,
): Promise<string[][]> => {
  const chartData = await nip78get(tableName);
  const datas = chartData ? JSON.parse(chartData) : { time: [], data: [] };
  const records = {
    time: [[...datas.time, time].slice(144)],
    data: [[...datas.data, count].slice(144)],
  };
  nip78post(tableName, JSON.stringify(records));
  logger("INFO", "Count Complete.");
  return;
};

const generateGraph = async (
  labels: string[],
  values: number[],
  title: string,
) => {
  const canvas = createCanvas(1200, labels.length * 72 + 100);
  const ctx: unknown = canvas.getContext("2d");

  const chart = new Chart(ctx as ChartItem, {
    type: "bar",
    data: {
      labels: labels,
      // datasets: values,
      datasets: [
        {
          label: "",
          data: values,
          backgroundColor: "#58B2DC",
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      font: {
        family: "CustomFont",
        size: 32,
      },
      plugins: {
        title: {
          display: true,
          text: title,
          font: {
            family: "CustomFont",
            size: 32,
          },
        },
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          title: {
            display: false,
            text: "流速 (posts / 10min)",
            font: {
              family: "CustomFont",
              size: 32,
            },
          },
          ticks: {
            font: {
              family: "CustomFont",
              size: 32,
            },
            padding: 40,
          },
        },
      },
    },
    plugins: [
      {
        id: "customCanvasBackgroundColor",
        beforeDraw: (chart, args, options) => {
          const { ctx } = chart;
          ctx.save();
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        },
      },
    ],
  });

  const image = canvas.toBuffer();
  writeFileSync("./chart.png", image);
  const imageBase64 = image.toString("base64");
  chart.destroy();

  // CLIENT_IDなければ画像URLなし
  if (!IMGUR_CLIENT_ID) return "";

  try {
    // POST to Imgur
    const response = await axios.post(
      "https://api.imgur.com/3/image",
      { image: imageBase64 },
      { headers: { Authorization: `Client-ID ${IMGUR_CLIENT_ID}` } },
    );
    return response.data.data.link;
  } catch (err) {
    logger("ERROR", err);
    return "";
  }
};

const getPostData = async (relayOfCount: Count, selectedRelays: Relays) => {
  const graph = {
    labels: [] as string[],
    counts: [] as number[],
  };
  const relayUrls: string[] = [];
  for (const relay of selectedRelays) relayUrls.push(relay.url);
  let text = "";
  selectedRelays.map((relay) => {
    const count = relayOfCount[relay.url];
    const forText = count !== null ? `${count} posts` : "欠測";
    text += `${relay.name}: ${forText} \n`;
    graph.labels.push(relay.name);
    graph.counts.push(count ?? NaN);
  });
  return { text, graph };
};

const postIntervalSpeed = async (now: Date, relayOfCount: Count) => {
  try {
    const from = subMinutes(startOfMinute(now), 10);
    const to = startOfMinute(now);
    const todayText = format(from, "yyyy/MM/dd");
    const fromText = format(from, "HH:mm");
    const toText = format(to, "HH:mm");
    let text = "■ 流速計測\n";
    text += `  ${todayText} ${fromText}～${toText}\n\n`;
    const jp = await getPostData(
      relayOfCount,
      relays.filter((relay) => relay.target === "jp"),
    );
    const global = await getPostData(
      relayOfCount,
      relays.filter((relay) => relay.target === "all"),
    );
    text += "[JP リレー]\n";
    text += jp.text;
    text += "\n[GLOBAL リレー]\n";
    text += global.text;
    text += "\n■ 野洲田川定点観測所\n";
    text += "  https://nostr-hotter-site.vercel.app\n\n";
    text += await generateGraph(
      jp.graph.labels,
      jp.graph.counts,
      `流速計測 ${todayText} ${fromText}～${toText}`,
    );
    text += "\n";
    text += await generateGraph(
      global.graph.labels,
      global.graph.counts,
      `流速計測 ${todayText} ${fromText}～${toText}`,
    );
    console.log(text);
    send(text);
  } catch (e) {
    logger("ERORR", e);
  }
};

const postSystemUp = async () => {
  try {
    const now = startOfMinute(new Date());
    const nowText = format(now, "yyyy/MM/dd HH:mm");
    let text = "再起動しました\n";
    text += `  ${nowText}\n`;
    text += "■ 野洲田川定点観測所\n";
    text += "  https://nostr-hotter-site.vercel.app\n\n";
    send(text);
  } catch (e) {
    logger("ERORR", e);
  }
};

cron.schedule("*/10 * * * *", async () => {
  const countOfRelays = await count(
    relays.map((relay) => relay.url),
    [1],
    new Date(),
    10,
  );
  await postIntervalSpeed(new Date(), countOfRelays);
});

cron.schedule("46 5 * * *", async () => {
  if (MODE_DEV) return;
  logger("INFO", "RESTART");
  process.exit();
});
