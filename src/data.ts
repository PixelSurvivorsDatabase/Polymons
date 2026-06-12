export type Game = {
  id: string;
  title: string;
  creator: string;
  creatorUsername: string;
  players: string;
  visits: number;
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
    creatorUsername: "polymons",
    players: "0",
    visits: 0,
    rating: 0,
    genre: "Sandbox",
    description:
      "A clean open world for movement, physics, building, and whatever comes next.",
    colors: ["#7247d8", "#36a777"],
    glyph: "B",
  },
];
