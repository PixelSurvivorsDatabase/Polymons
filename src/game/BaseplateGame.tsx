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
  AudioListener,
  AudioLoader,
  CanvasTexture,
  Color,
  Euler,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  PositionalAudio as ThreePositionalAudio,
  Vector2,
  Vector3,
} from "three";
import { ShirtMaterials } from "./AvatarPreview";
import type { ShirtId } from "./avatarCatalog";
import { chatUsernameColor } from "./chat";
import defaultDeathSoundUrl from "../../assets/audio/polymons-oof-remix.mp3";
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

type InputState = {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jumpQueued: boolean;
  resetQueued: boolean;
  yaw: number;
  pitch: number;
  zoomDistance: number;
};

type Telemetry = {
  grounded: boolean;
  speed: number;
  x: number;
  y: number;
  z: number;
  rotationY: number;
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
const AVATAR_SCALE = 0.8;
const AVATAR_VISUAL_OFFSET = -0.2;
const HEAD_PROFILE = [
  new Vector2(0, -0.72),
  new Vector2(0.64, -0.72),
  new Vector2(0.76, -0.67),
  new Vector2(0.83, -0.56),
  new Vector2(0.85, -0.42),
  new Vector2(0.85, 0.42),
  new Vector2(0.83, 0.56),
  new Vector2(0.76, 0.67),
  new Vector2(0.64, 0.72),
  new Vector2(0, 0.72),
];
function createInputState(): InputState {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
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
  onKeyInput?: (keyCode: string, event: "InputBegan" | "InputEnded") => void,
) {
  useEffect(() => {
    const setKey = (code: string, pressed: boolean, repeat = false) => {
      switch (code) {
        case "KeyW":
        case "ArrowUp":
          input.current.forward = pressed;
          break;
        case "KeyS":
        case "ArrowDown":
          input.current.backward = pressed;
          break;
        case "KeyA":
        case "ArrowLeft":
          input.current.left = pressed;
          break;
        case "KeyD":
        case "ArrowRight":
          input.current.right = pressed;
          break;
        case "ShiftLeft":
        case "ShiftRight":
          input.current.sprint = pressed;
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
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          event.code,
        )
      ) {
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
      input.current.sprint = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
    };
  }, [input, onKeyInput]);
}

function MouseLook({
  input,
  onPointerLock,
  playerSettings,
}: {
  input: MutableRefObject<InputState>;
  onPointerLock: (locked: boolean) => void;
  playerSettings: PolyPlayerSettings;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const touchPoints = new Map<number, { x: number; y: number }>();
    let touchPointer: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let pinchDistance: number | null = null;
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
        if (document.pointerLockElement !== canvas) {
          void canvas.requestPointerLock();
        }
        return;
      }
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
      input.current.yaw -= (event.clientX - lastTouchX) * 0.006;
      input.current.pitch = MathUtils.clamp(
        input.current.pitch - (event.clientY - lastTouchY) * 0.0045,
        -0.22,
        0.62,
      );
      lastTouchX = event.clientX;
      lastTouchY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
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
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return;
      input.current.yaw -= event.movementX * 0.0024;
      input.current.pitch = MathUtils.clamp(
        input.current.pitch - event.movementY * 0.0018,
        -0.22,
        0.62,
      );
    };
    const onLockChange = () => {
      onPointerLock(document.pointerLockElement === canvas);
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 1.2 : 0.03;
      setZoom(input.current.zoomDistance + event.deltaY * scale);
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [gl, input, onPointerLock, playerSettings]);

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
      <meshStandardMaterial color={color} roughness={0.72} />
    </mesh>
  );
}

function BlockAvatar({
  moving,
  grounded,
  facing,
  player,
}: {
  moving: MutableRefObject<number>;
  grounded: MutableRefObject<boolean>;
  facing: MutableRefObject<number>;
  player?: {
    username: string;
    displayName: string;
    equippedShirtId?: ShirtId | null;
  };
}) {
  const root = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);

  useFrame((state, delta) => {
    if (!root.current) return;

    const speedFactor = MathUtils.clamp(moving.current / 6.2, 0, 1);
    const walk = Math.sin(state.clock.elapsedTime * 10.5) * 0.5 * speedFactor;
    const targetFacing = facing.current;
    const currentFacing = root.current.rotation.y;
    const angleDelta = Math.atan2(
      Math.sin(targetFacing - currentFacing),
      Math.cos(targetFacing - currentFacing),
    );
    root.current.rotation.y += angleDelta * Math.min(1, delta * 14);

    if (leftArm.current && rightArm.current) {
      const airArm = grounded.current ? 0 : -0.24;
      leftArm.current.rotation.x = MathUtils.lerp(
        leftArm.current.rotation.x,
        grounded.current ? walk : airArm,
        Math.min(1, delta * 16),
      );
      rightArm.current.rotation.x = MathUtils.lerp(
        rightArm.current.rotation.x,
        grounded.current ? -walk : airArm,
        Math.min(1, delta * 16),
      );
    }
    if (leftLeg.current && rightLeg.current) {
      const airLeg = grounded.current ? 0 : 0.16;
      leftLeg.current.rotation.x = MathUtils.lerp(
        leftLeg.current.rotation.x,
        grounded.current ? -walk : airLeg,
        Math.min(1, delta * 16),
      );
      rightLeg.current.rotation.x = MathUtils.lerp(
        rightLeg.current.rotation.x,
        grounded.current ? walk : airLeg,
        Math.min(1, delta * 16),
      );
    }
    root.current.position.y =
      grounded.current && speedFactor > 0.05
        ? AVATAR_VISUAL_OFFSET +
          Math.abs(Math.sin(state.clock.elapsedTime * 10.5)) * 0.055
        : MathUtils.lerp(
            root.current.position.y,
            AVATAR_VISUAL_OFFSET,
            Math.min(1, delta * 10),
          );
  });

  return (
    <group
      ref={root}
      position={[0, AVATAR_VISUAL_OFFSET, 0]}
      scale={AVATAR_SCALE}
    >
      <group position={[0, 2.28, 0]}>
        <mesh castShadow receiveShadow>
          <latheGeometry args={[HEAD_PROFILE, 32]} />
          <meshStandardMaterial color="#e7bd91" roughness={0.72} />
        </mesh>
        <mesh position={[-0.28, 0.08, -0.852]}>
          <boxGeometry args={[0.15, 0.2, 0.035]} />
          <meshStandardMaterial color="#24202b" roughness={0.85} />
        </mesh>
        <mesh position={[0.28, 0.08, -0.852]}>
          <boxGeometry args={[0.15, 0.2, 0.035]} />
          <meshStandardMaterial color="#24202b" roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.28, -0.852]}>
          <boxGeometry args={[0.4, 0.075, 0.035]} />
          <meshStandardMaterial color="#8e5b52" roughness={0.9} />
        </mesh>
      </group>

      {player && (
        <PlayerNameTag
          username={player.username}
          displayName={player.displayName}
        />
      )}

      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 2, 1.2]} />
        <ShirtMaterials shirtId={player?.equippedShirtId ?? null} />
      </mesh>

      <group ref={leftArm} position={[-1.6, 1.5, 0]}>
        <mesh position={[0, -1.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 2.1, 1.05]} />
          <ShirtMaterials shirtId={player?.equippedShirtId ?? null} sleeve />
        </mesh>
      </group>
      <group ref={rightArm} position={[1.6, 1.5, 0]}>
        <mesh position={[0, -1.05, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 2.1, 1.05]} />
          <ShirtMaterials shirtId={player?.equippedShirtId ?? null} sleeve />
        </mesh>
      </group>

      <group ref={leftLeg} position={[-0.58, -0.5, 0]}>
        <BlockPart size={[1.1, 2, 1.1]} position={[0, -1, 0]} color="#313542" />
      </group>
      <group ref={rightLeg} position={[0.58, -0.5, 0]}>
        <BlockPart size={[1.1, 2, 1.1]} position={[0, -1, 0]} color="#313542" />
      </group>
    </group>
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

function playDefaultDeathSound() {
  const audio = new Audio(defaultDeathSoundUrl);
  audio.volume = 0.9;
  void audio.play().catch(() => playSynthesizedDeathSound());
}

function DeathPart({
  position,
  size,
  color,
  velocity,
  shirtId,
  sleeve = false,
  head = false,
}: {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  velocity: [number, number, number];
  shirtId?: ShirtId | null;
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
      linearDamping={0.08}
      angularDamping={0.14}
      ccd
    >
      <CuboidCollider
        args={[size[0] / 2, size[1] / 2, size[2] / 2]}
        restitution={0.25}
        friction={0.68}
        mass={Math.max(0.25, size[0] * size[1] * size[2] * 0.35)}
      />
      {head ? (
        <group scale={AVATAR_SCALE}>
          <mesh castShadow receiveShadow>
            <latheGeometry args={[HEAD_PROFILE, 32]} />
            <meshStandardMaterial color={color} roughness={0.72} />
          </mesh>
          <mesh position={[-0.28, 0.08, -0.852]}>
            <boxGeometry args={[0.15, 0.2, 0.035]} />
            <meshStandardMaterial color="#24202b" roughness={0.85} />
          </mesh>
          <mesh position={[0.28, 0.08, -0.852]}>
            <boxGeometry args={[0.15, 0.2, 0.035]} />
            <meshStandardMaterial color="#24202b" roughness={0.85} />
          </mesh>
          <mesh position={[0, -0.28, -0.852]}>
            <boxGeometry args={[0.4, 0.075, 0.035]} />
            <meshStandardMaterial color="#8e5b52" roughness={0.9} />
          </mesh>
        </group>
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={size} />
          {shirtId !== undefined ? (
            <ShirtMaterials shirtId={shirtId} sleeve={sleeve} />
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
  };
}) {
  const at = (
    x: number,
    y: number,
    z: number,
  ): [number, number, number] => [origin[0] + x, origin[1] + y, origin[2] + z];
  const shirtId = player?.equippedShirtId ?? null;
  return (
    <>
      <DeathPart
        position={at(0, 0.24, 0)}
        size={[1.76, 1.6, 0.96]}
        color="#5635B8"
        velocity={[0.5, 4.8, -1.1]}
        shirtId={shirtId}
      />
      <DeathPart
        position={at(0, 1.66, 0)}
        size={[1.36, 1.16, 1.36]}
        color="#e7bd91"
        velocity={[-0.4, 6.4, 0.8]}
        head
      />
      <DeathPart
        position={at(-1.28, 0.2, 0)}
        size={[0.8, 1.68, 0.84]}
        color="#e7bd91"
        velocity={[-5.2, 4.3, 1.8]}
        shirtId={shirtId}
        sleeve
      />
      <DeathPart
        position={at(1.28, 0.2, 0)}
        size={[0.8, 1.68, 0.84]}
        color="#e7bd91"
        velocity={[5.2, 4.6, -1.5]}
        shirtId={shirtId}
        sleeve
      />
      <DeathPart
        position={at(-0.46, -1.36, 0)}
        size={[0.88, 1.6, 0.88]}
        color="#313542"
        velocity={[-2.8, 3.2, -2.2]}
      />
      <DeathPart
        position={at(0.46, -1.36, 0)}
        size={[0.88, 1.6, 0.88]}
        color="#313542"
        velocity={[2.8, 3.5, 2.2]}
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
      1 - Math.exp(-7 * delta),
    );
    camera.lookAt(cameraTarget);
  });
  return null;
}

function ProjectSound({
  object,
  listener,
  requests,
  requestVersion,
  audioUnlockVersion,
}: {
  object: PolyWorldObject;
  listener: AudioListener;
  requests: PolySoundRequest[];
  requestVersion: number;
  audioUnlockVersion: number;
}) {
  const sound = useMemo(() => new ThreePositionalAudio(listener), [listener]);
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
    sound.position.set(...object.position);
    sound.setVolume(object.volume ?? 0.7);
    sound.setLoop(object.looped ?? false);
    sound.setPlaybackRate(object.playbackSpeed ?? 1);
    sound.setRefDistance(object.rolloffMinDistance ?? 5);
    sound.setMaxDistance(object.rolloffMaxDistance ?? 60);
    sound.setRolloffFactor(1);
  }, [object, sound]);
  useEffect(() => {
    setLoaded(false);
    autoplayStarted.current = false;
    lastHandledRequestId.current = null;
    processingRequestId.current = null;
    if (!object.soundData) return;
    let active = true;
    new AudioLoader().load(
      object.soundData,
      (buffer) => {
        if (!active) return;
        if (sound.isPlaying) sound.stop();
        sound.setBuffer(buffer);
        setLoaded(true);
      },
      undefined,
      () => {
        if (active) setLoaded(false);
      },
    );
    return () => {
      active = false;
      if (sound.isPlaying) sound.stop();
    };
  }, [object.soundData, sound]);
  useEffect(() => {
    if (!loaded || !object.autoplay || autoplayStarted.current) return;
    void listener.context
      .resume()
      .then(() => {
        if (listener.context.state !== "running") return;
        if (!sound.isPlaying) sound.play();
        autoplayStarted.current = true;
      })
      .catch(() => undefined);
  }, [audioUnlockVersion, listener, loaded, object.autoplay, sound]);
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
    void listener.context
      .resume()
      .then(() => {
        if (listener.context.state !== "running") return;
        if (request.action === "play") {
          if (sound.isPlaying) sound.stop();
          sound.play();
        } else if (request.action === "pause") {
          if (sound.isPlaying) sound.pause();
        } else if (sound.isPlaying) {
          sound.stop();
        }
        lastHandledRequestId.current = request.id;
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
    listener,
    loaded,
    requestVersion,
    sound,
  ]);
  return <primitive object={sound} />;
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
  const { camera } = useThree();
  const listener = useMemo(() => new AudioListener(), []);
  const [audioUnlockVersion, setAudioUnlockVersion] = useState(0);
  useEffect(() => {
    camera.add(listener);
    return () => {
      camera.remove(listener);
    };
  }, [camera, listener]);
  useEffect(() => {
    let active = true;
    const unlockAudio = () => {
      void listener.context
        .resume()
        .then(() => {
          if (!active || listener.context.state !== "running") return;
          setAudioUnlockVersion((version) => version + 1);
          window.removeEventListener("pointerdown", unlockAudio, true);
          window.removeEventListener("keydown", unlockAudio, true);
        })
        .catch(() => undefined);
    };
    window.addEventListener("pointerdown", unlockAudio, true);
    window.addEventListener("keydown", unlockAudio, true);
    return () => {
      active = false;
      window.removeEventListener("pointerdown", unlockAudio, true);
      window.removeEventListener("keydown", unlockAudio, true);
    };
  }, [listener]);
  return objects
    .filter((object) => object.type === "sound")
    .map((object) => (
      <ProjectSound
        key={object.id}
        object={object}
        listener={listener}
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
  const facing = useRef(player.state.rotationY);

  useEffect(() => {
    const next = new Vector3(...player.state.position);
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
  localPlayer,
  onDeath,
}: {
  input: MutableRefObject<InputState>;
  onTelemetry: (telemetry: Telemetry) => void;
  onPlayerState?: (state: Omit<PlayerTransform, "sequence">) => void;
  spawn: { x: number; y: number; z: number };
  playerSettings: PolyPlayerSettings;
  localPlayer?: {
    username: string;
    displayName: string;
    equippedShirtId?: ShirtId | null;
  };
  onDeath: (origin: [number, number, number]) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const groundContacts = useRef(0);
  const grounded = useRef(false);
  const moving = useRef(0);
  const facing = useRef(0);
  const lastTelemetry = useRef(0);
  const jumpCooldown = useRef(0);
  const lastPosition = useRef<[number, number, number]>([
    spawn.x,
    spawn.y,
    spawn.z,
  ]);
  const deathTriggered = useRef(false);
  const { camera } = useThree();
  const { rapier, world } = useRapier();

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

    jumpCooldown.current = Math.max(0, jumpCooldown.current - delta);
    grounded.current = groundContacts.current > 0;

    const axisForward =
      Number(input.current.forward) - Number(input.current.backward);
    const axisRight = Number(input.current.right) - Number(input.current.left);

    forward.set(
      -Math.sin(input.current.yaw),
      0,
      -Math.cos(input.current.yaw),
    );
    right.crossVectors(forward, WORLD_UP);
    movement
      .set(0, 0, 0)
      .addScaledVector(forward, axisForward)
      .addScaledVector(right, axisRight);
    if (movement.lengthSq() > 1) movement.normalize();

    const velocity = rigidBody.linvel();
    const walkSpeed = Math.max(1, playerSettings.walkSpeed / 3);
    const targetSpeed =
      input.current.sprint && playerSettings.sprintEnabled
        ? walkSpeed * playerSettings.sprintMultiplier
        : walkSpeed;
    const acceleration = grounded.current ? 15 : 4.5;
    const smoothing = 1 - Math.exp(-acceleration * delta);
    const targetX = movement.x * targetSpeed;
    const targetZ = movement.z * targetSpeed;
    const nextVelocity = {
      x: MathUtils.lerp(velocity.x, targetX, smoothing),
      y: velocity.y,
      z: MathUtils.lerp(velocity.z, targetZ, smoothing),
    };

    if (
      input.current.jumpQueued &&
      grounded.current &&
      jumpCooldown.current === 0
    ) {
      nextVelocity.y = Math.max(2, playerSettings.jumpPower * 0.78);
      jumpCooldown.current = 0.2;
      groundContacts.current = 0;
    }
    input.current.jumpQueued = false;

    rigidBody.setLinvel(nextVelocity, true);

    const horizontalSpeed = Math.hypot(nextVelocity.x, nextVelocity.z);
    moving.current = horizontalSpeed;
    if (movement.lengthSq() > 0.02) {
      facing.current = Math.atan2(-movement.x, -movement.z);
    }

    const position = rigidBody.translation();
    lastPosition.current = [position.x, position.y, position.z];
    if (position.y < -14 || input.current.resetQueued) {
      input.current.resetQueued = false;
      die();
      return;
    }

    cameraTarget.set(position.x, position.y + 0.45, position.z);
    const zoomBounds = cameraZoomBounds(playerSettings);
    input.current.zoomDistance = MathUtils.clamp(
      input.current.zoomDistance,
      zoomBounds.minimum,
      zoomBounds.maximum,
    );
    const distance = input.current.zoomDistance * CAMERA_DISTANCE_SCALE;
    const horizontalDistance = Math.cos(input.current.pitch) * distance;
    desiredCameraPosition.set(
      position.x + Math.sin(input.current.yaw) * horizontalDistance,
      position.y + 2.5 + Math.sin(input.current.pitch) * distance,
      position.z + Math.cos(input.current.yaw) * horizontalDistance,
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
      undefined,
      undefined,
      undefined,
      rigidBody,
    );
    if (cameraHit) {
      desiredCameraPosition
        .copy(cameraTarget)
        .addScaledVector(
          cameraRayDirection,
          Math.max(0.65, cameraHit.timeOfImpact - 0.35),
        );
    }
    const cameraSmoothing = 1 - Math.exp(-9 * delta);
    camera.position.lerp(desiredCameraPosition, cameraSmoothing);
    camera.lookAt(cameraTarget);

    if (state.clock.elapsedTime - lastTelemetry.current > 0.15) {
      lastTelemetry.current = state.clock.elapsedTime;
      const telemetry = {
        grounded: grounded.current,
        speed: horizontalSpeed,
        x: position.x,
        y: position.y,
        z: position.z,
        rotationY: facing.current,
      };
      onTelemetry(telemetry);
      onPlayerState?.({
        position: [position.x, position.y, position.z],
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
      linearDamping={0.2}
      friction={0}
      ccd
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[1.5, 0.7]} friction={0} />
      <CuboidCollider
        args={[0.4, 0.07, 0.36]}
        position={[0, -2.28, 0]}
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
  const meshMaterial = useRef<MeshStandardMaterial>(null);
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
    if (meshMaterial.current) {
      meshMaterial.current.opacity =
        1 -
        MathUtils.lerp(
          tween.from.transparency,
          tween.to.transparency,
          alpha,
        );
      meshMaterial.current.color
        .set(tween.from.color)
        .lerp(new Color(tween.to.color), alpha);
    }
  });
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
          <meshStandardMaterial
            ref={meshMaterial}
            key={`${object.material}-${object.surfaceTexture}`}
            color={object.color}
            map={surfaceTexture}
            roughness={material.roughness}
            metalness={material.metalness}
            emissive={object.material === "neon" ? object.color : "#000000"}
            emissiveIntensity={material.emissiveIntensity}
            transparent={object.transparency > 0 || Boolean(tween)}
            opacity={Math.max(0, Math.min(1, 1 - object.transparency))}
            depthWrite={object.transparency <= 0.02}
            alphaTest={object.transparency >= 1 ? 1 : 0}
          />
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
  lighting: PolyLightingSettings;
  shadows: boolean;
  spawn: { x: number; y: number; z: number };
  onWorldTouched?: (worldObjectId: string) => void;
  onWorldTouchEnded?: (worldObjectId: string) => void;
  localPlayer?: {
    username: string;
    displayName: string;
    equippedShirtId?: ShirtId | null;
  };
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
    }, 2_600);
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
      />
      <LightingRig lighting={lighting} shadows={shadows} />
      <Physics gravity={[0, -24, 0]} timeStep="vary" colliders={false}>
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
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const update = (
    event: ReactPointerEvent<HTMLDivElement>,
    release = false,
  ) => {
    if (release) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      setKnob({ x: 0, y: 0 });
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
    setKnob({ x, y });
    onChange(x / radius, y / radius);
  };

  return (
    <div
      className="mobile-joystick"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        update(event);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) update(event);
      }}
      onPointerUp={(event) => update(event, true)}
      onPointerCancel={(event) => update(event, true)}
      onContextMenu={(event) => event.preventDefault()}
      role="group"
      aria-label="Movement joystick"
    >
      <span
        className="mobile-joystick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}

function ChatPanel({
  messages,
  error,
  onSend,
}: {
  messages: ChatMessage[];
  error?: string;
  onSend: (text: string) => boolean;
}) {
  const [open, setOpen] = useState(true);
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
  localPlayer?: {
    username: string;
    displayName: string;
    equippedShirtId?: ShirtId | null;
  };
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
  const spawn = spawnObject
    ? {
        x: spawnObject.position[0],
        y: spawnObject.position[1] + 2.7,
        z: spawnObject.position[2],
      }
    : SPAWN;
  const input = useRef<InputState>(createInputState());
  const tools = worldObjects?.filter((object) => object.type === "tool") ?? [];
  const [pointerLocked, setPointerLocked] = useState(false);
  const [playerListOpen, setPlayerListOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<{
    username: string;
    displayName: string;
    local?: boolean;
  } | null>(null);
  const [friendStatus, setFriendStatus] = useState("");
  const [mobileDevice, setMobileDevice] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [graphicsMode, setGraphicsMode] = useState<"low" | "high">("high");
  const [fullscreen, setFullscreen] = useState(false);
  const [localSoundRequests, setLocalSoundRequests] = useState<
    PolySoundRequest[]
  >([]);
  const [localSoundVersion, setLocalSoundVersion] = useState(0);
  const mobileGraphicsInitialized = useRef(false);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    grounded: false,
    speed: 0,
    x: spawn.x,
    y: spawn.y,
    z: spawn.z,
    rotationY: 0,
  });
  useKeyboard(input, onKeyInput);
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => {
      const mobile =
        media.matches || Math.min(window.innerWidth, window.innerHeight) <= 820;
      setMobileDevice(mobile);
      setLandscape(window.innerWidth > window.innerHeight);
      if (mobile && !mobileGraphicsInitialized.current) {
        mobileGraphicsInitialized.current = true;
        setGraphicsMode("low");
      }
    };
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    const update = () =>
      setFullscreen(
        Boolean(
          document.fullscreenElement ||
            (document as Document & { webkitFullscreenElement?: Element })
              .webkitFullscreenElement,
        ),
      );
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
  }, []);

  const setMove = (
    key: "forward" | "backward" | "left" | "right" | "sprint",
    value: boolean,
  ) => {
    input.current[key] = value;
  };
  const enterMobileFullscreen = async () => {
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    try {
      if (!document.fullscreenElement) {
        if (root.requestFullscreen) {
          await root.requestFullscreen();
        } else {
          await root.webkitRequestFullscreen?.();
        }
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "landscape") => Promise<void>;
      };
      await orientation.lock?.("landscape");
    } catch {
      // Fullscreen and orientation locking vary by mobile browser.
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
      className="baseplate-player"
      aria-label="Playable Baseplate game"
      tabIndex={0}
      data-grounded={telemetry.grounded}
      data-speed={telemetry.speed.toFixed(2)}
      data-position={`${telemetry.x.toFixed(2)},${telemetry.y.toFixed(2)},${telemetry.z.toFixed(2)}`}
      data-remote-players={remotePlayers.length}
      data-chat-enabled={onSendChat ? "true" : undefined}
      data-mobile={mobileDevice ? "true" : undefined}
      data-landscape={landscape ? "true" : undefined}
      data-graphics={graphicsMode}
      data-dead={dead ? "true" : undefined}
    >
      <Canvas
        shadows={graphicsMode === "high" ? "basic" : false}
        dpr={graphicsMode === "high" ? [1, 1.5] : [0.65, 1]}
        camera={{
          position: [0, 5.5, 12],
          fov: playerSettings.cameraFieldOfView,
          near: 0.1,
          far: Math.max(300, lighting.fogEnd + 50),
        }}
        gl={{ antialias: true }}
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
                <b key={stat.id}>{String(stat.defaultValue)}</b>
              ))}
            </button>
          ))}
        </aside>
      )}

      {selectedPlayer && (
        <div className="player-profile-popover">
          <button className="profile-close" onClick={() => setSelectedPlayer(null)}>
            Close
          </button>
          <span>{selectedPlayer.displayName.slice(0, 1)}</span>
          <h2>{selectedPlayer.displayName}</h2>
          <p>@{selectedPlayer.username}</p>
          {!selectedPlayer.local && onFriendRequest && (
            <button
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
        <span>Space Jump</span>
        <span>Shift Sprint</span>
        <span>R Reset</span>
      </div>

      {mobileDevice && (
        <div className="mobile-game-menu">
          <button onClick={() => setPlayerListOpen((open) => !open)}>
            Players
          </button>
          <button
            onClick={() =>
              setGraphicsMode((current) =>
                current === "low" ? "high" : "low",
              )
            }
          >
            Graphics: {graphicsMode}
          </button>
          <button
            onClick={() => {
              if (document.fullscreenElement) {
                void document.exitFullscreen();
              } else {
                void enterMobileFullscreen();
              }
            }}
          >
            {fullscreen ? "Exit full" : "Fullscreen"}
          </button>
        </div>
      )}

      {mobileDevice && (!landscape || !fullscreen) && (
        <div className="mobile-landscape-gate" role="dialog" aria-modal="true">
          <div className="mobile-landscape-card">
            <span className="mobile-landscape-icon" aria-hidden="true">
              90
            </span>
            <strong>
              {landscape ? "Play in fullscreen" : "Rotate to landscape"}
            </strong>
            <p>
              {landscape
                ? "Polymons mobile play is built for fullscreen landscape."
                : "Turn your phone sideways to continue playing."}
            </p>
            {landscape && (
              <button onClick={() => void enterMobileFullscreen()}>
                Enter fullscreen
              </button>
            )}
          </div>
        </div>
      )}

      {!pointerLocked && (
        <div className="mouse-capture-hint">
          <strong>Click the game to control the camera</strong>
          <span>Scroll to zoom. Press Escape to release the mouse.</span>
        </div>
      )}

      <div className="touch-controls touch-movement" aria-label="Movement controls">
        <MobileJoystick
          onChange={(x, y) => {
            setMove("left", x < -0.22);
            setMove("right", x > 0.22);
            setMove("forward", y < -0.22);
            setMove("backward", y > 0.22);
          }}
        />
      </div>
      <div className="touch-controls touch-actions">
        <button
          onPointerDown={() => {
            input.current.jumpQueued = true;
          }}
        >
          Jump
        </button>
        {playerSettings.sprintEnabled && (
          <button
            onPointerDown={() => setMove("sprint", true)}
            onPointerUp={() => setMove("sprint", false)}
            onPointerCancel={() => setMove("sprint", false)}
          >
            Sprint
          </button>
        )}
        <button
          onPointerDown={() => {
            input.current.resetQueued = true;
          }}
        >
          Reset
        </button>
      </div>

      <div className="game-position" aria-hidden="true">
        {telemetry.x.toFixed(0)}, {telemetry.y.toFixed(0)},{" "}
        {telemetry.z.toFixed(0)}
      </div>
    </section>
  );
}
