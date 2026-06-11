export type Game = {
  id: string;
  title: string;
  creator: string;
  players: string;
  rating: number;
  genre: string;
  description: string;
  colors: [string, string];
  glyph: string;
  featured?: boolean;
};

export type Friend = {
  name: string;
  handle: string;
  status: string;
  color: string;
  online: boolean;
  game?: string;
};

export const games: Game[] = [
  {
    id: "skybound",
    title: "Skybound",
    creator: "MiraMakes",
    players: "12.8K",
    rating: 94,
    genre: "Adventure",
    description:
      "Build an airship, chart floating islands, and chase storms with your crew.",
    colors: ["#7357ff", "#36c8ff"],
    glyph: "✦",
    featured: true,
  },
  {
    id: "neon-drift",
    title: "Neon Drift",
    creator: "TurboTom",
    players: "8.4K",
    rating: 91,
    genre: "Racing",
    description:
      "Fast arcade racing through a city that changes every time you play.",
    colors: ["#ff3d81", "#7a36ff"],
    glyph: "N",
  },
  {
    id: "tiny-towns",
    title: "Tiny Towns",
    creator: "PipBuilds",
    players: "6.1K",
    rating: 97,
    genre: "Building",
    description:
      "Make a tiny home, grow a garden, and build a neighborhood with friends.",
    colors: ["#ffb341", "#39c883"],
    glyph: "⌂",
  },
  {
    id: "dungeon-shift",
    title: "Dungeon Shift",
    creator: "HexWorks",
    players: "4.7K",
    rating: 89,
    genre: "RPG",
    description:
      "A co-op dungeon crawler where the rooms move while you fight.",
    colors: ["#7b34c9", "#e24177"],
    glyph: "⬡",
  },
  {
    id: "moonbase",
    title: "Moonbase 9",
    creator: "OrbitClub",
    players: "3.2K",
    rating: 92,
    genre: "Strategy",
    description:
      "Keep a scrappy moon colony alive through dust storms and power cuts.",
    colors: ["#374a91", "#a6b4ff"],
    glyph: "◐",
  },
  {
    id: "spellbound",
    title: "Spellbound",
    creator: "Juniper",
    players: "2.9K",
    rating: 95,
    genre: "Roleplay",
    description:
      "Learn strange spells, explore an old academy, and start magical trouble.",
    colors: ["#4e2b95", "#ef85f2"],
    glyph: "✧",
  },
  {
    id: "block-party",
    title: "Block Party",
    creator: "GoodTimes",
    players: "2.4K",
    rating: 88,
    genre: "Party",
    description:
      "Quick, ridiculous party games for groups of two to twelve.",
    colors: ["#ff7350", "#ffcb45"],
    glyph: "●",
  },
  {
    id: "deep-blue",
    title: "Deep Blue",
    creator: "NoriDev",
    players: "1.8K",
    rating: 93,
    genre: "Exploration",
    description:
      "Dive into a hand-built ocean full of ruins, creatures, and secrets.",
    colors: ["#0768a5", "#19d3bb"],
    glyph: "≈",
  },
];

export const friends: Friend[] = [
  {
    name: "Maya",
    handle: "@mayday",
    status: "Building a suspiciously tall tower",
    color: "#ff7b72",
    online: true,
    game: "Tiny Towns",
  },
  {
    name: "Jordan",
    handle: "@jaybird",
    status: "Trying to beat the storm",
    color: "#55c2ff",
    online: true,
    game: "Skybound",
  },
  {
    name: "Kai",
    handle: "@kaijuice",
    status: "In the garage",
    color: "#d887ff",
    online: true,
    game: "Neon Drift",
  },
  {
    name: "Sam",
    handle: "@samwich",
    status: "Back later",
    color: "#f8c658",
    online: false,
  },
  {
    name: "Lena",
    handle: "@lenapixel",
    status: "Making something new",
    color: "#62d79b",
    online: false,
  },
];

export const currentUser = {
  name: "Nova",
  handle: "@novabyte",
  bio: "I build weird little games and play too many racing games.",
  joined: "June 2026",
};

