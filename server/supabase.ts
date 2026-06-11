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
  const { data, error } = await client
    .from("profiles")
    .select("id, username, display_name, avatar_url")
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
  };
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
