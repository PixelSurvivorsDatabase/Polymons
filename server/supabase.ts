import {
  createClient,
  type Session,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import WebSocket from "ws";
import type { ServerConfig } from "./config.js";

export type PublicProfile = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  tix: number;
  avatarUrl: string | null;
  equippedShirtId: string | null;
  equippedPantsId: string | null;
  equippedShirtTextureUrl: string | null;
  equippedPantsTextureUrl: string | null;
  avatarAppearance: AvatarAppearance;
};

export type AvatarAppearance = {
  face: "classic-smile";
  bodyColors: {
    head: string;
    torso: string;
    leftArm: string;
    rightArm: string;
    leftLeg: string;
    rightLeg: string;
  };
  accessories: string[];
};

const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = {
  face: "classic-smile",
  bodyColors: {
    head: "#e7bd91",
    torso: "#7650d8",
    leftArm: "#e7bd91",
    rightArm: "#e7bd91",
    leftLeg: "#313542",
    rightLeg: "#313542",
  },
  accessories: [],
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeAvatarAppearance(value: unknown): AvatarAppearance {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const colors =
    input.bodyColors &&
    typeof input.bodyColors === "object" &&
    !Array.isArray(input.bodyColors)
      ? (input.bodyColors as Record<string, unknown>)
      : {};
  const color = (name: keyof AvatarAppearance["bodyColors"]) =>
    typeof colors[name] === "string" && HEX_COLOR.test(colors[name])
      ? colors[name].toLowerCase()
      : DEFAULT_AVATAR_APPEARANCE.bodyColors[name];
  return {
    face: "classic-smile",
    bodyColors: {
      head: color("head"),
      torso: color("torso"),
      leftArm: color("leftArm"),
      rightArm: color("rightArm"),
      leftLeg: color("leftLeg"),
      rightLeg: color("rightLeg"),
    },
    accessories: Array.isArray(input.accessories)
      ? input.accessories
          .filter(
            (item): item is string =>
              typeof item === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(item),
          )
          .slice(0, 12)
      : [],
  };
}

function clientOptions() {
  return {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket as unknown as WebSocketLikeConstructor,
    },
  };
}

export function createAdminClient(config: ServerConfig): SupabaseClient {
  return createClient(
    config.supabaseUrl,
    config.supabaseSecretKey,
    clientOptions(),
  );
}

export function createAuthClient(config: ServerConfig): SupabaseClient {
  return createClient(
    config.supabaseUrl,
    config.supabaseSecretKey,
    clientOptions(),
  );
}

export async function loadProfile(
  client: SupabaseClient,
  userId: string,
): Promise<PublicProfile> {
  const [, dailyTix] = await Promise.all([
    syncAvatarUnlocks(client, userId),
    client.rpc("claim_daily_tix", { target_user_id: userId }),
  ]);
  if (dailyTix.error) throw dailyTix.error;
  const { data, error } = await client
    .from("profiles")
    .select(
      "id, polymons_id, username, display_name, bio, tix, avatar_url, equipped_shirt_id, equipped_pants_id, avatar_appearance",
    )
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("Profile not found.");
  }
  const equippedIds = [
    data.equipped_shirt_id,
    data.equipped_pants_id,
  ].filter((itemId): itemId is string => typeof itemId === "string");
  const { data: avatarItems, error: avatarItemsError } = equippedIds.length
    ? await client
        .from("avatar_items")
        .select("id, texture_url, review_status")
        .in("id", equippedIds)
    : { data: [], error: null };
  if (avatarItemsError) throw avatarItemsError;
  const textureById = new Map(
    (avatarItems ?? [])
      .filter((item) => item.review_status === "approved")
      .map((item) => [item.id, item.texture_url ?? null]),
  );

  return {
    id: data.id,
    polymonsId: Number(data.polymons_id),
    username: data.username,
    displayName: data.display_name,
    description: data.bio ?? "",
    tix: Number(data.tix ?? 0),
    avatarUrl: data.avatar_url,
    equippedShirtId: data.equipped_shirt_id,
    equippedPantsId: data.equipped_pants_id,
    equippedShirtTextureUrl: data.equipped_shirt_id
      ? textureById.get(data.equipped_shirt_id) ?? null
      : null,
    equippedPantsTextureUrl: data.equipped_pants_id
      ? textureById.get(data.equipped_pants_id) ?? null
      : null,
    avatarAppearance: normalizeAvatarAppearance(data.avatar_appearance),
  };
}

export async function syncAvatarUnlocks(
  client: SupabaseClient,
  userId: string,
): Promise<number> {
  const [{ data: games, error: gamesError }, { error: defaultItemError }] =
    await Promise.all([
      client.from("games").select("visit_count").eq("owner_id", userId),
      client.from("user_avatar_items").upsert(
        [
          { user_id: userId, item_id: "polymon-shirt" },
          { user_id: userId, item_id: "classic-denim-pants" },
        ],
        { onConflict: "user_id,item_id", ignoreDuplicates: true },
      ),
    ]);
  if (gamesError) throw gamesError;
  if (defaultItemError) throw defaultItemError;

  const totalVisits = (games ?? []).reduce(
    (total, game) => total + Number(game.visit_count ?? 0),
    0,
  );
  if (totalVisits >= 100) {
    const { error } = await client.from("user_avatar_items").upsert(
      [
        { user_id: userId, item_id: "creators-shirt" },
        { user_id: userId, item_id: "creators-pants" },
      ],
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  return totalVisits;
}

export function publicSession(session: Session) {
  const expiresIn = Number(session.expires_in) || 3600;
  const expiresAt = Number(session.expires_at);
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt:
      Number.isFinite(expiresAt) && expiresAt > 0
        ? expiresAt
        : Math.floor(Date.now() / 1000) + expiresIn,
    expiresIn,
    tokenType: session.token_type,
  };
}
