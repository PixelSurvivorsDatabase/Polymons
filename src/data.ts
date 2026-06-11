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
};

export const games: Game[] = [
  {
    id: "baseplate",
    title: "Baseplate",
    creator: "Polymons",
    players: "0",
    rating: 0,
    genre: "Internal test",
    description:
      "A clean testing ground for movement, physics, camera controls, building, and everything else the Polymons game client needs.",
    colors: ["#7247d8", "#36a777"],
    glyph: "B",
  },
];

export const currentUser = {
  name: "Nova",
  handle: "@novabyte",
  bio: "Building Polymons one working piece at a time.",
  joined: "June 2026",
};
