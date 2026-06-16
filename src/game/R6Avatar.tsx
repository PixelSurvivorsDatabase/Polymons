import { useFrame, useLoader } from "@react-three/fiber";
import {
  type MutableRefObject,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Group,
  MathUtils,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from "three";
import classicSmileFaceUrl from "../../assets/avatar/faces/classic-smile.png";
import {
  createPantsTexture,
  createShirtTexture,
  type PantsId,
  type ShirtId,
} from "./avatarCatalog";
import {
  createTemplateFaceTexture,
  type ShirtBodyPart,
  type ShirtSurfaceFace,
} from "./shirtTemplate";
import {
  createPantsTemplateFaceTexture,
  type PantsBodyPart,
  type PantsSurfaceFace,
} from "./pantsTemplate";
import {
  DEFAULT_AVATAR_APPEARANCE,
  normalizeAvatarAppearance,
  type AvatarAppearance,
} from "./avatarAppearance";
import {
  R6_AVATAR_SCALE,
  R6_HEAD_PROFILE,
  R6_VISUAL_OFFSET,
} from "./r6Geometry";

function useRemoteAvatarImage(textureUrl?: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!textureUrl) {
      setImage(null);
      return;
    }
    let disposed = false;
    const nextImage = new Image();
    nextImage.crossOrigin = "anonymous";
    nextImage.onload = () => {
      if (!disposed) setImage(nextImage);
    };
    nextImage.onerror = () => {
      if (!disposed) setImage(null);
    };
    nextImage.src = textureUrl;
    return () => {
      disposed = true;
      setImage(null);
    };
  }, [textureUrl]);
  return image;
}

export function ShirtMaterials({
  shirtId,
  textureUrl,
  bodyPart = "torso",
  sleeve = false,
  fallbackColor,
}: {
  shirtId: ShirtId | null;
  textureUrl?: string | null;
  bodyPart?: ShirtBodyPart;
  sleeve?: boolean;
  fallbackColor: string;
}) {
  const remoteImage = useRemoteAvatarImage(textureUrl);
  const templateTextures = useMemo(() => {
    if (!remoteImage) return null;
    const face = (surface: ShirtSurfaceFace) =>
      createTemplateFaceTexture(remoteImage, bodyPart, surface);
    return {
      right: face("right"),
      left: face("left"),
      top: face("top"),
      bottom: face("bottom"),
      back: face("back"),
      front: face("front"),
    };
  }, [bodyPart, remoteImage]);
  const textures = useMemo(
    () => ({
      front: createShirtTexture(shirtId, sleeve ? "sleeve" : "front"),
      back: createShirtTexture(shirtId, sleeve ? "sleeve" : "back"),
      side: createShirtTexture(shirtId, sleeve ? "sleeve" : "side"),
    }),
    [shirtId, sleeve],
  );
  useEffect(
    () => () => {
      textures.front?.dispose();
      textures.back?.dispose();
      textures.side?.dispose();
    },
    [textures],
  );
  useEffect(
    () => () => {
      templateTextures?.right?.dispose();
      templateTextures?.left?.dispose();
      templateTextures?.top?.dispose();
      templateTextures?.bottom?.dispose();
      templateTextures?.back?.dispose();
      templateTextures?.front?.dispose();
    },
    [templateTextures],
  );
  const material = (attach: string, map: Texture | null) => (
    <meshStandardMaterial
      attach={attach}
      color={shirtId || templateTextures ? "#ffffff" : fallbackColor}
      map={map}
      roughness={0.82}
      metalness={0}
      envMapIntensity={0.18}
    />
  );
  return (
    <>
      {material("material-0", templateTextures?.right ?? textures.side)}
      {material("material-1", templateTextures?.left ?? textures.side)}
      {material("material-2", templateTextures?.top ?? textures.side)}
      {material("material-3", templateTextures?.bottom ?? textures.side)}
      {material("material-4", templateTextures?.back ?? textures.back)}
      {material("material-5", templateTextures?.front ?? textures.front)}
    </>
  );
}

export function PantsMaterials({
  pantsId,
  textureUrl,
  bodyPart = "rightLeg",
  waist = false,
  fallbackColor,
}: {
  pantsId: PantsId | null;
  textureUrl?: string | null;
  bodyPart?: PantsBodyPart;
  waist?: boolean;
  fallbackColor: string;
}) {
  const remoteImage = useRemoteAvatarImage(textureUrl);
  const effectiveBodyPart = waist ? "waist" : bodyPart;
  const templateTextures = useMemo(() => {
    if (!remoteImage) return null;
    const face = (surface: PantsSurfaceFace) =>
      createPantsTemplateFaceTexture(remoteImage, effectiveBodyPart, surface);
    return {
      right: face("right"),
      left: face("left"),
      top: face("top"),
      bottom: face("bottom"),
      back: face("back"),
      front: face("front"),
    };
  }, [effectiveBodyPart, remoteImage]);
  const textures = useMemo(
    () => ({
      front: createPantsTexture(pantsId, waist ? "waist" : "front"),
      back: createPantsTexture(pantsId, waist ? "waist" : "back"),
      side: createPantsTexture(pantsId, waist ? "waist" : "side"),
    }),
    [pantsId, waist],
  );
  useEffect(
    () => () => {
      textures.front?.dispose();
      textures.back?.dispose();
      textures.side?.dispose();
    },
    [textures],
  );
  useEffect(
    () => () => {
      templateTextures?.right?.dispose();
      templateTextures?.left?.dispose();
      templateTextures?.top?.dispose();
      templateTextures?.bottom?.dispose();
      templateTextures?.back?.dispose();
      templateTextures?.front?.dispose();
    },
    [templateTextures],
  );
  const material = (attach: string, map: Texture | null) => (
    <meshStandardMaterial
      attach={attach}
      color={pantsId || templateTextures ? "#ffffff" : fallbackColor}
      map={map}
      roughness={0.86}
      metalness={0}
      envMapIntensity={0.16}
    />
  );
  return (
    <>
      {material("material-0", templateTextures?.right ?? textures.side)}
      {material("material-1", templateTextures?.left ?? textures.side)}
      {material("material-2", templateTextures?.top ?? textures.side)}
      {material("material-3", templateTextures?.bottom ?? textures.side)}
      {material("material-4", templateTextures?.back ?? textures.back)}
      {material("material-5", templateTextures?.front ?? textures.front)}
    </>
  );
}

export function R6Head({
  color = DEFAULT_AVATAR_APPEARANCE.bodyColors.head,
}: {
  color?: string;
}) {
  const faceTexture = useLoader(TextureLoader, classicSmileFaceUrl);
  faceTexture.colorSpace = SRGBColorSpace;
  return (
    <group name="Head">
      <mesh castShadow receiveShadow>
        <latheGeometry args={[R6_HEAD_PROFILE, 24]} />
        <meshStandardMaterial
          color={color}
          roughness={0.86}
          metalness={0}
          envMapIntensity={0.16}
        />
      </mesh>
      <mesh
        name="Face"
        position={[0, -0.055, -0.767]}
        rotation={[0, Math.PI, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[1.28, 0.86]} />
        <meshBasicMaterial
          map={faceTexture}
          transparent
          alphaTest={0.08}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
          toneMapped={false}
        />
      </mesh>
      <group name="HatAttachment" position={[0, 0.65, 0]} />
      <group name="FaceFrontAttachment" position={[0, 0, -0.78]} />
    </group>
  );
}

export type R6AvatarPlayer = {
  username: string;
  displayName: string;
  equippedShirtId?: ShirtId | null;
  equippedPantsId?: PantsId | null;
  equippedShirtTextureUrl?: string | null;
  equippedPantsTextureUrl?: string | null;
  avatarAppearance?: AvatarAppearance;
};

export function R6Avatar({
  moving,
  grounded,
  verticalVelocity,
  facing,
  player,
  children,
  staticPose = false,
}: {
  moving?: MutableRefObject<number>;
  grounded?: MutableRefObject<boolean>;
  verticalVelocity?: MutableRefObject<number>;
  facing?: MutableRefObject<number>;
  player?: R6AvatarPlayer;
  children?: ReactNode;
  staticPose?: boolean;
}) {
  const root = useRef<Group>(null);
  const head = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const appearance = normalizeAvatarAppearance(player?.avatarAppearance);
  const colors = appearance.bodyColors;
  const shirtId = player?.equippedShirtId ?? null;
  const pantsId = player?.equippedPantsId ?? null;
  const shirtTextureUrl = player?.equippedShirtTextureUrl ?? null;
  const pantsTextureUrl = player?.equippedPantsTextureUrl ?? null;
  const idleSeed = useMemo(() => {
    const identity = player?.username ?? "localplayer";
    return [...identity].reduce(
      (total, character) => (total * 31 + character.charCodeAt(0)) % 997,
      0,
    );
  }, [player?.username]);

  useFrame((state, delta) => {
    if (!root.current || staticPose) return;
    const speed = moving?.current ?? 0;
    const isGrounded = grounded?.current ?? true;
    const speedFactor = MathUtils.clamp(speed / 6.2, 0, 1);
    const cycle = state.clock.elapsedTime * 9.25;
    const walk = Math.sin(cycle) * 0.82 * speedFactor;
    const blend = Math.min(1, delta * 22);
    const idleAmount = isGrounded ? 1 - speedFactor : 0;
    const idleTime = state.clock.elapsedTime + idleSeed * 0.017;
    const idleTurn = Math.sin(idleTime * 0.38) * 0.018 * idleAmount;

    if (facing) {
      const angleDelta = Math.atan2(
        Math.sin(facing.current - root.current.rotation.y),
        Math.cos(facing.current - root.current.rotation.y),
      );
      root.current.rotation.y += angleDelta * Math.min(1, delta * 16);
    }

    const rising = (verticalVelocity?.current ?? 0) > 0.4;
    const airArm = rising ? -0.08 : 0.12;
    const airLeg = rising ? 0.22 : -0.12;
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x = MathUtils.lerp(
        leftArm.current.rotation.x,
        isGrounded
          ? walk
          : airArm,
        blend,
      );
      rightArm.current.rotation.x = MathUtils.lerp(
        rightArm.current.rotation.x,
        isGrounded
          ? -walk
          : airArm,
        blend,
      );
      leftArm.current.rotation.z = MathUtils.lerp(
        leftArm.current.rotation.z,
        isGrounded ? 0 : -2.52,
        blend,
      );
      rightArm.current.rotation.z = MathUtils.lerp(
        rightArm.current.rotation.z,
        isGrounded ? 0 : 2.52,
        blend,
      );
    }
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = MathUtils.lerp(
        leftLeg.current.rotation.x,
        isGrounded ? -walk : airLeg,
        blend,
      );
      rightLeg.current.rotation.x = MathUtils.lerp(
        rightLeg.current.rotation.x,
        isGrounded ? walk : -airLeg,
        blend,
      );
    }
    if (torso.current) {
      torso.current.rotation.y = MathUtils.lerp(
        torso.current.rotation.y,
        idleTurn,
        Math.min(1, delta * 5),
      );
      torso.current.rotation.z = MathUtils.lerp(
        torso.current.rotation.z,
        0,
        blend,
      );
    }
    if (head.current) {
      head.current.rotation.y = MathUtils.lerp(
        head.current.rotation.y,
        -idleTurn * 1.2,
        Math.min(1, delta * 4),
      );
      head.current.rotation.z = MathUtils.lerp(
        head.current.rotation.z,
        0,
        Math.min(1, delta * 4),
      );
    }
    const targetY =
      R6_VISUAL_OFFSET +
      (isGrounded && speedFactor > 0.05
        ? Math.abs(Math.sin(cycle)) * 0.025
        : 0);
    root.current.position.y = MathUtils.lerp(
      root.current.position.y,
      targetY,
      Math.min(1, delta * 14),
    );
  });

  return (
    <group
      ref={root}
      name="R6Character"
      position={[0, R6_VISUAL_OFFSET, 0]}
      scale={R6_AVATAR_SCALE}
    >
      <mesh
        name="ContactShadow"
        position={[0, -2.56, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
      >
        <circleGeometry args={[1.05, 28]} />
        <meshBasicMaterial
          color="#09080d"
          transparent
          opacity={0.24}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <group ref={head} name="HeadMotor" position={[0, 2.14, 0]}>
        <R6Head color={colors.head} />
      </group>

      {children}

      <group ref={torso} name="TorsoMotor">
        <mesh name="Torso" position={[0, 0.5, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 2, 1]} />
          <ShirtMaterials
            shirtId={shirtId}
            textureUrl={shirtTextureUrl}
            bodyPart="torso"
            fallbackColor={colors.torso}
          />
        </mesh>
        {pantsId && (
          <mesh
            name="Pants Waist"
            position={[0, -0.19, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[2.015, 0.62, 1.015]} />
            <PantsMaterials
              pantsId={pantsId}
              textureUrl={pantsTextureUrl}
              bodyPart="waist"
              waist
              fallbackColor={colors.torso}
            />
          </mesh>
        )}
        <group name="BackAttachment" position={[0, 0.65, 0.54]} />
        <group name="WaistAttachment" position={[0, -0.52, 0]} />
      </group>

      <group
        ref={leftArm}
        name="Left Shoulder"
        position={[-1.54, 1.5, 0]}
      >
        <mesh name="Left Arm" position={[0, -1.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 2, 1]} />
          <ShirtMaterials
            shirtId={shirtId}
            textureUrl={shirtTextureUrl}
            bodyPart="leftArm"
            sleeve
            fallbackColor={colors.leftArm}
          />
        </mesh>
        <group name="LeftShoulderAttachment" position={[0, -0.08, 0]} />
      </group>
      <group
        ref={rightArm}
        name="Right Shoulder"
        position={[1.54, 1.5, 0]}
      >
        <mesh name="Right Arm" position={[0, -1.04, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 2, 1]} />
          <ShirtMaterials
            shirtId={shirtId}
            textureUrl={shirtTextureUrl}
            bodyPart="rightArm"
            sleeve
            fallbackColor={colors.rightArm}
          />
        </mesh>
        <group name="RightShoulderAttachment" position={[0, -0.08, 0]} />
      </group>

      <group ref={leftLeg} name="Left Hip" position={[-0.51, -0.54, 0]}>
        <mesh name="Left Leg" position={[0, -1, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 2, 1]} />
          <PantsMaterials
            pantsId={pantsId}
            textureUrl={pantsTextureUrl}
            bodyPart="leftLeg"
            fallbackColor={colors.leftLeg}
          />
        </mesh>
      </group>
      <group ref={rightLeg} name="Right Hip" position={[0.51, -0.54, 0]}>
        <mesh name="Right Leg" position={[0, -1, 0]} castShadow receiveShadow>
          <boxGeometry args={[1, 2, 1]} />
          <PantsMaterials
            pantsId={pantsId}
            textureUrl={pantsTextureUrl}
            bodyPart="rightLeg"
            fallbackColor={colors.rightLeg}
          />
        </mesh>
      </group>
    </group>
  );
}
