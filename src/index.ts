import dotenv from "dotenv";
import NostrBot from "./Nostr.js";
import cron from "node-cron";
import { format } from "date-fns";
import { relays } from "./relays.js";
import { currUnixtime } from "./utils.js";
import { relayInit } from "nostr-tools";
import "websocket-polyfill";
import { startOfMinute, subMinutes, getUnixTime } from "date-fns";

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
  console.log(key, data);
  const now = subMinutes(startOfMinute(new Date()), 1);
  const formattedNow = format(now, "yyyyMMddHHmm");
  const db = await nostr.nip78get(
    `nostr-arrival-rate_${key}`,
    `nostr-arrival-rate_${key}`
  );
  const datas = db ? db.tags.slice(3) : [];
  const records = [...datas, [formattedNow, data.toString()]].slice(-1440);
  console.log("records", records);
  nostr.nip78post(
    `nostr-arrival-rate_${key}`,
    `nostr-arrival-rate_${key}`,
    "流速検出 realtime",
    records
  );
  const formattedDate = format(now, "yyyyMMdd");
  const db_day = await nostr.nip78get(
    `nostr-arrival-rate_${key}_${formattedDate}`,
    `nostr-arrival-rate_${key}_${formattedDate}`
  );
  const datas_day = db_day ? db_day.tags.slice(3) : [];
  const records_day = [...datas_day, [formattedNow, data.toString()]];
  console.log("records_day", records_day);
  nostr.nip78post(
    `nostr-arrival-rate_${key}_${formattedDate}`,
    `nostr-arrival-rate_${key}_${formattedDate}`,
    "流速検出 " + formattedDate,
    records_day
  );
};

dotenv.config();
const { HEX, RELAY } = process.env;

const nostr = new NostrBot();
nostr.init([{ kinds: [], since: currUnixtime() }]);

cron.schedule("* * * * *", async () => {
  relays.forEach((relay) => submitNostrStorage(relay.key, relay.url));
});
cron.schedule("*/10 * * * *", async () => {
  try {
    const from = subMinutes(startOfMinute(new Date()), 10);
    const to = startOfMinute(new Date());
    const todayText = format(from, "yyyy/MM/dd");
    const fromText = format(from, "HH:mm");
    const toText = format(to, "HH:mm");
    let text = `■ 流速計測\n`;
    text += `  ${todayText} ${fromText}～${toText}\n\n`;
    for (const relay of relays) {
      const count = await getCount(relay.url, 10);
      const forText = count ? `${count} posts` : "欠測";
      text += `${relay.name}: ${forText} \n`;
    }
    text += `\n■ 野洲田川定点観測所\n`;
    text += `  https://nostr-hotter-site.vercel.app`;
    nostr.send(text);
  } catch (e) {
    console.log(e);
  }
});
