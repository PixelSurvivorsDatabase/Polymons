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
  thumbnailData: z
    .string()
    .max(2_800_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  badges: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(500).default(""),
        iconData: z
          .string()
          .max(1_400_000)
          .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/)
          .optional(),
      }),
    )
    .max(50)
    .default([]),
  gamePasses: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(500).default(""),
        priceTix: z.number().int().min(0).max(1_000_000).default(0),
      }),
    )
    .max(50)
    .default([]),
  developerProducts: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(64),
        description: z.string().trim().max(500).default(""),
        priceTix: z.number().int().min(0).max(1_000_000).default(0),
        effectKey: z
          .string()
          .trim()
          .regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)
          .nullable()
          .default(null),
        effectAmount: z.number().finite().min(-1_000_000_000).max(1_000_000_000).default(0),
      }),
    )
    .max(50)
    .default([]),
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
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
    .nullable(),
});

export const equipAvatarPantsSchema = z.object({
  pantsId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,63}$/)
    .nullable(),
});

const avatarColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const avatarAppearanceSchema = z.object({
  face: z.literal("classic-smile"),
  bodyColors: z.object({
    head: avatarColor,
    torso: avatarColor,
    leftArm: avatarColor,
    rightArm: avatarColor,
    leftLeg: avatarColor,
    rightLeg: avatarColor,
  }),
  accessories: z
    .array(z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/))
    .max(12)
    .default([]),
});

export const favoriteGameSchema = z.object({
  favorite: z.boolean(),
});

export const followCreatorSchema = z.object({
  following: z.boolean(),
});

export const awardBadgeSchema = z.object({
  badgeName: z.string().trim().min(1).max(64),
});

export const hasBadgeSchema = z.object({
  badgeName: z.string().trim().min(1).max(64),
});

export const avatarUploadSchema = z.object({
  itemType: z.enum(["shirt", "pants"]),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).default(""),
  priceTix: z.number().int().min(0).max(1_000_000).default(0),
  textureData: z
    .string()
    .max(2_800_000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
});

export const adminCatalogReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(500).default(""),
});

export const adminInventorySchema = z.object({
  itemId: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  owned: z.boolean(),
  equip: z.boolean().optional(),
});

export const adminTixSchema = z.object({
  mode: z.enum(["add", "set"]),
  amount: z.number().int().min(-1_000_000_000).max(1_000_000_000),
});

const leaderstatValue = z.union([
  z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000),
  z.string().max(128),
]);

const leaderstats = z
  .record(
    z.string().trim().min(1).max(64),
    leaderstatValue,
  )
  .refine((values) => Object.keys(values).length <= 20);

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
  z.object({
    type: z.literal("leaderstats"),
    values: leaderstats,
  }),
]);
