import { useFrame, useLoader } from "@react-three/fiber";
import {
  Suspense,
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
  type Object3D,
  type Texture,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import classicSmileFaceUrl from "../../assets/avatar/faces/classic-smile.png";
import classicHeadObjSource from "../../assets/avatar/heads/classic-head.obj?raw";
import {
  avatarAccessoriesForIds,
  type AvatarAccessoryDefinition,
} from "./avatarAccessories";
import {
  createPantsTexture,
  createShirtTexture,
  type AvatarModelFormat,
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
  R6_ARM_CENTER_Y,
  R6_ARM_SIZE,
  R6_AVATAR_SCALE,
  R6_HEAD_CENTER_Y,
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
import { normalizedObjGeometry } from "./objMesh";

type RemoteAvatarImageRecord = {
  image: HTMLImageElement | null;
  subscribers: Set<() => void>;
};

const remoteAvatarImageCache = new Map<string, RemoteAvatarImageRecord>();

function getRemoteAvatarImageRecord(url: string): RemoteAvatarImageRecord {
  const cached = remoteAvatarImageCache.get(url);
  if (cached) return cached;

  const record: RemoteAvatarImageRecord = {
    image: null,
    subscribers: new Set(),
  };
  remoteAvatarImageCache.set(url, record);

  const nextImage = new Image();
  nextImage.crossOrigin = "anonymous";
  nextImage.onload = () => {
    record.image = nextImage;
    record.subscribers.forEach((subscriber) => subscriber());
  };
  nextImage.onerror = () => {
    record.subscribers.forEach((subscriber) => subscriber());
  };
  nextImage.src = url;

  return record;
}

function useRemoteAvatarImage(textureUrl?: string | null) {
  const [image, setImage] = useState<HTMLImageElement | null>(() =>
    textureUrl ? getRemoteAvatarImageRecord(textureUrl).image : null,
  );
  useEffect(() => {
    if (!textureUrl) {
      setImage(null);
      return;
    }
    const record = getRemoteAvatarImageRecord(textureUrl);
    if (record.image) {
      setImage(record.image);
      return;
    }
    let disposed = false;
    const update = () => {
      if (!disposed) setImage(record.image);
    };
    record.subscribers.add(update);
    return () => {
      disposed = true;
      record.subscribers.delete(update);
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
  const hasTexture =
    Boolean(templateTextures) ||
    Boolean(textures.front || textures.back || textures.side);
  const material = (attach: string, map: Texture | null) => (
    <meshStandardMaterial
      attach={attach}
      color={hasTexture ? "#ffffff" : fallbackColor}
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
  const hasTexture =
    Boolean(templateTextures) ||
    Boolean(textures.front || textures.back || textures.side);
  const material = (attach: string, map: Texture | null) => (
    <meshStandardMaterial
      attach={attach}
      color={hasTexture ? "#ffffff" : fallbackColor}
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

function prepareAccessoryObject(object: Object3D): Object3D {
  object.traverse((child) => {
    const mesh = child as Object3D & {
      castShadow?: boolean;
      receiveShadow?: boolean;
    };
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return object;
}

function GltfAccessoryModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url);
  const object = useMemo(
    () => prepareAccessoryObject(gltf.scene.clone(true)),
    [gltf.scene],
  );
  return <primitive object={object} />;
}

function ObjAccessoryModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  const object = useMemo(() => prepareAccessoryObject(obj.clone(true)), [obj]);
  return <primitive object={object} />;
}

function UploadedAccessoryModel({
  url,
  format,
}: {
  url: string;
  format: AvatarModelFormat;
}) {
  if (format === "glb" || format === "gltf") {
    return <GltfAccessoryModel url={url} />;
  }
  if (format === "obj") {
    return <ObjAccessoryModel url={url} />;
  }
  return null;
}

function canRenderAccessoryModel(format: AvatarModelFormat | null | undefined) {
  return format === "glb" || format === "gltf" || format === "obj";
}

function HeadAccessory({
  accessory,
}: {
  accessory: AvatarAccessoryDefinition;
}) {
  const transform = {
    position: accessory.position,
    rotation: accessory.rotation,
    scale: accessory.scale,
  };
  if (
    accessory.modelUrl &&
    accessory.modelFormat &&
    canRenderAccessoryModel(accessory.modelFormat)
  ) {
    return (
      <group {...transform}>
        <Suspense fallback={null}>
          <UploadedAccessoryModel
            url={accessory.modelUrl}
            format={accessory.modelFormat}
          />
        </Suspense>
      </group>
    );
  }
  if (accessory.slot === "hair") {
    return (
      <group {...transform}>
        <mesh name={accessory.name} position={[0, 0.23, -0.04]} castShadow>
          <sphereGeometry args={[0.69, 18, 10, 0, Math.PI * 2, 0, 1.72]} />
          <meshStandardMaterial
            color={accessory.color}
            roughness={0.9}
            metalness={0}
          />
        </mesh>
        <mesh name={`${accessory.name}Back`} position={[0, -0.06, 0.28]} castShadow>
          <boxGeometry args={[1.18, 0.55, 0.34]} />
          <meshStandardMaterial
            color={accessory.color}
            roughness={0.92}
            metalness={0}
          />
        </mesh>
      </group>
    );
  }
  return (
    <group {...transform}>
      <mesh name={accessory.name} position={[0, 0.39, 0]} castShadow>
        <cylinderGeometry args={[0.73, 0.73, 0.18, 28]} />
        <meshStandardMaterial
          color={accessory.color}
          roughness={0.86}
          metalness={0}
        />
      </mesh>
      <mesh name={`${accessory.name}Brim`} position={[0, 0.28, -0.48]} castShadow>
        <boxGeometry args={[1.1, 0.08, 0.42]} />
        <meshStandardMaterial
          color={accessory.color}
          roughness={0.86}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

export function R6Head({
  color = DEFAULT_AVATAR_APPEARANCE.bodyColors.head,
  accessories = [],
  uploadedAccessories = [],
}: {
  color?: string;
  accessories?: readonly string[];
  uploadedAccessories?: readonly AvatarAccessoryDefinition[];
}) {
  const faceTexture = useLoader(TextureLoader, classicSmileFaceUrl);
  const headGeometry = useMemo(
    () => normalizedObjGeometry(classicHeadObjSource, [1.25, 1.18, 1.25]),
    [],
  );
  const headAccessories = useMemo(
    () =>
      avatarAccessoriesForIds(
        [...uploadedAccessories.map((accessory) => accessory.id), ...accessories],
        uploadedAccessories,
      ),
    [accessories, uploadedAccessories],
  );
  faceTexture.colorSpace = SRGBColorSpace;
  useEffect(() => () => headGeometry.dispose(), [headGeometry]);
  return (
    <group name="Head">
      <mesh castShadow receiveShadow>
        <primitive object={headGeometry} attach="geometry" />
        <meshStandardMaterial
          color={color}
          roughness={0.86}
          metalness={0}
          envMapIntensity={0.16}
        />
      </mesh>
      <mesh
        name="Face"
        position={[0, -0.04, -0.64]}
        rotation={[0, Math.PI, 0]}
        renderOrder={2}
      >
        <planeGeometry args={[1.02, 0.68]} />
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
      <group name="HairAttachment" position={[0, 0.48, 0.03]}>
        {headAccessories
          .filter((accessory) => accessory.attachment === "HairAttachment")
          .map((accessory) => (
            <HeadAccessory key={accessory.id} accessory={accessory} />
          ))}
      </group>
      <group name="HatAttachment" position={[0, 0.64, 0]}>
        {headAccessories
          .filter((accessory) => accessory.attachment === "HatAttachment")
          .map((accessory) => (
            <HeadAccessory key={accessory.id} accessory={accessory} />
          ))}
      </group>
      <group name="FaceFrontAttachment" position={[0, 0, -0.66]} />
    </group>
  );
}

export type R6AvatarPlayer = {
  username: string;
  displayName: string;
  equippedShirtId?: ShirtId | null;
  equippedPantsId?: PantsId | null;
  equippedHairId?: string | null;
  equippedHatId?: string | null;
  equippedShirtTextureUrl?: string | null;
  equippedPantsTextureUrl?: string | null;
  equippedHairModelUrl?: string | null;
  equippedHairModelFormat?: AvatarModelFormat | null;
  equippedHatModelUrl?: string | null;
  equippedHatModelFormat?: AvatarModelFormat | null;
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
  const uploadedAccessories = useMemo<AvatarAccessoryDefinition[]>(() => {
    const items: AvatarAccessoryDefinition[] = [];
    if (player?.equippedHairId && player.equippedHairModelUrl) {
      items.push({
        id: player.equippedHairId,
        name: "Equipped Hair",
        slot: "hair",
        attachment: "HairAttachment",
        color: "#17121a",
        position: [0, 0.02, 0],
        rotation: [0, 0, 0],
        scale: [0.82, 0.82, 0.82],
        modelUrl: player.equippedHairModelUrl,
        modelFormat: player.equippedHairModelFormat ?? null,
      });
    }
    if (player?.equippedHatId && player.equippedHatModelUrl) {
      items.push({
        id: player.equippedHatId,
        name: "Equipped Hat",
        slot: "hat",
        attachment: "HatAttachment",
        color: "#2b2140",
        position: [0, 0.02, 0],
        rotation: [0, 0, 0],
        scale: [0.82, 0.82, 0.82],
        modelUrl: player.equippedHatModelUrl,
        modelFormat: player.equippedHatModelFormat ?? null,
      });
    }
    return items;
  }, [
    player?.equippedHairId,
    player?.equippedHairModelFormat,
    player?.equippedHairModelUrl,
    player?.equippedHatId,
    player?.equippedHatModelFormat,
    player?.equippedHatModelUrl,
  ]);
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
      root.current.rotation.y += angleDelta * Math.min(1, delta * 34);
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
        <circleGeometry args={[1.14, 28]} />
        <meshBasicMaterial
          color="#09080d"
          transparent
          opacity={0.24}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <group ref={head} name="HeadMotor" position={[0, R6_HEAD_CENTER_Y, 0]}>
        <R6Head
          color={colors.head}
          accessories={appearance.accessories}
          uploadedAccessories={uploadedAccessories}
        />
      </group>

      {children}

      <group ref={torso} name="TorsoMotor">
        <mesh
          name="Torso"
          position={[0, R6_TORSO_CENTER_Y, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={R6_TORSO_SIZE} />
          <ShirtMaterials
            shirtId={shirtId}
            textureUrl={shirtTextureUrl}
            bodyPart="torso"
            fallbackColor={colors.torso}
          />
        </mesh>
        <group name="BackAttachment" position={[0, 0.65, 0.43]} />
        <group name="WaistAttachment" position={[0, -0.52, 0]} />
      </group>

      <group
        ref={leftArm}
        name="Left Shoulder"
        position={[-R6_SHOULDER_X, R6_SHOULDER_Y, 0]}
      >
        <mesh
          name="Left Arm"
          position={[0, R6_ARM_CENTER_Y, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={R6_ARM_SIZE} />
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
        position={[R6_SHOULDER_X, R6_SHOULDER_Y, 0]}
      >
        <mesh
          name="Right Arm"
          position={[0, R6_ARM_CENTER_Y, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={R6_ARM_SIZE} />
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

      <group ref={leftLeg} name="Left Hip" position={[-R6_HIP_X, R6_HIP_Y, 0]}>
        <mesh
          name="Left Leg"
          position={[0, R6_LEG_CENTER_Y, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={R6_LEG_SIZE} />
          <PantsMaterials
            pantsId={pantsId}
            textureUrl={pantsTextureUrl}
            bodyPart="leftLeg"
            fallbackColor={colors.leftLeg}
          />
        </mesh>
      </group>
      <group ref={rightLeg} name="Right Hip" position={[R6_HIP_X, R6_HIP_Y, 0]}>
        <mesh
          name="Right Leg"
          position={[0, R6_LEG_CENTER_Y, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={R6_LEG_SIZE} />
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
