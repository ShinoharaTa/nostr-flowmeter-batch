import { nip78get, nip78post, send, type Count, count, subscribe, countPosts, RELAYS, setSuppressPost, countByKind, type CountByKind } from "./Nostr.js";
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

const getPostData = async (relayOfCount: CountByKind, selectedRelays: Relays) => {
  const graph = {
    labels: [] as string[],
    counts: [] as number[],
  };
  let text = "";
  selectedRelays.map((relay) => {
    const count = relayOfCount[relay.url];
    if (count) {
      const postsText = `${count.posts} posts`;
      const repostsText = `${count.reposts} reposts`;
      const favsText = `${count.favs} favs`;
      text += `${relay.name}: ${postsText}, ${repostsText}, ${favsText} \n`;
      graph.counts.push(count.posts); // グラフは投稿数のみ
    } else {
      text += `${relay.name}: 欠測 \n`;
      graph.counts.push(0);
    }
    graph.labels.push(relay.name);
  });
  return { text, graph };
};

const postIntervalSpeed = async (now: Date, relayOfCount: CountByKind) => {
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
  const countOfRelays = await countByKind(
    relays.map((relay) => relay.url),
    new Date(),
    10,
  );
  await postIntervalSpeed(new Date(), countOfRelays);
  // チャート用は投稿数のみ
  const countForChart: Count = {};
  for (const relay of relays) {
    countForChart[relay.url] = countOfRelays[relay.url]?.posts || 0;
  }
  await updateChart("nostr_river_flowmeter", nowIsoFormat, countForChart);
  const date = format(now, "yyyyMMdd");
  await updateChart(
    `nostr_river_flowmeter_${date}`,
    nowIsoFormat,
    countForChart,
  );
});

cron.schedule("46 5 * * *", async () => {
  if (MODE_DEV) return;
  logger("INFO", "RESTART");
  process.exit();
});

postSystemUp();

subscribe().catch(console.error);

// テスト用（一時的に追加）
if (process.argv.includes('--test')) {
  setSuppressPost(true);
  (async () => {
    const now = startOfMinute(new Date());
    const countOfRelays = await countByKind(
      relays.map((relay) => relay.url),
      new Date(),
      10,
    );
    await postIntervalSpeed(now, countOfRelays);
    process.exit(0);
  })();
}
