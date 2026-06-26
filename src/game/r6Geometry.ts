import { Vector2 } from "three";

export const R6_AVATAR_SCALE = 0.64;
export const R6_VISUAL_OFFSET = -0.2;
export const R6_TORSO_SIZE: [number, number, number] = [1.78, 1.78, 0.9];
export const R6_ARM_SIZE: [number, number, number] = [0.94, 1.78, 0.88];
export const R6_LEG_SIZE: [number, number, number] = [0.89, 1.78, 0.88];
export const R6_HEAD_SIZE: [number, number, number] = [1.18, 1.18, 1.18];
export const R6_TORSO_CENTER_Y = 0.45;
export const R6_SHOULDER_Y = 1.34;
export const R6_ARM_CENTER_Y = -0.89;
export const R6_HIP_Y = -0.44;
export const R6_LEG_CENTER_Y = -0.89;
export const R6_HEAD_CENTER_Y = 1.96;
export const R6_SHOULDER_X = 1.36;
export const R6_HIP_X = 0.445;
export const R6_COLLIDER_HALF_HEIGHT = 1.1;
export const R6_COLLIDER_RADIUS = 0.56;
export const R6_GROUND_SENSOR_Y = -1.66;
export const R6_HEAD_PROFILE = [
  new Vector2(0, -0.64),
  new Vector2(0.63, -0.64),
  new Vector2(0.71, -0.6),
  new Vector2(0.76, -0.52),
  new Vector2(0.76, 0.52),
  new Vector2(0.71, 0.6),
  new Vector2(0.63, 0.64),
  new Vector2(0, 0.64),
];
