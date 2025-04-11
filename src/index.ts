import { nip78get, nip78post, send, type Count, count, subscribe } from "./Nostr.js";
import { appendWithLimit } from "./utils.js";
import cron from "node-cron";
import { format, startOfMinute, subMinutes, getUnixTime } from "date-fns";
import { relays } from "./relays.js";
import type { Relays } from "./relays.js";
import { logger } from "./log.js";

const MODE_DEV = process.argv.includes("--dev");

const updateChart = async (
  tableName: string,
  time: number,
  countOfRelays: Count,
): Promise<string[][]> => {
  try {
    const getChartData = await nip78get(tableName);
    const chartData = getChartData
      ? JSON.parse(getChartData)
      : { axis: [], datas: {} };
    const records = {
      axis: chartData.axis,
      datas: chartData.datas,
    };
    for (const relay of relays) {
      if (relay.key in records.datas) {
        records.datas[relay.key] = appendWithLimit(
          records.datas[relay.key],
          countOfRelays[relay.url],
          144,
        );
      } else {
        records.datas[relay.key] = [];
        records.datas[relay.key].push(countOfRelays[relay.url]);
      }
    }
    records.axis = appendWithLimit(records.axis, time, 144);
    nip78post(tableName, JSON.stringify(records));
    console.log(records);
    logger("INFO", "Count Complete.");
  } catch (e) {
    console.log(e);
  }
  return;
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
    graph.counts.push(count);
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
    // text += await generateGraph(
    //   jp.graph.labels,
    //   jp.graph.counts,
    //   `流速計測 ${todayText} ${fromText}～${toText}`,
    // );
    // text += "\n";
    // text += await generateGraph(
    //   global.graph.labels,
    //   global.graph.counts,
    //   `流速計測 ${todayText} ${fromText}～${toText}`,
    // );
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
  const now = startOfMinute(new Date());
  const nowIsoFormat = getUnixTime(now);
  const countOfRelays = await count(
    relays.map((relay) => relay.url),
    [1],
    new Date(),
    10,
  );
  await postIntervalSpeed(new Date(), countOfRelays);
  await updateChart("nostr_river_flowmeter", nowIsoFormat, countOfRelays);
  const date = format(now, "yyyyMMdd");
  await updateChart(
    `nostr_river_flowmeter_${date}`,
    nowIsoFormat,
    countOfRelays,
  );
});

cron.schedule("46 5 * * *", async () => {
  if (MODE_DEV) return;
  logger("INFO", "RESTART");
  process.exit();
});

postSystemUp();

subscribe().catch(console.error);
