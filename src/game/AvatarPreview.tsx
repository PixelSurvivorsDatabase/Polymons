import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import type { PantsId, ShirtId } from "./avatarCatalog";
import type { AvatarAppearance } from "./avatarAppearance";
import { R6Avatar } from "./R6Avatar";

export default function AvatarPreview({
  shirtId,
  pantsId,
  shirtTextureUrl,
  pantsTextureUrl,
  appearance,
}: {
  shirtId: ShirtId | null;
  pantsId?: PantsId | null;
  shirtTextureUrl?: string | null;
  pantsTextureUrl?: string | null;
  appearance?: AvatarAppearance;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 2.55, -9.5], fov: 34 }}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={1.65} />
        <hemisphereLight args={["#e9f2ff", "#87827a", 1.1]} />
        <directionalLight position={[-5, 8, 7]} intensity={2.25} castShadow />
        <directionalLight position={[6, 3, -3]} intensity={0.45} color="#ffffff" />
        <group position={[0, 0.23, 0]} rotation={[0.04, -0.3, 0]} scale={1.08}>
          <R6Avatar
            player={{
              username: "",
              displayName: "",
              equippedShirtId: shirtId,
              equippedPantsId: pantsId,
              equippedShirtTextureUrl: shirtTextureUrl,
              equippedPantsTextureUrl: pantsTextureUrl,
              avatarAppearance: appearance,
            }}
          />
        </group>
      </Suspense>
    </Canvas>
  );
}
