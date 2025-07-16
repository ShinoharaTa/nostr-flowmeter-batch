export type Relays = RelayItem[];
export type RelayItem = {
  key: string;
  name: string;
  status: string;
  url: string;
  target: string;
};

export const relays: Relays = [
  {
    key: "kirino",
    name: "きりの川",
    status: "active",
    url: "wss://relay-jp.nostr.wirednet.jp",
    target: "jp",
  },
  {
    key: "kirino_g",
    name: "きりの川(G)",
    status: "active",
    url: "wss://relay.nostr.wirednet.jp",
    target: "all",
  },
  // {
  //   key: "takenoko_g",
  //   name: "のこたろ川(G)",
  //   status: "active",
  //   url: "wss://nostr-relay.nokotaro.com",
  //   target: "all",
  // },
  {
    key: "yabumi",
    name: "やぶみ川",
    status: "active",
    url: "wss://yabu.me",
    target: "jp",
  },
  //{
  //   key: "holybea",
  //   name: "ほりべあ川",
  //   status: "active",
  //   url: "wss://nostr.holybea.com",
  //   target: "jp",
  // },
  {
    key: "c-stellar",
    name: "かすてら川",
    status: "active",
    url: "wss://nrelay-jp.c-stellar.net",
    target: "jp",
  },
  {
    key: "kojira",
    name: "こじら川",
    status: "active",
    url: "wss://r.kojira.io",
    target: "jp",
  },
  {
    key: "kojira",
    name: "こじら大川",
    status: "active",
    url: "wss://x.kojira.io",
    target: "all",
  },
  {
    key: "shino3",
    name: "しの川",
    status: "active",
    url: "wss://relay-jp.shino3.net",
    target: "jp",
  },
  {
    key: "shino3",
    name: "しの川(G)",
    status: "active",
    url: "wss://relay.nostx.io",
    target: "jp",
  },
];
