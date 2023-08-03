import Hotter from "./hotter";

export type Relays = RelayItem[]
export type RelayItem = {
  key: string,
  name: string,
  status: string,
  url: string,
  class: Hotter,
}

export const relays: Relays = [
  {
    key: "kojira",
    name: "こじら川",
    status: "active",
    url: "wss://testr.kojira.io",
    class: null,
  },
  {
    key: "yabumi",
    name: "やぶみ川",
    status: "active",
    url: "wss://yabu.me",
    class: null,
  },
  {
    key: "kirino",
    name: "きりの川",
    status: "active",
    url: "wss://relay-jp.nostr.wirednet.jp",
    class: null,
  },
  // {
  //   key: "nokotaro",
  //   name: "竹田川",
  //   status: "active",
  //   url: "wss://relay-jp.nostr.wirednet.jp",
  //   class: null,
  // },
];
