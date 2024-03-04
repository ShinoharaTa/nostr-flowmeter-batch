import { currUnixtime } from "./utils.js";
import { finishEvent, getPublicKey, Kind, SimplePool } from "nostr-tools";
import type { Event, EventTemplate } from "nostr-tools";
import { eventKind, FetchStats, NostrFetcher } from "nostr-fetch";
import dotenv from "dotenv";
import "websocket-polyfill";
import { getUnixTime, startOfMinute, subMinutes } from "date-fns";

dotenv.config();
const HEX: string = process.env.HEX ?? "";

const RELAYS = [
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
  const ev: EventTemplate<Kind.Article> = {
    kind: Kind.Article,
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
  return result.content;
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
): Promise<Count | null> => {
  const now = startOfMinute(start);
  const to = getUnixTime(now);
  const from = getUnixTime(subMinutes(now, span));

  const fetcher = NostrFetcher.init();
  const response: Count = {};
  let fetchStats: FetchStats | undefined = undefined;

  await fetcher.fetchAllEvents(
    relays,
    { kinds: targetKinds },
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
