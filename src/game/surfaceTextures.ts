import {
  CanvasTexture,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import type { PolyWorldObject } from "./polyProject";

export function createSurfaceTexture(
  surface: PolyWorldObject["surfaceTexture"],
): CanvasTexture | null {
  if (surface === "none") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#b8b8b8";
  context.fillRect(0, 0, 128, 128);

  if (surface === "brick") {
    context.fillStyle = "#8f8f8f";
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "#d2d2d2";
    context.lineWidth = 4;
    for (let y = 0; y <= 128; y += 32) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(128, y);
      context.stroke();
      const offset = (y / 32) % 2 === 0 ? 0 : 32;
      for (let x = offset; x <= 128; x += 64) {
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x, y + 32);
        context.stroke();
      }
    }
  } else if (surface === "wood") {
    context.fillStyle = "#a7a7a7";
    context.fillRect(0, 0, 128, 128);
    for (let y = 8; y < 128; y += 14) {
      context.strokeStyle = y % 28 === 0 ? "#777777" : "#8b8b8b";
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(0, y);
      for (let x = 0; x <= 128; x += 16) {
        context.lineTo(x, y + Math.sin((x + y) * 0.09) * 4);
      }
      context.stroke();
    }
  } else if (surface === "concrete") {
    context.fillStyle = "#a5a5a5";
    context.fillRect(0, 0, 128, 128);
    for (let index = 0; index < 420; index += 1) {
      const value = 105 + ((index * 37) % 70);
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect((index * 47) % 128, (index * 83) % 128, 2, 2);
    }
  } else if (surface === "grass") {
    context.fillStyle = "#adadad";
    context.fillRect(0, 0, 128, 128);
    context.lineWidth = 1;
    for (let index = 0; index < 360; index += 1) {
      const x = (index * 41) % 128;
      const y = (index * 73) % 128;
      context.strokeStyle = index % 3 === 0 ? "#686868" : "#d2d2d2";
      context.beginPath();
      context.moveTo(x, y + 5);
      context.lineTo(x + ((index % 5) - 2), y);
      context.stroke();
    }
  } else if (surface === "fabric") {
    context.fillStyle = "#ababab";
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "#777777";
    context.lineWidth = 1;
    for (let value = 0; value <= 128; value += 5) {
      context.beginPath();
      context.moveTo(value, 0);
      context.lineTo(value, 128);
      context.stroke();
      context.beginPath();
      context.moveTo(0, value);
      context.lineTo(128, value);
      context.stroke();
    }
  } else if (surface === "marble") {
    context.fillStyle = "#d0d0d0";
    context.fillRect(0, 0, 128, 128);
    for (let vein = 0; vein < 7; vein += 1) {
      context.strokeStyle = vein % 2 === 0 ? "#7c7c7c" : "#9a9a9a";
      context.lineWidth = vein % 2 === 0 ? 3 : 1;
      context.beginPath();
      context.moveTo(-10, vein * 23);
      for (let x = 0; x <= 140; x += 14) {
        context.lineTo(x, vein * 23 + x * 0.28 + Math.sin(x * 0.12) * 8);
      }
      context.stroke();
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
