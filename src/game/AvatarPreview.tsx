import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import type { Texture } from "three";
import { createShirtTexture, type ShirtId } from "./avatarCatalog";

export function ShirtMaterials({
  shirtId,
  sleeve = false,
}: {
  shirtId: ShirtId | null;
  sleeve?: boolean;
}) {
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
  const material = (attach: string, map: Texture | null) => (
    <meshStandardMaterial
      attach={attach}
      color={shirtId ? "#ffffff" : sleeve ? "#e7bd91" : "#7650d8"}
      map={map}
      roughness={0.38}
    />
  );
  return (
    <>
      {material("material-0", textures.side)}
      {material("material-1", textures.side)}
      {material("material-2", textures.side)}
      {material("material-3", textures.side)}
      {material("material-4", textures.back)}
      {material("material-5", textures.front)}
    </>
  );
}

function PreviewAvatar({ shirtId }: { shirtId: ShirtId | null }) {
  return (
    <group position={[0, -0.4, 0]} rotation={[0.08, -0.35, 0]} scale={0.82}>
      <mesh position={[0, 2.78, 0]} castShadow>
        <capsuleGeometry args={[0.73, 0.42, 8, 24]} />
        <meshStandardMaterial color="#e7bd91" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[2.2, 2, 1.2]} />
        <ShirtMaterials shirtId={shirtId} />
      </mesh>
      <mesh position={[-1.6, 0.85, 0]} castShadow>
        <boxGeometry args={[1, 2.1, 1.05]} />
        <ShirtMaterials shirtId={shirtId} sleeve />
      </mesh>
      <mesh position={[1.6, 0.85, 0]} castShadow>
        <boxGeometry args={[1, 2.1, 1.05]} />
        <ShirtMaterials shirtId={shirtId} sleeve />
      </mesh>
      <mesh position={[-0.58, -1.1, 0]} castShadow>
        <boxGeometry args={[1.1, 2, 1.1]} />
        <meshStandardMaterial color="#262936" roughness={0.72} />
      </mesh>
      <mesh position={[0.58, -1.1, 0]} castShadow>
        <boxGeometry args={[1.1, 2, 1.1]} />
        <meshStandardMaterial color="#262936" roughness={0.72} />
      </mesh>
    </group>
  );
}

export default function AvatarPreview({
  shirtId,
}: {
  shirtId: ShirtId | null;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 2.7, -9.3], fov: 35 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={1.8} />
        <directionalLight position={[-5, 8, 7]} intensity={3} castShadow />
        <directionalLight position={[6, 3, -3]} intensity={1.2} color="#8b5cf6" />
        <PreviewAvatar shirtId={shirtId} />
      </Suspense>
    </Canvas>
  );
}
