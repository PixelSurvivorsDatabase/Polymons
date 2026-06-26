import {
  CanvasTexture,
  SRGBColorSpace,
  type Texture,
} from "three";

export const SHIRT_IDS = [
  "polymon-shirt",
  "beta-tester-shirt",
  "creators-shirt",
  "orange-polymons-shirt",
  "polymons-varsity-jacket",
] as const;

export type BuiltInShirtId = (typeof SHIRT_IDS)[number];
export type ShirtId = string;
export const PANTS_IDS = [
  "classic-denim-pants",
  "polymon-pants",
  "beta-tester-pants",
  "creators-pants",
  "orange-polymons-pants",
  "polymons-varsity-pants",
] as const;
export type BuiltInPantsId = (typeof PANTS_IDS)[number];
export type PantsId = string;
export type HairId = string;
export type HatId = string;
export type AvatarItemId = ShirtId | PantsId | HairId | HatId;
export type AvatarItemType = "shirt" | "pants" | "hair" | "hat";
export type AvatarModelFormat =
  | "glb"
  | "gltf"
  | "obj"
  | "fbx"
  | "stl"
  | "dae"
  | "zip"
  | "rbxm"
  | "rbxmx"
  | "rblx"
  | "rbxlx";
export type ShirtFace = "front" | "back" | "side" | "sleeve";
export type PantsFace = "front" | "back" | "side" | "waist";

export type AvatarCatalogItem = {
  id: AvatarItemId;
  itemType: AvatarItemType;
  name: string;
  description: string;
  unlockType: "free" | "creator_visits" | "tix";
  unlockThreshold: number | null;
  priceTix: number;
  bundleKey: string | null;
  textureUrl?: string | null;
  modelUrl?: string | null;
  modelFormat?: AvatarModelFormat | null;
  modelPreviewUrl?: string | null;
  creatorId?: string | null;
  createdFromUpload?: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  owned: boolean;
  equipped: boolean;
};

export function isShirtId(value: unknown): value is ShirtId {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,95}$/.test(value);
}

export function isPantsId(value: unknown): value is PantsId {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,95}$/.test(value);
}

export function isAccessoryId(value: unknown): value is HairId | HatId {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{1,95}$/.test(value);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function paintFlowingGradient(
  context: CanvasRenderingContext2D,
  colors: string[],
) {
  const gradient = context.createLinearGradient(0, 0, 256, 256);
  colors.forEach((color, index) => {
    gradient.addColorStop(index / (colors.length - 1), color);
  });
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);

  context.globalAlpha = 0.24;
  for (let band = -2; band < 6; band += 1) {
    context.strokeStyle = band % 2 === 0 ? "#ffffff" : "#09060f";
    context.lineWidth = 19;
    context.beginPath();
    context.moveTo(-40, band * 58 + 28);
    context.bezierCurveTo(
      56,
      band * 58 - 14,
      162,
      band * 58 + 78,
      300,
      band * 58 + 16,
    );
    context.stroke();
  }
  context.globalAlpha = 1;
}

function paintPolymonMark(context: CanvasRenderingContext2D) {
  const facets = [
    ["#8a4dff", [[96, 58], [157, 40], [140, 94], [91, 108]]],
    ["#d649e6", [[157, 40], [188, 77], [140, 94]]],
    ["#8f28df", [[140, 94], [188, 77], [184, 135], [143, 151]]],
    ["#6527ce", [[91, 108], [140, 94], [143, 151], [104, 166]]],
    ["#3266ed", [[104, 166], [143, 151], [130, 211], [82, 224]]],
    ["#702bd5", [[82, 86], [91, 108], [104, 166], [68, 188], [61, 104]]],
  ] as const;
  context.save();
  context.translate(3, -4);
  context.shadowColor = "#a65cff";
  context.shadowBlur = 20;
  for (const [color, points] of facets) {
    context.fillStyle = color;
    context.beginPath();
    points.forEach(([x, y], index) =>
      index === 0 ? context.moveTo(x, y) : context.lineTo(x, y),
    );
    context.closePath();
    context.fill();
  }
  context.restore();
}

function paintOrangePolymonsMark(context: CanvasRenderingContext2D) {
  context.save();
  context.translate(128, 128);
  context.rotate(-0.12);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.strokeStyle = "#32140f";
  context.lineWidth = 12;
  context.fillStyle = "#ef7a34";

  const pieces = [
    [[-62, -50], [-25, -64], [-4, -42], [-33, -17], [-58, -22]],
    [[-12, -54], [27, -39], [10, -5], [-22, -19]],
    [[27, -32], [59, -10], [47, 22], [10, 9]],
    [[-38, -5], [-4, 14], [-25, 42], [-60, 30]],
    [[0, 20], [42, 28], [29, 58], [-14, 51]],
    [[-54, 42], [-17, 54], [-50, 82], [-73, 78]],
  ] as const;

  for (const points of pieces) {
    context.beginPath();
    points.forEach(([x, y], index) =>
      index === 0 ? context.moveTo(x, y) : context.lineTo(x, y),
    );
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.restore();
}

function paintVarsityJacket(
  context: CanvasRenderingContext2D,
  face: ShirtFace,
) {
  const jacket = context.createLinearGradient(0, 0, 256, 256);
  jacket.addColorStop(0, "#4d13d1");
  jacket.addColorStop(0.55, "#64108c");
  jacket.addColorStop(1, "#421263");
  context.fillStyle = jacket;
  context.fillRect(0, 0, 256, 256);

  if (face === "front") {
    context.fillStyle = "#111016";
    context.fillRect(119, 0, 18, 256);
    context.strokeStyle = "#a97cff";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(128, 0);
    context.lineTo(128, 256);
    context.stroke();

    context.fillStyle = "#7518c6";
    context.beginPath();
    context.moveTo(18, 0);
    context.lineTo(120, 0);
    context.lineTo(113, 60);
    context.lineTo(72, 92);
    context.lineTo(18, 75);
    context.closePath();
    context.fill();

    context.fillStyle = "#8d24e5";
    context.font = "900 66px system-ui";
    context.textAlign = "center";
    context.strokeStyle = "#42105f";
    context.lineWidth = 8;
    context.strokeText("P", 184, 87);
    context.fillText("P", 184, 87);
  } else if (face === "sleeve") {
    const sleeve = context.createLinearGradient(0, 0, 256, 0);
    sleeve.addColorStop(0, "#4d13d1");
    sleeve.addColorStop(1, "#691199");
    context.fillStyle = sleeve;
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = "#141118";
    context.fillRect(0, 220, 256, 36);
  }
}

export function createShirtTexture(
  shirtId: ShirtId | null | undefined,
  face: ShirtFace,
): Texture | null {
  if (!shirtId) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (shirtId === "polymon-shirt") {
    paintFlowingGradient(context, ["#07070c", "#171020", "#3b1679", "#09080e"]);
    if (face === "front") paintPolymonMark(context);
  } else if (shirtId === "beta-tester-shirt") {
    paintFlowingGradient(context, ["#16b96b", "#e43042", "#8528ed"]);
    if (face === "front") {
      context.fillStyle = "rgba(12, 9, 18, 0.72)";
      roundedRect(context, 116, 35, 112, 58, 12);
      context.fill();
      context.strokeStyle = "rgba(255,255,255,0.85)";
      context.lineWidth = 3;
      context.stroke();
      context.fillStyle = "#ffffff";
      context.font = "700 19px system-ui";
      context.textAlign = "center";
      context.fillText("BETA", 172, 60);
      context.fillText("TESTER", 172, 82);
    }
  } else if (shirtId === "creators-shirt") {
    paintFlowingGradient(context, ["#080910", "#24104c", "#6830e3", "#126fe8"]);
    context.globalAlpha = 0.55;
    context.strokeStyle = "#8b66ff";
    context.lineWidth = 3;
    for (let offset = -180; offset < 300; offset += 48) {
      context.beginPath();
      context.moveTo(offset, 256);
      context.lineTo(offset + 180, 0);
      context.stroke();
    }
    context.globalAlpha = 1;
    if (face === "front") {
      context.fillStyle = "rgba(4, 5, 12, 0.84)";
      roundedRect(context, 22, 73, 212, 105, 16);
      context.fill();
      context.strokeStyle = "#775cff";
      context.lineWidth = 5;
      context.stroke();
      context.fillStyle = "#ffffff";
      context.font = "800 25px system-ui";
      context.textAlign = "center";
      context.fillText("POLYMONS", 128, 116);
      context.fillText("APPROVED", 128, 151);
    }
  } else if (shirtId === "orange-polymons-shirt") {
    const orange = context.createLinearGradient(0, 0, 256, 256);
    orange.addColorStop(0, "#ef5a2f");
    orange.addColorStop(0.55, "#dc3f21");
    orange.addColorStop(1, "#f17b3c");
    context.fillStyle = orange;
    context.fillRect(0, 0, 256, 256);
    if (face === "front") paintOrangePolymonsMark(context);
    if (face === "sleeve") {
      context.fillStyle = "#efe4b3";
      context.fillRect(0, 202, 256, 20);
      context.fillStyle = "#161218";
      context.fillRect(0, 222, 256, 34);
    }
  } else if (shirtId === "polymons-varsity-jacket") {
    paintVarsityJacket(context, face);
  } else {
    return null;
  }

  if (face === "back") {
    context.fillStyle = "rgba(0,0,0,0.12)";
    context.fillRect(0, 0, 256, 256);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createPantsTexture(
  pantsId: PantsId | null | undefined,
  face: PantsFace,
): Texture | null {
  if (!pantsId) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (pantsId === "classic-denim-pants") {
    const denim = context.createLinearGradient(0, 0, 256, 256);
    denim.addColorStop(0, "#315c89");
    denim.addColorStop(0.55, "#24466d");
    denim.addColorStop(1, "#172c48");
    context.fillStyle = denim;
    context.fillRect(0, 0, 256, 256);
    context.globalAlpha = 0.16;
    context.strokeStyle = "#b8d7ef";
    context.lineWidth = 2;
    for (let line = -256; line < 512; line += 18) {
      context.beginPath();
      context.moveTo(line, 0);
      context.lineTo(line + 256, 256);
      context.stroke();
    }
    context.globalAlpha = 1;
    if (face !== "waist") {
      context.fillStyle = "#121722";
      context.fillRect(0, 210, 256, 46);
    }
  } else if (pantsId === "polymon-pants") {
    paintFlowingGradient(context, ["#08080d", "#28104f", "#7028d5", "#11101a"]);
    context.globalAlpha = 0.48;
    context.strokeStyle = "#a46fff";
    context.lineWidth = 4;
    for (let x = -128; x < 384; x += 48) {
      context.beginPath();
      context.moveTo(x, 256);
      context.lineTo(x + 120, 0);
      context.stroke();
    }
    context.globalAlpha = 1;
    if (face !== "waist") {
      context.fillStyle = "#09090e";
      context.fillRect(0, 218, 256, 38);
    }
  } else if (pantsId === "beta-tester-pants") {
    paintFlowingGradient(context, ["#16b96b", "#e43042", "#8528ed"]);
    if (face !== "waist") {
      context.fillStyle = "#171019";
      context.fillRect(0, 218, 256, 38);
    }
  } else if (pantsId === "creators-pants") {
    paintFlowingGradient(context, ["#080910", "#24104c", "#6830e3", "#126fe8"]);
    context.globalAlpha = 0.48;
    context.strokeStyle = "#8b66ff";
    context.lineWidth = 3;
    for (let offset = -180; offset < 300; offset += 48) {
      context.beginPath();
      context.moveTo(offset, 256);
      context.lineTo(offset + 180, 0);
      context.stroke();
    }
    context.globalAlpha = 1;
    if (face !== "waist") {
      context.fillStyle = "#090a12";
      context.fillRect(0, 218, 256, 38);
    }
  } else if (pantsId === "orange-polymons-pants") {
    const orange = context.createLinearGradient(0, 0, 256, 256);
    orange.addColorStop(0, "#e64d28");
    orange.addColorStop(0.6, "#d83d20");
    orange.addColorStop(1, "#f06b34");
    context.fillStyle = orange;
    context.fillRect(0, 0, 256, 256);
    if (face !== "waist") {
      context.fillStyle = "#9b9ca2";
      context.fillRect(0, 218, 256, 38);
      context.fillStyle = "#1b171b";
      context.fillRect(0, 244, 256, 12);
    }
  } else if (pantsId === "polymons-varsity-pants") {
    const varsity = context.createLinearGradient(0, 0, 256, 256);
    varsity.addColorStop(0, "#151218");
    varsity.addColorStop(0.58, "#09090d");
    varsity.addColorStop(1, "#40105f");
    context.fillStyle = varsity;
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = "#7020ac";
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(0, 78);
    context.lineTo(256, 130);
    context.stroke();
    if (face !== "waist") {
      context.fillStyle = "#151118";
      context.fillRect(0, 220, 256, 36);
    }
  } else {
    return null;
  }

  if (face === "back") {
    context.fillStyle = "rgba(0,0,0,0.1)";
    context.fillRect(0, 0, 256, 256);
  }
  if (face === "waist") {
    context.fillStyle = "rgba(5,5,10,0.34)";
    context.fillRect(0, 0, 256, 42);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
