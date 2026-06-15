import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  Color,
  MathUtils,
  Texture,
  TextureLoader,
} from "three";
import {
  DEFAULT_LIGHTING_SETTINGS,
  type PolyLightingSettings,
} from "./polyProject";

function mixedColor(from: string, to: string, amount: number): string {
  return `#${new Color(from)
    .lerp(new Color(to), MathUtils.clamp(amount, 0, 1))
    .getHexString()}`;
}

function createCelestialTexture(phase?: number, glare = false): Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return new CanvasTexture(canvas);
  if (glare) {
    const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.25, "rgba(255,255,255,.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  } else {
    context.fillStyle = "#fff";
    context.beginPath();
    context.arc(64, 64, 58, 0, Math.PI * 2);
    context.fill();
    if (phase !== undefined && phase < 0.995) {
      context.globalCompositeOperation = "destination-out";
      context.fillStyle = "#000";
      context.beginPath();
      context.arc(64 + MathUtils.clamp(phase, 0, 1) * 128, 64, 58, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function CelestialSprite({
  textureData,
  position,
  color,
  opacity,
  size,
  phase,
  glare = false,
}: {
  textureData: string;
  position: [number, number, number];
  color: string;
  opacity: number;
  size: number;
  phase?: number;
  glare?: boolean;
}) {
  const [texture, setTexture] = useState<Texture | null>(null);
  const fallbackTexture = useMemo(
    () => createCelestialTexture(phase, glare),
    [glare, phase],
  );

  useEffect(() => {
    let active = true;
    if (!textureData) {
      setTexture(null);
      return;
    }
    new TextureLoader().load(
      textureData,
      (loaded) => {
        if (active) setTexture(loaded);
        else loaded.dispose();
      },
      undefined,
      () => {
        if (active) setTexture(null);
      },
    );
    return () => {
      active = false;
    };
  }, [textureData]);

  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => () => fallbackTexture.dispose(), [fallbackTexture]);

  return (
    <sprite
      position={position}
      scale={[size, size, 1]}
      renderOrder={-1}
      frustumCulled={false}
    >
      <spriteMaterial
        map={texture ?? fallbackTexture}
        color={color}
        opacity={MathUtils.clamp(opacity, 0, 1)}
        transparent
        depthWrite={false}
        depthTest={false}
        fog={false}
        toneMapped={false}
      />
    </sprite>
  );
}

export function LightingRig({
  lighting = DEFAULT_LIGHTING_SETTINGS,
  shadows = true,
}: {
  lighting?: PolyLightingSettings;
  shadows?: boolean;
}) {
  const [clockTime, setClockTime] = useState(lighting.clockTime);
  const cycleTime = useRef(lighting.clockTime);
  const updateAccumulator = useRef(0);

  useEffect(() => {
    cycleTime.current = lighting.clockTime;
    setClockTime(lighting.clockTime);
  }, [lighting.clockTime]);

  useFrame((_, delta) => {
    if (!lighting.dayNightCycle) return;
    cycleTime.current =
      (cycleTime.current +
        (Math.min(delta, 0.1) * 24) /
          (Math.max(0.5, lighting.dayLengthMinutes) * 60)) %
      24;
    updateAccumulator.current += delta;
    if (updateAccumulator.current >= 0.04) {
      updateAccumulator.current = 0;
      setClockTime(cycleTime.current);
    }
  });

  const angle = ((clockTime - 6) / 24) * Math.PI * 2;
  const elevation = Math.sin(angle);
  const daylight = MathUtils.smoothstep(elevation, -0.12, 0.3);
  const night = 1 - daylight;
  const brightness = MathUtils.clamp(lighting.brightness, 0, 8);
  const skyColor = mixedColor("#070B18", lighting.skyColor, daylight);
  const fogColor = mixedColor("#080B14", lighting.fogColor, daylight);
  const directionalColor = mixedColor("#829DE0", "#FFF5DD", daylight);
  const moonColor = mixedColor("#6D80B8", "#C7D8FF", night);
  const sunDistance = 82;
  const sunPosition: [number, number, number] = [
    Math.cos(angle) * sunDistance,
    elevation * sunDistance,
    Math.sin(angle) * 34,
  ];
  const moonPosition: [number, number, number] = [
    -sunPosition[0],
    -sunPosition[1],
    -sunPosition[2],
  ];
  const automaticMoonPhase =
    lighting.moonPhases
      ? 0.15 + 0.85 * Math.abs(Math.sin((clockTime / 24) * Math.PI))
      : lighting.moonPhase;
  const moonPhase = MathUtils.clamp(automaticMoonPhase, 0, 1);
  const sunStrength =
    brightness *
    lighting.sunBrightness *
    daylight *
    (lighting.sunRays ? 0.88 : 0.72);
  const moonStrength =
    brightness *
    lighting.moonBrightness *
    night *
    (0.2 + moonPhase * 0.62);

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
        intensity={brightness * (0.13 + daylight * 0.1 + night * 0.06)}
      />
      <hemisphereLight
        args={[
          skyColor,
          lighting.outdoorAmbient,
          brightness * (0.3 + daylight * 0.24),
        ]}
      />
      {lighting.sunEnabled && (
        <directionalLight
          position={sunPosition}
          color={directionalColor}
          intensity={sunStrength}
          castShadow={shadows && lighting.globalShadows && daylight > 0.03}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-54}
          shadow-camera-right={54}
          shadow-camera-top={54}
          shadow-camera-bottom={-54}
          shadow-camera-near={1}
          shadow-camera-far={180}
          shadow-bias={-0.00025}
          shadow-normalBias={0.045}
          shadow-radius={2 + lighting.shadowSoftness * 7}
        />
      )}
      {lighting.moonEnabled && (
        <directionalLight
          position={moonPosition}
          color={moonColor}
          intensity={moonStrength}
          castShadow={
            shadows &&
            lighting.globalShadows &&
            night > 0.65 &&
            moonPhase > 0.25
          }
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-42}
          shadow-camera-right={42}
          shadow-camera-top={42}
          shadow-camera-bottom={-42}
          shadow-camera-far={160}
          shadow-bias={-0.00035}
          shadow-normalBias={0.05}
          shadow-radius={3 + lighting.shadowSoftness * 6}
        />
      )}
      {lighting.sunEnabled && elevation > -0.18 && (
        <>
          <CelestialSprite
            textureData={lighting.sunTextureData}
            position={sunPosition}
            color="#FFF4C2"
            opacity={0.98}
            size={7}
          />
          {lighting.sunGlare > 0 && (
            <CelestialSprite
              textureData=""
              position={[
                sunPosition[0] * 0.995,
                sunPosition[1] * 0.995,
                sunPosition[2] * 0.995,
              ]}
              color="#FFD978"
              opacity={lighting.sunGlare * 0.22 * daylight}
              size={12 + lighting.sunGlare * 9}
              glare
            />
          )}
        </>
      )}
      {lighting.moonEnabled && elevation < 0.18 && (
        <CelestialSprite
          textureData={lighting.moonTextureData}
          position={moonPosition}
          color={moonColor}
          opacity={(0.25 + moonPhase * 0.75) * night}
          size={5.5}
          phase={moonPhase}
        />
      )}
    </>
  );
}
