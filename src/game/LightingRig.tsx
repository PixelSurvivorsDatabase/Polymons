import { Color, MathUtils } from "three";
import {
  DEFAULT_LIGHTING_SETTINGS,
  type PolyLightingSettings,
} from "./polyProject";

function mixedColor(from: string, to: string, amount: number): string {
  return `#${new Color(from)
    .lerp(new Color(to), MathUtils.clamp(amount, 0, 1))
    .getHexString()}`;
}

export function LightingRig({
  lighting = DEFAULT_LIGHTING_SETTINGS,
  shadows = true,
}: {
  lighting?: PolyLightingSettings;
  shadows?: boolean;
}) {
  const angle = ((lighting.clockTime - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const daylight = MathUtils.clamp((elevation + 0.15) / 1.15, 0, 1);
  const brightness = MathUtils.clamp(lighting.brightness, 0, 8);
  const skyColor = mixedColor("#111827", lighting.skyColor, daylight);
  const fogColor = mixedColor("#11141C", lighting.fogColor, daylight);
  const directionalColor = mixedColor("#AFC4FF", "#FFF1D2", daylight);
  const sunDistance = 48;

  return (
    <>
      <color attach="background" args={[skyColor]} />
      <fog
        attach="fog"
        args={[
          fogColor,
          Math.max(0, lighting.fogStart),
          Math.max(lighting.fogStart + 1, lighting.fogEnd),
        ]}
      />
      <ambientLight
        color={lighting.ambient}
        intensity={brightness * (0.18 + daylight * 0.12)}
      />
      <hemisphereLight
        args={[
          skyColor,
          lighting.outdoorAmbient,
          brightness * (0.22 + daylight * 0.28),
        ]}
      />
      <directionalLight
        position={[
          Math.cos(angle) * sunDistance,
          Math.max(6, Math.abs(elevation) * sunDistance),
          Math.sin(angle) * 18,
        ]}
        color={directionalColor}
        intensity={brightness * (0.12 + daylight * 0.88)}
        castShadow={shadows && lighting.globalShadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-48}
        shadow-camera-right={48}
        shadow-camera-top={48}
        shadow-camera-bottom={-48}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
        shadow-radius={1 + lighting.shadowSoftness * 5}
      />
    </>
  );
}
