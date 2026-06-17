import { CanvasTexture, SRGBColorSpace, type Texture } from "three";

export const SHIRT_TEMPLATE_WIDTH = 585;
export const SHIRT_TEMPLATE_HEIGHT = 559;
const TEMPLATE_FACE_INSET = 2;

export type ShirtBodyPart = "torso" | "rightArm" | "leftArm";
export type ShirtSurfaceFace =
  | "right"
  | "left"
  | "top"
  | "bottom"
  | "back"
  | "front";

export type ShirtTemplateRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getTemplateFaceSource(region: ShirtTemplateRegion): ShirtTemplateRegion {
  const inset = Math.min(
    TEMPLATE_FACE_INSET,
    Math.floor(region.width / 8),
    Math.floor(region.height / 8),
  );
  return {
    x: region.x + inset,
    y: region.y + inset,
    width: region.width - inset * 2,
    height: region.height - inset * 2,
  };
}

export const SHIRT_TEMPLATE_REGIONS: Record<
  ShirtBodyPart,
  Record<ShirtSurfaceFace, ShirtTemplateRegion>
> = {
  torso: {
    right: { x: 165, y: 74, width: 64, height: 128 },
    front: { x: 231, y: 74, width: 128, height: 128 },
    left: { x: 361, y: 74, width: 64, height: 128 },
    back: { x: 427, y: 74, width: 128, height: 128 },
    top: { x: 231, y: 8, width: 128, height: 64 },
    bottom: { x: 231, y: 204, width: 128, height: 64 },
  },
  rightArm: {
    left: { x: 18, y: 355, width: 64, height: 128 },
    back: { x: 84, y: 355, width: 64, height: 128 },
    right: { x: 150, y: 355, width: 64, height: 128 },
    front: { x: 217, y: 355, width: 64, height: 128 },
    top: { x: 217, y: 289, width: 64, height: 64 },
    bottom: { x: 217, y: 485, width: 64, height: 64 },
  },
  leftArm: {
    front: { x: 308, y: 355, width: 64, height: 128 },
    left: { x: 374, y: 355, width: 64, height: 128 },
    back: { x: 440, y: 355, width: 64, height: 128 },
    right: { x: 506, y: 355, width: 64, height: 128 },
    top: { x: 308, y: 289, width: 64, height: 64 },
    bottom: { x: 308, y: 485, width: 64, height: 64 },
  },
};

export function createTemplateFaceTexture(
  image: CanvasImageSource,
  bodyPart: ShirtBodyPart,
  face: ShirtSurfaceFace,
): Texture | null {
  const region = SHIRT_TEMPLATE_REGIONS[bodyPart][face];
  const canvas = document.createElement("canvas");
  canvas.width = region.width;
  canvas.height = region.height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const source = getTemplateFaceSource(region);
  context.drawImage(
    image,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    region.width,
    region.height,
  );

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
