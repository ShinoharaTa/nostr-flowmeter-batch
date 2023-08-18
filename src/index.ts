import dotenv from "dotenv";
import { nip78get, nip78post, send } from "./Nostr.js";
import cron from "node-cron";
import {
  format,
  startOfMinute,
  subMinutes,
  getUnixTime,
  fromUnixTime,
} from "date-fns";
import { relays } from "./relays.js";
import type { Relays } from "./relays.js";
import { relayInit } from "nostr-tools";
import "websocket-polyfill";
import axios from "axios";
import chartPkg from "chart.js";
import { createCanvas, registerFont } from "canvas";
import { writeFileSync } from "fs";
import { eventKind, NostrFetcher } from "nostr-fetch";

const { Chart } = chartPkg;

const MODE_DEV = process.argv.includes("--dev");
const MIGRATE = process.argv.includes("--migrate");

dotenv.config();
const { IMGUR_CLIENT_ID } = process.env;
registerFont("./font.ttf", { family: "CustomFont" });

interface count {
  [key: string]: number;
}

const getCount = async (url: string, span: number): Promise<count | null> => {
  const now = startOfMinute(new Date());
  const to = getUnixTime(now);
  const from = getUnixTime(subMinutes(now, span));

  try {
    const fetcher = NostrFetcher.init();
    const response: count = {};
    const allPosts = await fetcher.fetchAllEvents(
      [url],
      { kinds: [eventKind.text] },
      { since: from, until: to },
      { sort: true }
    );
    for (const post of allPosts) {
      const key = format(fromUnixTime(post.created_at), "yyyyMMddHHmm");
      response[key] = response[key] ? response[key] + 1 : 1;
    }
    return response;
  } catch (ex) {
    return Promise.resolve(null);
  }
};

function sumValues(obj: count): number {
  let sum = 0;
  for (let key in obj) {
    sum += obj[key];
  }
  return sum;
}

const submitNostrStorage = async (
  key: string,
  url: string
): Promise<string[][]> => {
  const count = await getCount(url, 1);
  const data = count ? sumValues(count) : NaN;
  const now = subMinutes(startOfMinute(new Date()), 1);
  const formattedNow = format(now, "yyyyMMddHHmm");
  const db = await nip78get(
    `nostr-arrival-rate_${key}`,
    `nostr-arrival-rate_${key}`
  );
  const datas = db ? db.tags.slice(3) : [];
  const records = [...datas, [formattedNow, data.toString()]].slice(-1440);
  if (MODE_DEV) return records.slice(-10);
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
  nip78post(
    `nostr-arrival-rate_${key}_${formattedDate}`,
    `nostr-arrival-rate_${key}_${formattedDate}`,
    "流速検出 " + formattedDate,
    records_day
  );
  console.log(`[INFO]: ${now} Count Complete.`);
  return records.slice(-10);
};

const generateGraph = async (
  labels: string[],
  values: number[],
  title: string
) => {
  const canvas = createCanvas(1200, labels.length * 72 + 100);
  const ctx: any = canvas.getContext("2d");

  new Chart(ctx, {
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

const getPostData = async (relays: Relays) => {
  const graph = {
    labels: [] as string[],
    counts: [] as number[],
  };
  const counts = await Promise.all(
    relays.map(async (relay) => {
      const count = await getCount(relay.url, 10);
      return count ? sumValues(count) : null;
    })
  );
  let text = "";
  relays.forEach((relay, index) => {
    const count = counts[index];
    const forText = count !== null ? `${count} posts` : "欠測";
    text += `${relay.name}: ${forText} \n`;
    graph.labels.push(relay.name);
    graph.counts.push(count ?? NaN);
  });
  return { counts, text, graph };
};

const postIntervalSpeed = async () => {
  try {
    const from = subMinutes(startOfMinute(new Date()), 10);
    const to = startOfMinute(new Date());
    const todayText = format(from, "yyyy/MM/dd");
    const fromText = format(from, "HH:mm");
    const toText = format(to, "HH:mm");
    let text = `■ 流速計測\n`;
    text += `  ${todayText} ${fromText}～${toText}\n\n`;
    const jp = await getPostData(
      relays.filter((relay) => relay.target === "jp")
    );
    const global = await getPostData(
      relays.filter((relay) => relay.target === "all")
    );
    text += "[JP リレー]\n";
    text += jp.text;
    text += "\n[GLOBAL リレー]\n";
    text += global.text;
    text += `\n■ 野洲田川定点観測所\n`;
    text += `  https://nostr-hotter-site.vercel.app\n\n`;
    text += await generateGraph(
      jp.graph.labels,
      jp.graph.counts,
      `流速計測 ${todayText} ${fromText}～${toText}`
    );
    text += `\n`;
    text += await generateGraph(
      global.graph.labels,
      global.graph.counts,
      `流速計測 ${todayText} ${fromText}～${toText}`
    );
    if (MODE_DEV) return;
    send(text);
  } catch (e) {
    console.error(e);
  }
};

const postSystemUp = async () => {
  try {
    const now = startOfMinute(new Date());
    const nowText = format(now, "yyyy/MM/dd HH:mm");
    let text = `再起動しました\n`;
    text += `  ${nowText}\n`;
    text += `■ 野洲田川定点観測所\n`;
    text += `  https://nostr-hotter-site.vercel.app\n\n`;
    send(text);
  } catch (e) {
    console.error(e);
  }
};

// テスト処理実行
if (MODE_DEV) {
  // await getCount("wss://r.kojira.io", 1);
} else {
  await postSystemUp();
}

// Schedule Batch
cron.schedule("* * * * *", async () => {
  if (MODE_DEV) return;
  // relays.forEach((relay) => submitNostrStorage(relay.key, relay.url));
  const countData = await Promise.all(
    relays.map(async (relay) => {
      const items = await submitNostrStorage(relay.key, relay.url);
      if (items) {
        const result = items.map((item) => Number(item[1]));
        return result;
      }
      return [null];
    })
  );
  const values: string[][] = [];
  values.push(["updated_at", format(new Date(), "yyyyMMddhhmm")]);
  relays.forEach((relay, index) => {
    const status = {
      status: !!countData[index].slice(-1)[0],
      count: countData[index],
    };
    values.push([relay.key, JSON.stringify(status)]);
  });
  nip78post(
    `relay_health_status`,
    `relay_health_status`,
    "流速検出 realtime",
    values
  );
});
cron.schedule("*/10 * * * *", async () => {
  if (MODE_DEV) return;
  await postIntervalSpeed();
});
cron.schedule("46 5 * * *", async () => {
  if (MODE_DEV) return;
  console.log("restart");
  process.exit();
});
