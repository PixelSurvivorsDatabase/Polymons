import { createHmac, randomBytes } from "node:crypto";

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "api",
  "help",
  "moderator",
  "polymons",
  "staff",
  "support",
  "system",
]);

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function isReservedUsername(username: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(username));
}

export function internalEmailForUsername(username: string): string {
  return `${normalizeUsername(username)}@accounts.polymons.invalid`;
}

export function createPlayTicket(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPlayTicket(ticket: string, secret: string): string {
  return createHmac("sha256", secret).update(ticket).digest("hex");
}

export function createPlayerAccountTicket(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPlayerAccountTicket(
  ticket: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`player-account:${ticket}`)
    .digest("hex");
}
