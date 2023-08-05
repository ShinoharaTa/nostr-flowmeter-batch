export type Relays = RelayItem[];
export type RelayItem = {
  key: string;
  name: string;
  status: string;
  url: string;
};

export const relays: Relays = [
  {
    key: "kojira",
    name: "こじら川",
    status: "active",
    url: "wss://r.kojira.io",
  },
  {
    key: "shino3",
    name: "しの川",
    status: "active",
    url: "wss://relay-jp.shino3.net",
  },
  {
    key: "yabumi",
    name: "やぶみ川",
    status: "active",
    url: "wss://yabu.me",
  },
  {
    key: "kirino",
    name: "きりの川",
    status: "active",
    url: "wss://relay-jp.nostr.wirednet.jp",
  },
  // {
  //   key: "nokotaro",
  //   name: "竹田川",
  //   status: "active",
  //   url: "wss://relay-jp.nostr.wirednet.jp",
  //   class: null,
  // },
];
