import { randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { internalEmailForUsername } from "./security.js";

export const OFFICIAL_ACCOUNT = {
  username: "polymons",
  displayName: "Polymons",
  accountKind: "official_locked",
} as const;

const BAN_DURATION = "876000h";

function lockedMetadata(user?: User) {
  return {
    ...(user?.app_metadata ?? {}),
    account_kind: OFFICIAL_ACCOUNT.accountKind,
    login_disabled: true,
    owner: true,
  };
}

export function isLoginDisabled(user: User): boolean {
  return user.app_metadata.login_disabled === true;
}

export async function ensureOfficialAccount(
  admin: SupabaseClient,
): Promise<void> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", OFFICIAL_ACCOUNT.username)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  let user: User;
  if (profile) {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (error || !data.user) {
      throw error ?? new Error("Official account identity was not found.");
    }
    user = data.user;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: internalEmailForUsername(OFFICIAL_ACCOUNT.username),
      password: randomBytes(48).toString("base64url"),
      email_confirm: true,
      user_metadata: {
        username: OFFICIAL_ACCOUNT.username,
        display_name: OFFICIAL_ACCOUNT.displayName,
      },
      app_metadata: lockedMetadata(),
    });

    if (error || !data.user) {
      throw error ?? new Error("Official account could not be created.");
    }
    user = data.user;
  }

  const { error: lockError } = await admin.auth.admin.updateUserById(user.id, {
    ban_duration: BAN_DURATION,
    app_metadata: lockedMetadata(user),
  });

  if (lockError) {
    throw lockError;
  }
}
