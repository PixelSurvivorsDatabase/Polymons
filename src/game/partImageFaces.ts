export type PartImageFace =
  | "all"
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom";

export type PartImageFaces = Partial<Record<PartImageFace, string>>;

export const PART_IMAGE_FACE_KEYS: PartImageFace[] = [
  "all",
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
];

const PART_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp|gif);base64,/i;

export function isValidPartImageUrl(value: string): boolean {
  if (value.length > 2_900_000) return false;
  if (PART_IMAGE_DATA_URL.test(value)) return true;
  if (value.length > 2_048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizePartImageFaces(value: unknown): PartImageFaces {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const output: PartImageFaces = {};
  for (const face of PART_IMAGE_FACE_KEYS) {
    const image = input[face];
    if (typeof image === "string" && image && isValidPartImageUrl(image)) {
      output[face] = image;
    }
  }
  return output;
}

export function hasPartImageFaces(value?: PartImageFaces): boolean {
  return Boolean(value && PART_IMAGE_FACE_KEYS.some((face) => value[face]));
}

