export type Relays = RelayItem[];
export type RelayItem = {
  key: string;
  name: string;
  status: string;
  url: string;
};

export const relays: Relays = [
  {
    key: "kirino",
    name: "きりの川",
    status: "active",
    url: "wss://relay-jp.nostr.wirednet.jp",
  },
  {
    key: "takenoko",
    name: "のこたろ川",
    status: "active",
    url: "wss://nostr-relay.nokotaro.com",
  },
  {
    key: "yabumi",
    name: "やぶみ川",
    status: "active",
    url: "wss://yabu.me",
  },
  {
    key: "holybea",
    name: "ほりべあ川",
    status: "active",
    url: "wss://nostr.holybea.com",
  },
  {
    key: "c-stellar",
    name: "かすてら川",
    status: "active",
    url: "wss://nrelay-jp.c-stellar.net",
  },
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
];
