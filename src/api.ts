export const POLYMONS_API_URL =
  import.meta.env.VITE_POLYMONS_API_URL ??
  "https://polymons-server.onrender.com";
export const POLYMONS_PLAYER_DOWNLOAD_URL =
  "https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download/PolymonsPlayer.exe";

export type PolymonsUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
  launch.searchParams.set("game", playSession.game.slug);
  launch.searchParams.set("ws", playSession.websocketUrl);
  if (accountTicket) launch.searchParams.set("link", accountTicket);
  return launch.toString();
}
