import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  BallCollider,
  CapsuleCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  type CollisionPayload,
  type RapierRigidBody,
  useRapier,
} from "@react-three/rapier";
import {
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  Euler,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  PCFSoftShadowMap,
  Vector3,
} from "three";
import type { PantsId, ShirtId } from "./avatarCatalog";
import {
  normalizeAvatarAppearance,
  type AvatarAppearance,
} from "./avatarAppearance";
import { chatUsernameColor } from "./chat";
import defaultDeathSoundUrl from "../../assets/audio/polymons-oof-remix.mp3";
import {
  R6Avatar,
  R6AvatarPlayer,
  R6Head,
  PantsMaterials,
  ShirtMaterials,
} from "./R6Avatar";
import {
  R6_ARM_CENTER_Y,
  R6_ARM_SIZE,
  R6_AVATAR_SCALE,
  R6_COLLIDER_HALF_HEIGHT,
  R6_COLLIDER_RADIUS,
  R6_GROUND_SENSOR_Y,
  R6_HEAD_CENTER_Y,
  R6_HEAD_SIZE,
  R6_HIP_X,
  R6_HIP_Y,
  R6_LEG_CENTER_Y,
  R6_LEG_SIZE,
  R6_SHOULDER_X,
  R6_SHOULDER_Y,
  R6_TORSO_CENTER_Y,
  R6_TORSO_SIZE,
  R6_VISUAL_OFFSET,
} from "./r6Geometry";
import type {
  ChatMessage,
  PlayerTransform,
  RemotePlayer,
} from "./multiplayer";
import type {
  PolyAnimation,
  PolyGuiObject,
  PolyLeaderstat,
  PolyLightingSettings,
  PolyPlayerSettings,
  PolySoundRequest,
  PolyTweenRequest,
  PolyWorldObject,
} from "./polyProject";
import { DEFAULT_LIGHTING_SETTINGS } from "./polyProject";
import { LightingRig } from "./LightingRig";
import { createSurfaceTexture } from "./surfaceTextures";
import { hasPartImageFaces } from "./partImageFaces";
import { usePartImageTextures } from "./usePartImageTextures";
import {
  cameraArrowDelta,
  movementAxis,
  normalizeJoystickAxis,
  shouldPreventGameplayDefault,
} from "./gameInput";

type InputState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  analogX: number;
  analogY: number;
  arrowForward: boolean;
  arrowBackward: boolean;
  sprint: boolean;
  cameraLeft: boolean;
  cameraRight: boolean;
  jumpQueued: boolean;
  resetQueued: boolean;
  yaw: number;
  pitch: number;
  zoomDistance: number;
};

type GameCameraSettings = {
  inverted: boolean;
  shiftLockEnabled: boolean;
  shiftLockActive: boolean;
};

type Telemetry = {
  grounded: boolean;
  speed: number;
  x: number;
  y: number;
  z: number;
  rotationY: number;
};

type GameSpawn = {
  x: number;
  y: number;
  z: number;
  rotationY?: number;
};

const SPAWN = { x: 0, y: 2.7, z: 7 };
const WORLD_UP = new Vector3(0, 1, 0);
const movement = new Vector3();
const forward = new Vector3();
const right = new Vector3();
const cameraTarget = new Vector3();
const desiredCameraPosition = new Vector3();
const cameraRayDirection = new Vector3();
const CAMERA_DISTANCE_SCALE = 0.37;
const CAMERA_MIN_PITCH = -0.82;
const CAMERA_MAX_PITCH = 1.12;
const FULL_TURN = Math.PI * 2;
const MOBILE_VIEWPORT_HEIGHT_VAR = "--polymons-mobile-vh";
const MOBILE_VIEWPORT_WIDTH_VAR = "--polymons-mobile-vw";
const MOBILE_VIEWPORT_TOP_VAR = "--polymons-mobile-top";
const DEATH_RESPAWN_DELAY_MS = 1_650;
let defaultDeathAudio: HTMLAudioElement | null = null;

function isIosLikeDevice(): boolean {
  const platform = navigator.platform || "";
  const userAgent = navigator.userAgent || "";
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isLikelyMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    Math.min(width, height) <= 820
  );
}

function clampCameraPitch(value: number): number {
  return MathUtils.clamp(value, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH);
}

function shortestAngleDelta(from: number, to: number): number {
  return MathUtils.euclideanModulo(to - from + Math.PI, FULL_TURN) - Math.PI;
}

function dampAngle(from: number, to: number, smoothing: number): number {
  return from + shortestAngleDelta(from, to) * smoothing;
}

function createInputState(): InputState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    analogX: 0,
    analogY: 0,
    arrowForward: false,
    arrowBackward: false,
    sprint: false,
    cameraLeft: false,
    cameraRight: false,
    jumpQueued: false,
    resetQueued: false,
    yaw: 0,
    pitch: 0.22,
    zoomDistance: 20,
  };
}

function cameraZoomBounds(playerSettings: PolyPlayerSettings) {
  const minimum = Math.max(
    1,
    Math.min(
      playerSettings.cameraMinZoomDistance,
      playerSettings.cameraMaxZoomDistance,
    ),
  );
  const maximum = Math.max(
    minimum,
    Math.min(
      200,
      Math.max(
        playerSettings.cameraMinZoomDistance,
        playerSettings.cameraMaxZoomDistance,
      ),
    ),
  );
  return { minimum, maximum };
}

function keyCodeName(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) {
    return [
      "Zero",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
    ][Number(code.slice(5))] ?? code;
  }
  return (
    {
      ShiftLeft: "LeftShift",
      ShiftRight: "RightShift",
      ControlLeft: "LeftControl",
      ControlRight: "RightControl",
      AltLeft: "LeftAlt",
      AltRight: "RightAlt",
      ArrowUp: "Up",
      ArrowDown: "Down",
      ArrowLeft: "Left",
      ArrowRight: "Right",
      Enter: "Return",
    }[code] ?? code
  );
}

function useKeyboard(
  input: MutableRefObject<InputState>,
  controlsEnabled: boolean,
  onKeyInput?: (keyCode: string, event: "InputBegan" | "InputEnded") => void,
) {
  useEffect(() => {
    const setKey = (code: string, pressed: boolean, repeat = false) => {
      switch (code) {
        case "KeyW":
          input.current.forward = pressed;
          break;
        case "KeyS":
          input.current.backward = pressed;
          break;
        case "KeyA":
          input.current.left = pressed;
          break;
        case "KeyD":
          input.current.right = pressed;
          break;
        case "ControlLeft":
        case "ControlRight":
          input.current.sprint = pressed;
          break;
        case "ArrowLeft":
          input.current.cameraLeft = pressed;
          break;
        case "ArrowRight":
          input.current.cameraRight = pressed;
          break;
        case "ArrowUp":
          input.current.arrowForward = pressed;
          break;
        case "ArrowDown":
          input.current.arrowBackward = pressed;
          break;
        case "Space":
          if (pressed && !repeat) input.current.jumpQueued = true;
          break;
        case "KeyR":
          if (pressed && !repeat) input.current.resetQueued = true;
          break;
        default:
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (!controlsEnabled) return;
      if (shouldPreventGameplayDefault(event.code)) {
        event.preventDefault();
      }
      setKey(event.code, true, event.repeat);
      if (!event.repeat) onKeyInput?.(keyCodeName(event.code), "InputBegan");
    };
    const onKeyUp = (event: KeyboardEvent) => {
      setKey(event.code, false);
      onKeyInput?.(keyCodeName(event.code), "InputEnded");
    };
    const clearKeys = () => {
      input.current.forward = false;
      input.current.backward = false;
      input.current.left = false;
      input.current.right = false;
      input.current.analogX = 0;
      input.current.analogY = 0;
      input.current.arrowForward = false;
      input.current.arrowBackward = false;
      input.current.sprint = false;
      input.current.cameraLeft = false;
      input.current.cameraRight = false;
      input.current.jumpQueued = false;
      input.current.resetQueued = false;
    };

    if (!controlsEnabled) clearKeys();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, [controlsEnabled, input, onKeyInput]);
}

function MouseLook({
  input,
  onPointerLock,
  playerSettings,
  cameraSettings,
  controlsEnabled,
  onShiftLockChange,
}: {
  input: MutableRefObject<InputState>;
  onPointerLock: (locked: boolean) => void;
  playerSettings: PolyPlayerSettings;
  cameraSettings: GameCameraSettings;
  controlsEnabled: boolean;
  onShiftLockChange: (active: boolean) => void;
}) {
  const { gl } = useThree();
  const cameraSettingsRef = useRef(cameraSettings);

  useEffect(() => {
    cameraSettingsRef.current = cameraSettings;
  }, [cameraSettings]);

  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    const previousUserSelect = canvas.style.userSelect;
    canvas.style.touchAction = "none";
    canvas.style.userSelect = "none";
    const touchPoints = new Map<number, { x: number; y: number }>();
    let touchPointer: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let pinchDistance: number | null = null;
    let mouseLooking = false;
    let mousePointer: number | null = null;
    let rightMouseHeld = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    const lookDirection = () =>
      cameraSettingsRef.current.inverted ? -1 : 1;
    const setZoom = (value: number) => {
      const bounds = cameraZoomBounds(playerSettings);
      input.current.zoomDistance = MathUtils.clamp(
        value,
        bounds.minimum,
        bounds.maximum,
      );
    };
    const currentPinchDistance = () => {
      const points = [...touchPoints.values()];
      if (points.length < 2) return null;
      return Math.hypot(
        points[0].x - points[1].x,
        points[0].y - points[1].y,
      );
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        if (!controlsEnabled || event.button !== 2) return;
        event.preventDefault();
        rightMouseHeld = true;
        mouseLooking = true;
        mousePointer = event.pointerId;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
        canvas.style.cursor = "grabbing";
        const captureFallback = () => {
          if (
            rightMouseHeld &&
            mousePointer === event.pointerId &&
            !canvas.hasPointerCapture(event.pointerId)
          ) {
            canvas.setPointerCapture(event.pointerId);
          }
        };
        try {
          const lockRequest = canvas.requestPointerLock();
          if (lockRequest) void lockRequest.catch(captureFallback);
        } catch {
          captureFallback();
        }
        return;
      }
      if (!controlsEnabled) return;
      event.preventDefault();
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      if (touchPoints.size === 1) {
        touchPointer = event.pointerId;
        lastTouchX = event.clientX;
        lastTouchY = event.clientY;
      } else {
        touchPointer = null;
        pinchDistance = currentPinchDistance();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!touchPoints.has(event.pointerId)) return;
      event.preventDefault();
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPoints.size >= 2) {
        const nextPinchDistance = currentPinchDistance();
        if (pinchDistance !== null && nextPinchDistance !== null) {
          setZoom(
            input.current.zoomDistance +
              (pinchDistance - nextPinchDistance) * 0.12,
          );
        }
        pinchDistance = nextPinchDistance;
        return;
      }
      if (event.pointerId !== touchPointer) return;
      input.current.yaw -=
        (event.clientX - lastTouchX) * 0.0052 * lookDirection();
      input.current.pitch = clampCameraPitch(
        input.current.pitch +
          (event.clientY - lastTouchY) * 0.0042 * lookDirection(),
      );
      lastTouchX = event.clientX;
      lastTouchY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        if (event.pointerId !== mousePointer) return;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        rightMouseHeld = false;
        mouseLooking = false;
        mousePointer = null;
        canvas.style.cursor = "";
        if (
          document.pointerLockElement === canvas &&
          !cameraSettingsRef.current.shiftLockActive
        ) {
          void document.exitPointerLock();
        }
        return;
      }
      touchPoints.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      pinchDistance = null;
      const remaining = touchPoints.entries().next().value as
        | [number, { x: number; y: number }]
        | undefined;
      if (remaining) {
        touchPointer = remaining[0];
        lastTouchX = remaining[1].x;
        lastTouchY = remaining[1].y;
      } else {
        touchPointer = null;
      }
    };
    const clearTouchLook = (event?: PointerEvent) => {
      if (event && event.pointerType !== "touch") return;
      touchPoints.clear();
      touchPointer = null;
      pinchDistance = null;
    };
    const onCanvasMouseMove = (event: PointerEvent) => {
      if (
        !controlsEnabled ||
        event.pointerType === "touch" ||
        !mouseLooking ||
        event.pointerId !== mousePointer ||
        document.pointerLockElement === canvas
      ) {
        return;
      }
      const deltaX = event.clientX - lastMouseX;
      const deltaY = event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      input.current.yaw -= deltaX * 0.0036 * lookDirection();
      input.current.pitch = clampCameraPitch(
        input.current.pitch + deltaY * 0.0032 * lookDirection(),
      );
    };
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      if (!rightMouseHeld && !cameraSettingsRef.current.shiftLockActive) return;
      input.current.yaw -= event.movementX * 0.0024 * lookDirection();
      input.current.pitch = clampCameraPitch(
        input.current.pitch + event.movementY * 0.0018 * lookDirection(),
      );
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 2 || !rightMouseHeld) return;
      rightMouseHeld = false;
      mouseLooking = false;
      mousePointer = null;
      canvas.style.cursor = "";
      if (
        document.pointerLockElement === canvas &&
        !cameraSettingsRef.current.shiftLockActive
      ) {
        void document.exitPointerLock();
      }
    };
    const clearMouseLook = () => {
      rightMouseHeld = false;
      mouseLooking = false;
      mousePointer = null;
      canvas.style.cursor = "";
      if (document.pointerLockElement === canvas) {
        void document.exitPointerLock();
      }
    };
    const onLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      onPointerLock(locked);
      if (!locked && cameraSettingsRef.current.shiftLockActive) {
        onShiftLockChange(false);
      }
    };
    const onLockError = () => {
      onPointerLock(false);
      onShiftLockChange(false);
    };
    const onWheel = (event: WheelEvent) => {
      if (!controlsEnabled) return;
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 1.2 : 0.03;
      setZoom(input.current.zoomDistance + event.deltaY * scale);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !controlsEnabled ||
        !cameraSettingsRef.current.shiftLockEnabled ||
        event.repeat ||
        !["ShiftLeft", "ShiftRight"].includes(event.code)
      ) {
        return;
      }
      const next = !cameraSettingsRef.current.shiftLockActive;
      onShiftLockChange(next);
      if (next) {
        void canvas.requestPointerLock();
      } else if (document.pointerLockElement === canvas) {
        void document.exitPointerLock();
      }
    };
    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointermove", onCanvasMouseMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("lostpointercapture", clearTouchLook);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("pointerlockerror", onLockError);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("blur", clearMouseLook);
    return () => {
      clearMouseLook();
      canvas.style.touchAction = previousTouchAction;
      canvas.style.userSelect = previousUserSelect;
      if (mousePointer !== null && canvas.hasPointerCapture(mousePointer)) {
        canvas.releasePointerCapture(mousePointer);
      }
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointermove", onCanvasMouseMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("lostpointercapture", clearTouchLook);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("pointerlockerror", onLockError);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", clearMouseLook);
    };
  }, [
    controlsEnabled,
    gl,
    input,
    onPointerLock,
    onShiftLockChange,
    playerSettings,
  ]);

  return null;
}

function BlockPart({
  size,
  position,
  color,
  castShadow = true,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color: string;
  castShadow?: boolean;
}) {
  return (
    <mesh position={position} castShadow={castShadow} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.58} metalness={0.015} />
    </mesh>
  );
}

function BlockAvatar({
  moving,
  grounded,
  verticalVelocity,
  facing,
  player,
}: {
  moving: MutableRefObject<number>;
  grounded: MutableRefObject<boolean>;
  verticalVelocity?: MutableRefObject<number>;
  facing: MutableRefObject<number>;
  player?: R6AvatarPlayer;
}) {
  return (
    <R6Avatar
      moving={moving}
      grounded={grounded}
      verticalVelocity={verticalVelocity}
      facing={facing}
      player={player}
    >
      {player && (
        <PlayerNameTag
          username={player.username}
          displayName={player.displayName}
        />
      )}
    </R6Avatar>
  );
}

function playSynthesizedDeathSound() {
  const browserWindow = window as Window & {
    speechSynthesis?: SpeechSynthesis;
    webkitAudioContext?: typeof AudioContext;
  };
  if (browserWindow.speechSynthesis) {
    browserWindow.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("OOF!");
    utterance.rate = 1.35;
    utterance.pitch = 0.55;
    utterance.volume = 0.9;
    browserWindow.speechSynthesis.speak(utterance);
    return;
  }
  const AudioContextClass =
    globalThis.AudioContext ?? browserWindow.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(165, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    82,
    context.currentTime + 0.22,
  );
  gain.gain.setValueAtTime(0.18, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.24);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.25);
  oscillator.addEventListener("ended", () => void context.close());
}

function preloadDefaultDeathSound() {
  if (defaultDeathAudio) return;
  const audio = new Audio(defaultDeathSoundUrl);
  audio.preload = "auto";
  audio.volume = 0.9;
  audio.load();
  defaultDeathAudio = audio;
}

function playDefaultDeathSound() {
  preloadDefaultDeathSound();
  const audio = defaultDeathAudio;
  if (!audio) {
    playSynthesizedDeathSound();
    return;
  }
  audio.pause();
  try {
    audio.currentTime = 0;
  } catch {
    // Metadata can still be loading during an immediate first death.
  }
  void audio.play().catch(() => playSynthesizedDeathSound());
}

function DeathPart({
  position,
  size,
  color,
  velocity,
  shirtId,
  pantsId,
  shirtTextureUrl,
  pantsTextureUrl,
  fallbackColor,
  sleeve = false,
  head = false,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  velocity: [number, number, number];
  shirtId?: ShirtId | null;
  pantsId?: PantsId | null;
  shirtTextureUrl?: string | null;
  pantsTextureUrl?: string | null;
  fallbackColor?: string;
  sleeve?: boolean;
  head?: boolean;
}) {
  const body = useRef<RapierRigidBody>(null);
  useEffect(() => {
    body.current?.setLinvel(
      { x: velocity[0], y: velocity[1], z: velocity[2] },
      true,
    );
    body.current?.setAngvel(
      {
        x: velocity[2] * 0.7,
        y: velocity[0] * 0.55,
        z: -velocity[1] * 0.35,
      },
      true,
    );
  }, [velocity]);
  return (
    <RigidBody
      ref={body}
      position={position}
      colliders={false}
      linearDamping={0.62}
      angularDamping={0.58}
      ccd
    >
      <CuboidCollider
        args={[size[0] / 2, size[1] / 2, size[2] / 2]}
        restitution={0.12}
        friction={0.78}
        mass={Math.max(0.25, size[0] * size[1] * size[2] * 0.35)}
      />
      {head ? (
        <group scale={R6_AVATAR_SCALE}>
          <R6Head color={color} />
        </group>
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={size} />
          {pantsId !== undefined ? (
            <PantsMaterials
              pantsId={pantsId}
              textureUrl={pantsTextureUrl}
              fallbackColor={fallbackColor ?? color}
            />
          ) : shirtId !== undefined ? (
            <ShirtMaterials
              shirtId={shirtId}
              textureUrl={shirtTextureUrl}
              sleeve={sleeve}
              fallbackColor={fallbackColor ?? color}
            />
          ) : (
            <meshStandardMaterial color={color} roughness={0.72} />
          )}
        </mesh>
      )}
    </RigidBody>
  );
}

function DeathParts({
  origin,
  player,
}: {
  origin: [number, number, number];
  player?: {
    equippedShirtId?: ShirtId | null;
    equippedPantsId?: PantsId | null;
    equippedShirtTextureUrl?: string | null;
    equippedPantsTextureUrl?: string | null;
    avatarAppearance?: AvatarAppearance;
  };
}) {
  const at = (
    x: number,
    y: number,
    z: number,
  ): [number, number, number] => [origin[0] + x, origin[1] + y, origin[2] + z];
  const shirtId = player?.equippedShirtId ?? null;
  const pantsId = player?.equippedPantsId ?? null;
  const shirtTextureUrl = player?.equippedShirtTextureUrl ?? null;
  const pantsTextureUrl = player?.equippedPantsTextureUrl ?? null;
  const colors = normalizeAvatarAppearance(player?.avatarAppearance).bodyColors;
  const scaledSize = (
    size: [number, number, number],
  ): [number, number, number] => [
    size[0] * R6_AVATAR_SCALE,
    size[1] * R6_AVATAR_SCALE,
    size[2] * R6_AVATAR_SCALE,
  ];
  const scaledPosition = (
    x: number,
    y: number,
  ): [number, number, number] => [
    x * R6_AVATAR_SCALE,
    R6_VISUAL_OFFSET + y * R6_AVATAR_SCALE,
    0,
  ];
  return (
    <>
      <DeathPart
        position={at(...scaledPosition(0, R6_TORSO_CENTER_Y))}
        size={scaledSize(R6_TORSO_SIZE)}
        color={colors.torso}
        velocity={[0.2, 2.15, -0.4]}
        shirtId={shirtId}
        shirtTextureUrl={shirtTextureUrl}
        fallbackColor={colors.torso}
      />
      <DeathPart
        position={at(...scaledPosition(0, R6_HEAD_CENTER_Y))}
        size={scaledSize(R6_HEAD_SIZE)}
        color={colors.head}
        velocity={[-0.18, 3.15, 0.35]}
        head
      />
      <DeathPart
        position={at(
          ...scaledPosition(-R6_SHOULDER_X, R6_SHOULDER_Y + R6_ARM_CENTER_Y),
        )}
        size={scaledSize(R6_ARM_SIZE)}
        color={colors.leftArm}
        velocity={[-2.25, 2.35, 0.72]}
        shirtId={shirtId}
        shirtTextureUrl={shirtTextureUrl}
        sleeve
        fallbackColor={colors.leftArm}
      />
      <DeathPart
        position={at(
          ...scaledPosition(R6_SHOULDER_X, R6_SHOULDER_Y + R6_ARM_CENTER_Y),
        )}
        size={scaledSize(R6_ARM_SIZE)}
        color={colors.rightArm}
        velocity={[2.25, 2.45, -0.65]}
        shirtId={shirtId}
        shirtTextureUrl={shirtTextureUrl}
        sleeve
        fallbackColor={colors.rightArm}
      />
      <DeathPart
        position={at(
          ...scaledPosition(-R6_HIP_X, R6_HIP_Y + R6_LEG_CENTER_Y),
        )}
        size={scaledSize(R6_LEG_SIZE)}
        color={colors.leftLeg}
        velocity={[-1.15, 1.8, -0.78]}
        pantsId={pantsId}
        pantsTextureUrl={pantsTextureUrl}
        fallbackColor={colors.leftLeg}
      />
      <DeathPart
        position={at(
          ...scaledPosition(R6_HIP_X, R6_HIP_Y + R6_LEG_CENTER_Y),
        )}
        size={scaledSize(R6_LEG_SIZE)}
        color={colors.rightLeg}
        velocity={[1.15, 1.9, 0.78]}
        pantsId={pantsId}
        pantsTextureUrl={pantsTextureUrl}
        fallbackColor={colors.rightLeg}
      />
    </>
  );
}

function DeathCamera({
  origin,
  input,
}: {
  origin: [number, number, number];
  input: MutableRefObject<InputState>;
}) {
  const { camera } = useThree();
  useFrame((_state, delta) => {
    cameraTarget.set(origin[0], origin[1] + 0.35, origin[2]);
    const distance = Math.max(4.6, input.current.zoomDistance * 0.28);
    const horizontalDistance = Math.cos(input.current.pitch) * distance;
    desiredCameraPosition.set(
      origin[0] + Math.sin(input.current.yaw) * horizontalDistance,
      origin[1] + 2.2 + Math.sin(input.current.pitch) * distance,
      origin[2] + Math.cos(input.current.yaw) * horizontalDistance,
    );
    camera.position.lerp(
      desiredCameraPosition,
      1 - Math.exp(-12 * delta),
    );
    camera.lookAt(cameraTarget);
  });
  return null;
}

function ProjectSound({
  object,
  requests,
  requestVersion,
  audioUnlockVersion,
}: {
  object: PolyWorldObject;
  requests: PolySoundRequest[];
  requestVersion: number;
  audioUnlockVersion: number;
}) {
  const audio = useMemo(() => document.createElement("audio"), []);
  const [loaded, setLoaded] = useState(false);
  const lastHandledRequestId = useRef<string | null>(null);
  const processingRequestId = useRef<string | null>(null);
  const autoplayStarted = useRef(false);
  const latestRequest = useMemo(
    () =>
      [...requests]
        .reverse()
        .find((candidate) => candidate.objectId === object.id),
    [object.id, requests],
  );
  useEffect(() => {
    audio.volume = object.volume ?? 0.7;
    audio.loop = object.looped ?? false;
    audio.playbackRate = object.playbackSpeed ?? 1;
  }, [audio, object.looped, object.playbackSpeed, object.volume]);
  useEffect(() => {
    setLoaded(false);
    autoplayStarted.current = false;
    lastHandledRequestId.current = null;
    processingRequestId.current = null;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (!object.soundData) return;
    audio.preload = "auto";
    audio.src = object.soundData;
    audio.load();
    setLoaded(true);
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    };
  }, [audio, object.soundData]);
  const runAction = useCallback(
    async (action: PolySoundRequest["action"]): Promise<boolean> => {
      if (action === "play") {
        audio.pause();
        audio.currentTime = 0;
        await audio.play();
      } else if (action === "pause") {
        audio.pause();
      } else {
        audio.pause();
        audio.currentTime = 0;
      }
      return true;
    },
    [audio],
  );
  useEffect(() => {
    if (!loaded || !object.autoplay || autoplayStarted.current) return;
    void runAction("play")
      .then((played) => {
        if (played) autoplayStarted.current = true;
      })
      .catch(() => undefined);
  }, [audioUnlockVersion, loaded, object.autoplay, runAction]);
  useEffect(() => {
    if (!loaded) return;
    const request = latestRequest;
    if (
      !request ||
      lastHandledRequestId.current === request.id ||
      processingRequestId.current === request.id
    ) {
      return;
    }
    processingRequestId.current = request.id;
    void runAction(request.action)
      .then((played) => {
        if (played) lastHandledRequestId.current = request.id;
      })
      .catch(() => undefined)
      .finally(() => {
        if (processingRequestId.current === request.id) {
          processingRequestId.current = null;
        }
      });
  }, [
    audioUnlockVersion,
    latestRequest,
    loaded,
    requestVersion,
    runAction,
  ]);
  return null;
}

function ProjectSounds({
  objects,
  requests,
  requestVersion,
}: {
  objects: PolyWorldObject[];
  requests: PolySoundRequest[];
  requestVersion: number;
}) {
  const [audioUnlockVersion, setAudioUnlockVersion] = useState(0);
  useEffect(() => {
    const unlockAudio = () =>
      setAudioUnlockVersion((version) => version + 1);
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, []);
  return objects
    .filter((object) => object.type === "sound")
    .map((object) => (
      <ProjectSound
        key={object.id}
        object={object}
        requests={requests}
        requestVersion={requestVersion}
        audioUnlockVersion={audioUnlockVersion}
      />
    ));
}

function PlayerNameTag({
  username,
  displayName,
}: {
  username: string;
  displayName: string;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 160;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.textAlign = "center";
    context.lineJoin = "round";
    context.strokeStyle = "rgba(0,0,0,0.9)";
    context.fillStyle = "#ffffff";
    context.font = "700 52px system-ui";
    context.lineWidth = 12;
    context.strokeText(displayName, 384, 65);
    context.fillText(displayName, 384, 65);
    context.fillStyle = "rgba(255,255,255,0.82)";
    context.font = "600 30px system-ui";
    context.lineWidth = 9;
    context.strokeText(`@${username}`, 384, 116);
    context.fillText(`@${username}`, 384, 116);
    const next = new CanvasTexture(canvas);
    next.colorSpace = SRGBColorSpace;
    next.needsUpdate = true;
    return next;
  }, [displayName, username]);
  useEffect(() => () => texture?.dispose(), [texture]);
  if (!texture) return null;
  return (
    <sprite position={[0, 4.25, 0]} scale={[3.9, 0.82, 1]} renderOrder={50}>
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
      />
    </sprite>
  );
}

function RemoteBlockAvatar({ player }: { player: RemotePlayer }) {
  const root = useRef<Group>(null);
  const target = useRef(new Vector3(...player.state.position));
  const moving = useRef(0);
  const grounded = useRef(true);
  const verticalVelocity = useRef(0);
  const facing = useRef(player.state.rotationY);

  useEffect(() => {
    const next = new Vector3(...player.state.position);
    verticalVelocity.current = (next.y - target.current.y) / 0.15;
    grounded.current = Math.abs(verticalVelocity.current) < 0.35;
    moving.current = Math.min(
      9.5,
      next.distanceTo(target.current) / 0.15,
    );
    target.current.copy(next);
    facing.current = player.state.rotationY;
  }, [player.state]);

  useFrame((_state, delta) => {
    if (!root.current) return;
    const distance = root.current.position.distanceTo(target.current);
    if (distance > 12) {
      root.current.position.copy(target.current);
    } else {
      root.current.position.lerp(
        target.current,
        1 - Math.exp(-14 * delta),
      );
    }
    moving.current *= Math.exp(-5 * delta);
  });

  return (
    <group
      ref={root}
      name={`remote-player-${player.username}`}
      position={player.state.position}
    >
      <BlockAvatar
        moving={moving}
        grounded={grounded}
        verticalVelocity={verticalVelocity}
        facing={facing}
        player={player}
      />
    </group>
  );
}

function PlayerController({
  input,
  onTelemetry,
  onPlayerState,
  spawn,
  playerSettings,
  shiftLockActive,
  cameraInverted,
  localPlayer,
  onDeath,
}: {
  input: MutableRefObject<InputState>;
  onTelemetry: (telemetry: Telemetry) => void;
  onPlayerState?: (state: Omit<PlayerTransform, "sequence">) => void;
  spawn: GameSpawn;
  playerSettings: PolyPlayerSettings;
  shiftLockActive: boolean;
  cameraInverted: boolean;
  localPlayer?: R6AvatarPlayer;
  onDeath: (origin: [number, number, number]) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const groundContacts = useRef(0);
  const grounded = useRef(false);
  const moving = useRef(0);
  const verticalVelocity = useRef(0);
  const facing = useRef(spawn.rotationY ?? 0);
  const lastTelemetry = useRef(0);
  const lastNetworkUpdate = useRef(0);
  const jumpCooldown = useRef(0);
  const jumpBuffer = useRef(0);
  const coyoteTime = useRef(0);
  const lastPosition = useRef<[number, number, number]>([
    spawn.x,
    spawn.y,
    spawn.z,
  ]);
  const deathTriggered = useRef(false);
  const cameraCollisionDistance = useRef<number | null>(null);
  const { camera } = useThree();
  const { rapier, world } = useRapier();

  useEffect(() => {
    if (!body.current) return;
    body.current.setTranslation({ x: spawn.x, y: spawn.y, z: spawn.z }, true);
    if (spawn.rotationY !== undefined) {
      input.current.yaw = spawn.rotationY;
      facing.current = spawn.rotationY;
    }
  }, [input, spawn.rotationY, spawn.x, spawn.y, spawn.z]);

  const die = useCallback(() => {
    if (deathTriggered.current) return;
    deathTriggered.current = true;
    onDeath([...lastPosition.current]);
  }, [onDeath]);

  useEffect(() => {
    if (playerSettings.health <= 0) {
      die();
    } else {
      deathTriggered.current = false;
    }
  }, [die, playerSettings.health]);

  useFrame((state, delta) => {
    const rigidBody = body.current;
    if (!rigidBody) return;
    const frameDelta = Math.min(delta, 0.05);
    input.current.yaw += cameraArrowDelta(
      input.current.cameraLeft,
      input.current.cameraRight,
      frameDelta,
      cameraInverted,
    );

    jumpCooldown.current = Math.max(0, jumpCooldown.current - frameDelta);
    grounded.current = groundContacts.current > 0;
    coyoteTime.current = grounded.current
      ? 0.11
      : Math.max(0, coyoteTime.current - frameDelta);
    if (input.current.jumpQueued) jumpBuffer.current = 0.14;
    else jumpBuffer.current = Math.max(0, jumpBuffer.current - frameDelta);

    const axisForward = movementAxis(
      input.current.forward,
      input.current.backward,
      input.current.arrowForward,
      input.current.arrowBackward,
      input.current.analogY,
    );
    const axisRight = MathUtils.clamp(
      Number(input.current.right) -
        Number(input.current.left) +
        input.current.analogX,
      -1,
      1,
    );
    const cameraYaw = input.current.yaw;
    const cameraPitch = input.current.pitch;

    forward.set(
      -Math.sin(cameraYaw),
      0,
      -Math.cos(cameraYaw),
    );
    right.crossVectors(forward, WORLD_UP);
    movement
      .set(0, 0, 0)
      .addScaledVector(forward, axisForward)
      .addScaledVector(right, axisRight);
    if (movement.lengthSq() > 1) movement.normalize();

    const velocity = rigidBody.linvel();
    verticalVelocity.current = velocity.y;
    const walkSpeed = Math.max(1, playerSettings.walkSpeed / 2.75);
    const targetSpeed =
      input.current.sprint && playerSettings.sprintEnabled
        ? walkSpeed * MathUtils.clamp(playerSettings.sprintMultiplier, 1, 5)
        : walkSpeed;
    const accelerating = movement.lengthSq() > 0.001;
    const acceleration = grounded.current
      ? accelerating
        ? 60
        : 52
      : accelerating
        ? 10
        : 1;
    const smoothing = 1 - Math.exp(-acceleration * frameDelta);
    const targetX = movement.x * targetSpeed;
    const targetZ = movement.z * targetSpeed;
    const nextVelocity = {
      x: MathUtils.lerp(velocity.x, targetX, smoothing),
      y: velocity.y,
      z: MathUtils.lerp(velocity.z, targetZ, smoothing),
    };

    if (
      jumpBuffer.current > 0 &&
      coyoteTime.current > 0 &&
      jumpCooldown.current === 0
    ) {
      nextVelocity.y = Math.max(8.5, playerSettings.jumpPower * 0.95);
      jumpCooldown.current = 0.18;
      jumpBuffer.current = 0;
      coyoteTime.current = 0;
      groundContacts.current = 0;
    }
    input.current.jumpQueued = false;

    rigidBody.setLinvel(nextVelocity, true);
    rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, false);

    const horizontalSpeed = Math.hypot(nextVelocity.x, nextVelocity.z);
    moving.current = horizontalSpeed;
    if (shiftLockActive) {
      facing.current = dampAngle(
        facing.current,
        cameraYaw,
        1 - Math.exp(-50 * frameDelta),
      );
    } else if (movement.lengthSq() > 0.02) {
      facing.current = dampAngle(
        facing.current,
        Math.atan2(-movement.x, -movement.z),
        1 - Math.exp(-42 * frameDelta),
      );
    }

    const position = rigidBody.translation();
    lastPosition.current = [position.x, position.y, position.z];
    if (position.y < -14 || input.current.resetQueued) {
      input.current.resetQueued = false;
      die();
      return;
    }

    cameraTarget.set(position.x, position.y + 1.05, position.z);
    const zoomBounds = cameraZoomBounds(playerSettings);
    input.current.zoomDistance = MathUtils.clamp(
      input.current.zoomDistance,
      zoomBounds.minimum,
      zoomBounds.maximum,
    );
    const distance = input.current.zoomDistance * CAMERA_DISTANCE_SCALE;
    const horizontalDistance = Math.cos(cameraPitch) * distance;
    const shoulderOffset = shiftLockActive ? 1.15 : 0;
    desiredCameraPosition.set(
      position.x +
        Math.sin(cameraYaw) * horizontalDistance +
        Math.cos(cameraYaw) * shoulderOffset,
      position.y + 2.5 + Math.sin(cameraPitch) * distance,
      position.z +
        Math.cos(cameraYaw) * horizontalDistance -
        Math.sin(cameraYaw) * shoulderOffset,
    );
    cameraRayDirection
      .copy(desiredCameraPosition)
      .sub(cameraTarget);
    const cameraDistance = cameraRayDirection.length();
    cameraRayDirection.normalize();
    const cameraHit = world.castRay(
      new rapier.Ray(cameraTarget, cameraRayDirection),
      cameraDistance,
      true,
      rapier.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      undefined,
      rigidBody,
    );
    const collisionTargetDistance = cameraHit
      ? Math.max(1.05, cameraHit.timeOfImpact - 0.3)
      : cameraDistance;
    const previousCollisionDistance =
      cameraCollisionDistance.current ?? collisionTargetDistance;
    const collisionSmoothing =
      1 -
      Math.exp(
        -(collisionTargetDistance < previousCollisionDistance ? 85 : 26) *
          frameDelta,
      );
    const resolvedCameraDistance = MathUtils.lerp(
      previousCollisionDistance,
      collisionTargetDistance,
      collisionSmoothing,
    );
    cameraCollisionDistance.current =
      !cameraHit && Math.abs(resolvedCameraDistance - cameraDistance) < 0.015
        ? null
        : resolvedCameraDistance;
    desiredCameraPosition
      .copy(cameraTarget)
      .addScaledVector(cameraRayDirection, resolvedCameraDistance);
    const cameraSmoothing =
      1 - Math.exp((shiftLockActive ? -95 : -80) * frameDelta);
    camera.position.lerp(desiredCameraPosition, cameraSmoothing);
    camera.lookAt(cameraTarget);

    const nextPlayerState = {
      position: [position.x, position.y, position.z] as [number, number, number],
      rotationY: facing.current,
    };
    if (state.clock.elapsedTime - lastNetworkUpdate.current > 0.06) {
      lastNetworkUpdate.current = state.clock.elapsedTime;
      onPlayerState?.({
        ...nextPlayerState,
      });
    }
    if (state.clock.elapsedTime - lastTelemetry.current > 0.15) {
      lastTelemetry.current = state.clock.elapsedTime;
      onTelemetry({
        grounded: grounded.current,
        speed: horizontalSpeed,
        x: position.x,
        y: position.y,
        z: position.z,
        rotationY: facing.current,
      });
    }
  });

  return (
    <RigidBody
      ref={body}
      name="HumanoidRootPart"
      position={[spawn.x, spawn.y, spawn.z]}
      colliders={false}
      lockRotations
      linearDamping={0}
      friction={0}
      ccd
      canSleep={false}
      additionalSolverIterations={4}
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider
        args={[R6_COLLIDER_HALF_HEIGHT, R6_COLLIDER_RADIUS]}
        friction={0}
      />
      <CuboidCollider
        args={[0.34, 0.06, 0.3]}
        position={[0, R6_GROUND_SENSOR_Y, 0]}
        sensor
        onIntersectionEnter={() => {
          groundContacts.current += 1;
        }}
        onIntersectionExit={() => {
          groundContacts.current = Math.max(0, groundContacts.current - 1);
        }}
      />
      <group name="Humanoid">
        <BlockAvatar
          moving={moving}
          grounded={grounded}
          verticalVelocity={verticalVelocity}
          facing={facing}
          player={localPlayer}
        />
      </group>
    </RigidBody>
  );
}

function StaticBlock({
  position,
  size,
  color,
  rotation,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position} rotation={rotation}>
      <BlockPart size={size} color={color} />
    </RigidBody>
  );
}

function PhysicsCrate({
  position,
  color,
}: {
  position: [number, number, number];
  color: string;
}) {
  return (
    <RigidBody
      position={position}
      colliders="cuboid"
      restitution={0.05}
      friction={0.75}
      mass={1.2}
      ccd
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.5, 1.5, 1.5]} />
        <meshStandardMaterial color={color} roughness={0.68} />
      </mesh>
    </RigidBody>
  );
}

function sampleAnimationPose(
  objectId: string,
  animations: PolyAnimation[],
  requests: string[],
  elapsed: number,
) {
  const animation = animations.find(
    (candidate) =>
      requests.includes(candidate.name) &&
      candidate.keyframes.some((keyframe) => keyframe.poses[objectId]),
  );
  if (!animation) return null;
  const time = animation.looped
    ? elapsed % animation.duration
    : Math.min(elapsed, animation.duration);
  const posed = animation.keyframes.filter(
    (keyframe) => keyframe.poses[objectId],
  );
  if (posed.length === 0) return null;
  const before =
    [...posed].reverse().find((keyframe) => keyframe.time <= time) ?? posed[0];
  const after =
    posed.find((keyframe) => keyframe.time >= time) ?? posed[posed.length - 1];
  const span = Math.max(0.0001, after.time - before.time);
  const alpha = before === after ? 0 : (time - before.time) / span;
  const interpolate = (
    first: [number, number, number] | undefined,
    second: [number, number, number] | undefined,
  ): [number, number, number] => {
    const a = first ?? [0, 0, 0];
    const b = second ?? a;
    return [
      a[0] + (b[0] - a[0]) * alpha,
      a[1] + (b[1] - a[1]) * alpha,
      a[2] + (b[2] - a[2]) * alpha,
    ];
  };
  return {
    position: interpolate(
      before.poses[objectId].position,
      after.poses[objectId].position,
    ),
    rotation: interpolate(
      before.poses[objectId].rotation,
      after.poses[objectId].rotation,
    ),
  };
}

function ProjectBlock({
  object,
  animations,
  animationRequests,
  tweenRequests,
  playerContactVersion,
  onTouched,
  onTouchEnded,
}: {
  object: PolyWorldObject;
  animations: PolyAnimation[];
  animationRequests: string[];
  tweenRequests: PolyTweenRequest[];
  playerContactVersion: number;
  onTouched?: (worldObjectId: string) => void;
  onTouchEnded?: (worldObjectId: string) => void;
}) {
  const animated = useRef<Group>(null);
  const scaled = useRef<Group>(null);
  const body = useRef<RapierRigidBody>(null);
  const meshMaterials = useRef<MeshStandardMaterial[]>([]);
  const animationStartedAt = useRef<number | null>(null);
  const tweenStartedAt = useRef<number | null>(null);
  const touchingPlayerColliders = useRef(new Set<number>());
  useEffect(() => {
    touchingPlayerColliders.current.clear();
  }, [playerContactVersion]);
  const surfaceTexture = useMemo(
    () => createSurfaceTexture(object.surfaceTexture),
    [object.surfaceTexture],
  );
  useEffect(() => () => surfaceTexture?.dispose(), [surfaceTexture]);
  const tween = [...tweenRequests]
    .reverse()
    .find((request) => request.objectId === object.id);
  useEffect(() => {
    tweenStartedAt.current = null;
  }, [tween?.id]);
  useEffect(() => {
    const rigidBody = body.current;
    if (!rigidBody || object.anchored) return;
    rigidBody.setLinvel(
      {
        x: object.velocity?.[0] ?? 0,
        y: object.velocity?.[1] ?? 0,
        z: object.velocity?.[2] ?? 0,
      },
      true,
    );
    rigidBody.setAngvel(
      {
        x: object.angularVelocity?.[0] ?? 0,
        y: object.angularVelocity?.[1] ?? 0,
        z: object.angularVelocity?.[2] ?? 0,
      },
      true,
    );
  }, [object.anchored, object.angularVelocity, object.mass, object.velocity]);
  useFrame(({ clock }) => {
    if (!animated.current) return;
    animationStartedAt.current ??= clock.elapsedTime;
    const pose = sampleAnimationPose(
      object.id,
      animations,
      animationRequests,
      clock.elapsedTime - animationStartedAt.current,
    );
    animated.current.position.set(...(pose?.position ?? [0, 0, 0]));
    animated.current.rotation.set(...(pose?.rotation ?? [0, 0, 0]));
    if (!tween || !body.current) return;
    tweenStartedAt.current ??= clock.elapsedTime;
    const progress = Math.min(
      1,
      (clock.elapsedTime - tweenStartedAt.current) / tween.duration,
    );
    const curve = (value: number) =>
      tween.easingStyle === "Linear"
        ? value
        : tween.easingStyle === "Quad"
          ? value * value
          : value * value * value;
    const alpha =
      tween.easingDirection === "In"
        ? curve(progress)
        : tween.easingDirection === "Out"
          ? 1 - curve(1 - progress)
          : progress < 0.5
            ? curve(progress * 2) / 2
            : 1 - curve((1 - progress) * 2) / 2;
    const lerpVector = (
      from: [number, number, number],
      to: [number, number, number],
    ): [number, number, number] => [
      MathUtils.lerp(from[0], to[0], alpha),
      MathUtils.lerp(from[1], to[1], alpha),
      MathUtils.lerp(from[2], to[2], alpha),
    ];
    const position = lerpVector(tween.from.position, tween.to.position);
    const rotation = lerpVector(tween.from.rotation, tween.to.rotation);
    body.current.setTranslation(
      { x: position[0], y: position[1], z: position[2] },
      true,
    );
    body.current.setRotation(
      new Quaternion().setFromEuler(
        new Euler(rotation[0], rotation[1], rotation[2]),
      ),
      true,
    );
    if (scaled.current) {
      const size = lerpVector(tween.from.scale, tween.to.scale);
      scaled.current.scale.set(...size);
    }
    for (const material of meshMaterials.current) {
      material.opacity =
        1 -
        MathUtils.lerp(
          tween.from.transparency,
          tween.to.transparency,
          alpha,
        );
      material.color
        .set(tween.from.color)
        .lerp(new Color(tween.to.color), alpha);
    }
  });
  const imageTextures = usePartImageTextures(object.imageFaces);
  const hasImages = hasPartImageFaces(object.imageFaces);
  const materialRef = (index: number) => (material: MeshStandardMaterial | null) => {
    if (material) meshMaterials.current[index] = material;
    else delete meshMaterials.current[index];
  };
  if (object.visible === false) return null;
  const material = {
    plastic: {
      roughness: object.surfaceTexture === "none" ? 0.38 : 0.72,
      metalness: 0,
      emissiveIntensity: 0,
    },
    metal: { roughness: 0.28, metalness: 0.82, emissiveIntensity: 0 },
    wood: { roughness: 0.94, metalness: 0, emissiveIntensity: 0 },
    neon: { roughness: 0.35, metalness: 0.05, emissiveIntensity: 0.65 },
  }[object.material];
  const content = (
    <group ref={animated}>
      <group ref={scaled} scale={object.scale}>
        <mesh
          castShadow={object.castShadow && object.transparency < 0.95}
          receiveShadow={object.transparency < 0.95}
        >
          <ProjectPartGeometry shape={object.shape ?? "block"} />
          {hasImages && (object.shape ?? "block") === "block" ? (
            ([
              ["right", 0],
              ["left", 1],
              ["top", 2],
              ["bottom", 3],
              ["back", 4],
              ["front", 5],
            ] as const).map(([face, index]) => (
              <meshStandardMaterial
                key={`${object.material}-${object.surfaceTexture}-${face}-${object.imageFaces?.[face] ?? object.imageFaces?.all ?? ""}`}
                ref={materialRef(index)}
                attach={`material-${index}`}
                color={object.color}
                map={imageTextures[face] ?? imageTextures.all ?? surfaceTexture}
                roughness={Math.max(0.18, material.roughness - 0.08)}
                metalness={material.metalness}
                emissive={object.material === "neon" ? object.color : "#000000"}
                emissiveIntensity={material.emissiveIntensity}
                transparent={object.transparency > 0 || Boolean(tween)}
                opacity={Math.max(0, Math.min(1, 1 - object.transparency))}
                depthWrite={object.transparency <= 0.02}
                alphaTest={object.transparency >= 1 ? 1 : 0}
              />
            ))
          ) : (
            <meshStandardMaterial
              ref={materialRef(0)}
              key={`${object.material}-${object.surfaceTexture}-${object.imageFaces?.all ?? object.imageFaces?.front ?? ""}`}
              color={object.color}
              map={imageTextures.all ?? imageTextures.front ?? surfaceTexture}
              roughness={Math.max(0.18, material.roughness - 0.08)}
              metalness={material.metalness}
              emissive={object.material === "neon" ? object.color : "#000000"}
              emissiveIntensity={material.emissiveIntensity}
              transparent={object.transparency > 0 || Boolean(tween)}
              opacity={Math.max(0, Math.min(1, 1 - object.transparency))}
              depthWrite={object.transparency <= 0.02}
              alphaTest={object.transparency >= 1 ? 1 : 0}
            />
          )}
        </mesh>
      </group>
    </group>
  );
  const playerEntered = ({ other }: CollisionPayload) => {
    if (other.rigidBodyObject?.name !== "HumanoidRootPart") return;
    const colliderHandle = other.collider.handle;
    if (touchingPlayerColliders.current.has(colliderHandle)) return;
    const firstContact = touchingPlayerColliders.current.size === 0;
    touchingPlayerColliders.current.add(colliderHandle);
    if (firstContact) onTouched?.(object.id);
  };
  const playerExited = ({ other }: CollisionPayload) => {
    if (other.rigidBodyObject?.name !== "HumanoidRootPart") return;
    touchingPlayerColliders.current.delete(other.collider.handle);
    if (touchingPlayerColliders.current.size === 0) onTouchEnded?.(object.id);
  };
  return (
    <RigidBody
      ref={body}
      name={object.id}
      type={object.anchored ? "fixed" : "dynamic"}
      colliders={false}
      position={object.position}
      rotation={object.rotation}
      ccd={!object.anchored}
      linearDamping={object.anchored ? 0 : 0.08}
      angularDamping={object.anchored ? 0 : 0.12}
    >
      <ProjectPartCollider
        object={object}
        sensor={!object.canCollide}
        friction={object.friction ?? 0.82}
        restitution={object.restitution ?? 0.03}
        mass={Math.max(0.01, object.mass ?? 1)}
        onCollisionEnter={playerEntered}
        onCollisionExit={playerExited}
        onIntersectionEnter={playerEntered}
        onIntersectionExit={playerExited}
      />
      {content}
    </RigidBody>
  );
}

function ProjectPartGeometry({
  shape,
}: {
  shape: NonNullable<PolyWorldObject["shape"]>;
}) {
  if (shape === "sphere") {
    return <sphereGeometry args={[0.5, 32, 20]} />;
  }
  if (shape === "cylinder" || shape === "stud") {
    return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
  }
  return <boxGeometry args={[1, 1, 1]} />;
}

function ProjectPartCollider({
  object,
  sensor,
  friction,
  restitution,
  mass,
  onCollisionEnter,
  onCollisionExit,
  onIntersectionEnter,
  onIntersectionExit,
}: {
  object: PolyWorldObject;
  sensor: boolean;
  friction: number;
  restitution: number;
  mass: number;
  onCollisionEnter: (payload: CollisionPayload) => void;
  onCollisionExit: (payload: CollisionPayload) => void;
  onIntersectionEnter: (payload: CollisionPayload) => void;
  onIntersectionExit: (payload: CollisionPayload) => void;
}) {
  const common = {
    sensor,
    friction,
    restitution,
    mass,
    onCollisionEnter,
    onCollisionExit,
    onIntersectionEnter,
    onIntersectionExit,
  };
  if (object.shape === "sphere") {
    return (
      <BallCollider
        args={[
          Math.max(
            0.01,
            Math.min(object.scale[0], object.scale[1], object.scale[2]) / 2,
          ),
        ]}
        {...common}
      />
    );
  }
  if (object.shape === "cylinder" || object.shape === "stud") {
    return (
      <CylinderCollider
        args={[
          Math.max(0.01, object.scale[1] / 2),
          Math.max(0.01, Math.min(object.scale[0], object.scale[2]) / 2),
        ]}
        {...common}
      />
    );
  }
  return (
    <CuboidCollider
      args={[
        Math.max(0.01, object.scale[0] / 2),
        Math.max(0.01, object.scale[1] / 2),
        Math.max(0.01, object.scale[2] / 2),
      ]}
      {...common}
    />
  );
}

function Scene({
  input,
  onTelemetry,
  onPointerLock,
  remotePlayers,
  onPlayerState,
  worldObjects,
  animations,
  animationRequests,
  animationVersion,
  tweenRequests,
  tweenVersion,
  soundRequests,
  soundVersion,
  playerSettings,
  cameraSettings,
  controlsEnabled,
  onShiftLockChange,
  lighting,
  shadows,
  spawn,
  onWorldTouched,
  onWorldTouchEnded,
  localPlayer,
  onPlayerDeath,
  onPlayerRespawn,
}: {
  input: MutableRefObject<InputState>;
  onTelemetry: (telemetry: Telemetry) => void;
  onPointerLock: (locked: boolean) => void;
  remotePlayers: RemotePlayer[];
  onPlayerState?: (state: Omit<PlayerTransform, "sequence">) => void;
  worldObjects?: PolyWorldObject[];
  animations: PolyAnimation[];
  animationRequests: string[];
  animationVersion: number;
  tweenRequests: PolyTweenRequest[];
  tweenVersion: number;
  soundRequests: PolySoundRequest[];
  soundVersion: number;
  playerSettings: PolyPlayerSettings;
  cameraSettings: GameCameraSettings;
  controlsEnabled: boolean;
  onShiftLockChange: (active: boolean) => void;
  lighting: PolyLightingSettings;
  shadows: boolean;
  spawn: GameSpawn;
  onWorldTouched?: (worldObjectId: string) => void;
  onWorldTouchEnded?: (worldObjectId: string) => void;
  localPlayer?: R6AvatarPlayer;
  onPlayerDeath: () => void;
  onPlayerRespawn?: () => void;
}) {
  const [death, setDeath] = useState<{
    origin: [number, number, number];
  } | null>(null);
  const [playerContactVersion, setPlayerContactVersion] = useState(0);
  const respawnCallback = useRef(onPlayerRespawn);
  respawnCallback.current = onPlayerRespawn;

  useEffect(() => {
    if (!death) return;
    const timer = window.setTimeout(() => {
      respawnCallback.current?.();
      setDeath(null);
    }, DEATH_RESPAWN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [death]);

  const beginDeath = useCallback(
    (origin: [number, number, number]) => {
      if (death) return;
      setDeath({ origin });
      setPlayerContactVersion((version) => version + 1);
      onPlayerDeath();
    },
    [death, onPlayerDeath],
  );

  return (
    <>
      <MouseLook
        input={input}
        onPointerLock={onPointerLock}
        playerSettings={playerSettings}
        cameraSettings={cameraSettings}
        controlsEnabled={controlsEnabled}
        onShiftLockChange={onShiftLockChange}
      />
      <LightingRig lighting={lighting} shadows={shadows} />
      <Physics
        gravity={[0, -28, 0]}
        timeStep={1 / 60}
        interpolate
        colliders={false}
      >
        {death ? (
          <>
            <DeathCamera origin={death.origin} input={input} />
            <DeathParts origin={death.origin} player={localPlayer} />
          </>
        ) : (
          <PlayerController
            input={input}
            onTelemetry={onTelemetry}
            onPlayerState={onPlayerState}
            spawn={spawn}
            playerSettings={playerSettings}
            shiftLockActive={cameraSettings.shiftLockActive}
            cameraInverted={cameraSettings.inverted}
            localPlayer={localPlayer}
            onDeath={beginDeath}
          />
        )}
        {remotePlayers.map((player) => (
          <RemoteBlockAvatar key={player.id} player={player} />
        ))}
        {worldObjects ? (
          worldObjects.filter((object) => object.type !== "sound").map((object) => (
            <ProjectBlock
              key={`${object.id}-${animationVersion}-${tweenVersion}`}
              object={object}
              animations={animations}
              animationRequests={animationRequests}
              tweenRequests={tweenRequests}
              playerContactVersion={playerContactVersion}
              onTouched={onWorldTouched}
              onTouchEnded={onWorldTouchEnded}
            />
          ))
        ) : (
          <>
            <RigidBody type="fixed" colliders={false} name="baseplate">
              <CuboidCollider
                args={[30, 0.5, 30]}
                position={[0, -0.5, 0]}
                friction={1}
              />
              <mesh position={[0, -0.5, 0]} receiveShadow>
                <boxGeometry args={[60, 1, 60]} />
                <meshStandardMaterial color="#55a76a" roughness={0.9} />
              </mesh>
              <gridHelper
                args={[60, 60, new Color("#d4efda"), new Color("#438956")]}
                position={[0, 0.012, 0]}
              />
            </RigidBody>
            <StaticBlock position={[-8, 1, -4]} size={[5, 2, 5]} color="#7281cf" />
            <StaticBlock
              position={[9, 1.3, -5]}
              size={[8, 0.8, 5]}
              color="#b990df"
              rotation={[0, 0, -0.25]}
            />
            {[0, 1, 2, 3, 4].map((step) => {
              const height = 0.5 * (step + 1);
              return (
                <StaticBlock
                  key={step}
                  position={[-3.2 + step * 1.55, height / 2, -10]}
                  size={[1.6, height, 4]}
                  color={step % 2 === 0 ? "#cf9b5e" : "#d8aa70"}
                />
              );
            })}
            <PhysicsCrate position={[4, 1.1, 4]} color="#df714d" />
            <PhysicsCrate position={[5.6, 1.1, 3.8]} color="#4d8fdf" />
            <PhysicsCrate position={[4.8, 2.8, 4]} color="#e0bd4f" />
          </>
        )}
        {worldObjects && (
          <ProjectSounds
            objects={worldObjects}
            requests={soundRequests}
            requestVersion={soundVersion}
          />
        )}
      </Physics>
    </>
  );
}

function MobileJoystick({
  onChange,
}: {
  onChange: (x: number, y: number) => void;
}) {
  const knobRef = useRef<HTMLSpanElement>(null);
  const moveKnob = (x: number, y: number) => {
    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  };
  const update = (
    event: ReactPointerEvent<HTMLDivElement>,
    release = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (release) {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      moveKnob(0, 0);
      onChange(0, 0);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const radius = bounds.width * 0.34;
    const rawX = event.clientX - (bounds.left + bounds.width / 2);
    const rawY = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > radius ? radius / distance : 1;
    const x = rawX * scale;
    const y = rawY * scale;
    moveKnob(x, y);
    onChange(x / radius, y / radius);
  };

  return (
    <div
      className="mobile-joystick"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event);
      }}
      onPointerUp={(event) => update(event, true)}
      onPointerCancel={(event) => update(event, true)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      role="group"
      aria-label="Movement joystick"
    >
      <span
        ref={knobRef}
        className="mobile-joystick-knob"
      />
    </div>
  );
}

function ChatPanel({
  messages,
  error,
  onSend,
  defaultOpen = true,
}: {
  messages: ChatMessage[];
  error?: string;
  onSend: (text: string) => boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.key !== "/" ||
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (document.pointerLockElement) void document.exitPointerLock();
      setOpen(true);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, open]);

  return (
    <aside className={`game-chat${open ? " game-chat-open" : ""}`}>
      <button
        className="game-chat-toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <strong>Chat</strong>
        <span>{open ? "Hide" : "Open"}</span>
      </button>
      {open && (
        <>
          <div className="game-chat-log" ref={logRef} aria-live="polite">
            {messages.length === 0 ? (
              <p className="game-chat-empty">Press / or click below to chat.</p>
            ) : (
              messages.map((message) => (
                <p key={message.id}>
                  <strong style={{ color: chatUsernameColor(message.userId) }}>
                    {message.displayName}
                  </strong>
                  <span>: {message.text}</span>
                </p>
              ))
            )}
          </div>
          <form
            className="game-chat-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (onSend(draft)) setDraft("");
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              maxLength={160}
              aria-label="Chat message"
              placeholder="To chat click here or press /"
              onFocus={() => {
                if (document.pointerLockElement) void document.exitPointerLock();
              }}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  inputRef.current?.blur();
                }
              }}
            />
            <button type="submit" disabled={!draft.trim()}>
              Send
            </button>
          </form>
          {error && <small className="game-chat-error">{error}</small>}
        </>
      )}
    </aside>
  );
}

function GuiNode({
  object,
  objects,
  onActivate,
}: {
  object: PolyGuiObject;
  objects: PolyGuiObject[];
  onActivate?: (guiObjectId: string) => void;
}) {
  if (!object.visible) return null;
  const children = objects.filter((item) => item.parentId === object.id);
  if (object.type === "screenGui") {
    return (
      <>
        {children.map((child) => (
          <GuiNode
            key={child.id}
            object={child}
            objects={objects}
            onActivate={onActivate}
          />
        ))}
      </>
    );
  }
  const style = {
    left: `${(object.position[0] - object.anchorPoint[0] * object.size[0]) * 100}%`,
    top: `${(object.position[1] - object.anchorPoint[1] * object.size[1]) * 100}%`,
    width: `${object.size[0] * 100}%`,
    height: `${object.size[1] * 100}%`,
    color: object.textColor,
    backgroundColor: object.backgroundColor,
    opacity: Math.max(0, Math.min(1, 1 - object.backgroundTransparency)),
    transform: `rotate(${object.rotation}deg)`,
    fontSize: `${object.textSize}px`,
    borderRadius: `${object.borderRadius}px`,
    zIndex: object.zIndex,
    overflow:
      object.type === "scrollingFrame"
        ? "auto"
        : object.clipDescendants
          ? "hidden"
          : "visible",
  };
  const className = `poly-gui-object poly-gui-${object.type}`;
  if (object.type === "textButton" || object.type === "imageButton") {
    return (
      <button
        className={className}
        style={style}
        onClick={(event) => {
          event.stopPropagation();
          onActivate?.(object.id);
        }}
      >
        {object.type === "imageButton" && object.imageUrl ? (
          <img src={object.imageUrl} alt="" draggable={false} />
        ) : (
          object.text
        )}
        {children.map((child) => (
          <GuiNode
            key={child.id}
            object={child}
            objects={objects}
            onActivate={onActivate}
          />
        ))}
      </button>
    );
  }
  if (object.type === "textBox") {
    return (
      <input
        className={className}
        style={style}
        defaultValue={object.text}
        placeholder={object.placeholder}
        onFocus={() => {
          if (document.pointerLockElement) void document.exitPointerLock();
        }}
      />
    );
  }
  return (
    <div className={className} style={style}>
      {object.type === "textLabel" ? object.text : null}
      {object.type === "imageLabel" && object.imageUrl ? (
        <img src={object.imageUrl} alt="" draggable={false} />
      ) : null}
      {children.map((child) => (
        <GuiNode
          key={child.id}
          object={child}
          objects={objects}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}

function ProjectGui({
  objects,
  onActivate,
}: {
  objects: PolyGuiObject[];
  onActivate?: (guiObjectId: string) => void;
}) {
  const roots = objects.filter(
    (object) => object.type === "screenGui" && object.parentId === null,
  );
  return (
    <div className="poly-player-gui">
      {roots.map((root) => (
        <GuiNode
          key={root.id}
          object={root}
          objects={objects}
          onActivate={onActivate}
        />
      ))}
    </div>
  );
}

export default function BaseplateGame({
  remotePlayers = [],
  onPlayerState,
  worldObjects,
  animations = [],
  animationRequests = [],
  animationVersion = 0,
  tweenRequests = [],
  tweenVersion = 0,
  soundRequests = [],
  soundVersion = 0,
  guiObjects = [],
  playerSettings = {
    health: 100,
    walkSpeed: 18,
    jumpPower: 10.5,
    cameraFieldOfView: 52,
    cameraMinZoomDistance: 10,
    cameraMaxZoomDistance: 80,
    maxHealth: 100,
    sprintEnabled: true,
    sprintMultiplier: 1.5,
  },
  lighting = DEFAULT_LIGHTING_SETTINGS,
  leaderstats = [],
  projectName = "Baseplate",
  localPlayer,
  playSpawn,
  onFriendRequest,
  chatMessages = [],
  chatError,
  onSendChat,
  onGuiActivated,
  onToolActivated,
  onWorldTouched,
  onWorldTouchEnded,
  onKeyInput,
  onPlayerRespawn,
  onLeave,
}: {
  remotePlayers?: RemotePlayer[];
  onPlayerState?: (state: Omit<PlayerTransform, "sequence">) => void;
  worldObjects?: PolyWorldObject[];
  animations?: PolyAnimation[];
  animationRequests?: string[];
  animationVersion?: number;
  tweenRequests?: PolyTweenRequest[];
  tweenVersion?: number;
  soundRequests?: PolySoundRequest[];
  soundVersion?: number;
  guiObjects?: PolyGuiObject[];
  playerSettings?: PolyPlayerSettings;
  lighting?: PolyLightingSettings;
  leaderstats?: PolyLeaderstat[];
  projectName?: string;
  localPlayer?: R6AvatarPlayer;
  playSpawn?: GameSpawn;
  onFriendRequest?: (username: string) => Promise<void>;
  chatMessages?: ChatMessage[];
  chatError?: string;
  onSendChat?: (text: string) => boolean;
  onGuiActivated?: (guiObjectId: string) => void;
  onToolActivated?: (toolObjectId: string) => void;
  onWorldTouched?: (worldObjectId: string) => void;
  onWorldTouchEnded?: (worldObjectId: string) => void;
  onKeyInput?: (
    keyCode: string,
    event: "InputBegan" | "InputEnded",
  ) => void;
  onPlayerRespawn?: () => void;
  onLeave?: () => void;
}) {
  const [dead, setDead] = useState(false);
  const visibleLeaderstats = leaderstats.filter(
    (stat) => stat.showOnLeaderboard !== false,
  );
  const playerListGridColumns =
    visibleLeaderstats.length > 0
      ? `32px minmax(0, 1fr) repeat(${visibleLeaderstats.length}, minmax(52px, auto))`
      : "32px minmax(0, 1fr)";
  const spawnObject = worldObjects?.find((object) => object.type === "spawn");
  const spawn = playSpawn ?? (spawnObject
    ? {
        x: spawnObject.position[0],
        y: spawnObject.position[1] + 2.7,
        z: spawnObject.position[2],
      }
    : SPAWN);
  const rootRef = useRef<HTMLElement>(null);
  const input = useRef<InputState>(createInputState());
  const tools = worldObjects?.filter((object) => object.type === "tool") ?? [];
  const [pointerLocked, setPointerLocked] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [gameMenuTab, setGameMenuTab] = useState<"players" | "settings">(
    "players",
  );
  const [cameraInverted, setCameraInverted] = useState(false);
  const [shiftLockEnabled, setShiftLockEnabled] = useState(true);
  const [shiftLockActive, setShiftLockActive] = useState(false);
  const [menuFriendStatus, setMenuFriendStatus] = useState<
    Record<string, string>
  >({});
  const [playerListOpen, setPlayerListOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    username: string;
    displayName: string;
    local?: boolean;
  } | null>(null);
  const [friendStatus, setFriendStatus] = useState("");
  const [mobileDevice, setMobileDevice] = useState(isLikelyMobileDevice);
  const [iosDevice, setIosDevice] = useState(isIosLikeDevice);
  const [landscape, setLandscape] = useState(() =>
    window.innerWidth > window.innerHeight,
  );
  const [portraitDismissed, setPortraitDismissed] = useState(false);
  const [mobileImmersive, setMobileImmersive] = useState(false);
  const [graphicsMode, setGraphicsMode] = useState<"low" | "high">(() =>
    isLikelyMobileDevice() ? "low" : "high",
  );
  const [touchSprintActive, setTouchSprintActive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [localSoundRequests, setLocalSoundRequests] = useState<
    PolySoundRequest[]
  >([]);
  const [localSoundVersion, setLocalSoundVersion] = useState(0);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    grounded: false,
    speed: 0,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    rotationY: 0,
  });
  const cameraSettings = useMemo<GameCameraSettings>(
    () => ({
      inverted: cameraInverted,
      shiftLockEnabled,
      shiftLockActive,
    }),
    [cameraInverted, shiftLockActive, shiftLockEnabled],
  );
  useKeyboard(input, !gameMenuOpen && !dead, onKeyInput);
  useEffect(() => preloadDefaultDeathSound(), []);
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("polymons:game-mode", { detail: { active: true } }),
    );
    return () => {
      window.dispatchEvent(
        new CustomEvent("polymons:game-mode", { detail: { active: false } }),
      );
    };
  }, []);
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const viewport = window.visualViewport;
    const previousHeight = document.documentElement.style.getPropertyValue(
      MOBILE_VIEWPORT_HEIGHT_VAR,
    );
    const previousWidth = document.documentElement.style.getPropertyValue(
      MOBILE_VIEWPORT_WIDTH_VAR,
    );
    const previousTop = document.documentElement.style.getPropertyValue(
      MOBILE_VIEWPORT_TOP_VAR,
    );
    const update = () => {
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const top = viewport?.offsetTop ?? 0;
      const mobile =
        media.matches || Math.min(width, height) <= 820;
      setMobileDevice(mobile);
      setIosDevice(isIosLikeDevice());
      setLandscape(width > height);
      document.documentElement.style.setProperty(
        MOBILE_VIEWPORT_HEIGHT_VAR,
        `${height}px`,
      );
      document.documentElement.style.setProperty(
        MOBILE_VIEWPORT_WIDTH_VAR,
        `${width}px`,
      );
      document.documentElement.style.setProperty(
        MOBILE_VIEWPORT_TOP_VAR,
        `${top}px`,
      );
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      if (previousHeight) {
        document.documentElement.style.setProperty(
          MOBILE_VIEWPORT_HEIGHT_VAR,
          previousHeight,
        );
      } else {
        document.documentElement.style.removeProperty(
          MOBILE_VIEWPORT_HEIGHT_VAR,
        );
      }
      if (previousWidth) {
        document.documentElement.style.setProperty(
          MOBILE_VIEWPORT_WIDTH_VAR,
          previousWidth,
        );
      } else {
        document.documentElement.style.removeProperty(
          MOBILE_VIEWPORT_WIDTH_VAR,
        );
      }
      if (previousTop) {
        document.documentElement.style.setProperty(
          MOBILE_VIEWPORT_TOP_VAR,
          previousTop,
        );
      } else {
        document.documentElement.style.removeProperty(
          MOBILE_VIEWPORT_TOP_VAR,
        );
      }
    };
  }, []);
  useEffect(() => {
    if (landscape) setPortraitDismissed(false);
  }, [landscape]);
  useEffect(() => {
    if (!mobileDevice) {
      setMobileImmersive(false);
      return;
    }
    const html = document.documentElement;
    const previousHtmlOverflow = html.style.overflow;
    const previousHtmlOverscroll = html.style.overscrollBehavior;
    const previousOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousTouchAction = document.body.style.touchAction;
    html.classList.add("polymons-mobile-game-active");
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    document.body.style.touchAction = "none";
    return () => {
      html.classList.remove("polymons-mobile-game-active");
      html.style.overflow = previousHtmlOverflow;
      html.style.overscrollBehavior = previousHtmlOverscroll;
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [mobileDevice]);
  useEffect(() => {
    const update = () =>
      setFullscreen(
        mobileImmersive ||
          Boolean(
            document.fullscreenElement ||
              (document as Document & { webkitFullscreenElement?: Element })
                .webkitFullscreenElement,
          ),
      );
    update();
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, [mobileImmersive]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        if (gameMenuOpen) {
          event.preventDefault();
          setGameMenuOpen(false);
          return;
        }
        const target = event.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
          target.blur();
          return;
        }
        event.preventDefault();
        setGameMenuOpen(true);
        return;
      }
      if (event.code !== "Tab") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      event.preventDefault();
      if (gameMenuOpen) return;
      setPlayerListOpen((open) => {
        const next = !open;
        if (next && document.pointerLockElement) {
          void document.exitPointerLock();
        }
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gameMenuOpen]);
  useEffect(() => {
    if (!gameMenuOpen) return;
    input.current.forward = false;
    input.current.backward = false;
    input.current.left = false;
    input.current.right = false;
    input.current.analogX = 0;
    input.current.analogY = 0;
    input.current.sprint = false;
    setTouchSprintActive(false);
    setPlayerListOpen(false);
    setSelectedPlayer(null);
    setShiftLockActive(false);
    if (document.pointerLockElement) void document.exitPointerLock();
  }, [gameMenuOpen]);
  useEffect(() => {
    if (!dead && playerSettings.sprintEnabled) return;
    input.current.sprint = false;
    setTouchSprintActive(false);
  }, [dead, playerSettings.sprintEnabled]);
  useEffect(() => {
    if (shiftLockEnabled) return;
    setShiftLockActive(false);
    if (document.pointerLockElement) void document.exitPointerLock();
  }, [shiftLockEnabled]);

  const setMove = (
    key: "forward" | "backward" | "left" | "right" | "sprint",
    value: boolean,
  ) => {
    input.current[key] = value;
  };
  const clearTouchMovement = () => {
    setMove("forward", false);
    setMove("backward", false);
    setMove("left", false);
    setMove("right", false);
    input.current.analogX = 0;
    input.current.analogY = 0;
    setMove("sprint", false);
    setTouchSprintActive(false);
  };
  const stopTouchAction = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const enterMobileFullscreen = async () => {
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    let nativeFullscreenRequested = false;
    try {
      if (!document.fullscreenElement) {
        if (root.requestFullscreen) {
          await root.requestFullscreen();
          nativeFullscreenRequested = true;
        } else if (root.webkitRequestFullscreen) {
          await root.webkitRequestFullscreen();
          nativeFullscreenRequested = true;
        }
      }
    } catch {
      nativeFullscreenRequested = false;
    }
    if (!nativeFullscreenRequested) {
      setMobileImmersive(true);
      window.scrollTo(0, 0);
    }
    try {
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "landscape") => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {
      // Fullscreen and orientation locking vary by mobile browser.
    } finally {
      setPortraitDismissed(true);
    }
  };
  const exitMobileFullscreen = async () => {
    const webkitDocument = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
      webkitFullscreenElement?: Element;
    };
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (
        webkitDocument.webkitFullscreenElement &&
        webkitDocument.webkitExitFullscreen
      ) {
        await webkitDocument.webkitExitFullscreen();
      }
    } catch {
      // Mobile browser fullscreen exits can fail if the browser owns the UI.
    } finally {
      setMobileImmersive(false);
      setFullscreen(false);
    }
  };
  const handlePlayerDeath = useCallback(() => {
    setDead(true);
    const deathSound = worldObjects?.find(
      (object) =>
        object.type === "sound" &&
        (object.name.toLowerCase() === "deathsound" ||
          object.tags.some((tag) => tag.toLowerCase() === "deathsound")),
    );
    if (!deathSound?.soundData) {
      playDefaultDeathSound();
      return;
    }
    setLocalSoundRequests((current) => [
      ...current,
      {
        id: `death-${Date.now()}`,
        objectId: deathSound.id,
        action: "play",
      },
    ]);
    setLocalSoundVersion((current) => current + 1);
  }, [worldObjects]);
  const handlePlayerRespawn = useCallback(() => {
    setDead(false);
    onPlayerRespawn?.();
  }, [onPlayerRespawn]);

  return (
    <section
      ref={rootRef}
      className="baseplate-player"
      aria-label="Playable Baseplate game"
      tabIndex={0}
      data-grounded={telemetry.grounded}
      data-speed={telemetry.speed.toFixed(2)}
      data-position={`${telemetry.x.toFixed(2)},${telemetry.y.toFixed(2)},${telemetry.z.toFixed(2)}`}
      data-remote-players={remotePlayers.length}
      data-chat-enabled={onSendChat ? "true" : undefined}
      data-mobile={mobileDevice ? "true" : undefined}
      data-ios={iosDevice ? "true" : undefined}
      data-landscape={landscape ? "true" : undefined}
      data-mobile-immersive={mobileImmersive ? "true" : undefined}
      data-fullscreen={fullscreen ? "true" : undefined}
      data-graphics={graphicsMode}
      data-dead={dead ? "true" : undefined}
      data-shift-lock={shiftLockActive ? "true" : undefined}
      data-pointer-locked={pointerLocked ? "true" : undefined}
    >
      <Canvas
        shadows={graphicsMode === "high" ? "soft" : false}
        dpr={
          graphicsMode === "high"
            ? [1, 1.5]
            : mobileDevice
              ? [0.55, 0.85]
              : [0.65, 1]
        }
        camera={{
          position: [0, 5.5, 12],
          fov: playerSettings.cameraFieldOfView,
          near: 0.1,
          far: Math.max(300, lighting.fogEnd + 50),
        }}
        gl={{
          antialias: graphicsMode === "high",
          powerPreference: "high-performance",
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1,
        }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = PCFSoftShadowMap;
        }}
      >
        <Suspense fallback={null}>
          <Scene
            input={input}
            onTelemetry={setTelemetry}
            onPointerLock={setPointerLocked}
            remotePlayers={remotePlayers}
            onPlayerState={onPlayerState}
            worldObjects={worldObjects}
            animations={animations}
            animationRequests={animationRequests}
            animationVersion={animationVersion}
            tweenRequests={tweenRequests}
            tweenVersion={tweenVersion}
            soundRequests={[...soundRequests, ...localSoundRequests]}
            soundVersion={soundVersion + localSoundVersion}
            playerSettings={playerSettings}
            cameraSettings={cameraSettings}
            controlsEnabled={!gameMenuOpen && !dead}
            onShiftLockChange={setShiftLockActive}
            lighting={lighting}
            shadows={graphicsMode === "high"}
            spawn={spawn}
            onWorldTouched={onWorldTouched}
            onWorldTouchEnded={onWorldTouchEnded}
            localPlayer={localPlayer}
            onPlayerDeath={handlePlayerDeath}
            onPlayerRespawn={handlePlayerRespawn}
          />
        </Suspense>
      </Canvas>

      <button
        className="game-menu-button"
        type="button"
        onClick={(event) => {
          event.currentTarget.blur();
          setGameMenuOpen(true);
        }}
        aria-label="Open game menu"
      >
        <span />
        <span />
        <span />
      </button>
      {shiftLockActive && !gameMenuOpen && (
        <span className="shift-lock-reticle" aria-hidden="true" />
      )}

      {gameMenuOpen && (
        <div className="game-menu-layer" role="dialog" aria-modal="true">
          <section className="game-menu-panel">
            <header className="game-menu-tabs">
              <button
                type="button"
                className={gameMenuTab === "players" ? "active" : ""}
                onClick={() => setGameMenuTab("players")}
              >
                Players
              </button>
              <button
                type="button"
                className={gameMenuTab === "settings" ? "active" : ""}
                onClick={() => setGameMenuTab("settings")}
              >
                Settings
              </button>
            </header>

            <div className="game-menu-content">
              {gameMenuTab === "players" ? (
                <>
                  <div className="game-menu-heading">
                    <div>
                      <strong>Players</strong>
                      <span>{remotePlayers.length + 1} in this game</span>
                    </div>
                  </div>
                  <div className="game-menu-players">
                    <article>
                      <span>
                        {(localPlayer?.displayName ?? "L").slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {localPlayer?.displayName ?? "LocalPlayer"}
                        </strong>
                        <small>
                          @{localPlayer?.username ?? "localplayer"} - You
                        </small>
                      </div>
                    </article>
                    {remotePlayers.map((player) => (
                      <article key={player.id}>
                        <span>{player.displayName.slice(0, 1)}</span>
                        <div>
                          <strong>{player.displayName}</strong>
                          <small>@{player.username}</small>
                        </div>
                        {onFriendRequest && (
                          <button
                            type="button"
                            disabled={
                              menuFriendStatus[player.username] === "Sent"
                            }
                            onClick={async () => {
                              setMenuFriendStatus((current) => ({
                                ...current,
                                [player.username]: "Sending...",
                              }));
                              try {
                                await onFriendRequest(player.username);
                                setMenuFriendStatus((current) => ({
                                  ...current,
                                  [player.username]: "Sent",
                                }));
                              } catch (error) {
                                setMenuFriendStatus((current) => ({
                                  ...current,
                                  [player.username]:
                                    error instanceof Error
                                      ? error.message
                                      : "Try again",
                                }));
                              }
                            }}
                          >
                            {menuFriendStatus[player.username] || "Add friend"}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="game-menu-heading">
                    <div>
                      <strong>Settings</strong>
                      <span>Changes apply immediately</span>
                    </div>
                  </div>
                  <div className="game-menu-settings">
                    <label>
                      <div>
                        <strong>Camera inverted</strong>
                        <small>
                          Reverse mouse, touch, and arrow-key camera movement.
                        </small>
                      </div>
                      <input
                        type="checkbox"
                        checked={cameraInverted}
                        onChange={(event) =>
                          setCameraInverted(event.target.checked)
                        }
                      />
                    </label>
                    <label>
                      <div>
                        <strong>Shift lock</strong>
                        <small>
                          Press Shift to lock the mouse and face the camera.
                        </small>
                      </div>
                      <input
                        type="checkbox"
                        checked={shiftLockEnabled}
                        onChange={(event) =>
                          setShiftLockEnabled(event.target.checked)
                        }
                      />
                    </label>
                    <label>
                      <div>
                        <strong>Graphics</strong>
                        <small>
                          High enables stronger shadows and resolution.
                        </small>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setGraphicsMode((current) =>
                            current === "low" ? "high" : "low",
                          )
                        }
                      >
                        {graphicsMode === "high" ? "High" : "Low"}
                      </button>
                    </label>
                    {mobileDevice && (
                      <label>
                        <div>
                          <strong>Fullscreen</strong>
                          <small>Use the full landscape display.</small>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (fullscreen) {
                              void exitMobileFullscreen();
                            } else {
                              void enterMobileFullscreen();
                            }
                          }}
                        >
                          {fullscreen ? "Exit" : "Enter"}
                        </button>
                      </label>
                    )}
                  </div>
                </>
              )}
            </div>

            <footer className="game-menu-actions">
              <button
                type="button"
                onClick={() => {
                  input.current.resetQueued = true;
                  setGameMenuOpen(false);
                }}
              >
                Reset character
              </button>
              {onLeave && (
                <button type="button" className="danger" onClick={onLeave}>
                  Leave game
                </button>
              )}
              <button
                type="button"
                className="primary"
                onClick={() => setGameMenuOpen(false)}
              >
                Resume
              </button>
            </footer>
          </section>
        </div>
      )}

      <div className="game-hud game-hud-left">
        <span className="game-build-label">{projectName.toUpperCase()}</span>
        <strong>{localPlayer?.displayName ?? "LocalPlayer"}</strong>
        <span>
          {telemetry.grounded ? "Grounded" : "Airborne"} -{" "}
          {telemetry.speed.toFixed(1)} studs/s
        </span>
        <span>
          {remotePlayers.length + 1}{" "}
          {remotePlayers.length === 0 ? "player" : "players"} online
        </span>
        <span>{dead ? 0 : playerSettings.health}/{playerSettings.maxHealth} health</span>
      </div>

      {dead && (
        <div className="death-status" role="status" aria-live="polite">
          <strong>Knocked out</strong>
          <span>Respawning...</span>
        </div>
      )}

      <ProjectGui objects={guiObjects} onActivate={onGuiActivated} />

      {tools.length > 0 && (
        <div className="tool-hotbar" aria-label="Tools">
          {tools.map((tool, index) => (
            <button
              type="button"
              key={tool.id}
              onClick={() => onToolActivated?.(tool.id)}
              disabled={!onToolActivated}
            >
              <kbd>{index + 1}</kbd>
              <span>{tool.name}</span>
            </button>
          ))}
        </div>
      )}

      {onSendChat && (
        <ChatPanel
          messages={chatMessages}
          error={chatError}
          onSend={onSendChat}
          defaultOpen={!mobileDevice}
        />
      )}

      {playerListOpen && (
        <aside className="player-list-menu">
          <header>
            <strong>Players</strong>
            <span>{remotePlayers.length + 1}</span>
          </header>
          {visibleLeaderstats.length > 0 && (
            <div
              className="player-list-columns"
              style={{
                gridTemplateColumns: `minmax(0, 1fr) repeat(${visibleLeaderstats.length}, minmax(52px, auto))`,
              }}
            >
              <span>Player</span>
              {visibleLeaderstats.map((stat) => (
                <span key={stat.id}>{stat.name}</span>
              ))}
            </div>
          )}
          <button
            type="button"
            style={{
              gridTemplateColumns: playerListGridColumns,
            }}
            onClick={() => {
              setFriendStatus("");
              setSelectedPlayer({
                username: localPlayer?.username ?? "localplayer",
                displayName: localPlayer?.displayName ?? "LocalPlayer",
                local: true,
              });
            }}
          >
            <span>{(localPlayer?.displayName ?? "L").slice(0, 1)}</span>
            <div>
              <strong>{localPlayer?.displayName ?? "LocalPlayer"}</strong>
              <small>@{localPlayer?.username ?? "localplayer"}</small>
            </div>
            {visibleLeaderstats.map((stat) => (
              <b key={stat.id}>{String(stat.defaultValue)}</b>
            ))}
          </button>
          {remotePlayers.map((player) => (
            <button
              type="button"
              key={player.id}
              style={{
                gridTemplateColumns: playerListGridColumns,
              }}
              onClick={() => {
                setFriendStatus("");
                setSelectedPlayer({
                  username: player.username,
                  displayName: player.displayName,
                });
              }}
            >
              <span>{player.displayName.slice(0, 1)}</span>
              <div>
                <strong>{player.displayName}</strong>
                <small>@{player.username}</small>
              </div>
              {visibleLeaderstats.map((stat) => (
                <b key={stat.id}>
                  {player.leaderstats[stat.name] === undefined
                    ? "-"
                    : String(player.leaderstats[stat.name])}
                </b>
              ))}
            </button>
          ))}
        </aside>
      )}

      {selectedPlayer && (
        <div className="player-profile-popover">
          <button
            className="profile-close"
            type="button"
            onClick={() => setSelectedPlayer(null)}
          >
            Close
          </button>
          <span>{selectedPlayer.displayName.slice(0, 1)}</span>
          <h2>{selectedPlayer.displayName}</h2>
          <p>@{selectedPlayer.username}</p>
          {!selectedPlayer.local && onFriendRequest && (
            <button
              type="button"
              onClick={async () => {
                setFriendStatus("Sending...");
                try {
                  await onFriendRequest(selectedPlayer.username);
                  setFriendStatus("Friend request sent");
                } catch (error) {
                  setFriendStatus(
                    error instanceof Error ? error.message : "Could not send request",
                  );
                }
              }}
            >
              Send friend request
            </button>
          )}
          {friendStatus && <small>{friendStatus}</small>}
        </div>
      )}

      <div className="game-hud game-hud-right">
        <span>WASD Move</span>
        <span>Arrows Camera</span>
        <span>Space Jump</span>
        <span>Ctrl Sprint</span>
        {shiftLockEnabled && <span>Shift Lock</span>}
        <span>R Reset</span>
      </div>

      {mobileDevice && !landscape && !portraitDismissed && (
        <div className="mobile-landscape-gate" role="dialog" aria-modal="true">
          <div className="mobile-landscape-card">
            <span className="mobile-landscape-icon" aria-hidden="true">
              90
            </span>
            <strong>Rotate to landscape</strong>
            <p>
              Turn your phone sideways for the best controls. If your browser
              gets stuck, you can still play in portrait.
            </p>
            <button type="button" onClick={() => void enterMobileFullscreen()}>
              Fit to screen
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setPortraitDismissed(true)}
            >
              Continue anyway
            </button>
          </div>
        </div>
      )}

      <div className="touch-controls touch-movement" aria-label="Movement controls">
        <MobileJoystick
          onChange={(x, y) => {
            if (gameMenuOpen || dead) {
              clearTouchMovement();
              return;
            }
            input.current.analogX = normalizeJoystickAxis(x);
            input.current.analogY = normalizeJoystickAxis(-y);
          }}
        />
      </div>
      <div className="touch-controls touch-actions">
        <button
          type="button"
          onPointerDown={(event) => {
            stopTouchAction(event);
            if (gameMenuOpen || dead) return;
            input.current.jumpQueued = true;
          }}
        >
          Jump
        </button>
        {playerSettings.sprintEnabled && (
          <button
            type="button"
            className={touchSprintActive ? "active" : undefined}
            aria-pressed={touchSprintActive}
            onPointerDown={(event) => {
              stopTouchAction(event);
              if (gameMenuOpen || dead) return;
              setTouchSprintActive((active) => {
                const next = !active;
                setMove("sprint", next);
                return next;
              });
            }}
          >
            {touchSprintActive ? "Running" : "Run"}
          </button>
        )}
      </div>

      <div className="game-position" aria-hidden="true">
        {telemetry.x.toFixed(0)}, {telemetry.y.toFixed(0)},{" "}
        {telemetry.z.toFixed(0)}
      </div>
    </section>
  );
}
