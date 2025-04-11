import { currUnixtime } from "./utils.js";
import { finishEvent, getPublicKey, Kind, nip19, SimplePool } from "nostr-tools";
import type { Event, EventTemplate } from "nostr-tools";
import { eventKind, type FetchStats, NostrFetcher } from "nostr-fetch";
import dotenv from "dotenv";
import "websocket-polyfill";
import { fromUnixTime, getUnixTime, startOfMinute, subDays, subMinutes } from "date-fns";

dotenv.config();
const HEX: string = process.env.HEX ?? "";

export const RELAYS = [
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://r.kojira.io",
  "wss://yabu.me",
  "wss://relay-jp.shino3.net",
];

const pool = new SimplePool();

export const send = async (
  content: string,
  targetEvent: Event | null = null,
) => {
  const created = targetEvent ? targetEvent.created_at + 1 : currUnixtime();
  const ev: EventTemplate<Kind.Text> = {
    kind: Kind.Text,
    content: content,
    tags: [],
    created_at: created,
  };
  if (targetEvent) {
    ev.tags.push(["e", targetEvent.id]);
    ev.tags.push(["p", targetEvent.pubkey]);
  }
  const post = finishEvent(ev, HEX);
  return new Promise(() => {
    const pub = pool.publish(RELAYS, post);
    pub.on("failed", (ev) => {
      console.error("failed to send event", ev);
    });
  });
};

export const nip78get = async (storeName: string) => {
  const result = await pool.get(RELAYS, {
    kinds: [eventKind.appSpecificData],
    "#d": [storeName],
    authors: [getPublicKey(HEX)],
  });
  return result?.content;
};

export const nip78post = async (storeName: string, content: string) => {
  const tags = [["d", storeName]];
  const ev = {
    kind: eventKind.appSpecificData,
    content,
    tags,
    created_at: currUnixtime(),
  };
  const post = finishEvent(ev, HEX);
  const pub = pool.publish(RELAYS, post);
  pub.on("failed", (ev) => {
    console.error("failed to send event", ev);
  });
};

export interface Count {
  [key: string]: number;
}
export const count = async (
  relays: string[],
  targetKinds: number[],
  start: Date,
  span: number,
  authors?: string[],
): Promise<Count | null> => {
  const now = startOfMinute(start);
  const to = getUnixTime(now);
  const from = getUnixTime(subMinutes(now, span));

  const fetcher = NostrFetcher.init();
  const response: Count = {};
  let fetchStats: FetchStats | undefined = undefined;

  await fetcher.fetchAllEvents(
    relays,
    { kinds: targetKinds, authors },
    { since: from, until: to },
    {
      sort: true,
      statsListener: (stats) => {
        fetchStats = stats;
      },
    },
  );
  fetcher.shutdown();
  relays.map((relay) => {
    const relay_url = relay.endsWith("/") ? relay : `${relay}/`;
    const resultStatus = fetchStats.relays[relay_url]?.status === "completed";
    response[relay] = resultStatus
      ? fetchStats.relays[relay_url].numFetchedEvents
      : null;
  });
  return response;
};
export const countPosts = async (
  relays: string[],
  targetKinds: number[],
  start: Date,
  span: number,
  authors?: string[],
): Promise<number> => {
  const now = startOfMinute(start);
  const to = getUnixTime(now);
  const from = getUnixTime(subMinutes(now, span));

  const fetcher = NostrFetcher.init();
  const response: Count = {};
  let fetchStats: FetchStats | undefined = undefined;

  const result = await fetcher.fetchAllEvents(
    relays,
    { kinds: targetKinds, authors },
    { since: from, until: to },
    {
      sort: true,
      statsListener: (stats) => {
        fetchStats = stats;
      },
    },
  );
  fetcher.shutdown();
  return result.length;
};

async function analysePosts(ev: Event) {
  const now = fromUnixTime(ev.created_at)
  try {
    const yesterday = await countPosts(RELAYS, [1, 6, 42], subDays(now, 1), 1440, [ev.pubkey])
    const today = await countPosts(RELAYS, [1, 6, 42], now, 1440, [ev.pubkey])
    let postText = `直近24時間は ${today} 投稿です。\nその前は ${yesterday} 投稿でした。\n`

    const averagePosts = 70; // 普段の平均投稿数の目安
    const ratio = today / (yesterday || 1); // yesterdayが0の場合を防止

    if (today <= yesterday) {
      postText += "昨日ほどじゃないね👍️";
    } else if (ratio >= 1.1 && today > 10) {
      if (today >= averagePosts * 1.5 && today >= yesterday * 1.5) {
        postText += "ねえ、多すぎない？😅";
      } else if (today > averagePosts || today > yesterday * 1.3) {
        postText += "昨日の投稿数を超えてるよ？大丈夫？😮";
      } else {
        postText += "今日はちょっと多めだね😌";
      }
    } else if (today <= 5) {
      postText += "まだ全然書いてないよ！忙しかった？😟";
    } else {
      postText += "順調だね！😊";
    }
    send(postText, ev);
  } catch (error) {
    send("ちょっといま忙しい", ev);
  }
  return;
}

export function isReplyToUser(ev: Event): boolean {
  return ev.tags.find((tag) => tag.includes("p"))?.[1] === getPublicKey(HEX);
}

export function getNpub(): string {
  return nip19.npubEncode(getPublicKey(HEX));
}

export const subscribe = async () => {
  const sub = pool.sub(RELAYS, [{ kinds: [1], since: currUnixtime() }]);
  sub.on("event", async (ev) => {
    try {
      const isReply = isReplyToUser(ev);
      if (isReply) {
        const npub = getNpub();
        if (ev.content.match(new RegExp(`^(nostr:${npub}\\s+)?.*(さわぎすぎ|騒ぎすぎ|しゃべりすぎ|喋りすぎ|うるさくない|うるさすぎ).*`))) {
          await analysePosts(ev);
        } else {
          send("コマンド確認して", ev);
        }
      }
      if (ev.content.match(/^流速ちゃん？/)) {
        send("呼びましたか？", ev);
      }
    } catch (ex) {
      console.error(ex);
    }
  });
};
