import type { AvatarModelFormat } from "./avatarCatalog";

export type AvatarAccessorySlot = "hair" | "hat";

export type AvatarAccessoryId = string;

export type AvatarAccessoryDefinition = {
  id: AvatarAccessoryId;
  name: string;
  slot: AvatarAccessorySlot;
  attachment: "HatAttachment" | "HairAttachment";
  color: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  modelUrl?: string | null;
  modelFormat?: AvatarModelFormat | null;
};

export const AVATAR_ACCESSORIES: AvatarAccessoryDefinition[] = [
  {
    id: "classic-side-hair",
    name: "Classic Side Hair",
    slot: "hair",
    attachment: "HairAttachment",
    color: "#151217",
    position: [0, 0.2, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: "classic-test-cap",
    name: "Classic Test Cap",
    slot: "hat",
    attachment: "HatAttachment",
    color: "#2b2140",
    position: [0, 0.08, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
];

export function avatarAccessoryById(
  id: string,
): AvatarAccessoryDefinition | null {
  return AVATAR_ACCESSORIES.find((item) => item.id === id) ?? null;
}

export function avatarAccessoriesForIds(
  ids: readonly string[] | undefined,
  extraAccessories: readonly AvatarAccessoryDefinition[] = [],
): AvatarAccessoryDefinition[] {
  const usedSlots = new Set<AvatarAccessorySlot>();
  const accessories: AvatarAccessoryDefinition[] = [];
  const byId = new Map<string, AvatarAccessoryDefinition>([
    ...AVATAR_ACCESSORIES.map((accessory) => [accessory.id, accessory] as const),
    ...extraAccessories.map((accessory) => [accessory.id, accessory] as const),
  ]);
  for (const id of ids ?? []) {
    const accessory = byId.get(id);
    if (!accessory || usedSlots.has(accessory.slot)) continue;
    usedSlots.add(accessory.slot);
    accessories.push(accessory);
  }
  return accessories;
}
