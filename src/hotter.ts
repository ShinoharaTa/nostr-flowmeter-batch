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

  public init = async (url: string): Promise<boolean> => {
    this.relay = relayInit(url);
    return new Promise((resolve, reject) => {
      this.relay.on("error", () => {
        console.log("error");
        resolve(false);
      });
      resolve(true);
    });
  };

  public watch = async () => {
    await this.relay.connect();
    const sub = this.relay.sub([{ kinds: [1], since: currUnixtime() }]);
    this.relay.on("connect", () => {
      this.relayStatus.status = true;
      this.relayStatus.count = 0;
      this.relayStatus.count_10 = 0;
      console.log("connect");
    });
    sub.on("event", (ev) => {
      this.relayStatus.count++;
      this.relayStatus.count_10++;
    });
    this.relay.on("error", () => {
      this.relayStatus.status = false;
      throw "disconnect relay";
    });
  };

  public getStatus = (): RelayStatus => {
    return this.relayStatus;
  };
  public clearCount = (): void => {
    this.relayStatus.count = 0;
  };
  public clear10Count = (): void => {
    this.relayStatus.count_10 = 0;
  };
}
