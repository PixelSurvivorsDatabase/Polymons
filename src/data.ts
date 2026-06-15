export type Game = {
  id: string;
  platformId?: string;
  title: string;
  creator: string;
  creatorUsername: string;
  players: string;
  visits: number;
  favorites: number;
  rating: number;
  genre: string;
  description: string;
  colors: [string, string];
  glyph: string;
  thumbnailUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const games: Game[] = [
  {
    id: "baseplate",
    title: "Baseplate",
    creator: "Polymons",
    creatorUsername: "polymons",
    players: "0",
    visits: 0,
    favorites: 0,
    rating: 0,
    genre: "Sandbox",
    description:
      "A clean open world for movement, physics, building, and whatever comes next.",
    colors: ["#7247d8", "#36a777"],
    glyph: "B",
    thumbnailUrl: null,
    createdAt: "2026-06-11T00:00:00.000Z",
    updatedAt: "2026-06-11T00:00:00.000Z",
  },
];
