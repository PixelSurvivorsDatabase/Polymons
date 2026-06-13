export const POLYMONS_API_URL =
  import.meta.env.VITE_POLYMONS_API_URL ??
  "https://polymons-server.onrender.com";
export const POLYMONS_PLAYER_DOWNLOAD_URL =
  "https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download/PolymonsPlayer.exe";
export const POLY_STUDIO_DOWNLOAD_URL =
  "https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download/PolyStudio.exe";

export type PolymonsUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  equippedShirtId: import("./game/avatarCatalog").ShirtId | null;
};

export type PolymonsSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  expiresIn: number;
  tokenType: string;
};

export type AuthResponse = {
  user: PolymonsUser;
  session: PolymonsSession;
};

export type PlaySession = {
  id: string;
  game: {
    id: string;
    slug: string;
    title: string;
  };
  expiresAt: string;
  ticket: string;
  websocketUrl: string;
};

export type PlayerAccountLink = {
  ticket: string;
  expiresAt: string;
};

type ApiOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  accessToken?: string;
};

export type PlatformGame = {
  id: string;
  slug: string;
  title: string;
  description: string;
  genre: string;
  thumbnailUrl: string | null;
  creator: string;
  creatorUsername: string;
  activePlayers: number;
  visits: number;
  updatedAt: string;
  manifest?: import("./game/polyProject").PolyProject | null;
};

export type PublicPlayer = PolymonsUser & {
  joinedAt: string;
};

export type PublicPlayerProfile = {
  player: PublicPlayer;
  stats: {
    friends: number;
    games: number;
    gameVisits: number;
  };
  games: PlatformGame[];
};

export type Friendship = {
  id: string;
  status: "pending" | "accepted" | "blocked";
  incoming: boolean;
  user: PolymonsUser | null;
  gameId: string | null;
};

export type Wardrobe = {
  equippedShirtId: import("./game/avatarCatalog").ShirtId | null;
  totalCreatorVisits: number;
  items: import("./game/avatarCatalog").AvatarCatalogItem[];
};

async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const response = await fetch(`${POLYMONS_API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const result = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? "Polymons could not complete the request.");
  }

  return result as T;
}

export function signUp(
  username: string,
  password: string,
  displayName?: string,
): Promise<AuthResponse> {
  return apiRequest("/v1/accounts/signup", {
    method: "POST",
    body: { username, password, displayName },
  });
}

export function login(
  username: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest("/v1/accounts/login", {
    method: "POST",
    body: { username, password },
  });
}

export function refreshSession(refreshToken: string): Promise<AuthResponse> {
  return apiRequest("/v1/accounts/refresh", {
    method: "POST",
    body: { refreshToken },
  });
}

export function createPlaySession(
  gameId: string,
  accessToken: string,
): Promise<{ playSession: PlaySession }> {
  return apiRequest("/v1/play-sessions", {
    method: "POST",
    accessToken,
    body: { gameId },
  });
}

export function listGames(query = ""): Promise<{ games: PlatformGame[] }> {
  const suffix = query.trim()
    ? `?query=${encodeURIComponent(query.trim())}`
    : "";
  return apiRequest(`/v1/games${suffix}`);
}

export function getGame(gameId: string): Promise<{ game: PlatformGame }> {
  return apiRequest(`/v1/games/${encodeURIComponent(gameId)}`);
}

export type GameLibrary = {
  favoriteGameIds: string[];
  recentGames: Array<{
    game_id: string;
    last_played_at: string;
    play_count: number;
  }>;
};

export function getGameLibrary(accessToken: string): Promise<GameLibrary> {
  return apiRequest("/v1/games/library", { accessToken });
}

export function setGameFavorite(
  gameId: string,
  favorite: boolean,
  accessToken: string,
): Promise<{ gameId: string; favorite: boolean }> {
  return apiRequest(`/v1/games/${encodeURIComponent(gameId)}/favorite`, {
    method: "POST",
    accessToken,
    body: { favorite },
  });
}

export function searchPlayers(
  query: string,
): Promise<{ players: PublicPlayer[] }> {
  return apiRequest(`/v1/players?query=${encodeURIComponent(query)}`);
}

export function getPlayerProfile(
  username: string,
): Promise<PublicPlayerProfile> {
  return apiRequest(`/v1/players/${encodeURIComponent(username)}`);
}

export function listFriends(
  accessToken: string,
): Promise<{ friendships: Friendship[] }> {
  return apiRequest("/v1/friends", { accessToken });
}

export function sendFriendRequest(
  username: string,
  accessToken: string,
): Promise<{ friendship: { id: string; status: "pending" } }> {
  return apiRequest("/v1/friends/request", {
    method: "POST",
    accessToken,
    body: { username },
  });
}

export function acceptFriendRequest(
  friendshipId: string,
  accessToken: string,
): Promise<{ friendship: { id: string; status: "accepted" } }> {
  return apiRequest(`/v1/friends/${encodeURIComponent(friendshipId)}/accept`, {
    method: "POST",
    accessToken,
  });
}

export function getWardrobe(
  accessToken: string,
): Promise<Wardrobe> {
  return apiRequest("/v1/avatar/wardrobe", { accessToken });
}

export function claimAvatarItem(
  itemId: string,
  accessToken: string,
): Promise<{ itemId: string; owned: true }> {
  return apiRequest(`/v1/avatar/items/${encodeURIComponent(itemId)}/claim`, {
    method: "POST",
    accessToken,
  });
}

export function equipShirt(
  shirtId: import("./game/avatarCatalog").ShirtId | null,
  accessToken: string,
): Promise<{
  equippedShirtId: import("./game/avatarCatalog").ShirtId | null;
  user: PolymonsUser;
}> {
  return apiRequest("/v1/avatar/equip", {
    method: "POST",
    accessToken,
    body: { shirtId },
  });
}

export function createPlayerAccountLink(
  accessToken: string,
): Promise<{ playerAccountLink: PlayerAccountLink }> {
  return apiRequest("/v1/player-account-links", {
    method: "POST",
    accessToken,
  });
}

export function playerAccountUrl(ticket: string): string {
  const launch = new URL("polymons://account");
  launch.searchParams.set("link", ticket);
  return launch.toString();
}

export function playerLaunchUrl(
  playSession: PlaySession,
  accountTicket?: string,
): string {
  const launch = new URL("polymons://play");
  launch.searchParams.set("game", playSession.game.id);
  launch.searchParams.set("ws", playSession.websocketUrl);
  if (accountTicket) launch.searchParams.set("link", accountTicket);
  return launch.toString();
}
