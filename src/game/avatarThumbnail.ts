import type { PantsId, ShirtId } from "./avatarCatalog";
import {
  normalizeAvatarAppearance,
  type AvatarAppearance,
} from "./avatarAppearance";

export type AvatarThumbnailPlayer = {
  username: string;
  displayName: string;
  equippedShirtId?: ShirtId | null;
  equippedPantsId?: PantsId | null;
  avatarAppearance?: AvatarAppearance;
};

const thumbnailCache = new Map<string, string>();

function xml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function shirtPalette(shirtId: ShirtId | null | undefined, fallback: string) {
  if (shirtId === "polymon-shirt") return ["#0b0910", "#5c22bb"];
  if (shirtId === "beta-tester-shirt") return ["#13a867", "#b52ad7"];
  if (shirtId === "creators-shirt") return ["#11121d", "#3168e6"];
  if (shirtId === "orange-polymons-shirt") return ["#ef5a2f", "#d83d20"];
  if (shirtId === "polymons-varsity-jacket") return ["#4d13d1", "#65108d"];
  return [fallback, fallback];
}

function pantsPalette(
  pantsId: PantsId | null | undefined,
  leftFallback: string,
  rightFallback: string,
) {
  if (pantsId === "classic-denim-pants") return ["#315c89", "#172c48"];
  if (pantsId === "polymon-pants") return ["#1b102b", "#6426c2"];
  if (pantsId === "beta-tester-pants") return ["#16a864", "#8528ed"];
  if (pantsId === "creators-pants") return ["#24104c", "#126fe8"];
  if (pantsId === "orange-polymons-pants") return ["#df4524", "#ee6b35"];
  if (pantsId === "polymons-varsity-pants") return ["#151218", "#40105f"];
  return [leftFallback, rightFallback];
}

export function avatarThumbnailDataUrl(player: AvatarThumbnailPlayer) {
  const appearance = normalizeAvatarAppearance(player.avatarAppearance);
  const cacheKey = JSON.stringify({
    username: player.username,
    shirt: player.equippedShirtId ?? null,
    pants: player.equippedPantsId ?? null,
    appearance,
  });
  const cached = thumbnailCache.get(cacheKey);
  if (cached) return cached;

  const [shirtStart, shirtEnd] = shirtPalette(
    player.equippedShirtId,
    appearance.bodyColors.torso,
  );
  const [leftPants, rightPants] = pantsPalette(
    player.equippedPantsId,
    appearance.bodyColors.leftLeg,
    appearance.bodyColors.rightLeg,
  );
  const shirtMark =
    player.equippedShirtId === "beta-tester-shirt"
      ? "B"
      : player.equippedShirtId === "creators-shirt"
        ? "A"
        : player.equippedShirtId === "orange-polymons-shirt"
          ? "O"
          : player.equippedShirtId === "polymons-varsity-jacket"
            ? "P"
        : player.equippedShirtId === "polymon-shirt"
          ? "P"
          : "";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#251647"/>
          <stop offset="1" stop-color="#090910"/>
        </linearGradient>
        <linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${shirtStart}"/>
          <stop offset="1" stop-color="${shirtEnd}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="18" fill="url(#bg)"/>
      <ellipse cx="64" cy="118" rx="35" ry="7" fill="#050509" opacity=".45"/>
      <rect x="45" y="14" width="38" height="34" rx="5" fill="${appearance.bodyColors.head}"/>
      <ellipse cx="56" cy="29" rx="2.1" ry="3.2" fill="#151315"/>
      <ellipse cx="72" cy="29" rx="2.1" ry="3.2" fill="#151315"/>
      <path d="M55 36 Q64 43 73 36" fill="none" stroke="#151315" stroke-width="2.8" stroke-linecap="round"/>
      <rect x="34" y="49" width="60" height="39" rx="3" fill="url(#shirt)"/>
      <rect x="20" y="50" width="13" height="40" rx="2" fill="${appearance.bodyColors.leftArm}"/>
      <rect x="95" y="50" width="13" height="40" rx="2" fill="${appearance.bodyColors.rightArm}"/>
      <rect x="37" y="88" width="25" height="34" rx="2" fill="${leftPants}"/>
      <rect x="66" y="88" width="25" height="34" rx="2" fill="${rightPants}"/>
      ${
        shirtMark
          ? `<text x="64" y="74" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="17" font-weight="800">${xml(shirtMark)}</text>`
          : ""
      }
    </svg>`;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  thumbnailCache.set(cacheKey, url);
  return url;
}
