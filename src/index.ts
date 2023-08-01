import dotenv from "dotenv";
import NostrBot from "./Nostr.js";
import cron from "node-cron";
import Hotter from "./hotter.js";
import { format } from "date-fns";
import { relays } from "./relays.js";
import { currUnixtime } from "./utils.js";

dotenv.config();
const { HEX, RELAY } = process.env;

const nostr = new NostrBot();
nostr.init([{ kinds: [], since: currUnixtime() }]);

console.log("connected to relay");

// 全リレー初期化
relays.forEach((item) => {
  item.class = new Hotter(item.url);
  item.class.watch();
});

cron.schedule("* * * * *", async () => {
  try {
    for (let i in relays) {
      const relay = relays[i];
      const count = relay.class.getCount();
      console.log(relay.key, count);
      relay.class.clearCount();
      let now = new Date();
      now.setTime(now.getTime() - 60000);
      const formattedNow = format(now, "yyyyMMddHHmm");
      const db = await nostr.nip78get(
        `nostr-arrival-rate_${relay.key}`,
        `nostr-arrival-rate_${relay.key}`
      );
      const datas = db ? db.tags.slice(3) : [];
      const records = [...datas, [formattedNow, count.toString()]].slice(-1440);
      console.log("records", records);
      nostr.nip78post(
        `nostr-arrival-rate_${relay.key}`,
        `nostr-arrival-rate_${relay.key}`,
        "流速検出 realtime",
        records
      );
      const formattedDate = format(now, "yyyyMMdd");
      const db_day = await nostr.nip78get(
        `nostr-arrival-rate_${relay.key}_${formattedDate}`,
        `nostr-arrival-rate_${relay.key}_${formattedDate}`
      );
      const datas_day = db_day ? db_day.tags.slice(3) : [];
      const records_day = [...datas_day, [formattedNow, count.toString()]];
      console.log("records_day", records_day);
      nostr.nip78post(
        `nostr-arrival-rate_${relay.key}_${formattedDate}`,
        `nostr-arrival-rate_${relay.key}_${formattedDate}`,
        "流速検出 " + formattedDate,
        records_day
      );
    }
  } catch (e) {
    console.log(e);
  }
});
cron.schedule("*/10 * * * *", () => {
  try {
    let from = new Date();
    let to = new Date();
    from.setTime(from.getTime() - 600000);
    const fromText = format(from, "yyyy/MM/dd HH:mm");
    const toText = format(to, "yyyy/MM/dd HH:mm");
    let text = `【テスト】\n流速検出: ${fromText} ～ ${toText}\n`;
    text += `　※posts/10min\n\n`;
    relays.forEach((item) => {
      const count = item.class.get10Count();
      text += `${item.name}：${count} posts\n`;
      item.class.clear10Count();
    });
    nostr.send(text);
  } catch (e) {
    console.log(e);
  }
});
