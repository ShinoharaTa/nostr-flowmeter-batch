import { currUnixtime } from "./utils.js";
import { relayInit, finishEvent, getPublicKey } from "nostr-tools";
import type { Relay, Filter, Event } from "nostr-tools";
import { eventKind, NostrFetcher } from "nostr-fetch";
import dotenv from "dotenv";
import "websocket-polyfill";

dotenv.config();
const HEX: string = process.env.HEX ?? "";
const RELAY: string = process.env.RELAY ?? "";

const COOL_TIME_DUR_SEC = 5;
const lastReplyTimePerPubkey = new Map();

const fetcher = NostrFetcher.init();

class NostrBot {
  private relay: Relay;

  constructor() {
    this.relay = relayInit(RELAY);
    this.relay.on("error", () => {
      throw `failed to connect, ${RELAY}`;
    });
    return;
  }

  init = async (filter: Filter<number>[]) => {
    await this.relay.connect();
    console.log("connected to relay");
    return this.relay.sub(filter);
  };

  send = (content: string, targetEvent: Event | null = null) => {
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
    const pub = this.relay.publish(post);
    pub.on("ok", () => {
      console.log("succeess!");
    });
    pub.on("failed", () => {
      console.log("failed to send event");
    });
  };

  nip78get = async (tableName: string, tagName: string) => {
    const result = await fetcher.fetchLastEvent([RELAY], {
      kinds: [eventKind.appSpecificData],
      "#d": [tableName],
      "#t": [tagName],
      authors: [getPublicKey(HEX)],
    });
    return result;
  };

  nip78post = async (
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
    const pub = this.relay.publish(post);
    pub.on("ok", () => {
      console.log("succeess!");
    });
    pub.on("failed", () => {
      console.log("failed to send event");
    });
  };

  /* 無限リプライループ対策 */
  isSafeToReply = (pubkey: string) => {
    const now = currUnixtime();
    const lastReplyTime = lastReplyTimePerPubkey.get(pubkey);
    if (
      lastReplyTime !== undefined &&
      now - lastReplyTime < COOL_TIME_DUR_SEC
    ) {
      return false;
    }
    lastReplyTimePerPubkey.set(pubkey, now);
    return true;
  };
}

export default NostrBot;
