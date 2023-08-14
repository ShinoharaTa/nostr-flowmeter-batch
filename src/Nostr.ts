import { currUnixtime } from "./utils.js";
import { finishEvent, getPublicKey, SimplePool } from "nostr-tools";
import type { Event } from "nostr-tools";
import { eventKind, NostrFetcher } from "nostr-fetch";
import dotenv from "dotenv";
import "websocket-polyfill";

dotenv.config();
const HEX: string = process.env.HEX ?? "";

const fetcher = NostrFetcher.init();
const RELAYS = [
  "wss://relay-jp.nostr.wirednet.jp",
  "wss://r.kojira.io",
  "wss://yabu.me",
  "wss://nostr-relay.nokotaro.com",
];

const pool = new SimplePool();

export const send = async (
  content: string,
  targetEvent: Event | null = null
) => {
  const created = targetEvent ? targetEvent.created_at + 1 : currUnixtime();
  const ev: any = {
    kind: 1,
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
      console.log(ev);
      console.log("failed to send event");
    });
  });
};

export const nip78get = async (tableName: string, tagName: string) => {
  const result = await fetcher.fetchLastEvent(RELAYS, {
    kinds: [eventKind.appSpecificData],
    "#d": [tableName],
    "#t": [tagName],
    authors: [getPublicKey(HEX)],
  });
  return result;
};

export const nip78post = async (
  tableName: string,
  tagName: string,
  title: string,
  items: string[][]
) => {
  const db_head = [
    ["d", tableName],
    ["title", title],
    ["t", tagName],
  ];
  const tags = [...db_head, ...items];
  const ev = {
    kind: eventKind.appSpecificData,
    content: "test",
    tags: tags,
    created_at: currUnixtime(),
  };
  const post = finishEvent(ev, HEX);
  const pub = pool.publish(RELAYS, post);
  pub.on("failed", () => {
    console.log("failed to send event");
  });
};
