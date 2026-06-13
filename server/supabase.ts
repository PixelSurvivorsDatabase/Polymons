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
  username: string;
  displayName: string;
  avatarUrl: string | null;
  equippedShirtId: string | null;
};

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
  await syncAvatarUnlocks(client, userId);
  const { data, error } = await client
    .from("profiles")
    .select("id, username, display_name, avatar_url, equipped_shirt_id")
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error("Profile not found.");
  }

  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    equippedShirtId: data.equipped_shirt_id,
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
        { user_id: userId, item_id: "polymon-shirt" },
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
      { user_id: userId, item_id: "creators-shirt" },
      { onConflict: "user_id,item_id", ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  return totalVisits;
}

export function publicSession(session: Session) {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    expiresIn: session.expires_in,
    tokenType: session.token_type,
  };
}
