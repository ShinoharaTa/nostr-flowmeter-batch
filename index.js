import NostrBot from "./Nostr.js";
import dotenv from "dotenv";
import { currUnixtime } from "./utils.js";
import cron from "node-cron";
import admin from "firebase-admin";
import { format } from "date-fns";
import firebaseConfig from "./firebaseConfig.js";

dotenv.config();
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: firebaseConfig.databaseURL,
});

const nostr = new NostrBot();

let count = 0;
let count_10 = 0;

// メイン関数
const main = async () => {
  const sub = await nostr.init([{ kinds: [1], since: currUnixtime() }]);
  sub.on("event", (ev) => {
    count++;
    count10++;
  });
};

main().catch((e) => console.error(e));
cron.schedule("* * * * *", async () => {
  try {
    let now = new Date();
    now.setTime(now.getTime() - 60000);
    const formattedNow = format(now, "yyyyMMddHHmm");
    const db = await nostr.nip78get("nostr-arrival-rate", "nostr-arrival-rate");
    console.log(db);
    const datas = db ? db.tags.slice(3) : [];
    const records = [...datas, [formattedNow, count.toString()]].slice(-1440);
    console.log(records)
    nostr.nip78post(
      "nostr-arrival-rate",
      "nostr-arrival-rate",
      "流速検出 realtime",
      records
    );

    const formattedDate = format(now, "yyyyMMdd");
    const db_day = await nostr.nip78get("nostr-arrival-rate", "nostr-arrival-rate_" + formattedDate);
    const datas_day = db_day ? db_day.tags.slice(3) : [];
    const records_day = [...datas_day, [formattedNow, count.toString()]];
    console.log(records_day)
    nostr.nip78post(
      "nostr-arrival-rate",
      "nostr-arrival-rate_" + formattedDate,
      "流速検出 realtime",
      records_day
    );

    count = 0;
  } catch (e) {
    console.log(e);
  }
});
cron.schedule("*/10 * * * *", () => {
  try {
    let from = new Date();
    let to = new Date();
    to.setTime(to.getTime() - 600000);
    nostr.send("流速検出: " + count_10 + "posts/ 10min\n" + format(from, "yyyy/MM/dd HH:mm") + " ～ " + format(from, "yyyy/MM/dd HH:mm"));
    count_10 = 0;
  } catch (e) {
    console.log(e);
  }
});
