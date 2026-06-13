import {
  CanvasTexture,
  SRGBColorSpace,
  type Texture,
} from "three";

export const SHIRT_IDS = [
  "polymon-shirt",
  "beta-tester-shirt",
  "creators-shirt",
] as const;

export type ShirtId = (typeof SHIRT_IDS)[number];
export type ShirtFace = "front" | "back" | "side" | "sleeve";

export type AvatarCatalogItem = {
  id: ShirtId;
  name: string;
  description: string;
  unlockType: "free" | "creator_visits";
  unlockThreshold: number | null;
  owned: boolean;
  equipped: boolean;
};

export function isShirtId(value: unknown): value is ShirtId {
  return typeof value === "string" && SHIRT_IDS.includes(value as ShirtId);
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
  } else {
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
