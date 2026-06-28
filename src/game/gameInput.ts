const GAMEPLAY_KEY_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "Space",
  "ControlLeft",
  "ControlRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function shouldPreventGameplayDefault(code: string): boolean {
  return GAMEPLAY_KEY_CODES.has(code);
}

export function normalizeJoystickAxis(value: number): number {
  const deadZone = 0.14;
  const magnitude = Math.abs(value);
  if (magnitude <= deadZone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - deadZone) / (1 - deadZone));
}

const CAMERA_ARROW_YAW_SPEED = 2.7;
export function cameraArrowDelta(
  left: boolean,
  right: boolean,
  deltaSeconds: number,
  inverted: boolean,
): number {
  const direction = inverted ? -1 : 1;
  return (
    (Number(left) - Number(right)) *
    CAMERA_ARROW_YAW_SPEED *
    deltaSeconds *
    direction
  );
}

export function movementAxis(
  positive: boolean,
  negative: boolean,
  alternatePositive: boolean,
  alternateNegative: boolean,
  analog: number,
): number {
  return Math.max(
    -1,
    Math.min(
      1,
      Number(positive) -
        Number(negative) +
        Number(alternatePositive) -
        Number(alternateNegative) +
        analog,
    ),
  );
}
