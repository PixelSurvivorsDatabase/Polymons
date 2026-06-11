import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  CapsuleCollider,
  CuboidCollider,
  Physics,
  RigidBody,
  type RapierRigidBody,
  useRapier,
} from "@react-three/rapier";
import {
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Color,
  Group,
  MathUtils,
  Vector3,
} from "three";

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
};

type Telemetry = {
  grounded: boolean;
  speed: number;
  x: number;
  y: number;
  z: number;
};

const SPAWN = { x: 0, y: 3.2, z: 7 };
const WORLD_UP = new Vector3(0, 1, 0);
const movement = new Vector3();
const forward = new Vector3();
const right = new Vector3();
const cameraTarget = new Vector3();
const desiredCameraPosition = new Vector3();
const cameraRayDirection = new Vector3();
const AVATAR_VISUAL_OFFSET = -0.28;

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
  };
}

function useKeyboard(input: MutableRefObject<InputState>) {
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
    };
    const onKeyUp = (event: KeyboardEvent) => setKey(event.code, false);
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
  }, [input]);
}

function MouseLook({
  input,
  onPointerLock,
}: {
  input: MutableRefObject<InputState>;
  onPointerLock: (locked: boolean) => void;
}) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    let touchPointer: number | null = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        if (document.pointerLockElement !== canvas) {
          void canvas.requestPointerLock();
        }
        return;
      }
      touchPointer = event.pointerId;
      lastTouchX = event.clientX;
      lastTouchY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
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
      if (event.pointerId !== touchPointer) return;
      touchPointer = null;
      canvas.releasePointerCapture(event.pointerId);
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

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [gl, input, onPointerLock]);

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
}: {
  moving: MutableRefObject<number>;
  grounded: MutableRefObject<boolean>;
  facing: MutableRefObject<number>;
}) {
  const root = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);

  useFrame((state, delta) => {
    if (!root.current) return;

    const speedFactor = MathUtils.clamp(moving.current / 7, 0, 1);
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
    <group ref={root} position={[0, AVATAR_VISUAL_OFFSET, 0]}>
      <group position={[0, 2.28, 0]}>
        <BlockPart size={[2.15, 1.55, 1.6]} color="#e7bd91" />
        <mesh position={[-0.38, 0.1, -0.806]}>
          <boxGeometry args={[0.15, 0.2, 0.035]} />
          <meshStandardMaterial color="#24202b" roughness={0.85} />
        </mesh>
        <mesh position={[0.38, 0.1, -0.806]}>
          <boxGeometry args={[0.15, 0.2, 0.035]} />
          <meshStandardMaterial color="#24202b" roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.3, -0.81]}>
          <boxGeometry args={[0.44, 0.075, 0.035]} />
          <meshStandardMaterial color="#8e5b52" roughness={0.9} />
        </mesh>
      </group>

      <BlockPart size={[2.4, 2, 1.2]} position={[0, 0.5, 0]} color="#7650d8" />

      <group ref={leftArm} position={[-1.7, 1.5, 0]}>
        <BlockPart size={[1, 2, 1.05]} position={[0, -1, 0]} color="#e7bd91" />
      </group>
      <group ref={rightArm} position={[1.7, 1.5, 0]}>
        <BlockPart size={[1, 2, 1.05]} position={[0, -1, 0]} color="#e7bd91" />
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

function PlayerController({
  input,
  onTelemetry,
}: {
  input: MutableRefObject<InputState>;
  onTelemetry: (telemetry: Telemetry) => void;
}) {
  const body = useRef<RapierRigidBody>(null);
  const groundContacts = useRef(0);
  const grounded = useRef(false);
  const moving = useRef(0);
  const facing = useRef(0);
  const lastTelemetry = useRef(0);
  const jumpCooldown = useRef(0);
  const { camera } = useThree();
  const { rapier, world } = useRapier();

  const reset = useCallback(() => {
    const rigidBody = body.current;
    if (!rigidBody) return;
    rigidBody.setTranslation(SPAWN, true);
    rigidBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    rigidBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, []);

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
    const targetSpeed = input.current.sprint ? 11 : 7;
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
      nextVelocity.y = 9.4;
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
    if (position.y < -14 || input.current.resetQueued) {
      input.current.resetQueued = false;
      reset();
      return;
    }

    cameraTarget.set(position.x, position.y + 0.65, position.z);
    const distance = 9.5;
    const horizontalDistance = Math.cos(input.current.pitch) * distance;
    desiredCameraPosition.set(
      position.x + Math.sin(input.current.yaw) * horizontalDistance,
      position.y + 3.25 + Math.sin(input.current.pitch) * distance,
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
      onTelemetry({
        grounded: grounded.current,
        speed: horizontalSpeed,
        x: position.x,
        y: position.y,
        z: position.z,
      });
    }
  });

  return (
    <RigidBody
      ref={body}
      name="player"
      position={[SPAWN.x, SPAWN.y, SPAWN.z]}
      colliders={false}
      lockRotations
      linearDamping={0.2}
      friction={0}
      ccd
      enabledRotations={[false, false, false]}
    >
      <CapsuleCollider args={[1.9, 0.9]} friction={0} />
      <CuboidCollider
        args={[0.48, 0.08, 0.42]}
        position={[0, -2.9, 0]}
        sensor
        onIntersectionEnter={() => {
          groundContacts.current += 1;
        }}
        onIntersectionExit={() => {
          groundContacts.current = Math.max(0, groundContacts.current - 1);
        }}
      />
      <BlockAvatar moving={moving} grounded={grounded} facing={facing} />
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

function BaseplateWorld() {
  return (
    <>
      <color attach="background" args={["#8ec8ed"]} />
      <fog attach="fog" args={["#8ec8ed", 38, 86]} />
      <hemisphereLight args={["#dff3ff", "#556b3f", 1.75]} />
      <directionalLight
        position={[-14, 22, 9]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-36}
        shadow-camera-right={36}
        shadow-camera-top={36}
        shadow-camera-bottom={-36}
      />
    </>
  );
}

function Scene({
  input,
  onTelemetry,
  onPointerLock,
}: {
  input: MutableRefObject<InputState>;
  onTelemetry: (telemetry: Telemetry) => void;
  onPointerLock: (locked: boolean) => void;
}) {
  return (
    <>
      <MouseLook input={input} onPointerLock={onPointerLock} />
      <BaseplateWorld />
      <Physics gravity={[0, -24, 0]} timeStep="vary" colliders={false}>
        <PlayerController input={input} onTelemetry={onTelemetry} />
        <RigidBody type="fixed" colliders={false} name="baseplate">
          <CuboidCollider args={[30, 0.5, 30]} position={[0, -0.5, 0]} friction={1} />
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
      </Physics>
    </>
  );
}

function TouchButton({
  label,
  className,
  onDown,
  onUp,
}: {
  label: string;
  className?: string;
  onDown: () => void;
  onUp: () => void;
}) {
  const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onUp();
  };

  return (
    <button
      className={className}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onDown();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
}

export default function BaseplateGame() {
  const input = useRef<InputState>(createInputState());
  const [pointerLocked, setPointerLocked] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry>({
    grounded: false,
    speed: 0,
    x: SPAWN.x,
    y: SPAWN.y,
    z: SPAWN.z,
  });
  useKeyboard(input);

  const setMove = (
    key: "forward" | "backward" | "left" | "right" | "sprint",
    value: boolean,
  ) => {
    input.current[key] = value;
  };

  return (
    <section
      className="baseplate-player"
      aria-label="Playable Baseplate test"
      tabIndex={0}
      data-grounded={telemetry.grounded}
      data-speed={telemetry.speed.toFixed(2)}
      data-position={`${telemetry.x.toFixed(2)},${telemetry.y.toFixed(2)},${telemetry.z.toFixed(2)}`}
    >
      <Canvas
        shadows="basic"
        dpr={[1, 1.75]}
        camera={{ position: [0, 7, 15], fov: 54, near: 0.1, far: 140 }}
        gl={{ antialias: true }}
      >
        <Suspense fallback={null}>
          <Scene
            input={input}
            onTelemetry={setTelemetry}
            onPointerLock={setPointerLocked}
          />
        </Suspense>
      </Canvas>

      <div className="game-hud game-hud-left">
        <span className="game-build-label">BASEPLATE / CLIENT TEST 01</span>
        <strong>Nova</strong>
        <span>
          {telemetry.grounded ? "Grounded" : "Airborne"} -{" "}
          {telemetry.speed.toFixed(1)} studs/s
        </span>
      </div>

      <div className="game-hud game-hud-right">
        <span>WASD Move</span>
        <span>Space Jump</span>
        <span>Shift Sprint</span>
        <span>R Reset</span>
      </div>

      {!pointerLocked && (
        <div className="mouse-capture-hint">
          <strong>Click the game to control the camera</strong>
          <span>Press Escape to release the mouse</span>
        </div>
      )}

      <div className="touch-controls touch-movement" aria-label="Movement controls">
        <TouchButton
          label="W"
          className="touch-forward"
          onDown={() => setMove("forward", true)}
          onUp={() => setMove("forward", false)}
        />
        <TouchButton
          label="A"
          onDown={() => setMove("left", true)}
          onUp={() => setMove("left", false)}
        />
        <TouchButton
          label="S"
          onDown={() => setMove("backward", true)}
          onUp={() => setMove("backward", false)}
        />
        <TouchButton
          label="D"
          onDown={() => setMove("right", true)}
          onUp={() => setMove("right", false)}
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
