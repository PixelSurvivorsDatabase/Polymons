import type { SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import cors from "cors";
import { randomUUID } from "crypto";
import express, { type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { access, unlink, writeFile } from "fs/promises";
import helmet from "helmet";
import { tmpdir } from "os";
import { join } from "path";
import type { ServerConfig } from "./config.js";
import {
  bearerToken,
  errorHandler,
  HttpError,
  notFound,
  parseBody,
} from "./http.js";
import {
  createPlayerAccountTicket,
  createPlayTicket,
  hashPlayerAccountTicket,
  hashPlayTicket,
  internalEmailForUsername,
  isOwnerAccount,
  isReservedUsername,
} from "./security.js";
import {
  createAuthClient,
  loadProfile,
  normalizeAvatarAppearance,
  publicSession,
  syncAvatarUnlocks,
} from "./supabase.js";
import { isLoginDisabled } from "./official-account.js";
import { isAllowedClientOrigin } from "./origins.js";
import type { PresenceSnapshot } from "./websocket.js";
import {
  adminCatalogReviewSchema,
  adminTixSchema,
  adminInventorySchema,
  avatarUploadSchema,
  avatarAppearanceSchema,
  awardBadgeSchema,
  friendRequestSchema,
  equipAvatarAccessorySchema,
  equipAvatarItemSchema,
  equipAvatarPantsSchema,
  favoriteGameSchema,
  followCreatorSchema,
  hasBadgeSchema,
  loginSchema,
  playerAccountLinkSchema,
  playSessionSchema,
  polyCodeCompleteSchema,
  profileUpdateSchema,
  publishGameSchema,
  refreshSchema,
  signUpSchema,
} from "./validation.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();

function cacheKey(parts: Array<string | number | boolean | null | undefined>) {
  return parts.map((part) => String(part ?? "")).join(":");
}

async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = memoryCache.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;
  const value = await loader();
  memoryCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

function clearCacheByPrefix(prefix: string) {
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}

function publicCache(response: Response, seconds: number) {
  response.set(
    "Cache-Control",
    `public, max-age=${seconds}, s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`,
  );
}

type EquippedAvatarRow = {
  equipped_shirt_id?: string | null;
  equipped_pants_id?: string | null;
  equipped_hair_id?: string | null;
  equipped_hat_id?: string | null;
};

type AvatarItemAsset = {
  textureUrl: string | null;
  modelUrl: string | null;
  modelFormat: string | null;
};

function versionedAssetUrl(
  url: string | null | undefined,
  version: string | null | undefined,
): string | null {
  if (!url) return null;
  const marker = version ? Date.parse(version) || version : "1";
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(
    String(marker),
  )}`;
}

function avatarTextureUrl(item: {
  texture_url?: string | null;
  reviewed_at?: string | null;
  created_at?: string | null;
}): string | null {
  return versionedAssetUrl(
    item.texture_url,
    item.reviewed_at ?? item.created_at ?? null,
  );
}

async function loadEquippedAvatarAssetMap(
  admin: SupabaseClient,
  profiles: EquippedAvatarRow[],
): Promise<Map<string, AvatarItemAsset>> {
  const itemIds = [
    ...new Set(
      profiles
        .flatMap((profile) => [
          profile.equipped_shirt_id,
          profile.equipped_pants_id,
          profile.equipped_hair_id,
          profile.equipped_hat_id,
        ])
        .filter((itemId): itemId is string => typeof itemId === "string"),
    ),
  ];
  if (itemIds.length === 0) return new Map();
  const { data, error } = await admin
    .from("avatar_items")
    .select(
      "id, texture_url, model_url, model_format, review_status, created_at, reviewed_at",
    )
    .in("id", itemIds);
  if (error) throw error;
  return new Map(
    (data ?? [])
      .filter((item) => item.review_status === "approved")
      .map((item) => [
        item.id,
        {
          textureUrl: avatarTextureUrl(item),
          modelUrl: item.model_url ?? null,
          modelFormat: item.model_format ?? null,
        },
      ]),
  );
}

function equippedAvatarAssetFields(
  profile: EquippedAvatarRow,
  assetById: Map<string, AvatarItemAsset>,
) {
  return {
    equippedShirtTextureUrl: profile.equipped_shirt_id
      ? assetById.get(profile.equipped_shirt_id)?.textureUrl ?? null
      : null,
    equippedPantsTextureUrl: profile.equipped_pants_id
      ? assetById.get(profile.equipped_pants_id)?.textureUrl ?? null
      : null,
    equippedHairModelUrl: profile.equipped_hair_id
      ? assetById.get(profile.equipped_hair_id)?.modelUrl ?? null
      : null,
    equippedHairModelFormat: profile.equipped_hair_id
      ? assetById.get(profile.equipped_hair_id)?.modelFormat ?? null
      : null,
    equippedHatModelUrl: profile.equipped_hat_id
      ? assetById.get(profile.equipped_hat_id)?.modelUrl ?? null
      : null,
    equippedHatModelFormat: profile.equipped_hat_id
      ? assetById.get(profile.equipped_hat_id)?.modelFormat ?? null
      : null,
  };
}

function gameSlug(title: string, projectId: string): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "game";
  return `${base}-${projectId.replace(/-/g, "").slice(0, 8)}`;
}

function contentSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42) || "item"
  );
}

async function uploadAvatarItemTexture(
  admin: SupabaseClient,
  creatorId: string,
  itemId: string,
  textureData: string,
): Promise<string> {
  const match = textureData.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HttpError(400, "Avatar clothing textures must be PNG files.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 2_000_000) {
    throw new HttpError(413, "Avatar clothing textures must be 2 MB or smaller.");
  }
  const path = `${creatorId}/${itemId}.png`;
  const { error } = await admin.storage
    .from("avatar-item-textures")
    .upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "2592000",
      upsert: true,
    });
  if (error) throw error;
  return admin.storage.from("avatar-item-textures").getPublicUrl(path).data.publicUrl;
}

const ACCESSORY_MODEL_CONTENT_TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
  fbx: "application/octet-stream",
  stl: "model/stl",
  dae: "application/xml",
  zip: "application/zip",
  rbxm: "application/octet-stream",
  rbxmx: "application/xml",
  rblx: "application/octet-stream",
  rbxlx: "application/xml",
};

async function uploadAvatarItemModel(
  admin: SupabaseClient,
  creatorId: string,
  itemId: string,
  modelData: string,
  modelFormat: string,
): Promise<string> {
  const match = modelData.match(/^data:[^;]+;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HttpError(400, "Accessory models must be uploaded as files.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 8_000_000) {
    throw new HttpError(413, "Accessory models must be 8 MB or smaller.");
  }
  const contentType =
    ACCESSORY_MODEL_CONTENT_TYPES[modelFormat] ?? "application/octet-stream";
  const path = `${creatorId}/${itemId}.${modelFormat}`;
  const { error } = await admin.storage
    .from("avatar-item-models")
    .upload(path, bytes, {
      contentType,
      cacheControl: "2592000",
      upsert: true,
    });
  if (error) throw error;
  return admin.storage.from("avatar-item-models").getPublicUrl(path).data.publicUrl;
}

async function uploadGameThumbnail(
  admin: SupabaseClient,
  gameId: string,
  thumbnailData: string,
): Promise<string> {
  const match = thumbnailData.match(
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) throw new HttpError(400, "Invalid game thumbnail.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 2_000_000) {
    throw new HttpError(413, "Game thumbnails must be 2 MB or smaller.");
  }
  const extension = match[1] === "jpeg" ? "jpg" : match[1];
  const path = `${gameId}/thumbnail-${Date.now()}.${extension}`;
  const { error } = await admin.storage
    .from("game-thumbnails")
    .upload(path, bytes, {
      contentType: `image/${match[1]}`,
      cacheControl: "604800",
      upsert: true,
    });
  if (error) throw error;
  return admin.storage.from("game-thumbnails").getPublicUrl(path).data.publicUrl;
}

async function uploadBadgeIcon(
  admin: SupabaseClient,
  gameId: string,
  badgeId: string,
  iconData: string,
): Promise<string> {
  const match = iconData.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new HttpError(400, "Badge icons must be PNG files.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length > 1_000_000) {
    throw new HttpError(413, "Badge icons must be 1 MB or smaller.");
  }
  const path = `${gameId}/${badgeId}.png`;
  const { error } = await admin.storage
    .from("badge-icons")
    .upload(path, bytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });
  if (error) throw error;
  return admin.storage.from("badge-icons").getPublicUrl(path).data.publicUrl;
}

async function syncGameBadges(
  admin: SupabaseClient,
  gameId: string,
  creatorId: string,
  badges: Array<{
    id: string;
    name: string;
    description: string;
    iconData?: string;
  }>,
) {
  const { data: existing, error: existingError } = await admin
    .from("game_badges")
    .select("id, icon_url")
    .eq("game_id", gameId);
  if (existingError) throw existingError;
  const existingById = new Map(
    (existing ?? []).map((badge) => [badge.id, badge]),
  );
  const rows = [];
  for (const badge of badges) {
    const iconUrl = badge.iconData
      ? await uploadBadgeIcon(admin, gameId, badge.id, badge.iconData)
      : existingById.get(badge.id)?.icon_url ?? null;
    rows.push({
      id: badge.id,
      game_id: gameId,
      creator_id: creatorId,
      name: badge.name,
      description: badge.description,
      icon_url: iconUrl,
    });
  }
  if (rows.length > 0) {
    const { error } = await admin
      .from("game_badges")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;
  }
  const retained = new Set(rows.map((badge) => badge.id));
  const removed = (existing ?? [])
    .map((badge) => badge.id)
    .filter((badgeId) => !retained.has(badgeId));
  if (removed.length > 0) {
    const { error } = await admin.from("game_badges").delete().in("id", removed);
    if (error) throw error;
  }
  return rows;
}

async function syncGameMonetization(
  admin: SupabaseClient,
  gameId: string,
  creatorId: string,
  gamePasses: Array<{
    id: string;
    name: string;
    description: string;
    priceTix: number;
  }>,
  developerProducts: Array<{
    id: string;
    name: string;
    description: string;
    priceTix: number;
    effectKey: string | null;
    effectAmount: number;
  }>,
) {
  const passRows = gamePasses.map((pass) => ({
    id: pass.id,
    game_id: gameId,
    creator_id: creatorId,
    name: pass.name,
    description: pass.description,
    price_tix: pass.priceTix,
    is_active: true,
  }));
  if (passRows.length > 0) {
    const { error } = await admin
      .from("game_passes")
      .upsert(passRows, { onConflict: "id" });
    if (error) throw error;
  }
  const retainedPasses = new Set(passRows.map((pass) => pass.id));
  const { data: existingPasses, error: existingPassError } = await admin
    .from("game_passes")
    .select("id")
    .eq("game_id", gameId);
  if (existingPassError) throw existingPassError;
  const removedPasses = (existingPasses ?? [])
    .map((pass) => pass.id)
    .filter((passId) => !retainedPasses.has(passId));
  if (removedPasses.length > 0) {
    const { error } = await admin
      .from("game_passes")
      .update({ is_active: false })
      .in("id", removedPasses);
    if (error) throw error;
  }

  const productRows = developerProducts.map((product) => ({
    id: product.id,
    game_id: gameId,
    creator_id: creatorId,
    name: product.name,
    description: product.description,
    price_tix: product.priceTix,
    effect_key: product.effectKey || null,
    effect_amount: product.effectAmount,
    is_active: true,
  }));
  if (productRows.length > 0) {
    const { error } = await admin
      .from("developer_products")
      .upsert(productRows, { onConflict: "id" });
    if (error) throw error;
  }
  const retainedProducts = new Set(productRows.map((product) => product.id));
  const { data: existingProducts, error: existingProductError } = await admin
    .from("developer_products")
    .select("id")
    .eq("game_id", gameId);
  if (existingProductError) throw existingProductError;
  const removedProducts = (existingProducts ?? [])
    .map((product) => product.id)
    .filter((productId) => !retainedProducts.has(productId));
  if (removedProducts.length > 0) {
    const { error } = await admin
      .from("developer_products")
      .update({ is_active: false })
      .in("id", removedProducts);
    if (error) throw error;
  }
}

function websocketUrl(request: Request, ticket: string): string {
  const forwardedProtocol = request.get("x-forwarded-proto");
  const secure = forwardedProtocol === "https" || request.protocol === "https";
  const protocol = secure ? "wss" : "ws";
  return `${protocol}://${request.get("host")}/v1/connect?ticket=${encodeURIComponent(ticket)}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function polyCodeRoot(): string {
  return process.env.POLYCODE_ROOT || join(process.cwd(), "polycode");
}

async function runPolyCodeCompletion(input: {
  language: "luau" | "cpp" | "csharp";
  prompt: string;
  tokens: number;
  model: "polycode-13m" | "polycode-28m";
}): Promise<{ suggestion: string; source: "polycode" | "unavailable" }> {
  const apiUrl = process.env.POLYCODE_API_URL;
  const apiKey = process.env.POLYCODE_API_KEY;
  if (apiUrl && apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.POLYCODE_API_TIMEOUT_MS || 20_000),
    );
    try {
      const response = await fetch(
        `${apiUrl.replace(/\/+$/, "")}/complete`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PolyCode-Key": apiKey,
          },
          body: JSON.stringify(input),
          signal: controller.signal,
        },
      );
      if (response.ok) {
        const result = (await response.json()) as {
          suggestion?: unknown;
          source?: unknown;
        };
        if (
          typeof result.suggestion === "string" &&
          result.source === "polycode"
        ) {
          return {
            suggestion: result.suggestion.slice(0, 2_000),
            source: "polycode",
          };
        }
      }
    } catch {
      // Fall through to the local fallback below.
    } finally {
      clearTimeout(timeout);
    }
  }

  const root = polyCodeRoot();
  const completeScript = join(root, "complete.py");
  const checkpoint = input.model === "polycode-28m"
    ? process.env.POLYCODE_28M_CHECKPOINT ||
      process.env.POLYCODE_CHECKPOINT ||
      join(root, "checkpoints-28m", "checkpoint-latest.pt")
    : process.env.POLYCODE_13M_CHECKPOINT ||
      process.env.POLYCODE_CHECKPOINT ||
      join(root, "checkpoints", "checkpoint-final.pt");
  const tokenizer = input.model === "polycode-28m"
    ? process.env.POLYCODE_28M_TOKENIZER ||
      process.env.POLYCODE_TOKENIZER ||
      join(root, "artifacts", "tokenizer-28m.json")
    : process.env.POLYCODE_13M_TOKENIZER ||
      process.env.POLYCODE_TOKENIZER ||
      join(root, "artifacts", "tokenizer.json");
  if (
    !(await fileExists(completeScript)) ||
    !(await fileExists(checkpoint)) ||
    !(await fileExists(tokenizer))
  ) {
    return { suggestion: "", source: "unavailable" };
  }

  const promptPath = join(
    tmpdir(),
    `polymons-polycode-${process.pid}-${Date.now()}-${randomUUID()}.txt`,
  );
  await writeFile(promptPath, input.prompt, "utf8");
  const python = process.env.POLYCODE_PYTHON || "python";
  const args = [
    completeScript,
    "--checkpoint",
    checkpoint,
    "--tokenizer",
    tokenizer,
    "--language",
    input.language,
    "--prompt-file",
    promptPath,
    "--tokens",
    String(input.tokens),
    "--temperature",
    process.env.POLYCODE_TEMPERATURE || "0.18",
    "--top-k",
    process.env.POLYCODE_TOP_K || "5",
  ];

  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(python, args, {
        cwd: root,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("PolyCode suggestion timed out."));
      }, Number(process.env.POLYCODE_TIMEOUT_MS || 25_000));
      child.stdout?.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) resolve(stdout);
        else reject(new Error(stderr.trim() || `PolyCode exited with ${code}.`));
      });
    });
    const normalized = output.replace(/\r\n/g, "\n").trimEnd();
    const prompt = input.prompt.replace(/\r\n/g, "\n");
    const suggestion = normalized.startsWith(prompt)
      ? normalized.slice(prompt.length)
      : normalized;
    return { suggestion: suggestion.slice(0, 2_000), source: "polycode" };
  } finally {
    await unlink(promptPath).catch(() => undefined);
  }
}

async function authenticatedUser(
  request: Request,
  admin: SupabaseClient,
) {
  const token = bearerToken(request);
  const { data, error } = await admin.auth.getUser(token);

  if (error || !data.user) {
    throw new HttpError(401, "Invalid or expired session.");
  }

  if (isLoginDisabled(data.user)) {
    throw new HttpError(401, "Invalid or expired session.");
  }

  return data.user;
}

async function ownerUser(
  request: Request,
  admin: SupabaseClient,
) {
  const user = await authenticatedUser(request, admin);
  if (!isOwnerAccount(user)) {
    throw new HttpError(403, "Owner access required.");
  }
  return user;
}

function integerQuery(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Number(value)));
}

export function createApp(
  config: ServerConfig,
  admin: SupabaseClient,
  presence: () => PresenceSnapshot = () => ({
    counts: {},
    players: [],
    servers: [],
  }),
) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, isAllowedClientOrigin(config.webOrigin, origin)),
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Authorization", "Content-Type"],
    }),
  );
  app.use(express.json({ limit: "16mb" }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );

  const signUpLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const loginLimiter = rateLimit({
    windowMs: 5 * 60_000,
    limit: 60,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const refreshLimiter = rateLimit({
    windowMs: 5 * 60_000,
    limit: 120,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  const polyCodeLimiter = rateLimit({
    windowMs: 2 * 60 * 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.get("/", (_request, response) => {
    response.json({
      name: "Polymons Server",
      status: "online",
      protocolVersion: 1,
    });
  });

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/v1/polycode/complete", polyCodeLimiter, async (request, response) => {
    await authenticatedUser(request, admin);
    const input = parseBody(polyCodeCompleteSchema, request.body);
    const result = await runPolyCodeCompletion(input);
    response.json(result);
  });

  app.post("/v1/accounts/signup", signUpLimiter, async (request, response) => {
    const input = parseBody(signUpSchema, request.body);
    if (isReservedUsername(input.username)) {
      throw new HttpError(409, "That username is unavailable.");
    }

    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .maybeSingle();

    if (profileLookupError) {
      throw profileLookupError;
    }
    if (existingProfile) {
      throw new HttpError(409, "That username is unavailable.");
    }

    const email = internalEmailForUsername(input.username);
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          username: input.username,
          display_name: input.displayName ?? input.username,
        },
      });

    if (createError || !created.user) {
      const message = createError?.message.toLowerCase() ?? "";
      if (message.includes("already") || message.includes("database")) {
        throw new HttpError(409, "That username is unavailable.");
      }
      throw new HttpError(400, "Could not create account.");
    }

    const auth = createAuthClient(config);
    const { data: signedIn, error: signInError } =
      await auth.auth.signInWithPassword({
        email,
        password: input.password,
      });

    if (signInError || !signedIn.session) {
      throw new HttpError(500, "Account created, but sign-in failed.");
    }

    const profile = await loadProfile(admin, created.user.id);
    response.status(201).json({
      user: profile,
      session: publicSession(signedIn.session),
    });
  });

  app.post("/v1/accounts/login", loginLimiter, async (request, response) => {
    const input = parseBody(loginSchema, request.body);
    if (isReservedUsername(input.username)) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const auth = createAuthClient(config);
    const { data, error } = await auth.auth.signInWithPassword({
      email: internalEmailForUsername(input.username),
      password: input.password,
    });

    if (error || !data.user || !data.session) {
      throw new HttpError(401, "Invalid username or password.");
    }

    const profile = await loadProfile(admin, data.user.id);
    response.json({
      user: profile,
      session: publicSession(data.session),
    });
  });

  app.post("/v1/accounts/refresh", refreshLimiter, async (request, response) => {
    const input = parseBody(refreshSchema, request.body);
    const auth = createAuthClient(config);
    const { data, error } = await auth.auth.refreshSession({
      refresh_token: input.refreshToken,
    });

    if (error || !data.user || !data.session) {
      throw new HttpError(401, "Invalid or expired refresh token.");
    }

    const profile = await loadProfile(admin, data.user.id);
    response.json({
      user: profile,
      session: publicSession(data.session),
    });
  });

  app.get("/v1/me", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    response.json({ user: await loadProfile(admin, user.id) });
  });

  app.post("/v1/me/profile", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(profileUpdateSchema, request.body);
    const { error } = await admin
      .from("profiles")
      .update({ bio: input.description })
      .eq("id", user.id);
    if (error) throw error;
    clearCacheByPrefix("players:");
    response.json({ user: await loadProfile(admin, user.id) });
  });

  app.get("/v1/avatar/wardrobe", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const totalCreatorVisits = await syncAvatarUnlocks(admin, user.id);
    const [
      { data: profile, error: profileError },
      items,
      { data: inventory, error: inventoryError },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, avatar_appearance, tix")
        .eq("id", user.id)
        .single(),
      cached("avatar:wardrobe:approved-items", 5 * 60_000, async () => {
        const { data, error } = await admin
          .from("avatar_items")
          .select(
            "id, name, description, item_type, unlock_type, unlock_threshold, price_tix, bundle_key, sort_order, texture_url, model_url, model_format, model_preview_url, creator_id, created_from_upload, created_at, reviewed_at",
          )
          .eq("review_status", "approved")
          .order("sort_order");
        if (error) throw error;
        return data ?? [];
      }),
      admin
        .from("user_avatar_items")
        .select("item_id")
        .eq("user_id", user.id),
    ]);
    if (profileError) throw profileError;
    if (inventoryError) throw inventoryError;

    const owned = new Set((inventory ?? []).map((item) => item.item_id));
    response.json({
      equippedShirtId: profile.equipped_shirt_id,
      equippedPantsId: profile.equipped_pants_id,
      equippedHairId: profile.equipped_hair_id,
      equippedHatId: profile.equipped_hat_id,
      avatarAppearance: normalizeAvatarAppearance(profile.avatar_appearance),
      tix: Number(profile.tix ?? 0),
      totalCreatorVisits,
      items: items.map((item) => ({
        id: item.id,
        itemType: item.item_type,
        name: item.name,
        description: item.description,
        unlockType: item.unlock_type,
        unlockThreshold: item.unlock_threshold,
        priceTix: Number(item.price_tix ?? 0),
        bundleKey: item.bundle_key,
        textureUrl: avatarTextureUrl(item),
        modelUrl: item.model_url ?? null,
        modelFormat: item.model_format ?? null,
        modelPreviewUrl: item.model_preview_url ?? null,
        creatorId: item.creator_id ?? null,
        createdFromUpload: item.created_from_upload === true,
        owned: owned.has(item.id),
        equipped:
          item.item_type === "pants"
            ? profile.equipped_pants_id === item.id
            : item.item_type === "hair"
              ? profile.equipped_hair_id === item.id
              : item.item_type === "hat"
                ? profile.equipped_hat_id === item.id
                : profile.equipped_shirt_id === item.id,
      })),
    });
  });

  app.get("/v1/avatar/catalog", async (_request, response) => {
    const payload = await cached("avatar:catalog:approved", 5 * 60_000, async () => {
      const { data: items, error } = await admin
        .from("avatar_items")
        .select(
          "id, name, description, item_type, unlock_type, unlock_threshold, price_tix, bundle_key, sort_order, texture_url, model_url, model_format, model_preview_url, creator_id, created_from_upload, created_at, reviewed_at",
        )
        .eq("review_status", "approved")
        .order("sort_order")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const creatorIds = [
        ...new Set(
          (items ?? [])
            .map((item) => item.creator_id)
            .filter((creatorId): creatorId is string => Boolean(creatorId)),
        ),
      ];
      const { data: creators, error: creatorsError } = creatorIds.length
        ? await admin
            .from("profiles")
            .select("id, username, display_name")
            .in("id", creatorIds)
        : { data: [], error: null };
      if (creatorsError) throw creatorsError;

      const creatorById = new Map(
        (creators ?? []).map((creator) => [creator.id, creator]),
      );
      return {
        items: (items ?? []).map((item) => {
          const creator = item.creator_id
            ? creatorById.get(item.creator_id)
            : null;
          return {
            id: item.id,
            itemType: item.item_type,
            name: item.name,
            description: item.description,
            unlockType: item.unlock_type,
            unlockThreshold: item.unlock_threshold,
            priceTix: Number(item.price_tix ?? 0),
            bundleKey: item.bundle_key,
            textureUrl: avatarTextureUrl(item),
            modelUrl: item.model_url ?? null,
            modelFormat: item.model_format ?? null,
            modelPreviewUrl: item.model_preview_url ?? null,
            creatorId: item.creator_id ?? null,
            createdFromUpload: item.created_from_upload === true,
            createdAt: item.created_at ?? null,
            creator: creator
              ? {
                  username: creator.username,
                  displayName: creator.display_name,
                }
              : null,
          };
        }),
      };
    });
    publicCache(response, 300);
    response.json(payload);
  });

  app.get("/v1/avatar/uploads", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data, error } = await admin
      .from("avatar_items")
      .select(
        "id, name, description, item_type, unlock_type, price_tix, texture_url, model_url, model_format, model_preview_url, review_status, rejection_reason, created_at, reviewed_at",
      )
      .eq("creator_id", user.id)
      .eq("created_from_upload", true)
      .order("created_at", { ascending: false });
    if (error) throw error;
    response.json({
      submissions: (data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        itemType: item.item_type,
        unlockType: item.unlock_type,
        priceTix: Number(item.price_tix ?? 0),
        textureUrl: avatarTextureUrl(item),
        modelUrl: item.model_url ?? null,
        modelFormat: item.model_format ?? null,
        modelPreviewUrl: item.model_preview_url ?? null,
        reviewStatus: item.review_status,
        rejectionReason: item.rejection_reason ?? "",
        createdAt: item.created_at,
        reviewedAt: item.reviewed_at,
      })),
    });
  });

  app.post("/v1/avatar/uploads", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(avatarUploadSchema, request.body);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await admin
      .from("avatar_items")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", user.id)
      .eq("created_from_upload", true)
      .gte("created_at", startOfDay.toISOString());
    if (countError) throw countError;
    if ((count ?? 0) >= 5) {
      throw new HttpError(429, "You can upload 5 catalog items per day.");
    }
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    const itemId = `${profile.username}-${contentSlug(input.name)}-${randomUUID().slice(0, 8)}`;
    const textureUrl = input.textureData
      ? await uploadAvatarItemTexture(
          admin,
          user.id,
          itemId,
          input.textureData,
        )
      : null;
    const modelUrl =
      input.modelData && input.modelFormat
        ? await uploadAvatarItemModel(
            admin,
            user.id,
            itemId,
            input.modelData,
            input.modelFormat,
          )
        : null;
    const { data: item, error } = await admin
      .from("avatar_items")
      .insert({
        id: itemId,
        name: input.name,
        description: input.description,
        item_type: input.itemType,
        unlock_type: input.priceTix > 0 ? "tix" : "free",
        price_tix: input.priceTix,
        creator_id: user.id,
        texture_url: textureUrl,
        model_url: modelUrl,
        model_format: input.modelFormat ?? null,
        review_status: "pending",
        created_from_upload: true,
        sort_order: 10_000,
      })
      .select(
        "id, name, description, item_type, unlock_type, price_tix, texture_url, model_url, model_format, model_preview_url, review_status, rejection_reason, created_at, reviewed_at",
      )
      .single();
    if (error) throw error;
    clearCacheByPrefix("avatar:");
    response.status(201).json({
      submission: {
        id: item.id,
        name: item.name,
        description: item.description,
        itemType: item.item_type,
        unlockType: item.unlock_type,
        priceTix: Number(item.price_tix ?? 0),
        textureUrl: avatarTextureUrl(item),
        modelUrl: item.model_url ?? null,
        modelFormat: item.model_format ?? null,
        modelPreviewUrl: item.model_preview_url ?? null,
        reviewStatus: item.review_status,
        rejectionReason: item.rejection_reason ?? "",
        createdAt: item.created_at,
        reviewedAt: item.reviewed_at,
      },
    });
  });

  app.post("/v1/avatar/items/:itemId/claim", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const itemId = request.params.itemId;
    const { data: item, error: itemError } = await admin
      .from("avatar_items")
      .select("id, unlock_type, review_status")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new HttpError(404, "Avatar item not found.");
    if (item.review_status !== "approved") {
      throw new HttpError(403, "This avatar item is still under review.");
    }
    if (item.unlock_type === "creator_visits") {
      throw new HttpError(403, "This item must be unlocked.");
    }
    if (item.unlock_type === "tix") {
      const { data, error } = await admin.rpc(
        "purchase_avatar_item_with_tix",
        {
          target_user_id: user.id,
          target_item_id: item.id,
        },
      );
      if (error?.message.includes("not enough tix")) {
        throw new HttpError(403, "You do not have enough Tix.");
      }
      if (error) throw error;
      const purchase = Array.isArray(data) ? data[0] : data;
      response.status(201).json({
        itemId: item.id,
        itemIds: purchase?.purchased_item_ids ?? [item.id],
        owned: true,
        tix: Number(purchase?.balance ?? 0),
      });
      return;
    }
    const { error } = await admin.from("user_avatar_items").upsert(
      { user_id: user.id, item_id: item.id },
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
    if (error) throw error;
    const profile = await loadProfile(admin, user.id);
    response.status(201).json({
      itemId: item.id,
      itemIds: [item.id],
      owned: true,
      tix: profile.tix,
    });
  });

  app.post("/v1/avatar/equip", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(equipAvatarItemSchema, request.body);
    if (input.shirtId) {
      await syncAvatarUnlocks(admin, user.id);
      const { data: owned, error: ownedError } = await admin
        .from("user_avatar_items")
        .select("item_id")
        .eq("user_id", user.id)
        .eq("item_id", input.shirtId)
        .maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) throw new HttpError(403, "You do not own this shirt.");
    }
    const { error } = await admin
      .from("profiles")
      .update({ equipped_shirt_id: input.shirtId })
      .eq("id", user.id);
    if (error) throw error;
    clearCacheByPrefix("players:");
    response.json({
      equippedShirtId: input.shirtId,
      user: await loadProfile(admin, user.id),
    });
  });

  app.post("/v1/avatar/equip-pants", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(equipAvatarPantsSchema, request.body);
    if (input.pantsId) {
      await syncAvatarUnlocks(admin, user.id);
      const { data: owned, error: ownedError } = await admin
        .from("user_avatar_items")
        .select("item_id")
        .eq("user_id", user.id)
        .eq("item_id", input.pantsId)
        .maybeSingle();
      if (ownedError) throw ownedError;
      if (!owned) throw new HttpError(403, "You do not own these pants.");
    }
    const { error } = await admin
      .from("profiles")
      .update({ equipped_pants_id: input.pantsId })
      .eq("id", user.id);
    if (error) throw error;
    clearCacheByPrefix("players:");
    response.json({
      equippedPantsId: input.pantsId,
      user: await loadProfile(admin, user.id),
    });
  });

  async function assertOwnedAvatarItem(
    userId: string,
    itemId: string | null,
    itemType: "shirt" | "pants" | "hair" | "hat",
  ) {
    if (!itemId) return;
    await syncAvatarUnlocks(admin, userId);
    const { data: item, error: itemError } = await admin
      .from("avatar_items")
      .select("id, item_type, review_status")
      .eq("id", itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!item || item.item_type !== itemType || item.review_status !== "approved") {
      throw new HttpError(403, `You do not own this ${itemType}.`);
    }
    const { data: owned, error: ownedError } = await admin
      .from("user_avatar_items")
      .select("item_id")
      .eq("user_id", userId)
      .eq("item_id", itemId)
      .maybeSingle();
    if (ownedError) throw ownedError;
    if (!owned) throw new HttpError(403, `You do not own this ${itemType}.`);
  }

  app.post("/v1/avatar/equip-hair", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(equipAvatarAccessorySchema, request.body);
    await assertOwnedAvatarItem(user.id, input.itemId, "hair");
    const { error } = await admin
      .from("profiles")
      .update({ equipped_hair_id: input.itemId })
      .eq("id", user.id);
    if (error) throw error;
    clearCacheByPrefix("players:");
    response.json({
      equippedHairId: input.itemId,
      user: await loadProfile(admin, user.id),
    });
  });

  app.post("/v1/avatar/equip-hat", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(equipAvatarAccessorySchema, request.body);
    await assertOwnedAvatarItem(user.id, input.itemId, "hat");
    const { error } = await admin
      .from("profiles")
      .update({ equipped_hat_id: input.itemId })
      .eq("id", user.id);
    if (error) throw error;
    clearCacheByPrefix("players:");
    response.json({
      equippedHatId: input.itemId,
      user: await loadProfile(admin, user.id),
    });
  });

  app.post("/v1/avatar/appearance", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const appearance = parseBody(avatarAppearanceSchema, request.body);
    const { error } = await admin
      .from("profiles")
      .update({ avatar_appearance: appearance })
      .eq("id", user.id);
    if (error) throw error;
    clearCacheByPrefix("players:");
    response.json({
      avatarAppearance: appearance,
      user: await loadProfile(admin, user.id),
    });
  });

  app.get("/v1/admin/accounts", async (request, response) => {
    await ownerUser(request, admin);
    const page = integerQuery(request.query.page, 1, 1, 10_000);
    const perPage = integerQuery(request.query.perPage, 100, 10, 200);
    const { data: authData, error: authError } =
      await admin.auth.admin.listUsers({ page, perPage });
    if (authError) throw authError;

    const userIds = authData.users.map((user) => user.id);
    const [
      profilesResult,
      gamesResult,
      friendshipsResult,
      inventoryResult,
      avatarItemsResult,
    ] = await Promise.all([
      userIds.length
        ? admin
            .from("profiles")
            .select(
              "id, polymons_id, username, display_name, bio, tix, avatar_url, equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, created_at",
            )
            .in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("games").select("id, owner_id, visit_count"),
      admin
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted"),
      userIds.length
        ? admin
            .from("user_avatar_items")
            .select("user_id, item_id, acquired_at")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("avatar_items")
        .select("id, name, description, item_type, unlock_type, unlock_threshold, price_tix, bundle_key, sort_order, texture_url, model_url, model_format, model_preview_url, review_status, creator_id, created_from_upload, created_at, reviewed_at")
        .order("sort_order"),
    ]);
    if (profilesResult.error) throw profilesResult.error;
    if (gamesResult.error) throw gamesResult.error;
    if (friendshipsResult.error) throw friendshipsResult.error;
    if (inventoryResult.error) throw inventoryResult.error;
    if (avatarItemsResult.error) throw avatarItemsResult.error;

    const profileById = new Map(
      (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
    );
    const accountStats = new Map<
      string,
      { friends: number; games: number; gameVisits: number }
    >();
    const statsFor = (userId: string) => {
      const current = accountStats.get(userId);
      if (current) return current;
      const created = { friends: 0, games: 0, gameVisits: 0 };
      accountStats.set(userId, created);
      return created;
    };

    for (const game of gamesResult.data ?? []) {
      if (!game.owner_id) continue;
      const stats = statsFor(game.owner_id);
      stats.games += 1;
      stats.gameVisits += Number(game.visit_count ?? 0);
    }
    for (const friendship of friendshipsResult.data ?? []) {
      statsFor(friendship.requester_id).friends += 1;
      statsFor(friendship.addressee_id).friends += 1;
    }

    const livePlayers = presence().players;
    const liveByUserId = new Map(
      livePlayers.map((player) => [
        player.userId,
        { gameId: player.gameId, connected: true },
      ]),
    );
    const totalVisits = (gamesResult.data ?? []).reduce(
      (total, game) => total + Number(game.visit_count ?? 0),
      0,
    );

    response.set("Cache-Control", "private, no-store");
    response.json({
      accounts: authData.users.map((authUser) => {
        const profile = profileById.get(authUser.id);
        const stats = statsFor(authUser.id);
        return {
          id: authUser.id,
          username: profile?.username ?? "unknown",
          polymonsId: Number(profile?.polymons_id ?? 0),
          displayName: profile?.display_name ?? "Unknown player",
          description: profile?.bio ?? "",
          tix: Number(profile?.tix ?? 0),
          avatarUrl: profile?.avatar_url ?? null,
          equippedShirtId: profile?.equipped_shirt_id ?? null,
          equippedPantsId: profile?.equipped_pants_id ?? null,
          equippedHairId: profile?.equipped_hair_id ?? null,
          equippedHatId: profile?.equipped_hat_id ?? null,
          joinedAt: profile?.created_at ?? authUser.created_at,
          lastSignInAt: authUser.last_sign_in_at ?? null,
          role: isOwnerAccount(authUser) ? "owner" : "player",
          loginDisabled: authUser.app_metadata?.login_disabled === true,
          passwordStatus: "protected-hash-only",
          inventory: (inventoryResult.data ?? [])
            .filter((item) => item.user_id === authUser.id)
            .map((item) => ({
              itemId: item.item_id,
              acquiredAt: item.acquired_at,
            })),
          online: liveByUserId.get(authUser.id) ?? {
            gameId: null,
            connected: false,
          },
          stats,
        };
      }),
      pagination: {
        page,
        perPage,
        total: authData.total ?? authData.users.length,
        lastPage:
          authData.lastPage ??
          Math.max(1, Math.ceil((authData.total ?? authData.users.length) / perPage)),
      },
      summary: {
        accounts: authData.total ?? authData.users.length,
        games: (gamesResult.data ?? []).length,
        gameVisits: totalVisits,
        onlinePlayers: new Set(livePlayers.map((player) => player.userId)).size,
      },
      avatarItems: (avatarItemsResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        itemType: item.item_type,
        unlockType: item.unlock_type,
        unlockThreshold: item.unlock_threshold,
        priceTix: Number(item.price_tix ?? 0),
        bundleKey: item.bundle_key,
        textureUrl: avatarTextureUrl(item),
        modelUrl: item.model_url ?? null,
        modelFormat: item.model_format ?? null,
        modelPreviewUrl: item.model_preview_url ?? null,
        reviewStatus: item.review_status,
        creatorId: item.creator_id ?? null,
        createdFromUpload: item.created_from_upload === true,
      })),
    });
  });

  app.get("/v1/admin/catalog-submissions", async (request, response) => {
    await ownerUser(request, admin);
    const { data, error } = await admin
      .from("avatar_items")
      .select(
        "id, name, description, item_type, unlock_type, price_tix, texture_url, model_url, model_format, model_preview_url, review_status, rejection_reason, created_at, reviewed_at, creator_id",
      )
      .eq("created_from_upload", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const creatorIds = [
      ...new Set((data ?? []).flatMap((item) => item.creator_id ? [item.creator_id] : [])),
    ];
    const { data: creators, error: creatorsError } = creatorIds.length
      ? await admin
          .from("profiles")
          .select("id, username, display_name")
          .in("id", creatorIds)
      : { data: [], error: null };
    if (creatorsError) throw creatorsError;
    const creatorById = new Map((creators ?? []).map((creator) => [creator.id, creator]));
    response.json({
      submissions: (data ?? []).map((item) => {
        const creator = item.creator_id ? creatorById.get(item.creator_id) : null;
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          itemType: item.item_type,
          unlockType: item.unlock_type,
          priceTix: Number(item.price_tix ?? 0),
          textureUrl: avatarTextureUrl(item),
          modelUrl: item.model_url ?? null,
          modelFormat: item.model_format ?? null,
          modelPreviewUrl: item.model_preview_url ?? null,
          reviewStatus: item.review_status,
          rejectionReason: item.rejection_reason ?? "",
          createdAt: item.created_at,
          reviewedAt: item.reviewed_at,
          creator: creator
            ? {
                id: creator.id,
                username: creator.username,
                displayName: creator.display_name,
              }
            : null,
        };
      }),
    });
  });

  app.post("/v1/admin/catalog-submissions/:itemId/review", async (request, response) => {
    const owner = await ownerUser(request, admin);
    const itemId = request.params.itemId;
    if (!/^[a-z0-9][a-z0-9-]{1,95}$/.test(itemId)) {
      throw new HttpError(400, "Invalid catalog item ID.");
    }
    const input = parseBody(adminCatalogReviewSchema, request.body);
    const { data, error } = await admin
      .from("avatar_items")
      .update({
        review_status: input.status,
        rejection_reason: input.status === "rejected" ? input.reason : "",
        reviewed_by: owner.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", itemId)
      .eq("created_from_upload", true)
      .select("id, review_status, rejection_reason")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Catalog submission not found.");
    clearCacheByPrefix("avatar:");
    clearCacheByPrefix("players:");
    response.json({
      itemId: data.id,
      reviewStatus: data.review_status,
      rejectionReason: data.rejection_reason ?? "",
    });
  });

  app.post("/v1/admin/accounts/:userId/tix", async (request, response) => {
    await ownerUser(request, admin);
    const userId = request.params.userId;
    if (!UUID_PATTERN.test(userId)) {
      throw new HttpError(400, "Invalid account ID.");
    }
    const input = parseBody(adminTixSchema, request.body);
    const { data, error } = await admin.rpc("adjust_profile_tix", {
      target_user_id: userId,
      adjustment: input.amount,
      set_balance: input.mode === "set",
    });
    if (error) throw error;
    response.json({
      userId,
      tix: Number(data ?? 0),
      mode: input.mode,
      amount: input.amount,
    });
  });

  app.post(
    "/v1/admin/accounts/:userId/inventory",
    async (request, response) => {
      await ownerUser(request, admin);
      const userId = request.params.userId;
      if (!UUID_PATTERN.test(userId)) {
        throw new HttpError(400, "Invalid account ID.");
      }
      const input = parseBody(adminInventorySchema, request.body);
      const { data: item, error: itemError } = await admin
        .from("avatar_items")
        .select("id, item_type")
        .eq("id", input.itemId)
        .maybeSingle();
      if (itemError) throw itemError;
      if (!item) throw new HttpError(404, "Avatar item not found.");

      if (input.owned) {
        const { error } = await admin.from("user_avatar_items").upsert(
          { user_id: userId, item_id: input.itemId },
          { onConflict: "user_id,item_id", ignoreDuplicates: true },
        );
        if (error) throw error;
        if (input.equip) {
          const equippedColumn =
            item.item_type === "pants"
              ? "equipped_pants_id"
              : item.item_type === "hair"
                ? "equipped_hair_id"
                : item.item_type === "hat"
                  ? "equipped_hat_id"
                  : "equipped_shirt_id";
          const { error: equipError } = await admin
            .from("profiles")
            .update({ [equippedColumn]: input.itemId })
            .eq("id", userId);
          if (equipError) throw equipError;
        }
      } else {
        const { error } = await admin
          .from("user_avatar_items")
          .delete()
          .eq("user_id", userId)
          .eq("item_id", input.itemId);
        if (error) throw error;
        const equippedColumn =
          item.item_type === "pants"
            ? "equipped_pants_id"
            : item.item_type === "hair"
              ? "equipped_hair_id"
              : item.item_type === "hat"
                ? "equipped_hat_id"
                : "equipped_shirt_id";
        const { error: unequipError } = await admin
          .from("profiles")
          .update({ [equippedColumn]: null })
          .eq("id", userId)
          .eq(equippedColumn, input.itemId);
        if (unequipError) throw unequipError;
      }

      response.json({
        userId,
        itemId: input.itemId,
        owned: input.owned,
        equipped: input.owned && input.equip === true,
      });
    },
  );

  app.post("/v1/player-account-links", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const ticket = createPlayerAccountTicket();
    const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
    const { error } = await admin.from("player_account_links").insert({
      user_id: user.id,
      ticket_hash: hashPlayerAccountTicket(
        ticket,
        config.playTicketSecret,
      ),
      expires_at: expiresAt,
    });

    if (error) throw error;
    response.set("Cache-Control", "no-store");
    response.status(201).json({
      playerAccountLink: { ticket, expiresAt },
    });
  });

  app.post(
    "/v1/player-account-links/redeem",
    loginLimiter,
    async (request, response) => {
      const input = parseBody(playerAccountLinkSchema, request.body);
      const now = new Date().toISOString();
      const { data: link, error: linkError } = await admin
        .from("player_account_links")
        .update({ consumed_at: now })
        .eq(
          "ticket_hash",
          hashPlayerAccountTicket(input.ticket, config.playTicketSecret),
        )
        .is("consumed_at", null)
        .gt("expires_at", now)
        .select("user_id")
        .maybeSingle();

      if (linkError) throw linkError;
      if (!link) {
        throw new HttpError(401, "That Player link is invalid or expired.");
      }

      const { data: account, error: accountError } =
        await admin.auth.admin.getUserById(link.user_id);
      if (
        accountError ||
        !account.user?.email ||
        isLoginDisabled(account.user)
      ) {
        throw new HttpError(401, "That Player link cannot be used.");
      }

      const { data: generated, error: generateError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: account.user.email,
        });
      if (generateError || !generated.properties.hashed_token) {
        throw new HttpError(500, "Could not connect the Player account.");
      }

      const auth = createAuthClient(config);
      const { data: verified, error: verifyError } =
        await auth.auth.verifyOtp({
          token_hash: generated.properties.hashed_token,
          type: "email",
        });
      if (verifyError || !verified.user || !verified.session) {
        throw new HttpError(500, "Could not connect the Player account.");
      }

      response.set("Cache-Control", "no-store");
      response.json({
        user: await loadProfile(admin, verified.user.id),
        session: publicSession(verified.session),
      });
    },
  );

  app.get("/v1/games/:gameId", async (request, response) => {
    const gameId = request.params.gameId;
    const game = await cached(cacheKey(["games:detail", gameId]), 30_000, async () => {
      let query = admin
        .from("games")
        .select(
          "id, slug, title, description, visibility, genre, thumbnail_url, platform_owned, owner_id, visit_count, created_at, updated_at",
        )
        .eq("visibility", "public");

      query = UUID_PATTERN.test(gameId)
        ? query.eq("id", gameId)
        : query.eq("slug", gameId);

      const { data, error } = await query.maybeSingle();
      if (error) {
        throw error;
      }
      if (!data) {
        throw new HttpError(404, "Game not found.");
      }

      const { data: owner } = data.owner_id
        ? await admin
            .from("profiles")
            .select("username, display_name")
            .eq("id", data.owner_id)
            .maybeSingle()
        : { data: null };
      const { data: version } = await admin
        .from("game_versions")
        .select("manifest, version_number")
        .eq("game_id", data.id)
        .eq("status", "published")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count: favorites } = await admin
        .from("game_favorites")
        .select("game_id", { count: "exact", head: true })
        .eq("game_id", data.id);
      const { data: badges, error: badgesError } = await admin
        .from("game_badges")
        .select("id, name, description, icon_url")
        .eq("game_id", data.id)
        .order("created_at");
      if (badgesError) throw badgesError;
      const [
        { data: gamePasses, error: gamePassesError },
        { data: developerProducts, error: developerProductsError },
      ] = await Promise.all([
        admin
          .from("game_passes")
          .select("id, name, description, price_tix")
          .eq("game_id", data.id)
          .eq("is_active", true)
          .order("created_at"),
        admin
          .from("developer_products")
          .select("id, name, description, price_tix, effect_key, effect_amount")
          .eq("game_id", data.id)
          .eq("is_active", true)
          .order("created_at"),
      ]);
      if (gamePassesError) throw gamePassesError;
      if (developerProductsError) throw developerProductsError;
      return {
        id: data.id,
        slug: data.slug,
        title: data.title,
        description: data.description,
        visibility: data.visibility,
        genre: data.genre,
        thumbnailUrl: data.thumbnail_url,
        platformOwned: data.platform_owned,
        creator: owner?.display_name ?? "Polymons",
        creatorUsername: owner?.username ?? "polymons",
        visits: Number(data.visit_count ?? 0),
        favorites: favorites ?? 0,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        manifest: version?.manifest ?? null,
        version: version?.version_number ?? null,
        badges: (badges ?? []).map((badge) => ({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          iconUrl: badge.icon_url,
        })),
        gamePasses: (gamePasses ?? []).map((pass) => ({
          id: pass.id,
          name: pass.name,
          description: pass.description,
          priceTix: Number(pass.price_tix ?? 0),
        })),
        developerProducts: (developerProducts ?? []).map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          priceTix: Number(product.price_tix ?? 0),
          effectKey: product.effect_key ?? null,
          effectAmount: Number(product.effect_amount ?? 0),
        })),
      };
    });
    publicCache(response, 30);
    response.json({
      game: {
        ...game,
        activePlayers: presence().counts[game.id] ?? 0,
      },
    });
  });

  app.post("/v1/games/:gameId/badges/award", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(awardBadgeSchema, request.body);
    const gameId = request.params.gameId;
    const activePlayer = presence().players.find(
      (player) => player.userId === user.id && player.gameId === gameId,
    );
    if (!activePlayer) {
      throw new HttpError(403, "Join this game before earning its badges.");
    }
    const { data, error } = await admin.rpc("award_game_badge", {
      target_user_id: user.id,
      target_game_id: gameId,
      target_badge_name: input.badgeName,
    });
    if (error?.message.includes("badge not found")) {
      throw new HttpError(404, "Badge not found.");
    }
    if (error) throw error;
    response.status(201).json({ badgeId: data, awarded: true });
  });

  app.post("/v1/games/:gameId/badges/check", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(hasBadgeSchema, request.body);
    const gameId = request.params.gameId;
    if (!UUID_PATTERN.test(gameId)) {
      throw new HttpError(400, "Invalid game ID.");
    }
    const { data, error } = await admin.rpc("player_has_game_badge", {
      target_user_id: user.id,
      target_game_id: gameId,
      target_badge_name: input.badgeName,
    });
    if (error) throw error;
    response.json({ gameId, badgeName: input.badgeName, owned: data === true });
  });

  app.get("/v1/games/:gameId/entitlements", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const gameId = request.params.gameId;
    if (!UUID_PATTERN.test(gameId)) {
      throw new HttpError(400, "Invalid game ID.");
    }
    const [
      { data: ownedPasses, error: passesError },
      { data: playerData, error: playerDataError },
      { data: playerBadges, error: playerBadgesError },
    ] = await Promise.all([
      admin
        .from("user_game_passes")
        .select("game_pass_id, game_passes!inner(game_id, name)")
        .eq("user_id", user.id)
        .eq("game_passes.game_id", gameId),
      admin
        .from("game_player_data")
        .select("data")
        .eq("game_id", gameId)
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("player_badges")
        .select("game_badges!inner(game_id, name)")
        .eq("user_id", user.id)
        .eq("game_badges.game_id", gameId),
    ]);
    if (passesError) throw passesError;
    if (playerDataError) throw playerDataError;
    if (playerBadgesError) throw playerBadgesError;
    response.json({
      gamePasses: (ownedPasses ?? []).map((pass) => pass.game_pass_id),
      gamePassNames: (ownedPasses ?? []).flatMap((pass) => {
        const gamePass = Array.isArray(pass.game_passes)
          ? pass.game_passes[0]
          : pass.game_passes;
        return gamePass?.name ? [gamePass.name] : [];
      }),
      badges: (playerBadges ?? []).flatMap((badge) => {
        const gameBadge = Array.isArray(badge.game_badges)
          ? badge.game_badges[0]
          : badge.game_badges;
        return gameBadge?.name ? [gameBadge.name] : [];
      }),
      playerData: playerData?.data ?? {},
    });
  });

  app.post("/v1/games/:gameId/gamepasses/:passId/purchase", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data: pass, error: passError } = await admin
      .from("game_passes")
      .select("id, game_id")
      .eq("id", request.params.passId)
      .eq("game_id", request.params.gameId)
      .eq("is_active", true)
      .maybeSingle();
    if (passError) throw passError;
    if (!pass) throw new HttpError(404, "Gamepass not found.");
    const { data, error } = await admin.rpc("purchase_game_pass_with_tix", {
      target_user_id: user.id,
      target_game_pass_id: pass.id,
    });
    if (error?.message.includes("not enough tix")) {
      throw new HttpError(403, "You do not have enough Tix.");
    }
    if (error) throw error;
    const purchase = Array.isArray(data) ? data[0] : data;
    response.status(201).json({
      passId: pass.id,
      owned: true,
      tix: Number(purchase?.balance ?? 0),
    });
  });

  app.post("/v1/games/:gameId/products/:productId/purchase", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data: product, error: productError } = await admin
      .from("developer_products")
      .select("id, game_id")
      .eq("id", request.params.productId)
      .eq("game_id", request.params.gameId)
      .eq("is_active", true)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) throw new HttpError(404, "Developer product not found.");
    const { data, error } = await admin.rpc(
      "purchase_developer_product_with_tix",
      {
        target_user_id: user.id,
        target_product_id: product.id,
      },
    );
    if (error?.message.includes("not enough tix")) {
      throw new HttpError(403, "You do not have enough Tix.");
    }
    if (error) throw error;
    const purchase = Array.isArray(data) ? data[0] : data;
    response.status(201).json({
      productId: product.id,
      purchaseId: purchase?.purchase_id,
      tix: Number(purchase?.balance ?? 0),
      playerData: purchase?.player_data ?? {},
    });
  });

  app.get("/v1/games", async (request, response) => {
    const search =
      typeof request.query.query === "string"
        ? request.query.query.trim()
        : "";
    if (search.length > 64) {
      throw new HttpError(400, "Game search is too long.");
    }
    const cachedGames = await cached(
      cacheKey(["games:list", search.toLowerCase()]),
      search ? 30_000 : 60_000,
      async () => {
        let gameQuery = admin
          .from("games")
          .select(
            "id, slug, title, description, genre, thumbnail_url, owner_id, visit_count, created_at, updated_at",
          )
          .eq("visibility", "public");
        if (search) {
          const escaped = search.replace(/[%_,]/g, "\\$&");
          gameQuery = gameQuery.or(
            `title.ilike.%${escaped}%,description.ilike.%${escaped}%,genre.ilike.%${escaped}%`,
          );
        }
        const { data, error } = await gameQuery
          .order("updated_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        const ownerIds = [
          ...new Set(
            (data ?? []).flatMap((game) => (game.owner_id ? [game.owner_id] : [])),
          ),
        ];
        const { data: owners } = ownerIds.length
          ? await admin
              .from("profiles")
              .select("id, username, display_name")
              .in("id", ownerIds)
          : { data: [] };
        const ownerById = new Map((owners ?? []).map((owner) => [owner.id, owner]));
        const gameIds = (data ?? []).map((game) => game.id);
        const { data: favoriteRows } = gameIds.length
          ? await admin.from("game_favorites").select("game_id").in("game_id", gameIds)
          : { data: [] };
        const favoritesByGame = new Map<string, number>();
        for (const favorite of favoriteRows ?? []) {
          favoritesByGame.set(
            favorite.game_id,
            (favoritesByGame.get(favorite.game_id) ?? 0) + 1,
          );
        }
        return (data ?? []).map((game) => {
          const owner = game.owner_id ? ownerById.get(game.owner_id) : null;
          return {
            id: game.id,
            slug: game.slug,
            title: game.title,
            description: game.description,
            genre: game.genre,
            thumbnailUrl: game.thumbnail_url,
            creator: owner?.display_name ?? "Polymons",
            creatorUsername: owner?.username ?? "polymons",
            visits: Number(game.visit_count ?? 0),
            favorites: favoritesByGame.get(game.id) ?? 0,
            createdAt: game.created_at,
            updatedAt: game.updated_at,
          };
        });
      },
    );
    const counts = presence().counts;
    publicCache(response, search ? 30 : 60);
    response.json({
      games: cachedGames.map((game) => ({
        ...game,
        activePlayers: counts[game.id] ?? 0,
      })),
    });
  });

  app.get("/v1/games/library", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const [favoritesResult, recentResult] = await Promise.all([
      admin
        .from("game_favorites")
        .select("game_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("recent_games")
        .select("game_id, last_played_at, play_count")
        .eq("user_id", user.id)
        .order("last_played_at", { ascending: false })
        .limit(24),
    ]);
    if (favoritesResult.error) throw favoritesResult.error;
    if (recentResult.error) throw recentResult.error;
    response.set("Cache-Control", "private, no-store");
    response.json({
      favoriteGameIds: (favoritesResult.data ?? []).map((item) => item.game_id),
      recentGames: recentResult.data ?? [],
    });
  });

  app.post("/v1/games/:gameId/favorite", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(favoriteGameSchema, request.body);
    const gameId = request.params.gameId;
    let query = admin
      .from("games")
      .select("id")
      .eq("visibility", "public");
    query = UUID_PATTERN.test(gameId)
      ? query.eq("id", gameId)
      : query.eq("slug", gameId);
    const { data: game, error: gameError } = await query.maybeSingle();
    if (gameError) throw gameError;
    if (!game) throw new HttpError(404, "Game not found.");

    const result = input.favorite
      ? await admin.from("game_favorites").upsert(
          { user_id: user.id, game_id: game.id },
          { onConflict: "user_id,game_id", ignoreDuplicates: true },
        )
      : await admin
          .from("game_favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("game_id", game.id);
    if (result.error) throw result.error;
    clearCacheByPrefix("games:");
    response.json({ gameId: game.id, favorite: input.favorite });
  });

  app.get("/v1/players", async (request, response) => {
    const query =
      typeof request.query.query === "string"
        ? request.query.query.trim().toLowerCase()
        : "";
    if (query.length < 1) {
      publicCache(response, 30);
      response.json({ players: [] });
      return;
    }
    if (query.length > 32 || !/^[a-z0-9_ -]+$/.test(query)) {
      throw new HttpError(400, "Enter a valid player search.");
    }
    const players = await cached(
      cacheKey(["players:search", query]),
      30_000,
      async () => {
        const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
        const [usernames, displayNames] = await Promise.all([
          admin
            .from("profiles")
            .select(
              "id, polymons_id, username, display_name, bio, avatar_url, equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, avatar_appearance, created_at",
            )
            .ilike("username", pattern)
            .order("username")
            .limit(12),
          admin
            .from("profiles")
            .select(
              "id, polymons_id, username, display_name, bio, avatar_url, equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, avatar_appearance, created_at",
            )
            .ilike("display_name", pattern)
            .order("username")
            .limit(12),
        ]);
        if (usernames.error) throw usernames.error;
        if (displayNames.error) throw displayNames.error;
        const { data: numericIds, error: numericIdsError } = /^\d+$/.test(query)
          ? await admin
              .from("profiles")
              .select(
                "id, polymons_id, username, display_name, bio, avatar_url, equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, avatar_appearance, created_at",
              )
              .eq("polymons_id", Number(query))
              .limit(1)
          : { data: [], error: null };
        if (numericIdsError) throw numericIdsError;
        const rows = [
          ...(numericIds ?? []),
          ...(usernames.data ?? []),
          ...(displayNames.data ?? []),
        ];
        const assetById = await loadEquippedAvatarAssetMap(admin, rows);
        return [
          ...new Map(
            rows.map((player) => [
              player.id,
              {
                id: player.id,
                polymonsId: Number(player.polymons_id),
                username: player.username,
                displayName: player.display_name,
                description: player.bio ?? "",
                avatarUrl: player.avatar_url,
                equippedShirtId: player.equipped_shirt_id,
                equippedPantsId: player.equipped_pants_id,
                equippedHairId: player.equipped_hair_id,
                equippedHatId: player.equipped_hat_id,
                ...equippedAvatarAssetFields(player, assetById),
                avatarAppearance: normalizeAvatarAppearance(player.avatar_appearance),
                joinedAt: player.created_at,
              },
            ]),
          ).values(),
        ].slice(0, 12);
      },
    );
    publicCache(response, 30);
    response.json({ players });
  });

  app.get("/v1/players/:username", async (request, response) => {
    const username = request.params.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      throw new HttpError(404, "Player not found.");
    }
    const { data: player, error: playerError } = await admin
      .from("profiles")
      .select(
        "id, polymons_id, username, display_name, bio, avatar_url, equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, avatar_appearance, created_at",
      )
      .eq("username", username)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) throw new HttpError(404, "Player not found.");
    const playerAssetById = await loadEquippedAvatarAssetMap(admin, [player]);

    const [
      { data: games, error: gamesError },
      { count: friends, error: friendsError },
      { count: followers, error: followersError },
      { data: playerBadges, error: playerBadgesError },
    ] =
      await Promise.all([
        admin
          .from("games")
          .select(
            "id, slug, title, description, genre, thumbnail_url, visit_count, created_at, updated_at",
          )
          .eq("owner_id", player.id)
          .eq("visibility", "public")
          .order("updated_at", { ascending: false }),
        admin
          .from("friendships")
          .select("id", { count: "exact", head: true })
          .eq("status", "accepted")
          .or(`requester_id.eq.${player.id},addressee_id.eq.${player.id}`),
        admin
          .from("creator_follows")
          .select("creator_id", { count: "exact", head: true })
          .eq("creator_id", player.id),
        admin
          .from("player_badges")
          .select("badge_id, awarded_at")
          .eq("user_id", player.id)
          .order("awarded_at", { ascending: false })
          .limit(100),
      ]);
    if (gamesError) throw gamesError;
    if (friendsError) throw friendsError;
    if (followersError) throw followersError;
    if (playerBadgesError) throw playerBadgesError;
    const badgeIds = (playerBadges ?? []).map((badge) => badge.badge_id);
    const { data: badgeDetails, error: badgeDetailsError } = badgeIds.length
      ? await admin
          .from("game_badges")
          .select("id, game_id, name, description, icon_url")
          .in("id", badgeIds)
      : { data: [], error: null };
    if (badgeDetailsError) throw badgeDetailsError;
    const badgeById = new Map(
      (badgeDetails ?? []).map((badge) => [badge.id, badge]),
    );
    const counts = presence().counts;
    const publicGames = (games ?? []).map((game) => ({
      id: game.id,
      slug: game.slug,
      title: game.title,
      description: game.description,
      genre: game.genre,
      thumbnailUrl: game.thumbnail_url,
      creator: player.display_name,
      creatorUsername: player.username,
      activePlayers: counts[game.id] ?? 0,
      visits: Number(game.visit_count ?? 0),
      favorites: 0,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
    }));
    response.json({
      player: {
        id: player.id,
        polymonsId: Number(player.polymons_id),
        username: player.username,
        displayName: player.display_name,
        description: player.bio ?? "",
        avatarUrl: player.avatar_url,
        equippedShirtId: player.equipped_shirt_id,
        equippedPantsId: player.equipped_pants_id,
        equippedHairId: player.equipped_hair_id,
        equippedHatId: player.equipped_hat_id,
        ...equippedAvatarAssetFields(player, playerAssetById),
        avatarAppearance: normalizeAvatarAppearance(player.avatar_appearance),
        joinedAt: player.created_at,
      },
      stats: {
        friends: friends ?? 0,
        games: publicGames.length,
        gameVisits: publicGames.reduce((total, game) => total + game.visits, 0),
        followers: followers ?? 0,
      },
      games: publicGames,
      badges: (playerBadges ?? []).flatMap((earned) => {
        const badge = badgeById.get(earned.badge_id);
        return badge
          ? [{
              id: badge.id,
              gameId: badge.game_id,
              name: badge.name,
              description: badge.description,
              iconUrl: badge.icon_url,
              awardedAt: earned.awarded_at,
            }]
          : [];
      }),
    });
  });

  app.post("/v1/players/:username/follow", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(followCreatorSchema, request.body);
    const username = request.params.username.trim().toLowerCase();
    const { data: creator, error: creatorError } = await admin
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .maybeSingle();
    if (creatorError) throw creatorError;
    if (!creator) throw new HttpError(404, "Creator not found.");
    if (creator.id === user.id) {
      throw new HttpError(400, "You cannot follow yourself.");
    }
    const result = input.following
      ? await admin.from("creator_follows").upsert(
          { follower_id: user.id, creator_id: creator.id },
          { onConflict: "follower_id,creator_id", ignoreDuplicates: true },
        )
      : await admin
          .from("creator_follows")
          .delete()
          .eq("follower_id", user.id)
          .eq("creator_id", creator.id);
    if (result.error) throw result.error;
    response.json({ username: creator.username, following: input.following });
  });

  app.get("/v1/follows", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data: follows, error } = await admin
      .from("creator_follows")
      .select("creator_id, created_at")
      .eq("follower_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const creatorIds = (follows ?? []).map((follow) => follow.creator_id);
    const { data: creators, error: creatorError } = creatorIds.length
      ? await admin
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", creatorIds)
      : { data: [], error: null };
    if (creatorError) throw creatorError;
    const creatorById = new Map(
      (creators ?? []).map((creator) => [creator.id, creator]),
    );
    response.json({
      creators: (follows ?? []).flatMap((follow) => {
        const creator = creatorById.get(follow.creator_id);
        return creator
          ? [{
              id: creator.id,
              username: creator.username,
              displayName: creator.display_name,
              avatarUrl: creator.avatar_url,
              followedAt: follow.created_at,
            }]
          : [];
      }),
    });
  });

  app.get("/v1/creator/analytics", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data: games, error } = await admin
      .from("games")
      .select("id, slug, title, visit_count, updated_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const gameIds = (games ?? []).map((game) => game.id);
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: sessions, error: sessionsError }, { data: favorites, error: favoritesError }] =
      gameIds.length
        ? await Promise.all([
            admin
              .from("play_sessions")
              .select("game_id, created_at")
              .in("game_id", gameIds)
              .gte("created_at", since),
            admin.from("game_favorites").select("game_id").in("game_id", gameIds),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
          ];
    if (sessionsError) throw sessionsError;
    if (favoritesError) throw favoritesError;
    const weeklyByGame = new Map<string, number>();
    const favoritesByGame = new Map<string, number>();
    for (const session of sessions ?? []) {
      weeklyByGame.set(
        session.game_id,
        (weeklyByGame.get(session.game_id) ?? 0) + 1,
      );
    }
    for (const favorite of favorites ?? []) {
      favoritesByGame.set(
        favorite.game_id,
        (favoritesByGame.get(favorite.game_id) ?? 0) + 1,
      );
    }
    const counts = presence().counts;
    response.json({
      totals: {
        games: gameIds.length,
        visits: (games ?? []).reduce(
          (total, game) => total + Number(game.visit_count ?? 0),
          0,
        ),
        activePlayers: gameIds.reduce(
          (total, gameId) => total + (counts[gameId] ?? 0),
          0,
        ),
        playsLast7Days: (sessions ?? []).length,
      },
      games: (games ?? []).map((game) => ({
        id: game.id,
        slug: game.slug,
        title: game.title,
        visits: Number(game.visit_count ?? 0),
        activePlayers: counts[game.id] ?? 0,
        favorites: favoritesByGame.get(game.id) ?? 0,
        playsLast7Days: weeklyByGame.get(game.id) ?? 0,
        updatedAt: game.updated_at,
      })),
    });
  });

  app.post("/v1/games/publish", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(publishGameSchema, request.body);
    if (Buffer.byteLength(JSON.stringify(input.manifest), "utf8") > 8_000_000) {
      throw new HttpError(413, "This game is too large to publish.");
    }
    const { data: existing, error: lookupError } = await admin
      .from("games")
      .select("id, slug")
      .eq("owner_id", user.id)
      .eq("studio_project_id", input.projectId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    let game = existing;
    if (game) {
      const { data, error } = await admin
        .from("games")
        .update({
          title: input.title,
          description: input.description,
          genre: input.genre,
          visibility: "public",
        })
        .eq("id", game.id)
        .select("id, slug")
        .single();
      if (error) throw error;
      game = data;
    } else {
      const { data, error } = await admin
        .from("games")
        .insert({
          owner_id: user.id,
          studio_project_id: input.projectId,
          slug: gameSlug(input.title, input.projectId),
          title: input.title,
          description: input.description,
          genre: input.genre,
          visibility: "public",
          platform_owned: false,
        })
        .select("id, slug")
        .single();
      if (error) throw error;
      game = data;
    }
    if (input.thumbnailData) {
      const thumbnailUrl = await uploadGameThumbnail(
        admin,
        game.id,
        input.thumbnailData,
      );
      const { error: thumbnailError } = await admin
        .from("games")
        .update({ thumbnail_url: thumbnailUrl })
        .eq("id", game.id);
      if (thumbnailError) throw thumbnailError;
    }
    await syncGameBadges(admin, game.id, user.id, input.badges);
    await syncGameMonetization(
      admin,
      game.id,
      user.id,
      input.gamePasses,
      input.developerProducts,
    );
    const { data: latest } = await admin
      .from("game_versions")
      .select("version_number")
      .eq("game_id", game.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error: retireError } = await admin
      .from("game_versions")
      .update({ status: "retired" })
      .eq("game_id", game.id)
      .eq("status", "published");
    if (retireError) throw retireError;
    const versionNumber = (latest?.version_number ?? 0) + 1;
    const { error: versionError } = await admin.from("game_versions").insert({
      game_id: game.id,
      version_number: versionNumber,
      status: "published",
      manifest: input.manifest,
      created_by: user.id,
      published_at: new Date().toISOString(),
    });
    if (versionError) throw versionError;
    clearCacheByPrefix("games:");
    response.status(201).json({
      game: {
        id: game.id,
        slug: game.slug,
        title: input.title,
        version: versionNumber,
      },
    });
  });

  app.get("/v1/games/:gameId/servers", async (request, response) => {
    const gameReference = request.params.gameId;
    let query = admin
      .from("games")
      .select("id, slug, title")
      .eq("visibility", "public");
    query = UUID_PATTERN.test(gameReference)
      ? query.eq("id", gameReference)
      : query.eq("slug", gameReference);
    const { data: game, error } = await query.maybeSingle();
    if (error) throw error;
    if (!game) throw new HttpError(404, "Game not found.");
    response.json({
      game,
      servers: presence().servers
        .filter((server) => server.gameId === game.id)
        .map((server) => ({
          id: server.id,
          playerCount: server.playerCount,
          players: server.players,
        })),
    });
  });

  app.get("/v1/servers/friends", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data: friendships, error } = await admin
      .from("friendships")
      .select("requester_id, addressee_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (error) throw error;
    const friendIds = new Set(
      (friendships ?? []).map((friendship) =>
        friendship.requester_id === user.id
          ? friendship.addressee_id
          : friendship.requester_id,
      ),
    );
    const servers = presence().servers
      .map((server) => ({
        ...server,
        friends: server.players.filter((player) => friendIds.has(player.userId)),
      }))
      .filter((server) => server.friends.length > 0);
    const gameIds = [...new Set(servers.map((server) => server.gameId))];
    const { data: games, error: gamesError } = gameIds.length
      ? await admin
          .from("games")
          .select("id, slug, title, thumbnail_url")
          .in("id", gameIds)
      : { data: [], error: null };
    if (gamesError) throw gamesError;
    const gameById = new Map((games ?? []).map((game) => [game.id, game]));
    response.json({
      servers: servers.flatMap((server) => {
        const game = gameById.get(server.gameId);
        return game
          ? [{
              id: server.id,
              playerCount: server.playerCount,
              friends: server.friends,
              game: {
                id: game.id,
                slug: game.slug,
                title: game.title,
                thumbnailUrl: game.thumbnail_url,
              },
            }]
          : [];
      }),
    });
  });

  app.get("/v1/friends", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data, error } = await admin
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const profileIds = [
      ...new Set(
        (data ?? []).map((friendship) =>
          friendship.requester_id === user.id
            ? friendship.addressee_id
            : friendship.requester_id,
        ),
      ),
    ];
    const { data: profiles } = profileIds.length
      ? await admin
          .from("profiles")
          .select(
            "id, polymons_id, username, display_name, bio, avatar_url, equipped_shirt_id, equipped_pants_id, equipped_hair_id, equipped_hat_id, avatar_appearance",
          )
          .in("id", profileIds)
      : { data: [] };
    const profileById = new Map(
      (profiles ?? []).map((profile) => [profile.id, profile]),
    );
    const assetById = await loadEquippedAvatarAssetMap(admin, profiles ?? []);
    const live = presence().players;
    const liveGameIds = [...new Set(live.map((player) => player.gameId))];
    const { data: liveGames } = liveGameIds.length
      ? await admin.from("games").select("id, slug").in("id", liveGameIds)
      : { data: [] };
    const gameSlugById = new Map(
      (liveGames ?? []).map((game) => [game.id, game.slug]),
    );
    response.json({
      friendships: (data ?? []).map((friendship) => {
        const profileId =
          friendship.requester_id === user.id
            ? friendship.addressee_id
            : friendship.requester_id;
        const profile = profileById.get(profileId);
        const online = live.find((player) => player.userId === profileId);
        return {
          id: friendship.id,
          status: friendship.status,
          incoming: friendship.addressee_id === user.id,
          user: profile
            ? {
                id: profile.id,
                polymonsId: Number(profile.polymons_id),
                username: profile.username,
                displayName: profile.display_name,
                description: profile.bio ?? "",
                avatarUrl: profile.avatar_url,
                equippedShirtId: profile.equipped_shirt_id,
                equippedPantsId: profile.equipped_pants_id,
                equippedHairId: profile.equipped_hair_id,
                equippedHatId: profile.equipped_hat_id,
                ...equippedAvatarAssetFields(profile, assetById),
                avatarAppearance: normalizeAvatarAppearance(
                  profile.avatar_appearance,
                ),
              }
            : null,
          gameId: online ? gameSlugById.get(online.gameId) ?? null : null,
        };
      }),
    });
  });

  app.post("/v1/friends/request", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(friendRequestSchema, request.body);
    const { data: addressee, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", input.username)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!addressee) throw new HttpError(404, "Player not found.");
    if (addressee.id === user.id) {
      throw new HttpError(400, "You cannot friend yourself.");
    }
    const { data, error } = await admin
      .from("friendships")
      .insert({
        requester_id: user.id,
        addressee_id: addressee.id,
        status: "pending",
      })
      .select("id")
      .single();
    if (error?.code === "23505") {
      throw new HttpError(409, "A friendship already exists.");
    }
    if (error) throw error;
    response.status(201).json({ friendship: { id: data.id, status: "pending" } });
  });

  app.post("/v1/friends/:friendshipId/accept", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const { data, error } = await admin
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", request.params.friendshipId)
      .eq("addressee_id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Friend request not found.");
    response.json({ friendship: { id: data.id, status: "accepted" } });
  });

  app.post("/v1/play-sessions", async (request, response) => {
    const user = await authenticatedUser(request, admin);
    const input = parseBody(playSessionSchema, request.body);

    let gameQuery = admin
      .from("games")
      .select("id, slug, title")
      .eq("visibility", "public");

    gameQuery = UUID_PATTERN.test(input.gameId)
      ? gameQuery.eq("id", input.gameId)
      : gameQuery.eq("slug", input.gameId);

    const { data: game, error: gameError } = await gameQuery.maybeSingle();
    if (gameError) {
      throw gameError;
    }
    if (!game) {
      throw new HttpError(404, "Game not found.");
    }

    const { data: version } = await admin
      .from("game_versions")
      .select("id")
      .eq("game_id", game.id)
      .eq("status", "published")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ticket = createPlayTicket();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const { data: playSession, error: sessionError } = await admin
      .from("play_sessions")
      .insert({
        user_id: user.id,
        game_id: game.id,
        game_version_id: version?.id ?? null,
        ticket_hash: hashPlayTicket(ticket, config.playTicketSecret),
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (sessionError || !playSession) {
      throw sessionError ?? new Error("Could not create play session.");
    }
    const { error: visitError } = await admin.rpc("increment_game_visit", {
      target_game_id: game.id,
    });
    if (visitError) {
      console.error("Could not increment game visits:", visitError.message);
    }
    const { error: recentError } = await admin.rpc("record_recent_game", {
      target_user_id: user.id,
      target_game_id: game.id,
    });
    if (recentError) {
      console.error("Could not update recent games:", recentError.message);
    }

    response.status(201).json({
      playSession: {
        id: playSession.id,
        game,
        expiresAt,
        ticket,
        websocketUrl: websocketUrl(request, ticket),
      },
    });
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
