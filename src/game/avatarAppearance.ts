export const AVATAR_FACE_IDS = ["classic-smile"] as const;

export type AvatarFaceId = (typeof AVATAR_FACE_IDS)[number];

export type AvatarBodyColors = {
  head: string;
  torso: string;
  leftArm: string;
  rightArm: string;
  leftLeg: string;
  rightLeg: string;
};

export type AvatarAppearance = {
  face: AvatarFaceId;
  bodyColors: AvatarBodyColors;
  accessories: string[];
};

export const DEFAULT_AVATAR_APPEARANCE: AvatarAppearance = {
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

function colorOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" && HEX_COLOR.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function normalizeAvatarAppearance(value: unknown): AvatarAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return structuredClone(DEFAULT_AVATAR_APPEARANCE);
  }
  const candidate = value as {
    face?: unknown;
    bodyColors?: Partial<Record<keyof AvatarBodyColors, unknown>>;
    accessories?: unknown;
  };
  const colors = candidate.bodyColors ?? {};
  return {
    face: AVATAR_FACE_IDS.includes(candidate.face as AvatarFaceId)
      ? (candidate.face as AvatarFaceId)
      : DEFAULT_AVATAR_APPEARANCE.face,
    bodyColors: {
      head: colorOrDefault(colors.head, DEFAULT_AVATAR_APPEARANCE.bodyColors.head),
      torso: colorOrDefault(
        colors.torso,
        DEFAULT_AVATAR_APPEARANCE.bodyColors.torso,
      ),
      leftArm: colorOrDefault(
        colors.leftArm,
        DEFAULT_AVATAR_APPEARANCE.bodyColors.leftArm,
      ),
      rightArm: colorOrDefault(
        colors.rightArm,
        DEFAULT_AVATAR_APPEARANCE.bodyColors.rightArm,
      ),
      leftLeg: colorOrDefault(
        colors.leftLeg,
        DEFAULT_AVATAR_APPEARANCE.bodyColors.leftLeg,
      ),
      rightLeg: colorOrDefault(
        colors.rightLeg,
        DEFAULT_AVATAR_APPEARANCE.bodyColors.rightLeg,
      ),
    },
    accessories: Array.isArray(candidate.accessories)
      ? candidate.accessories
          .filter(
            (item): item is string =>
              typeof item === "string" && /^[a-z0-9][a-z0-9-]{1,63}$/.test(item),
          )
          .slice(0, 12)
      : [],
  };
}
