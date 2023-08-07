import dotenv from "dotenv";
import { nip78get, nip78post, send } from "./Nostr.js";
import cron from "node-cron";
import { format, startOfMinute, subMinutes, getUnixTime } from "date-fns";
import { relays } from "./relays.js";
import { relayInit } from "nostr-tools";
import "websocket-polyfill";
import axios from "axios";
import chartPkg from "chart.js";
import { createCanvas, registerFont } from "canvas";
import { writeFileSync } from "fs";
const { Chart } = chartPkg;

const MODE_DEV = process.argv.includes("--dev");

dotenv.config();
const { IMGUR_CLIENT_ID } = process.env;
registerFont("./font.ttf", { family: "CustomFont" });

const getCount = async (url: string, span: number): Promise<number | null> => {
  const now = startOfMinute(new Date());
  const to = getUnixTime(now);
  const from = getUnixTime(subMinutes(now, span));

  let count: number = 0;
  try {
    const relay = relayInit(url);
    await relay.connect();

    const sub = relay.sub([{ kinds: [1], since: from, until: to }]);
    sub.on("event", () => {
      count++;
    });

    return new Promise((resolve, reject) => {
      sub.on("eose", () => {
        resolve(count);
      });
      relay.on("error", () => {
        resolve(null);
      });
    });
  } catch (ex) {
    return Promise.resolve(null);
  }
};

const submitNostrStorage = async (key: string, url: string) => {
  const data = (await getCount(url, 1)) ?? NaN;
  const now = subMinutes(startOfMinute(new Date()), 1);
  const formattedNow = format(now, "yyyyMMddHHmm");
  console.log(`${key} ${now} : `, data);
  if (MODE_DEV) return;
  const db = await nip78get(
    `nostr-arrival-rate_${key}`,
    `nostr-arrival-rate_${key}`
  );
  const datas = db ? db.tags.slice(3) : [];
  const records = [...datas, [formattedNow, data.toString()]].slice(-1440);
  // console.log("records", records);
  nip78post(
    `nostr-arrival-rate_${key}`,
    `nostr-arrival-rate_${key}`,
    "流速検出 realtime",
    records
  );
  const formattedDate = format(now, "yyyyMMdd");
  const db_day = await nip78get(
    `nostr-arrival-rate_${key}_${formattedDate}`,
    `nostr-arrival-rate_${key}_${formattedDate}`
  );
  const datas_day = db_day ? db_day.tags.slice(3) : [];
  const records_day = [...datas_day, [formattedNow, data.toString()]];
  // console.log("records_day", records_day);
  nip78post(
    `nostr-arrival-rate_${key}_${formattedDate}`,
    `nostr-arrival-rate_${key}_${formattedDate}`,
    "流速検出 " + formattedDate,
    records_day
  );
};

const generateGraph = async (
  labels: string[],
  values: number[],
  title: string
) => {
  const canvas = createCanvas(1200, 600);
  const ctx: any = canvas.getContext("2d");

  new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
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
            display: true,
            text: "流速 (posts / 10min)",
            font: {
              family: "CustomFont",
              size: 32,
            },
          },
          ticks: {
            font: {
              family: "CustomFont",
              size: 48,
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

  // CLIENT_IDなければ画像URLなし
  if (!IMGUR_CLIENT_ID) return "";

  try {
    // POST to Imgur
    const response = await axios.post(
      "https://api.imgur.com/3/image",
      { image: imageBase64 },
      { headers: { Authorization: `Client-ID ${IMGUR_CLIENT_ID}` } }
    );
    return response.data.data.link;
  } catch (err) {
    console.error(err);
    return "";
  }
};

const postIntervalSpeed = async () => {
  try {
    const from = subMinutes(startOfMinute(new Date()), 10);
    const to = startOfMinute(new Date());
    const todayText = format(from, "yyyy/MM/dd");
    const fromText = format(from, "HH:mm");
    const toText = format(to, "HH:mm");
    const graph = {
      labels: [] as string[],
      counts: [] as number[],
    };
    let text = `■ 流速計測\n`;
    text += `  ${todayText} ${fromText}～${toText}\n\n`;
    const counts = await Promise.all(
      relays.map((relay) => getCount(relay.url, 10))
    );
    relays.forEach((relay, index) => {
      const count = counts[index];
      const forText = count ? `${count} posts` : "欠測";
      text += `${relay.name}: ${forText} \n`;
      graph.labels.push(relay.name);
      graph.counts.push(count ?? NaN);
    });
    text += `\n■ 野洲田川定点観測所\n`;
    text += `  https://nostr-hotter-site.vercel.app\n\n`;
    const imageUrl = await generateGraph(
      graph.labels,
      graph.counts,
      `流速計測 ${todayText} ${fromText}～${toText}`
    );
    text += `  ${imageUrl}`;
    console.log(text);
    if (MODE_DEV) return;
    send(text);
  } catch (e) {
    console.log(e);
  }
};

// テスト処理実行
if (MODE_DEV) {
  // send("test message");
  // relays.forEach((relay) => submitNostrStorage(relay.key, relay.url));
}

// Schedule Batch
cron.schedule("* * * * *", async () => {
  if (MODE_DEV) return;
  relays.forEach((relay) => submitNostrStorage(relay.key, relay.url));
});
cron.schedule("*/10 * * * *", async () => {
  if (MODE_DEV) return;
  await postIntervalSpeed();
});
