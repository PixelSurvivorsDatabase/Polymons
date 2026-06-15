import { z } from "zod";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9_]{2,19}$/,
    "Username must be 3-20 characters using lowercase letters, numbers, or underscores.",
  );

const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(128, "Password must be at most 128 characters.")
  .regex(/[A-Za-z]/, "Password must contain a letter.")
  .regex(/[0-9]/, "Password must contain a number.");

export const signUpSchema = z.object({
  username,
  password,
  displayName: z.string().trim().min(1).max(32).optional(),
});

export const loginSchema = z.object({
  username,
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const profileUpdateSchema = z.object({
  description: z.string().trim().max(500),
});

export const playSessionSchema = z.object({
  gameId: z.string().trim().min(1).max(64),
});

export const publishGameSchema = z.object({
  projectId: z.uuid(),
  title: z.string().trim().min(1).max(64),
  description: z.string().trim().max(2000).default(""),
  genre: z.string().trim().min(1).max(64).default("All"),
  manifest: z.record(z.string(), z.unknown()),
});

export const friendRequestSchema = z.object({
  username: z.string().trim().toLowerCase().min(3).max(20),
});

export const playerAccountLinkSchema = z.object({
  ticket: z.string().min(40).max(256),
});

export const equipAvatarItemSchema = z.object({
  shirtId: z
    .enum(["polymon-shirt", "beta-tester-shirt", "creators-shirt"])
    .nullable(),
});

export const favoriteGameSchema = z.object({
  favorite: z.boolean(),
});

export const adminInventorySchema = z.object({
  itemId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  owned: z.boolean(),
  equip: z.boolean().optional(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("ping"),
  }),
  z.object({
    type: z.literal("state"),
    sequence: z.number().int().min(0),
    position: z.tuple([
      z.number().finite().min(-10_000).max(10_000),
      z.number().finite().min(-10_000).max(10_000),
      z.number().finite().min(-10_000).max(10_000),
    ]),
    rotationY: z.number().finite().min(-Math.PI * 4).max(Math.PI * 4),
  }),
  z.object({
    type: z.literal("chat"),
    text: z.string().trim().min(1).max(160),
  }),
]);
