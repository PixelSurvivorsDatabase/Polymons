export const POLYMONS_API_URL =
  import.meta.env.VITE_POLYMONS_API_URL ??
  "https://polymons-server.onrender.com";
const RELEASE_DOWNLOAD_BASE =
  "https://github.com/PixelSurvivorsDatabase/Polymons/releases/latest/download";

function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isMacDesktopBrowser(): boolean {
  if (typeof navigator === "undefined" || isMobileBrowser()) return false;
  return /Mac/i.test(navigator.platform || navigator.userAgent);
}

function isLikelyAppleSiliconBrowser(): boolean {
  if (!isMacDesktopBrowser() || typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  if (/\b(?:x86_64|x64)\b/i.test(userAgent)) return false;
  if (/\b(?:arm64|aarch64)\b/i.test(userAgent)) return true;
  // Modern Safari masks Apple Silicon as MacIntel, so prefer the current Mac
  // architecture while keeping the explicit Intel link available beside it.
  return true;
}

export const IS_MOBILE_BROWSER = isMobileBrowser();
export const IS_ANDROID_BROWSER = isAndroidBrowser();
export const IS_IOS_BROWSER = isIosBrowser();
export const IS_MAC_DESKTOP_BROWSER = isMacDesktopBrowser();
export const IS_LIKELY_APPLE_SILICON_BROWSER =
  isLikelyAppleSiliconBrowser();

export const POLYMONS_PLAYER_WINDOWS_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/PolymonsPlayer.exe`;
export const POLYMONS_PLAYER_ANDROID_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/Polymons-Player.apk`;
export const POLYMONS_PLAYER_MAC_ARM64_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/PolymonsPlayer-mac-arm64.dmg`;
export const POLYMONS_PLAYER_MAC_X64_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/PolymonsPlayer-mac-x64.dmg`;
export const POLY_STUDIO_WINDOWS_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/PolyStudio.exe`;
export const POLY_STUDIO_ANDROID_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/Poly-Studio.apk`;
export const POLY_STUDIO_MAC_ARM64_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/PolyStudio-mac-arm64.dmg`;
export const POLY_STUDIO_MAC_X64_DOWNLOAD_URL =
  `${RELEASE_DOWNLOAD_BASE}/PolyStudio-mac-x64.dmg`;

export const POLYMONS_PLAYER_DOWNLOAD_URL = IS_ANDROID_BROWSER
  ? POLYMONS_PLAYER_ANDROID_DOWNLOAD_URL
  : IS_MAC_DESKTOP_BROWSER
    ? IS_LIKELY_APPLE_SILICON_BROWSER
      ? POLYMONS_PLAYER_MAC_ARM64_DOWNLOAD_URL
      : POLYMONS_PLAYER_MAC_X64_DOWNLOAD_URL
    : POLYMONS_PLAYER_WINDOWS_DOWNLOAD_URL;
export const POLY_STUDIO_DOWNLOAD_URL = IS_ANDROID_BROWSER
  ? POLY_STUDIO_ANDROID_DOWNLOAD_URL
  : IS_MAC_DESKTOP_BROWSER
    ? IS_LIKELY_APPLE_SILICON_BROWSER
      ? POLY_STUDIO_MAC_ARM64_DOWNLOAD_URL
      : POLY_STUDIO_MAC_X64_DOWNLOAD_URL
    : POLY_STUDIO_WINDOWS_DOWNLOAD_URL;

export type PolymonsUser = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  tix: number;
  avatarUrl: string | null;
  equippedShirtId: import("./game/avatarCatalog").ShirtId | null;
  equippedPantsId: import("./game/avatarCatalog").PantsId | null;
  equippedHairId?: import("./game/avatarCatalog").HairId | null;
  equippedHatId?: import("./game/avatarCatalog").HatId | null;
  equippedShirtTextureUrl?: string | null;
  equippedPantsTextureUrl?: string | null;
  equippedHairModelUrl?: string | null;
  equippedHairModelFormat?: import("./game/avatarCatalog").AvatarModelFormat | null;
  equippedHatModelUrl?: string | null;
  equippedHatModelFormat?: import("./game/avatarCatalog").AvatarModelFormat | null;
  avatarAppearance: import("./game/avatarAppearance").AvatarAppearance;
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

export class PolymonsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
  ) {
    super(message);
    this.name = "PolymonsApiError";
  }
}

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
  favorites: number;
  createdAt: string;
  updatedAt: string;
  manifest?: import("./game/polyProject").PolyProject | null;
  badges?: GameBadge[];
  gamePasses?: GamePass[];
  developerProducts?: DeveloperProduct[];
};

export type GameBadge = {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
};

export type GamePass = {
  id: string;
  name: string;
  description: string;
  priceTix: number;
};

export type DeveloperProduct = {
  id: string;
  name: string;
  description: string;
  priceTix: number;
  effectKey: string | null;
  effectAmount: number;
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
    followers: number;
  };
  games: PlatformGame[];
  badges: Array<GameBadge & { gameId: string; awardedAt: string }>;
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
  equippedPantsId: import("./game/avatarCatalog").PantsId | null;
  equippedHairId: import("./game/avatarCatalog").HairId | null;
  equippedHatId: import("./game/avatarCatalog").HatId | null;
  avatarAppearance: import("./game/avatarAppearance").AvatarAppearance;
  tix: number;
  totalCreatorVisits: number;
  items: import("./game/avatarCatalog").AvatarCatalogItem[];
};

export type MarketplaceCatalogItem = {
  id: string;
  itemType: import("./game/avatarCatalog").AvatarItemType;
  name: string;
  description: string;
  unlockType: "free" | "creator_visits" | "tix";
  unlockThreshold: number | null;
  priceTix: number;
  bundleKey: string | null;
  textureUrl: string | null;
  modelUrl: string | null;
  modelFormat: import("./game/avatarCatalog").AvatarModelFormat | null;
  modelPreviewUrl: string | null;
  creatorId: string | null;
  createdFromUpload: boolean;
  createdAt: string | null;
  creator: {
    username: string;
    displayName: string;
  } | null;
};

export type AvatarCatalogSubmission = {
  id: string;
  name: string;
  description: string;
  itemType: import("./game/avatarCatalog").AvatarItemType;
  unlockType: "free" | "creator_visits" | "tix";
  priceTix: number;
  textureUrl: string | null;
  modelUrl: string | null;
  modelFormat: import("./game/avatarCatalog").AvatarModelFormat | null;
  modelPreviewUrl: string | null;
  reviewStatus: "pending" | "approved" | "rejected";
  rejectionReason: string;
  createdAt: string;
  reviewedAt: string | null;
};

async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30_000);
  let response: Response;
  try {
    response = await fetch(`${POLYMONS_API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.accessToken
          ? { Authorization: `Bearer ${options.accessToken}` }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PolymonsApiError(
        "The server took too long to respond. Check your connection and try again.",
        null,
      );
    }
    throw new PolymonsApiError(
      "Could not reach the Polymons server. Check your connection and try again.",
      null,
    );
  } finally {
    window.clearTimeout(timeout);
  }

  const responseText = await response.text();
  let result: { error?: string } | null = null;
  try {
    result = responseText
      ? (JSON.parse(responseText) as { error?: string })
      : null;
  } catch {
    result = null;
  }
  if (!response.ok) {
    const fallback =
      response.status === 429
        ? "Too many attempts. Wait a few minutes, then try again."
        : response.status >= 500
          ? "The Polymons server is temporarily unavailable. Try again shortly."
          : "Polymons could not complete the request.";
    throw new PolymonsApiError(result?.error ?? fallback, response.status);
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

export function updateProfile(
  description: string,
  accessToken: string,
): Promise<{ user: PolymonsUser }> {
  return apiRequest("/v1/me/profile", {
    method: "POST",
    accessToken,
    body: { description },
  });
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

export function listAvatarCatalog(): Promise<{
  items: MarketplaceCatalogItem[];
}> {
  return apiRequest("/v1/avatar/catalog");
}

export function listAvatarUploads(
  accessToken: string,
): Promise<{ submissions: AvatarCatalogSubmission[] }> {
  return apiRequest("/v1/avatar/uploads", { accessToken });
}

export function submitAvatarUpload(
  input: {
    itemType: import("./game/avatarCatalog").AvatarItemType;
    name: string;
    description: string;
    priceTix: number;
    textureData?: string;
    modelData?: string;
    modelFormat?: import("./game/avatarCatalog").AvatarModelFormat;
  },
  accessToken: string,
): Promise<{ submission: AvatarCatalogSubmission }> {
  return apiRequest("/v1/avatar/uploads", {
    method: "POST",
    accessToken,
    body: input,
  });
}

export function claimAvatarItem(
  itemId: string,
  accessToken: string,
): Promise<{
  itemId: string;
  itemIds: string[];
  owned: true;
  tix: number;
}> {
  return apiRequest(`/v1/avatar/items/${encodeURIComponent(itemId)}/claim`, {
    method: "POST",
    accessToken,
  });
}

export function setCreatorFollow(
  username: string,
  following: boolean,
  accessToken: string,
): Promise<{ username: string; following: boolean }> {
  return apiRequest(`/v1/players/${encodeURIComponent(username)}/follow`, {
    method: "POST",
    accessToken,
    body: { following },
  });
}

export function listFollowedCreators(accessToken: string): Promise<{
  creators: Array<{
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    followedAt: string;
  }>;
}> {
  return apiRequest("/v1/follows", { accessToken });
}

export function listFriendServers(accessToken: string): Promise<{
  servers: Array<{
    id: string;
    playerCount: number;
    friends: Array<{
      userId: string;
      username: string;
      displayName: string;
    }>;
    game: {
      id: string;
      slug: string;
      title: string;
      thumbnailUrl: string | null;
    };
  }>;
}> {
  return apiRequest("/v1/servers/friends", { accessToken });
}

export function listGameServers(gameId: string): Promise<{
  game: { id: string; slug: string; title: string };
  servers: Array<{
    id: string;
    playerCount: number;
    players: Array<{
      userId: string;
      username: string;
      displayName: string;
    }>;
  }>;
}> {
  return apiRequest(`/v1/games/${encodeURIComponent(gameId)}/servers`);
}

export function getCreatorAnalytics(accessToken: string): Promise<{
  totals: {
    games: number;
    visits: number;
    activePlayers: number;
    playsLast7Days: number;
  };
  games: Array<{
    id: string;
    slug: string;
    title: string;
    visits: number;
    activePlayers: number;
    favorites: number;
    playsLast7Days: number;
    updatedAt: string;
  }>;
}> {
  return apiRequest("/v1/creator/analytics", { accessToken });
}

export function awardGameBadge(
  gameId: string,
  badgeName: string,
  accessToken: string,
): Promise<{ badgeId: string; awarded: true }> {
  return apiRequest(`/v1/games/${encodeURIComponent(gameId)}/badges/award`, {
    method: "POST",
    accessToken,
    body: { badgeName },
  });
}

export function checkGameBadge(
  gameId: string,
  badgeName: string,
  accessToken: string,
): Promise<{ gameId: string; badgeName: string; owned: boolean }> {
  return apiRequest(`/v1/games/${encodeURIComponent(gameId)}/badges/check`, {
    method: "POST",
    accessToken,
    body: { badgeName },
  });
}

export function getGameEntitlements(
  gameId: string,
  accessToken: string,
): Promise<{
  gamePasses: string[];
  gamePassNames: string[];
  badges: string[];
  playerData: Record<string, import("./game/polyProject").PolyStoredValue>;
}> {
  return apiRequest(`/v1/games/${encodeURIComponent(gameId)}/entitlements`, {
    accessToken,
  });
}

export function purchaseGamePass(
  gameId: string,
  passId: string,
  accessToken: string,
): Promise<{ passId: string; owned: true; tix: number }> {
  return apiRequest(
    `/v1/games/${encodeURIComponent(gameId)}/gamepasses/${encodeURIComponent(passId)}/purchase`,
    { method: "POST", accessToken },
  );
}

export function purchaseDeveloperProduct(
  gameId: string,
  productId: string,
  accessToken: string,
): Promise<{
  productId: string;
  purchaseId: string;
  tix: number;
  playerData: Record<string, import("./game/polyProject").PolyStoredValue>;
}> {
  return apiRequest(
    `/v1/games/${encodeURIComponent(gameId)}/products/${encodeURIComponent(productId)}/purchase`,
    { method: "POST", accessToken },
  );
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

export function equipPants(
  pantsId: import("./game/avatarCatalog").PantsId | null,
  accessToken: string,
): Promise<{
  equippedPantsId: import("./game/avatarCatalog").PantsId | null;
  user: PolymonsUser;
}> {
  return apiRequest("/v1/avatar/equip-pants", {
    method: "POST",
    accessToken,
    body: { pantsId },
  });
}

export function equipHair(
  hairId: import("./game/avatarCatalog").HairId | null,
  accessToken: string,
): Promise<{
  equippedHairId: import("./game/avatarCatalog").HairId | null;
  user: PolymonsUser;
}> {
  return apiRequest("/v1/avatar/equip-hair", {
    method: "POST",
    accessToken,
    body: { itemId: hairId },
  });
}

export function equipHat(
  hatId: import("./game/avatarCatalog").HatId | null,
  accessToken: string,
): Promise<{
  equippedHatId: import("./game/avatarCatalog").HatId | null;
  user: PolymonsUser;
}> {
  return apiRequest("/v1/avatar/equip-hat", {
    method: "POST",
    accessToken,
    body: { itemId: hatId },
  });
}

export function updateAvatarAppearance(
  avatarAppearance: import("./game/avatarAppearance").AvatarAppearance,
  accessToken: string,
): Promise<{
  avatarAppearance: import("./game/avatarAppearance").AvatarAppearance;
  user: PolymonsUser;
}> {
  return apiRequest("/v1/avatar/appearance", {
    method: "POST",
    accessToken,
    body: avatarAppearance,
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
