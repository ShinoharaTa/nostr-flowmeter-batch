import { relayInit } from "nostr-tools";
import type { Relay } from "nostr-tools";
import "websocket-polyfill";
import { currUnixtime } from "./utils.js";

export type RelayStatus = {
  count: number;
  count_10: number;
  status: boolean;
};
export default class Hotter {
  private relayStatus: RelayStatus = {
    count: 0,
    count_10: 0,
    status: false,
  };
  private relay: Relay;

  constructor(url: string) {
    this.relay = relayInit(url);
    this.relay.on("error", () => {
      throw "failed to connnect";
    });
    return;
  }

  public watch = async () => {
    await this.relay.connect();
    const sub = this.relay.sub([{ kinds: [1], since: currUnixtime() }]);
    sub.on("event", (ev) => {
      this.relayStatus.count++;
      this.relayStatus.count_10++;
    });
  };

  public getCount = (): RelayStatus => {
    return this.relayStatus;
  };
  public get10Count = (): RelayStatus => {
    return this.relayStatus;
  };
  public clearCount = (): void => {
    this.relayStatus.count = 0;
  };
  public clear10Count = (): void => {
    this.relayStatus.count_10 = 0;
  };
}
