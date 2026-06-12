import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "./config.js";
import { OFFICIAL_ACCOUNT, isLoginDisabled } from "./official-account.js";
import {
  createPlayTicket,
  createPlayerAccountTicket,
  hashPlayerAccountTicket,
  hashPlayTicket,
  internalEmailForUsername,
  isReservedUsername,
  normalizeUsername,
} from "./security.js";
import {
  clientMessageSchema,
  friendRequestSchema,
  publishGameSchema,
  signUpSchema,
} from "./validation.js";

test("normalizes usernames and builds internal account identifiers", () => {
  assert.equal(normalizeUsername("  Nova_7 "), "nova_7");
  assert.equal(
    internalEmailForUsername("Nova_7"),
    "nova_7@accounts.polymons.invalid",
  );
  assert.equal(isReservedUsername("POLYMONS"), true);
  assert.equal(isReservedUsername("nova_7"), false);
});

test("keeps the official account reserved and login-disabled", () => {
  assert.equal(OFFICIAL_ACCOUNT.username, "polymons");
  assert.equal(isReservedUsername(OFFICIAL_ACCOUNT.username), true);
  assert.equal(
    isLoginDisabled({
      app_metadata: { login_disabled: true },
    } as unknown as Parameters<typeof isLoginDisabled>[0]),
    true,
  );
});

test("validates signup credentials", () => {
  assert.equal(
    signUpSchema.safeParse({
      username: "nova_7",
      password: "baseplate7",
    }).success,
    true,
  );
  assert.equal(
    signUpSchema.safeParse({
      username: "no",
      password: "password",
    }).success,
    false,
  );
});

test("creates opaque tickets and stable keyed hashes", () => {
  const ticket = createPlayTicket();
  const secret = "a-secure-test-secret-that-is-long-enough";
  assert.ok(ticket.length >= 40);
  assert.equal(hashPlayTicket(ticket, secret), hashPlayTicket(ticket, secret));
  assert.notEqual(
    hashPlayTicket(ticket, secret),
    hashPlayTicket(ticket, `${secret}-different`),
  );
});

test("creates domain-separated Player account tickets", () => {
  const ticket = createPlayerAccountTicket();
  const secret = "a-secure-test-secret-that-is-long-enough";
  assert.ok(ticket.length >= 40);
  assert.equal(
    hashPlayerAccountTicket(ticket, secret),
    hashPlayerAccountTicket(ticket, secret),
  );
  assert.notEqual(
    hashPlayerAccountTicket(ticket, secret),
    hashPlayTicket(ticket, secret),
  );
});

test("accepts only bounded gameplay messages", () => {
  assert.equal(
    clientMessageSchema.safeParse({
      type: "state",
      sequence: 4,
      position: [1, 2, 3],
      rotationY: 0.5,
    }).success,
    true,
  );
  assert.equal(
    clientMessageSchema.safeParse({
      type: "state",
      sequence: 4,
      position: [Number.POSITIVE_INFINITY, 2, 3],
      rotationY: 0.5,
    }).success,
    false,
  );
});

test("validates Studio publishes and friend requests", () => {
  assert.equal(
    publishGameSchema.safeParse({
      projectId: "11111111-1111-4111-8111-111111111111",
      title: "Lava's Game",
      manifest: { version: 2 },
    }).success,
    true,
  );
  assert.equal(
    friendRequestSchema.safeParse({ username: "lava" }).success,
    true,
  );
  assert.equal(
    friendRequestSchema.safeParse({ username: "x" }).success,
    false,
  );
});

test("normalizes the configured web origin", () => {
  const config = readConfig({
    NODE_ENV: "test",
    PORT: "10000",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SECRET_KEY: "test-secret-key-that-is-long-enough",
    WEB_ORIGIN: "https://example.com/some/path",
    PLAY_TICKET_SECRET: "test-ticket-secret-that-is-long-enough",
  });

  assert.equal(config.webOrigin, "https://example.com");
  assert.equal(config.serverId, "local-polymons-server");
});
