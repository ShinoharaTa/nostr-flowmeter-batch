import { relayInit } from "nostr-tools";
import "websocket-polyfill";
import { currUnixtime } from "./utils.js";

export default class Hotter {
  count = 0;
  count_10 = 0;

  constructor(url) {
    this.relay = relayInit(url);
    this.relay.on("error", () => {
      throw "failed to connnect";
    });
    return;
  }

  watch = async () => {
    await this.relay.connect();
    const sub = this.relay.sub([{ kinds: [1], since: currUnixtime() }]);
    sub.on("event", (ev) => {
      this.count++;
      this.count_10++;
    });
  };

  getCount () {
    return this.count;
  }
  get10Count () {
    return this.count_10;
  }
  clearCount () {
    this.count = 0;
  }
  clear10Count () {
    this.count_10 = 0;
  }
}
