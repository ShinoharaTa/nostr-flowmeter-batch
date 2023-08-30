import dotenv from "dotenv";
import { nip78get, nip78post, send } from "./Nostr.js";
import cron from "node-cron";
import { format, startOfMinute, subMinutes, getUnixTime } from "date-fns";
import { relays } from "./relays.js";
import type { Relays } from "./relays.js";
import { Kind, relayInit } from "nostr-tools";
import "websocket-polyfill";
import axios from "axios";
import chartPkg from "chart.js";
import { createCanvas, registerFont } from "canvas";
import { writeFileSync } from "fs";
import { eventKind, FetchStats, NostrFetcher } from "nostr-fetch";
import { logger } from "./log.js";

const { Chart } = chartPkg;

const MODE_DEV = process.argv.includes("--dev");
const MIGRATE = process.argv.includes("--migrate");

dotenv.config();
const { IMGUR_CLIENT_ID } = process.env;
registerFont("./font.ttf", { family: "CustomFont" });

interface count {
  [key: string]: number;
}

const getCount = async (
  urls: string[],
  targetKinds: number[],
  span: number
): Promise<count | null> => {
  const now = startOfMinute(new Date());
  const to = getUnixTime(now);
  const from = getUnixTime(subMinutes(now, span));

  // const fetcher = NostrFetcher.init();
  // const response: count = {};
  // let fetchStats: FetchStats | undefined = undefined;

  // await fetcher.fetchAllEvents(
  //   urls,
  //   { kinds: [eventKind.text] },
  //   { since: from, until: to },
  //   {
  //     sort: true,
  //     statsListener: (stats) => {
  //       fetchStats = stats;
  //     },
  //   }
  // );
  // fetcher.shutdown();
  // urls.forEach((url) => {
  //   const relay_url = url.endsWith("/") ? url : url + "/";
  //   const resultStatus = fetchStats.relays[relay_url]?.status === "completed";
  //   response[url] = resultStatus
  //     ? fetchStats.relays[relay_url].numFetchedEvents
  //     : null;
  // });
  const response: count = {};
  const result = await Promise.all(
    urls.map(async (url) => {
      const relay = relayInit(url);
      await relay.connect();
      let event: number = 0;
      const result = await new Promise ((resolve) => {
        try {
          const sub = relay.sub([
            { kinds: targetKinds, since: from, until: to, limit: 10000 },
          ]);
          sub.on("event", () => {
            event++;
          })
          sub.on("eose", () => {
            resolve(true);
          })
        } catch (ex) {
          return Promise.resolve(false);
        }
      })
      return {url: url, count: result ? event : null}
    })
  );
  // console.log(result)
  for(const url of urls) {
    // console.log(url)
    const count = result.find((item) => item.url === url);
    response[url] = count ? count.count : null
  }
  return response;
};

const submitNostrStorage = async (
  key: string,
  count: number
): Promise<string[][]> => {
  const now = subMinutes(startOfMinute(new Date()), 1);
  const formattedNow = format(now, "yyyyMMddHHmm");
  const db = await nip78get(
    `nostr-arrival-rate_${key}`,
    `nostr-arrival-rate_${key}`
  );
  const datas = db ? db.tags.slice(3) : [];
  const records = [...datas, [formattedNow, count.toString()]].slice(-1440);
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
  const records_day = [...datas_day, [formattedNow, count.toString()]];
  nip78post(
    `nostr-arrival-rate_${key}_${formattedDate}`,
    `nostr-arrival-rate_${key}_${formattedDate}`,
    "流速検出 " + formattedDate,
    records_day
  );
  logger("INFO", `Count Complete.`);
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
    logger("ERROR", err);
    return "";
  }
};

const getPostData = async (relays: Relays, span: number) => {
  const graph = {
    labels: [] as string[],
    counts: [] as number[],
  };
  const relayUrls: string[] = [];
  for (const relay of relays) relayUrls.push(relay.url);
  const result = await getCount(relayUrls, [Kind.Text], span);
  let text = "";
  relays.forEach((relay) => {
    const count = result[relay.url];
    const forText = count !== null ? `${count} posts` : "欠測";
    text += `${relay.name}: ${forText} \n`;
    graph.labels.push(relay.name);
    graph.counts.push(count ?? NaN);
  });
  return { text, graph };
};

const postIntervalSpeed = async (span: number) => {
  try {
    const from = subMinutes(startOfMinute(new Date()), 10);
    const to = startOfMinute(new Date());
    const todayText = format(from, "yyyy/MM/dd");
    const fromText = format(from, "HH:mm");
    const toText = format(to, "HH:mm");
    let text = `■ 流速計測\n`;
    text += `  ${todayText} ${fromText}～${toText}\n\n`;
    const jp = await getPostData(
      relays.filter((relay) => relay.target === "jp"),
      span
    );
    const global = await getPostData(
      relays.filter((relay) => relay.target === "all"),
      span
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
    console.log(text);
    if (MODE_DEV) return;
    send(text);
  } catch (e) {
    logger("ERORR", e);
  }
};

const getChannelMessageData = async (relays: Relays, span: number) => {
  const graph = {
    labels: [] as string[],
    counts: [] as number[],
  };
  const relayUrls: string[] = [];
  for (const relay of relays) relayUrls.push(relay.url);
  const result = await getCount(relayUrls, [Kind.ChannelMessage], span);
  let text = "";
  relays.forEach((relay) => {
    const count = result[relay.url];
    const forText = count !== null ? `${count} posts` : "欠測";
    text += `${relay.name}: ${forText} \n`;
    graph.labels.push(relay.name);
    graph.counts.push(count ?? NaN);
  });
  return { text, graph };
};

const channelMessageIntervalSpeed = async (span: number) => {
  try {
    const from = subMinutes(startOfMinute(new Date()), 10);
    const to = startOfMinute(new Date());
    const todayText = format(from, "yyyy/MM/dd");
    const fromText = format(from, "HH:mm");
    const toText = format(to, "HH:mm");
    let text = `■ ぱぶちゃ流速\n`;
    text += `  ${todayText} ${fromText}～${toText}\n\n`;
    const jp = await getChannelMessageData(
      relays.filter((relay) => relay.target === "jp"),
      span
    );
    // const global = await getChannelMessageData(
    //   relays.filter((relay) => relay.target === "all"),
    //   span
    // );
    text += "[JP リレー]\n";
    text += jp.text;
    // text += "\n[GLOBAL リレー]\n";
    // text += global.text;
    // text += `\n■ 野洲田川定点観測所\n`;
    // text += `  https://nostr-hotter-site.vercel.app\n\n`;
    // text += await generateGraph(
    //   jp.graph.labels,
    //   jp.graph.counts,
    //   `流速計測 ${todayText} ${fromText}～${toText}`
    // );
    // text += `\n`;
    // text += await generateGraph(
    //   global.graph.labels,
    //   global.graph.counts,
    //   `流速計測 ${todayText} ${fromText}～${toText}`
    // );
    console.log(text);
    if (MODE_DEV) return;
    send(text);
  } catch (e) {
    logger("ERORR", e);
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
    logger("ERORR", e);
  }
};

// テスト処理実行
if (MODE_DEV) {
  // const result = await getCount("wss://r1234567.kojira.io", 1);
  // const result = await getCount("wss://r.kojira.io", 10);
  // console.log(result);
  // await postIntervalSpeed(10);
  await channelMessageIntervalSpeed(10)
} else {
  await postSystemUp();
}

// Schedule Batch
cron.schedule("* * * * *", async () => {
  if (MODE_DEV) return;
  const relayUrls: string[] = [];
  for (const relay of relays) relayUrls.push(relay.url);
  const result = await getCount(relayUrls, [Kind.Text], 1);
  const countData = await Promise.all(
    relays.map(async (relay) => {
      const count = result[relay.url] ?? NaN;
      const items = await submitNostrStorage(relay.key, count);
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
  await postIntervalSpeed(10);
});
cron.schedule("*/10 * * * *", async () => {
  if (MODE_DEV) return;
  await channelMessageIntervalSpeed(10);
});
// "46 5,11,17,23 * * *"
cron.schedule("46 5 * * *", async () => {
  if (MODE_DEV) return;
  logger("INFO", `RESTART`);
  process.exit();
});
