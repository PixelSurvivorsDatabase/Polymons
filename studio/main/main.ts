import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} from "electron";
import { registerUpdater } from "./updater.js";

const API_URL = "https://polymons-server.onrender.com";
const WEBSITE_URL = "https://pixelsurvivorsdatabase.github.io/Polymons/";
const __dirname = dirname(fileURLToPath(import.meta.url));

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

type StudioLanguage = "luau" | "cpp" | "csharp";

type StudioUser = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  tix: number;
  avatarUrl: string | null;
  equippedShirtId:
    | "polymon-shirt"
    | "beta-tester-shirt"
    | "creators-shirt"
    | "orange-polymons-shirt"
    | "polymons-varsity-jacket"
    | null;
  equippedPantsId:
    | "classic-denim-pants"
    | "polymon-pants"
    | "beta-tester-pants"
    | "creators-pants"
    | "orange-polymons-pants"
    | "polymons-varsity-pants"
    | null;
  avatarAppearance: {
    face: "classic-smile";
    bodyColors: {
      head: string;
      torso: string;
      leftArm: string;
      rightArm: string;
      leftLeg: string;
      rightLeg: string;
    };
    accessories: string[];
  };
};

type StudioSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  expiresIn: number;
  tokenType: string;
};

type StoredAuth = {
  user: StudioUser;
  session: StudioSession;
};

type SceneObject = {
  id: string;
  name: string;
  type:
    | "baseplate"
    | "spawn"
    | "part"
    | "tool"
    | "handle"
    | "humanoidRootPart"
    | "sound";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  shape?: "block" | "sphere" | "cylinder" | "stud";
  color: string;
  anchored: boolean;
  visible?: boolean;
  transparency: number;
  material: "plastic" | "metal" | "wood" | "neon";
  surfaceTexture:
    | "none"
    | "brick"
    | "wood"
    | "concrete"
    | "grass"
    | "fabric"
    | "marble";
  canCollide: boolean;
  castShadow: boolean;
  friction?: number;
  restitution?: number;
  mass?: number;
  velocity?: [number, number, number];
  angularVelocity?: [number, number, number];
  soundData?: string;
  soundFileName?: string;
  volume?: number;
  looped?: boolean;
  playbackSpeed?: number;
  rolloffMinDistance?: number;
  rolloffMaxDistance?: number;
  autoplay?: boolean;
  parentId?: string | null;
  modelId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  tags: string[];
};

type StudioModel = {
  id: string;
  name: string;
  primaryPartId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  tags: string[];
};

type StudioRemote = {
  id: string;
  name: string;
  kind: "remoteEvent" | "remoteFunction";
};

type StudioScript = {
  id: string;
  name: string;
  kind: "script" | "localScript" | "moduleScript";
  parent: "ServerScriptService" | "StarterPlayerScripts" | string;
  source: string;
};

type StudioGuiObject = {
  id: string;
  name: string;
  type:
    | "screenGui"
    | "frame"
    | "textLabel"
    | "textButton"
    | "textBox"
    | "imageLabel"
    | "imageButton"
    | "scrollingFrame";
  parentId: string | null;
  position: [number, number];
  size: [number, number];
  backgroundColor: string;
  backgroundTransparency: number;
  text: string;
  textColor: string;
  visible: boolean;
  rotation: number;
  textSize: number;
  borderRadius: number;
  zIndex: number;
  anchorPoint: [number, number];
  clipDescendants: boolean;
  locked: boolean;
  imageUrl: string;
  placeholder: string;
  canvasSize: [number, number];
};

type StudioAnimation = {
  id: string;
  name: string;
  rigModelId: string | null;
  duration: number;
  looped: boolean;
  keyframes: Array<{
    time: number;
    poses: Record<
      string,
      {
        position?: [number, number, number];
        rotation?: [number, number, number];
      }
    >;
  }>;
};

type StudioValueObject = {
  id: string;
  name: string;
  type: "boolValue" | "numberValue" | "stringValue";
  parent: string;
  value: string | number | boolean;
};

type StudioLightingSettings = {
  clockTime: number;
  brightness: number;
  ambient: string;
  outdoorAmbient: string;
  skyColor: string;
  fogColor: string;
  fogStart: number;
  fogEnd: number;
  globalShadows: boolean;
  shadowSoftness: number;
  dayNightCycle: boolean;
  dayLengthMinutes: number;
  sunEnabled: boolean;
  moonEnabled: boolean;
  sunTextureData: string;
  moonTextureData: string;
  sunBrightness: number;
  sunGlare: number;
  sunRays: boolean;
  moonBrightness: number;
  moonPhases: boolean;
  moonPhase: number;
};

function defaultLighting(): StudioLightingSettings {
  return {
    clockTime: 14,
    brightness: 2,
    ambient: "#8A8A8A",
    outdoorAmbient: "#A7B0A0",
    skyColor: "#8EC8ED",
    fogColor: "#A9D4EE",
    fogStart: 90,
    fogEnd: 260,
    globalShadows: true,
    shadowSoftness: 0.25,
    dayNightCycle: false,
    dayLengthMinutes: 20,
    sunEnabled: true,
    moonEnabled: true,
    sunTextureData: "",
    moonTextureData: "",
    sunBrightness: 1.35,
    sunGlare: 0.45,
    sunRays: true,
    moonBrightness: 0.55,
    moonPhases: true,
    moonPhase: 1,
  };
}

type StudioProject = {
  version: 2;
  id: string;
  name: string;
  description: string;
  language: StudioLanguage;
  createdAt: string;
  updatedAt: string;
  objects: SceneObject[];
  models: StudioModel[];
  remotes: StudioRemote[];
  scripts: StudioScript[];
  gui: StudioGuiObject[];
  playerSettings: {
    health: number;
    walkSpeed: number;
    jumpPower: number;
    cameraFieldOfView: number;
    cameraMinZoomDistance: number;
    cameraMaxZoomDistance: number;
    maxHealth: number;
    sprintEnabled: boolean;
    sprintMultiplier: number;
  };
  lighting: StudioLightingSettings;
  leaderstats: Array<{
    id: string;
    name: string;
    type: "number" | "string";
    defaultValue: number | string;
    showOnLeaderboard?: boolean;
  }>;
  animations: StudioAnimation[];
  badges: Array<{
    id: string;
    name: string;
    description: string;
    iconData: string;
  }>;
  gamePasses: Array<{
    id: string;
    name: string;
    description: string;
    priceTix: number;
  }>;
  developerProducts: Array<{
    id: string;
    name: string;
    description: string;
    priceTix: number;
    effectKey: string | null;
    effectAmount: number;
  }>;
  values: StudioValueObject[];
  publication: {
    gameId: string;
    slug: string;
    version: number;
    publishedAt: string;
  } | null;
  dataStores: Record<string, Record<string, string | number | boolean | null>>;
};

type PolyGameFile = {
  format: "polymons-game";
  version: 1;
  project: StudioProject;
};

type PmxlFile = {
  format: "pmxl";
  version: 1;
  model: {
    name: string;
    primaryPartIndex: number | null;
    attributes: Record<string, string | number | boolean | null>;
    tags: string[];
    parts: Array<
      Omit<SceneObject, "id" | "modelId" | "parentId"> & {
        parentIndex?: number | null;
      }
    >;
  };
};

type PmaFile = {
  format: "pma";
  version: 1;
  animation: Omit<StudioAnimation, "id" | "rigModelId">;
  partNames: Record<string, string>;
};

type ProjectSummary = Pick<
  StudioProject,
  "id" | "name" | "language" | "createdAt" | "updatedAt"
>;

let auth: StoredAuth | null = null;
const previewMode =
  !app.isPackaged && process.argv.includes("--studio-preview");
const captureArgument = !app.isPackaged
  ? process.argv.find(
      (argument) =>
        argument.startsWith("--studio-capture-script=") ||
        argument.startsWith("--studio-capture-ui="),
    )
  : undefined;

function sessionPath(): string {
  return join(app.getPath("userData"), "session.bin");
}

function projectsRoot(): string {
  return join(app.getPath("documents"), "Poly Studio Projects");
}

function validateProjectId(id: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    throw new Error("Invalid project.");
  }
}

function projectDirectory(id: string): string {
  validateProjectId(id);
  return join(projectsRoot(), id);
}

function manifestPath(id: string): string {
  return join(projectDirectory(id), "project.poly.json");
}

function dataStoresPath(id: string): string {
  return join(projectDirectory(id), "data-stores.json");
}

function backupsDirectory(id: string): string {
  return join(projectDirectory(id), "backups");
}

async function findPlayerExecutable(): Promise<string | null> {
  if (process.platform !== "win32") return null;
  const portableDirectory = process.env.PORTABLE_EXECUTABLE_DIR;
  const executableDirectory = dirname(
    process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath,
  );
  const candidates = [
    process.env.POLYMONS_PLAYER_PATH,
    portableDirectory
      ? join(portableDirectory, "PolymonsPlayer.exe")
      : undefined,
    join(executableDirectory, "PolymonsPlayer.exe"),
    join(executableDirectory, "..", "release", "PolymonsPlayer.exe"),
    join(process.cwd(), "release", "PolymonsPlayer.exe"),
    join(app.getPath("downloads"), "PolymonsPlayer.exe"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Keep looking for an installed Player.
    }
  }
  return null;
}

function sourceExtension(language: StudioLanguage): string {
  if (language === "cpp") return "cpp";
  if (language === "csharp") return "cs";
  return "luau";
}

function sourcePath(id: string, language: StudioLanguage): string {
  return join(projectDirectory(id), "src", `Main.${sourceExtension(language)}`);
}

function safeFileName(value: string): string {
  const cleaned = value.replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
  return cleaned || "Script";
}

function scriptSourcePath(
  project: StudioProject,
  script: StudioScript,
): string {
  let parent = script.parent;
  const visited = new Set<string>();
  while (!visited.has(parent)) {
    visited.add(parent);
    const parentScript = project.scripts.find(
      (candidate) => candidate.id === parent,
    );
    if (!parentScript) break;
    parent = parentScript.parent;
  }
  const folder = project.objects.some((object) => object.id === parent) ||
    project.models.some((model) => model.id === parent)
    ? "Workspace"
    : project.gui.some((gui) => gui.id === parent)
      ? "StarterGui"
      : [
            "Workspace",
            "ServerScriptService",
            "StarterPlayerScripts",
            "ReplicatedStorage",
            "ServerStorage",
            "StarterGui",
          ].includes(parent)
        ? parent
        : "StarterGui";
  return join(
    projectDirectory(project.id),
    "src",
    folder,
    `${safeFileName(script.name)}-${script.id.slice(0, 8)}.${sourceExtension(project.language)}`,
  );
}

function starterScript(
  language: StudioLanguage,
  kind: StudioScript["kind"],
): string {
  if (language === "cpp") {
    if (kind === "moduleScript") {
      return `#include <poly/module.hpp>

Module::Export("WalkSpeed", 22);
Module::Export("Accent", "#6F49BB");
`;
    }
    if (kind === "localScript") {
      return `#include <poly/client.hpp>

auto player = Players::LocalPlayer;
player.WalkSpeed = 18;
Console::Log("Client script started");
`;
    }
    return `#include <poly/server.hpp>

auto part = Workspace.Find("Part");
part.Color = "#6F49BB";
Console::Log("Server script started");
`;
  }
  if (language === "csharp") {
    if (kind === "moduleScript") {
      return `using Poly;

Module.Export("WalkSpeed", 22);
Module.Export("Accent", "#6F49BB");
`;
    }
    if (kind === "localScript") {
      return `using Poly;

var player = Players.LocalPlayer;
player.WalkSpeed = 18;
Poly.Log("Client script started");
`;
    }
    return `using Poly;

var part = Workspace.Find("Part");
part.Color = "#6F49BB";
Poly.Log("Server script started");
`;
  }
  if (kind === "localScript") {
    return `local player = Players.LocalPlayer

player.WalkSpeed = 18
print("Client script started")
`;
  }
  if (kind === "moduleScript") {
    return `return {
    WalkSpeed = 22,
    Accent = "#6F49BB",
}
`;
  }
  return `local part = Workspace:FindFirstChild("Part")

part.Color = "#6F49BB"
print("Server script started")
`;
}

function starterScripts(language: StudioLanguage): StudioScript[] {
  return [
    {
      id: randomUUID(),
      name: "Main",
      kind: "script",
      parent: "ServerScriptService",
      source: starterScript(language, "script"),
    },
    {
      id: randomUUID(),
      name: "Client",
      kind: "localScript",
      parent: "StarterPlayerScripts",
      source: starterScript(language, "localScript"),
    },
  ];
}

function migrateLegacyProject(
  manifest: Omit<StudioProject, "version" | "scripts" | "gui" | "playerSettings"> & {
    script?: string;
  },
  source: string,
): StudioProject {
  return {
    version: 2,
    id: manifest.id,
    name: manifest.name,
    description: "",
    language: manifest.language,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    objects: manifest.objects.map((object) => ({
      ...object,
      visible: true,
      transparency: 0,
      material: "plastic",
      surfaceTexture: "none",
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0] as [number, number, number],
      angularVelocity: [0, 0, 0] as [number, number, number],
      parentId: null,
      modelId: null,
      attributes: {},
      tags: [],
    })),
    models: [],
    remotes: [],
    scripts: [
      {
        id: randomUUID(),
        name: "Main",
        kind: "script",
        parent: "ServerScriptService",
        source: source || manifest.script || starterScript(manifest.language, "script"),
      },
    ],
    gui: [],
    playerSettings: {
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
    lighting: defaultLighting(),
    leaderstats: [],
    animations: [],
    badges: [],
    gamePasses: [],
    developerProducts: [],
    values: [],
    publication: null,
    dataStores: {},
  };
}

function normalizeProject(project: StudioProject): StudioProject {
  const cameraMinZoomDistance = Math.max(
    1,
    Math.min(200, project.playerSettings.cameraMinZoomDistance ?? 10),
  );
  const cameraMaxZoomDistance = Math.max(
    cameraMinZoomDistance,
    Math.min(200, project.playerSettings.cameraMaxZoomDistance ?? 80),
  );
  return {
    ...project,
    objects: project.objects.map((object) => ({
      ...object,
      shape: object.shape ?? "block",
      visible: object.visible ?? true,
      transparency: object.transparency ?? 0,
      material: object.material ?? "plastic",
      surfaceTexture: object.surfaceTexture ?? "none",
      canCollide: object.canCollide ?? true,
      castShadow: object.castShadow ?? true,
      friction: object.friction ?? 0.82,
      restitution: object.restitution ?? 0.03,
      mass: object.mass ?? 1,
      velocity: object.velocity ?? [0, 0, 0],
      angularVelocity: object.angularVelocity ?? [0, 0, 0],
      soundData: object.soundData ?? "",
      soundFileName: object.soundFileName ?? "",
      volume: Math.max(0, Math.min(1, object.volume ?? 0.7)),
      looped: object.looped ?? false,
      playbackSpeed: Math.max(0.25, Math.min(4, object.playbackSpeed ?? 1)),
      rolloffMinDistance: Math.max(0.1, object.rolloffMinDistance ?? 5),
      rolloffMaxDistance: Math.max(
        Math.max(0.1, object.rolloffMinDistance ?? 5),
        object.rolloffMaxDistance ?? 60,
      ),
      autoplay: object.autoplay ?? false,
      parentId: object.parentId ?? null,
      modelId: object.modelId ?? null,
      attributes: object.attributes ?? {},
      tags: object.tags ?? [],
    })),
    models: (project.models ?? []).map((model) => ({
      ...model,
      primaryPartId: model.primaryPartId ?? null,
      attributes: model.attributes ?? {},
      tags: model.tags ?? [],
    })),
    remotes: project.remotes ?? [],
    values: (project.values ?? []).map((value) => ({
      ...value,
      type:
        value.type === "boolValue"
          ? "boolValue"
          : value.type === "stringValue"
            ? "stringValue"
            : "numberValue",
      value:
        value.type === "boolValue"
          ? Boolean(value.value)
          : value.type === "stringValue"
            ? String(value.value ?? "")
            : Number.isFinite(Number(value.value))
              ? Number(value.value)
              : 0,
    })),
    gui: project.gui.map((gui) => ({
      ...gui,
      rotation: gui.rotation ?? 0,
      textSize: gui.textSize ?? 16,
      borderRadius: gui.borderRadius ?? 7,
      zIndex: gui.zIndex ?? 1,
      anchorPoint: gui.anchorPoint ?? [0, 0],
      clipDescendants: gui.clipDescendants ?? true,
      locked: gui.locked ?? false,
      imageUrl: gui.imageUrl ?? "",
      placeholder: gui.placeholder ?? "",
      canvasSize: gui.canvasSize ?? [1, 1],
    })),
    playerSettings: {
      health: project.playerSettings.health ?? project.playerSettings.maxHealth ?? 100,
      walkSpeed: project.playerSettings.walkSpeed ?? 18,
      jumpPower: project.playerSettings.jumpPower ?? 10.5,
      cameraFieldOfView: project.playerSettings.cameraFieldOfView ?? 52,
      cameraMinZoomDistance,
      cameraMaxZoomDistance,
      maxHealth: project.playerSettings.maxHealth ?? 100,
      sprintEnabled: project.playerSettings.sprintEnabled ?? true,
      sprintMultiplier: project.playerSettings.sprintMultiplier ?? 1.5,
    },
    lighting: {
      ...defaultLighting(),
      ...(project.lighting ?? {}),
      clockTime: Math.max(
        0,
        Math.min(24, project.lighting?.clockTime ?? defaultLighting().clockTime),
      ),
      brightness: Math.max(
        0,
        Math.min(8, project.lighting?.brightness ?? defaultLighting().brightness),
      ),
      fogStart: Math.max(
        0,
        project.lighting?.fogStart ?? defaultLighting().fogStart,
      ),
      fogEnd: Math.max(
        Math.max(0, project.lighting?.fogStart ?? defaultLighting().fogStart) + 1,
        project.lighting?.fogEnd ?? defaultLighting().fogEnd,
      ),
      shadowSoftness: Math.max(
        0,
        Math.min(
          1,
          project.lighting?.shadowSoftness ?? defaultLighting().shadowSoftness,
        ),
      ),
      dayLengthMinutes: Math.max(
        0.5,
        Math.min(
          240,
          project.lighting?.dayLengthMinutes ?? defaultLighting().dayLengthMinutes,
        ),
      ),
      sunBrightness: Math.max(
        0,
        Math.min(
          8,
          project.lighting?.sunBrightness ?? defaultLighting().sunBrightness,
        ),
      ),
      sunGlare: Math.max(
        0,
        Math.min(2, project.lighting?.sunGlare ?? defaultLighting().sunGlare),
      ),
      moonBrightness: Math.max(
        0,
        Math.min(
          4,
          project.lighting?.moonBrightness ?? defaultLighting().moonBrightness,
        ),
      ),
      moonPhase: Math.max(
        0,
        Math.min(1, project.lighting?.moonPhase ?? defaultLighting().moonPhase),
      ),
    },
    description: project.description ?? "",
    leaderstats: (project.leaderstats ?? []).map((stat) => ({
      ...stat,
      showOnLeaderboard: stat.showOnLeaderboard ?? true,
      type: stat.type === "string" ? "string" : "number",
      defaultValue:
        stat.type === "string"
          ? String(stat.defaultValue ?? "")
          : Number.isFinite(Number(stat.defaultValue))
            ? Number(stat.defaultValue)
            : 0,
    })),
    animations: (project.animations ?? []).map((animation) => ({
      ...animation,
      rigModelId: animation.rigModelId ?? null,
      duration: Math.max(0.05, Number(animation.duration) || 1),
      looped: animation.looped ?? false,
      keyframes: (animation.keyframes ?? [])
        .map((keyframe) => ({
          time: Math.max(0, Number(keyframe.time) || 0),
          poses: keyframe.poses ?? {},
        }))
        .sort((a, b) => a.time - b.time),
    })),
    badges: (project.badges ?? []).map((badge) => ({
      id: badge.id,
      name: String(badge.name ?? "").slice(0, 64),
      description: String(badge.description ?? "").slice(0, 500),
      iconData:
        typeof badge.iconData === "string" &&
        /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(badge.iconData)
          ? badge.iconData
          : "",
    })),
    gamePasses: (project.gamePasses ?? []).map((pass) => ({
      id: pass.id,
      name: String(pass.name ?? "").slice(0, 64),
      description: String(pass.description ?? "").slice(0, 500),
      priceTix: Math.max(0, Math.min(1_000_000, Math.floor(Number(pass.priceTix) || 0))),
    })),
    developerProducts: (project.developerProducts ?? []).map((product) => ({
      id: product.id,
      name: String(product.name ?? "").slice(0, 64),
      description: String(product.description ?? "").slice(0, 500),
      priceTix: Math.max(0, Math.min(1_000_000, Math.floor(Number(product.priceTix) || 0))),
      effectKey:
        typeof product.effectKey === "string" &&
        /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(product.effectKey)
          ? product.effectKey
          : null,
      effectAmount: Number.isFinite(Number(product.effectAmount))
        ? Number(product.effectAmount)
        : 0,
    })),
    publication: project.publication ?? null,
    dataStores: project.dataStores ?? {},
  };
}

function starterObjects(): SceneObject[] {
  return [
    {
      id: randomUUID(),
      name: "Baseplate",
      type: "baseplate",
      position: [0, -0.5, 0],
      rotation: [0, 0, 0],
      scale: [40, 1, 40],
      color: "#405946",
      anchored: true,
      visible: true,
      transparency: 0,
      material: "plastic",
      surfaceTexture: "grass",
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      parentId: null,
      modelId: null,
      attributes: {},
      tags: [],
    },
    {
      id: randomUUID(),
      name: "Spawn",
      type: "spawn",
      position: [0, 0.15, 5],
      rotation: [0, 0, 0],
      scale: [4, 0.3, 4],
      color: "#5b3d91",
      anchored: true,
      visible: true,
      transparency: 0,
      material: "neon",
      surfaceTexture: "none",
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      parentId: null,
      modelId: null,
      attributes: {},
      tags: [],
    },
    {
      id: randomUUID(),
      name: "Part",
      type: "part",
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scale: [4, 4, 4],
      color: "#342856",
      anchored: true,
      visible: true,
      transparency: 0,
      material: "plastic",
      surfaceTexture: "brick",
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      parentId: null,
      modelId: null,
      attributes: {},
      tags: [],
    },
  ];
}

function tutorialObjects(): SceneObject[] {
  const objects = starterObjects();
  const lessons: Array<{
    name: string;
    position: [number, number, number];
    color: string;
    texture: SceneObject["surfaceTexture"];
  }> = [
    {
      name: "Step1_SelectAndMove",
      position: [-8, 1, -2],
      color: "#6F49BB",
      texture: "brick",
    },
    {
      name: "Step2_EditProperties",
      position: [0, 1, -8],
      color: "#3D8D73",
      texture: "wood",
    },
    {
      name: "Step3_OpenMainScript",
      position: [8, 1, -2],
      color: "#A65B6A",
      texture: "marble",
    },
  ];
  return [
    ...objects,
    ...lessons.map((lesson) => ({
      id: randomUUID(),
      name: lesson.name,
      type: "part" as const,
      position: lesson.position,
      rotation: [0, 0, 0] as [number, number, number],
      scale: [5, 2, 5] as [number, number, number],
      color: lesson.color,
      anchored: true,
      visible: true,
      transparency: 0,
      material: "plastic" as const,
      surfaceTexture: lesson.texture,
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0] as [number, number, number],
      angularVelocity: [0, 0, 0] as [number, number, number],
      parentId: null,
      modelId: null,
      attributes: {
        Tutorial:
          lesson.name === "Step1_SelectAndMove"
            ? "Select this Part and use Move."
            : lesson.name === "Step2_EditProperties"
              ? "Change Color and Texture in Properties."
              : "Open Main in ServerScriptService and edit the code.",
      },
      tags: ["Tutorial"],
    })),
  ];
}

function tutorialScripts(language: StudioLanguage): StudioScript[] {
  const scripts = starterScripts(language);
  return scripts.map((script) =>
    script.name === "Main"
      ? {
          ...script,
          source: `${script.source}
${language === "luau" ? '-- Tutorial: change the Part color, then press Play.' : "// Tutorial: change the Part color, then press Play."}
`,
        }
      : script,
  );
}

function tutorialGui(): StudioGuiObject[] {
  const screenId = randomUUID();
  return [
    {
      id: screenId,
      name: "TutorialGui",
      type: "screenGui",
      parentId: null,
      position: [0, 0],
      size: [1, 1],
      backgroundColor: "#000000",
      backgroundTransparency: 1,
      text: "",
      textColor: "#FFFFFF",
      visible: true,
      rotation: 0,
      textSize: 16,
      borderRadius: 0,
      zIndex: 1,
      anchorPoint: [0, 0],
      clipDescendants: true,
      locked: false,
      imageUrl: "",
      placeholder: "",
      canvasSize: [1, 1],
    },
    {
      id: randomUUID(),
      name: "Welcome",
      type: "textLabel",
      parentId: screenId,
      position: [0.03, 0.04],
      size: [0.38, 0.1],
      backgroundColor: "#17131F",
      backgroundTransparency: 0.08,
      text: "Welcome to Poly Studio. Follow the three named Parts.",
      textColor: "#FFFFFF",
      visible: true,
      rotation: 0,
      textSize: 18,
      borderRadius: 10,
      zIndex: 2,
      anchorPoint: [0, 0],
      clipDescendants: true,
      locked: false,
      imageUrl: "",
      placeholder: "",
      canvasSize: [1, 1],
    },
  ];
}

async function loadAuth(): Promise<StoredAuth | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(
      safeStorage.decryptString(await readFile(sessionPath())),
    ) as StoredAuth;
  } catch {
    return null;
  }
}

async function saveAuth(next: StoredAuth | null): Promise<void> {
  auth = next;
  if (!safeStorage.isEncryptionAvailable()) return;
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(
    sessionPath(),
    safeStorage.encryptString(next ? JSON.stringify(next) : ""),
  );
}

function requireAuth(): StoredAuth {
  if (!auth) throw new Error("Sign in to use Poly Studio.");
  return auth;
}

async function apiRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    accessToken?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.accessToken
        ? { Authorization: `Bearer ${options.accessToken}` }
        : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const result = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  if (!response.ok) {
    throw new Error(result?.error ?? "Poly Studio could not complete the request.");
  }
  return result as T;
}

async function publishProject(
  project: StudioProject,
  metadata: {
    title: string;
    description: string;
    thumbnailData?: string;
  },
): Promise<{
  game: { id: string; slug: string; title: string; version: number };
}> {
  validateProject(project);
  const title = metadata.title.trim();
  const description = metadata.description.trim();
  if (title.length < 1 || title.length > 64) {
    throw new Error("Game names must be 1-64 characters.");
  }
  if (description.length > 2_000) {
    throw new Error("Descriptions must be 2,000 characters or fewer.");
  }
  let current = requireAuth();
  const request = (accessToken: string) =>
    apiRequest<{
      game: { id: string; slug: string; title: string; version: number };
    }>("/v1/games/publish", {
      method: "POST",
      accessToken,
      body: {
        projectId: project.id,
        title,
        description,
        genre: "All",
        thumbnailData: metadata.thumbnailData,
        badges: project.badges.map((badge) => ({
          id: badge.id,
          name: badge.name,
          description: badge.description,
          iconData: badge.iconData || undefined,
        })),
        gamePasses: project.gamePasses.map((pass) => ({
          id: pass.id,
          name: pass.name,
          description: pass.description,
          priceTix: pass.priceTix,
        })),
        developerProducts: project.developerProducts.map((product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          priceTix: product.priceTix,
          effectKey: product.effectKey,
          effectAmount: product.effectAmount,
        })),
        manifest: {
          ...project,
          name: title,
          description,
          badges: project.badges.map((badge) => ({
            id: badge.id,
            name: badge.name,
            description: badge.description,
          })),
          gamePasses: project.gamePasses,
          developerProducts: project.developerProducts,
        },
      },
    });
  if (
    !current.session.expiresAt ||
    current.session.expiresAt * 1000 < Date.now() + 60_000
  ) {
    const renewed = await refreshAuth();
    if (!renewed) throw new Error("Sign in again to publish.");
    current = renewed;
  }
  const result = await request(current.session.accessToken);
  const verified = await apiRequest<{
    game: {
      id: string;
      version: number | null;
      manifest: { id?: string } | null;
    };
  }>(`/v1/games/${encodeURIComponent(result.game.id)}`);
  if (
    verified.game.id !== result.game.id ||
    verified.game.version !== result.game.version ||
    verified.game.manifest?.id !== project.id
  ) {
    throw new Error("Polymons could not verify the published game.");
  }
  return result;
}

async function refreshAuth(): Promise<StoredAuth | null> {
  if (!auth?.session.refreshToken) return null;
  const current = auth;
  try {
    const next = await apiRequest<StoredAuth>("/v1/accounts/refresh", {
      method: "POST",
      body: { refreshToken: auth.session.refreshToken },
    });
    await saveAuth(next);
    return next;
  } catch {
    return current;
  }
}

function isStoredValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    typeof value === "boolean"
  );
}

function validateAttributes(
  attributes: Record<string, string | number | boolean | null>,
): void {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) {
    throw new Error("Invalid attributes.");
  }
  const entries = Object.entries(attributes);
  if (entries.length > 100) throw new Error("Too many attributes.");
  for (const [key, value] of entries) {
    if (key.length < 1 || key.length > 64 || !isStoredValue(value)) {
      throw new Error("Invalid attribute.");
    }
  }
}

function validateTags(tags: string[]): void {
  if (
    !Array.isArray(tags) ||
    tags.length > 50 ||
    tags.some((tag) => typeof tag !== "string" || tag.length < 1 || tag.length > 64)
  ) {
    throw new Error("Invalid tags.");
  }
}

function validateProject(project: StudioProject): void {
  validateProjectId(project.id);
  if (
    typeof project.name !== "string" ||
    project.name.trim().length < 1 ||
    project.name.length > 64
  ) {
    throw new Error("Invalid project name.");
  }
  if (
    typeof project.description !== "string" ||
    project.description.length > 2_000
  ) {
    throw new Error("Invalid project description.");
  }
  if (!["luau", "cpp", "csharp"].includes(project.language)) {
    throw new Error("Invalid project language.");
  }
  if (!Array.isArray(project.objects) || project.objects.length > 5_000) {
    throw new Error("Invalid project scene.");
  }
  for (const object of project.objects) {
    if (
      typeof object.id !== "string" ||
      typeof object.name !== "string" ||
      object.name.length > 100 ||
      !["baseplate", "spawn", "part", "tool", "handle", "humanoidRootPart", "sound"].includes(object.type) ||
      !Array.isArray(object.position) ||
      !Array.isArray(object.rotation) ||
      !Array.isArray(object.scale) ||
      object.position.length !== 3 ||
      object.rotation.length !== 3 ||
      object.scale.length !== 3 ||
      (object.shape !== undefined &&
        !["block", "sphere", "cylinder", "stud"].includes(object.shape)) ||
      ![...object.position, ...object.rotation, ...object.scale].every(
        Number.isFinite,
      ) ||
      typeof object.color !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(object.color) ||
      typeof object.anchored !== "boolean" ||
      (object.visible !== undefined && typeof object.visible !== "boolean") ||
      !Number.isFinite(object.transparency) ||
      object.transparency < 0 ||
      object.transparency > 1 ||
      !["plastic", "metal", "wood", "neon"].includes(object.material) ||
      ![
        "none",
        "brick",
        "wood",
        "concrete",
        "grass",
        "fabric",
        "marble",
      ].includes(object.surfaceTexture) ||
      typeof object.canCollide !== "boolean" ||
      typeof object.castShadow !== "boolean" ||
      (object.friction !== undefined &&
        (!Number.isFinite(object.friction) ||
          object.friction < 0 ||
          object.friction > 2)) ||
      (object.restitution !== undefined &&
        (!Number.isFinite(object.restitution) ||
          object.restitution < 0 ||
          object.restitution > 1)) ||
      (object.mass !== undefined &&
        (!Number.isFinite(object.mass) ||
          object.mass <= 0 ||
          object.mass > 10_000)) ||
      (object.velocity !== undefined &&
        (!Array.isArray(object.velocity) ||
          object.velocity.length !== 3 ||
          !object.velocity.every(Number.isFinite))) ||
      (object.angularVelocity !== undefined &&
        (!Array.isArray(object.angularVelocity) ||
          object.angularVelocity.length !== 3 ||
          !object.angularVelocity.every(Number.isFinite))) ||
      (object.type === "sound" &&
        ((object.soundData &&
          (!/^data:audio\/[a-z0-9.+-]+;base64,/i.test(object.soundData) ||
            object.soundData.length > 2_900_000)) ||
          (object.volume !== undefined &&
            (!Number.isFinite(object.volume) ||
              object.volume < 0 ||
              object.volume > 1)) ||
          (object.playbackSpeed !== undefined &&
            (!Number.isFinite(object.playbackSpeed) ||
              object.playbackSpeed < 0.25 ||
              object.playbackSpeed > 4)))) ||
      (object.parentId !== undefined &&
        object.parentId !== null &&
        typeof object.parentId !== "string") ||
      (object.modelId !== null && typeof object.modelId !== "string")
    ) {
      throw new Error("Invalid project object.");
    }
    validateAttributes(object.attributes);
    validateTags(object.tags);
  }
  const objectIds = new Set(project.objects.map((object) => object.id));
  for (const object of project.objects) {
    if (
      object.parentId &&
      (object.parentId === object.id || !objectIds.has(object.parentId))
    ) {
      throw new Error("Invalid project object parent.");
    }
    if (
      object.parentId &&
      project.objects.find((candidate) => candidate.id === object.parentId)
        ?.modelId !== object.modelId
    ) {
      throw new Error("Nested Parts must belong to the same Model.");
    }
    const visited = new Set([object.id]);
    let parentId = object.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        throw new Error("Project object hierarchy contains a cycle.");
      }
      visited.add(parentId);
      parentId =
        project.objects.find((candidate) => candidate.id === parentId)
          ?.parentId ?? null;
    }
  }
  if (!Array.isArray(project.models) || project.models.length > 1_000) {
    throw new Error("Invalid project models.");
  }
  for (const model of project.models) {
    if (
      typeof model.id !== "string" ||
      typeof model.name !== "string" ||
      model.name.length < 1 ||
      model.name.length > 100 ||
      (model.primaryPartId !== null && typeof model.primaryPartId !== "string")
    ) {
      throw new Error("Invalid project model.");
    }
    validateAttributes(model.attributes);
    validateTags(model.tags);
  }
  const modelIds = new Set(project.models.map((model) => model.id));
  if (
    project.objects.some(
      (object) => object.modelId !== null && !modelIds.has(object.modelId),
    )
  ) {
    throw new Error("A Part references a missing Model.");
  }
  for (const model of project.models) {
    if (
      model.primaryPartId &&
      !project.objects.some(
        (object) =>
          object.id === model.primaryPartId && object.modelId === model.id,
      )
    ) {
      throw new Error("A Model has an invalid Primary Part.");
    }
  }
  if (!Array.isArray(project.remotes) || project.remotes.length > 1_000) {
    throw new Error("Invalid project remotes.");
  }
  for (const remote of project.remotes) {
    if (
      typeof remote.id !== "string" ||
      typeof remote.name !== "string" ||
      remote.name.length < 1 ||
      remote.name.length > 100 ||
      !["remoteEvent", "remoteFunction"].includes(remote.kind)
    ) {
      throw new Error("Invalid project remote.");
    }
  }
  if (new Set(project.remotes.map((remote) => remote.name)).size !== project.remotes.length) {
    throw new Error("Remote names must be unique.");
  }
  if (!Array.isArray(project.scripts) || project.scripts.length > 1_000) {
    throw new Error("Invalid project scripts.");
  }
  for (const script of project.scripts) {
    if (
      typeof script.id !== "string" ||
      typeof script.name !== "string" ||
      script.name.trim().length < 1 ||
      script.name.length > 100 ||
      !["script", "localScript", "moduleScript"].includes(script.kind) ||
      typeof script.parent !== "string" ||
      typeof script.source !== "string" ||
      script.source.length > 2_000_000
    ) {
      throw new Error("Invalid project script.");
    }
  }
  if (!Array.isArray(project.gui) || project.gui.length > 5_000) {
    throw new Error("Invalid project GUI.");
  }
  for (const gui of project.gui) {
    if (
      typeof gui.id !== "string" ||
      typeof gui.name !== "string" ||
      ![
        "screenGui",
        "frame",
        "textLabel",
        "textButton",
        "textBox",
        "imageLabel",
        "imageButton",
        "scrollingFrame",
      ].includes(gui.type) ||
      (gui.parentId !== null && typeof gui.parentId !== "string") ||
      !Array.isArray(gui.position) ||
      gui.position.length !== 2 ||
      !gui.position.every(Number.isFinite) ||
      !Array.isArray(gui.size) ||
      gui.size.length !== 2 ||
      !gui.size.every(Number.isFinite) ||
      !/^#[0-9a-f]{6}$/i.test(gui.backgroundColor) ||
      !Number.isFinite(gui.backgroundTransparency) ||
      gui.backgroundTransparency < 0 ||
      gui.backgroundTransparency > 1 ||
      typeof gui.text !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(gui.textColor) ||
      typeof gui.visible !== "boolean"
      || !Number.isFinite(gui.rotation)
      || !Number.isFinite(gui.textSize)
      || !Number.isFinite(gui.borderRadius)
      || !Number.isInteger(gui.zIndex)
      || typeof gui.imageUrl !== "string"
      || gui.imageUrl.length > 2_900_000
      || (gui.imageUrl.startsWith("data:") &&
        !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(gui.imageUrl))
    ) {
      throw new Error("Invalid GUI object.");
    }
  }
  const guiIds = new Set(project.gui.map((gui) => gui.id));
  for (const gui of project.gui) {
    if (gui.parentId && !guiIds.has(gui.parentId)) {
      throw new Error("A GUI object references a missing parent.");
    }
    const visited = new Set([gui.id]);
    let parentId = gui.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        throw new Error("GUI hierarchy contains a cycle.");
      }
      visited.add(parentId);
      parentId =
        project.gui.find((candidate) => candidate.id === parentId)?.parentId ??
        null;
    }
  }
  const scriptIds = new Set(project.scripts.map((script) => script.id));
  const serviceParents = new Set([
    "Workspace",
    "ServerScriptService",
    "ReplicatedStorage",
    "ServerStorage",
    "StarterPlayerScripts",
    "StarterGui",
  ]);
  for (const script of project.scripts) {
    if (
      !serviceParents.has(script.parent) &&
      !scriptIds.has(script.parent) &&
      !guiIds.has(script.parent) &&
      !objectIds.has(script.parent) &&
      !modelIds.has(script.parent)
    ) {
      throw new Error("A Script references a missing parent.");
    }
    const visited = new Set([script.id]);
    let parentId = script.parent;
    while (scriptIds.has(parentId)) {
      if (visited.has(parentId)) {
        throw new Error("Script hierarchy contains a cycle.");
      }
      visited.add(parentId);
      parentId =
        project.scripts.find((candidate) => candidate.id === parentId)
          ?.parent ?? "";
    }
  }
  if (!Array.isArray(project.values) || project.values.length > 5_000) {
    throw new Error("Invalid project values.");
  }
  const valueIds = new Set(project.values.map((value) => value.id));
  for (const value of project.values) {
    if (
      typeof value.id !== "string" ||
      typeof value.name !== "string" ||
      value.name.trim().length < 1 ||
      value.name.length > 100 ||
      !["boolValue", "numberValue", "stringValue"].includes(value.type) ||
      typeof value.parent !== "string" ||
      (value.type === "boolValue" && typeof value.value !== "boolean") ||
      (value.type === "numberValue" && !Number.isFinite(value.value)) ||
      (value.type === "stringValue" &&
        (typeof value.value !== "string" || value.value.length > 10_000)) ||
      (!serviceParents.has(value.parent) &&
        !scriptIds.has(value.parent) &&
        !guiIds.has(value.parent) &&
        !objectIds.has(value.parent) &&
        !modelIds.has(value.parent) &&
        !valueIds.has(value.parent))
    ) {
      throw new Error("Invalid Value object.");
    }
    const visited = new Set([value.id]);
    let parentId = value.parent;
    while (valueIds.has(parentId)) {
      if (visited.has(parentId)) {
        throw new Error("Value hierarchy contains a cycle.");
      }
      visited.add(parentId);
      parentId =
        project.values.find((candidate) => candidate.id === parentId)?.parent ??
        "";
    }
  }
  if (
    !project.playerSettings ||
    !Number.isFinite(project.playerSettings.health) ||
    !Number.isFinite(project.playerSettings.walkSpeed) ||
    !Number.isFinite(project.playerSettings.jumpPower) ||
    !Number.isFinite(project.playerSettings.cameraFieldOfView) ||
    !Number.isFinite(project.playerSettings.cameraMinZoomDistance) ||
    !Number.isFinite(project.playerSettings.cameraMaxZoomDistance) ||
    project.playerSettings.cameraMinZoomDistance < 1 ||
    project.playerSettings.cameraMaxZoomDistance >
      200 ||
    project.playerSettings.cameraMinZoomDistance >
      project.playerSettings.cameraMaxZoomDistance ||
    !Number.isFinite(project.playerSettings.maxHealth)
  ) {
    throw new Error("Invalid LocalPlayer settings.");
  }
  if (
    !Array.isArray(project.leaderstats) ||
    project.leaderstats.length > 12 ||
    project.leaderstats.some(
      (stat) =>
        typeof stat.id !== "string" ||
        typeof stat.name !== "string" ||
        stat.name.trim().length < 1 ||
        stat.name.length > 24 ||
        !["number", "string"].includes(stat.type) ||
        (stat.showOnLeaderboard !== undefined &&
          typeof stat.showOnLeaderboard !== "boolean") ||
        (stat.type === "number"
          ? !Number.isFinite(Number(stat.defaultValue))
          : typeof stat.defaultValue !== "string" ||
            stat.defaultValue.length > 64),
    )
  ) {
    throw new Error("Invalid leaderstats.");
  }
  if (
    !Array.isArray(project.animations) ||
    project.animations.length > 200
  ) {
    throw new Error("Invalid animations.");
  }
  for (const animation of project.animations) {
    if (
      typeof animation.id !== "string" ||
      typeof animation.name !== "string" ||
      animation.name.trim().length < 1 ||
      animation.name.length > 64 ||
      (animation.rigModelId !== null &&
        !project.models.some((model) => model.id === animation.rigModelId)) ||
      !Number.isFinite(animation.duration) ||
      animation.duration < 0.05 ||
      animation.duration > 600 ||
      typeof animation.looped !== "boolean" ||
      !Array.isArray(animation.keyframes) ||
      animation.keyframes.length > 2_000
    ) {
      throw new Error("Invalid animation.");
    }
    for (const keyframe of animation.keyframes) {
      if (
        !Number.isFinite(keyframe.time) ||
        keyframe.time < 0 ||
        keyframe.time > animation.duration ||
        !keyframe.poses ||
        typeof keyframe.poses !== "object" ||
        Array.isArray(keyframe.poses)
      ) {
        throw new Error("Invalid animation keyframe.");
      }
      for (const [partId, pose] of Object.entries(keyframe.poses)) {
        if (
          !project.objects.some((object) => object.id === partId) ||
          !pose ||
          typeof pose !== "object" ||
          (pose.position &&
            (pose.position.length !== 3 ||
              !pose.position.every(Number.isFinite))) ||
          (pose.rotation &&
            (pose.rotation.length !== 3 ||
              !pose.rotation.every(Number.isFinite)))
        ) {
          throw new Error("Invalid animation pose.");
        }
      }
    }
  }
  if (
    !Array.isArray(project.badges) ||
    project.badges.length > 50 ||
    project.badges.some(
      (badge) =>
        typeof badge.id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(badge.id) ||
        typeof badge.name !== "string" ||
        badge.name.trim().length < 1 ||
        badge.name.length > 64 ||
        typeof badge.description !== "string" ||
        badge.description.length > 500 ||
        (badge.iconData !== "" &&
          (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(badge.iconData) ||
            Buffer.byteLength(badge.iconData, "utf8") > 1_400_000)),
    )
  ) {
    throw new Error("Invalid badges.");
  }
  if (
    !Array.isArray(project.gamePasses) ||
    project.gamePasses.length > 50 ||
    project.gamePasses.some(
      (pass) =>
        typeof pass.id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(pass.id) ||
        typeof pass.name !== "string" ||
        pass.name.trim().length < 1 ||
        pass.name.length > 64 ||
        typeof pass.description !== "string" ||
        pass.description.length > 500 ||
        !Number.isInteger(pass.priceTix) ||
        pass.priceTix < 0 ||
        pass.priceTix > 1_000_000,
    )
  ) {
    throw new Error("Invalid gamepasses.");
  }
  if (
    !Array.isArray(project.developerProducts) ||
    project.developerProducts.length > 50 ||
    project.developerProducts.some(
      (product) =>
        typeof product.id !== "string" ||
        !/^[a-f0-9-]{36}$/i.test(product.id) ||
        typeof product.name !== "string" ||
        product.name.trim().length < 1 ||
        product.name.length > 64 ||
        typeof product.description !== "string" ||
        product.description.length > 500 ||
        !Number.isInteger(product.priceTix) ||
        product.priceTix < 0 ||
        product.priceTix > 1_000_000 ||
        !(
          product.effectKey === null ||
          (typeof product.effectKey === "string" &&
            /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(product.effectKey))
        ) ||
        typeof product.effectAmount !== "number" ||
        !Number.isFinite(product.effectAmount),
    )
  ) {
    throw new Error("Invalid developer products.");
  }
  if (
    project.publication &&
    (typeof project.publication.gameId !== "string" ||
      typeof project.publication.slug !== "string" ||
      !Number.isInteger(project.publication.version) ||
      typeof project.publication.publishedAt !== "string")
  ) {
    throw new Error("Invalid publication details.");
  }
  if (!project.dataStores || typeof project.dataStores !== "object") {
    throw new Error("Invalid project data stores.");
  }
  const stores = Object.entries(project.dataStores);
  if (stores.length > 100) throw new Error("Too many project data stores.");
  for (const [storeName, store] of stores) {
    if (
      storeName.length < 1 ||
      storeName.length > 64 ||
      !store ||
      typeof store !== "object" ||
      Array.isArray(store) ||
      Object.keys(store).length > 5_000
    ) {
      throw new Error("Invalid project data store.");
    }
    for (const [key, value] of Object.entries(store)) {
      if (
        key.length < 1 ||
        key.length > 128 ||
        !(
          value === null ||
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        )
      ) {
        throw new Error("Invalid project data entry.");
      }
    }
  }
}

async function readProject(id: string): Promise<StudioProject> {
  requireAuth();
  const manifest = JSON.parse(await readFile(manifestPath(id), "utf8")) as
    | StudioProject
    | (Omit<
        StudioProject,
        "version" | "scripts" | "gui" | "playerSettings"
      > & { script?: string });
  let project: StudioProject;
  if ("version" in manifest && manifest.version === 2) {
    project = normalizeProject(manifest);
  } else {
    const source = await readFile(sourcePath(id, manifest.language), "utf8").catch(
      () => "",
    );
    project = migrateLegacyProject(manifest, source);
    await writeProject(project);
  }
  const persistedDataStores = await readFile(dataStoresPath(id), "utf8")
    .then((value) => JSON.parse(value) as StudioProject["dataStores"])
    .catch(() => null);
  if (persistedDataStores) project.dataStores = persistedDataStores;
  validateProject(project);
  return project;
}

const lastBackupAt = new Map<string, number>();

async function createProjectBackup(
  projectId: string,
  force = false,
): Promise<void> {
  const now = Date.now();
  if (!force && now - (lastBackupAt.get(projectId) ?? 0) < 5 * 60_000) {
    return;
  }
  const current = await readFile(manifestPath(projectId), "utf8").catch(
    () => null,
  );
  if (!current) return;
  const directory = backupsDirectory(projectId);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${now}.poly.json`), current);
  lastBackupAt.set(projectId, now);
  const files = (await readdir(directory))
    .filter((file) => /^\d+\.poly\.json$/.test(file))
    .sort((left, right) => Number(right.split(".")[0]) - Number(left.split(".")[0]));
  await Promise.all(
    files.slice(25).map((file) => unlink(join(directory, file))),
  );
}

async function listProjectBackups(projectId: string) {
  requireAuth();
  validateProjectId(projectId);
  const directory = backupsDirectory(projectId);
  const files = await readdir(directory).catch(() => [] as string[]);
  return Promise.all(
    files
      .filter((file) => /^\d+\.poly\.json$/.test(file))
      .sort((left, right) => Number(right.split(".")[0]) - Number(left.split(".")[0]))
      .map(async (file) => {
        const project = normalizeProject(
          JSON.parse(await readFile(join(directory, file), "utf8")) as StudioProject,
        );
        return {
          id: file,
          name: project.name,
          savedAt: new Date(Number(file.split(".")[0])).toISOString(),
        };
      }),
  );
}

async function restoreProjectBackup(
  projectId: string,
  backupId: string,
): Promise<StudioProject> {
  requireAuth();
  validateProjectId(projectId);
  if (!/^\d+\.poly\.json$/.test(backupId)) {
    throw new Error("Invalid project backup.");
  }
  await createProjectBackup(projectId, true);
  const restored = normalizeProject(
    JSON.parse(
      await readFile(join(backupsDirectory(projectId), backupId), "utf8"),
    ) as StudioProject,
  );
  const next = {
    ...restored,
    id: projectId,
    updatedAt: new Date().toISOString(),
  };
  validateProject(next);
  await writeProject(next);
  return next;
}

async function writeProject(
  project: StudioProject,
  forceBackup = false,
): Promise<void> {
  requireAuth();
  validateProject(project);
  await createProjectBackup(project.id, forceBackup);
  const directory = projectDirectory(project.id);
  await mkdir(join(directory, "src"), { recursive: true });
  await Promise.all([
    writeFile(manifestPath(project.id), JSON.stringify(project, null, 2)),
    ...project.scripts.map(async (script) => {
      const path = scriptSourcePath(project, script);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, script.source);
    }),
  ]);
}

function pmxlProject(
  model: StudioModel,
  parts: SceneObject[],
): StudioProject {
  return {
    version: 2,
    id: "00000000-0000-4000-8000-000000000000",
    name: "PMXL validation",
    description: "",
    language: "luau",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    objects: parts,
    models: [model],
    remotes: [],
    scripts: [],
    gui: [],
    playerSettings: {
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
    lighting: defaultLighting(),
    leaderstats: [],
    animations: [],
      badges: [],
      gamePasses: [],
      developerProducts: [],
    values: [],
    publication: null,
    dataStores: {},
  };
}

async function exportPmxl(input: {
  model: StudioModel;
  parts: SceneObject[];
}): Promise<string | null> {
  requireAuth();
  if (
    !input ||
    !input.model ||
    !Array.isArray(input.parts) ||
    input.parts.length < 1 ||
    input.parts.length > 1_000 ||
    input.parts.some(
      (part) =>
        ["baseplate", "spawn"].includes(part.type) ||
        part.modelId !== input.model.id,
    )
  ) {
    throw new Error("Select a valid Model containing Parts.");
  }
  validateProject(pmxlProject(input.model, input.parts));
  const primaryPartIndex = input.model.primaryPartId
    ? input.parts.findIndex((part) => part.id === input.model.primaryPartId)
    : -1;
  const partIndexes = new Map(
    input.parts.map((part, index) => [part.id, index]),
  );
  const pivot =
    input.parts[primaryPartIndex >= 0 ? primaryPartIndex : 0]?.position ??
    ([0, 0, 0] as [number, number, number]);
  const file: PmxlFile = {
    format: "pmxl",
    version: 1,
    model: {
      name: input.model.name,
      primaryPartIndex: primaryPartIndex >= 0 ? primaryPartIndex : null,
      attributes: input.model.attributes,
      tags: input.model.tags,
      parts: input.parts.map((part) => ({
        name: part.name,
        type: part.type,
        position: [
          part.position[0] - pivot[0],
          part.position[1] - pivot[1],
          part.position[2] - pivot[2],
        ],
        rotation: part.rotation,
        scale: part.scale,
        shape: part.shape ?? "block",
        color: part.color,
        anchored: part.anchored,
        visible: part.visible,
        transparency: part.transparency,
        material: part.material,
        surfaceTexture: part.surfaceTexture,
        canCollide: part.canCollide,
        castShadow: part.castShadow,
        friction: part.friction,
        restitution: part.restitution,
        mass: part.mass,
        velocity: part.velocity,
        angularVelocity: part.angularVelocity,
        soundData: part.soundData,
        soundFileName: part.soundFileName,
        volume: part.volume,
        looped: part.looped,
        playbackSpeed: part.playbackSpeed,
        rolloffMinDistance: part.rolloffMinDistance,
        rolloffMaxDistance: part.rolloffMaxDistance,
        autoplay: part.autoplay,
        parentIndex:
          part.parentId && partIndexes.has(part.parentId)
            ? partIndexes.get(part.parentId)!
            : null,
        attributes: part.attributes,
        tags: part.tags,
      })),
    },
  };
  const result = await dialog.showSaveDialog({
    title: "Export Poly Model",
    defaultPath: `${safeFileName(input.model.name)}.pmxl`,
    filters: [{ name: "Poly Model", extensions: ["pmxl"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const path = result.filePath.toLowerCase().endsWith(".pmxl")
    ? result.filePath
    : `${result.filePath}.pmxl`;
  await writeFile(path, JSON.stringify(file, null, 2));
  return path;
}

async function importPmxl(): Promise<{
  model: StudioModel;
  parts: SceneObject[];
} | null> {
  requireAuth();
  const result = await dialog.showOpenDialog({
    title: "Import Poly Model",
    properties: ["openFile"],
    filters: [{ name: "Poly Model", extensions: ["pmxl"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const raw = JSON.parse(await readFile(result.filePaths[0], "utf8")) as Partial<PmxlFile>;
  if (
    raw.format !== "pmxl" ||
    raw.version !== 1 ||
    !raw.model ||
    typeof raw.model.name !== "string" ||
    !Array.isArray(raw.model.parts) ||
    raw.model.parts.length < 1 ||
    raw.model.parts.length > 1_000 ||
    raw.model.parts.some((part) =>
      !["part", "tool", "handle", "humanoidRootPart", "sound"].includes(part.type),
    )
  ) {
    throw new Error("This is not a valid PMXL model.");
  }
  const modelId = randomUUID();
  const partIds = raw.model.parts.map(() => randomUUID());
  const parts = raw.model.parts.map((rawPart, index) => {
    const part = rawPart as SceneObject;
    const parentIndex = rawPart.parentIndex;
    return {
      id: partIds[index],
      name: part.name,
      type: part.type,
      position: [
        part.position[0],
        part.position[1] + 2,
        part.position[2],
      ] as [number, number, number],
      rotation: part.rotation,
      scale: part.scale,
      shape: part.shape ?? "block",
      color: part.color,
      anchored: part.anchored,
      visible: part.visible,
      transparency: part.transparency,
      material: part.material,
      surfaceTexture: part.surfaceTexture ?? "none",
      canCollide: part.canCollide,
      castShadow: part.castShadow,
      friction: part.friction ?? 0.82,
      restitution: part.restitution ?? 0.03,
      mass: part.mass ?? 1,
      velocity: part.velocity ?? [0, 0, 0],
      angularVelocity: part.angularVelocity ?? [0, 0, 0],
      soundData: part.soundData ?? "",
      soundFileName: part.soundFileName ?? "",
      volume: part.volume ?? 0.7,
      looped: part.looped ?? false,
      playbackSpeed: part.playbackSpeed ?? 1,
      rolloffMinDistance: part.rolloffMinDistance ?? 5,
      rolloffMaxDistance: part.rolloffMaxDistance ?? 60,
      autoplay: part.autoplay ?? false,
      parentId:
        typeof parentIndex === "number" && partIds[parentIndex]
          ? partIds[parentIndex]
          : null,
      modelId,
      attributes: part.attributes,
      tags: part.tags,
    };
  });
  const primaryIndex = raw.model.primaryPartIndex;
  const model: StudioModel = {
    id: modelId,
    name: raw.model.name,
    primaryPartId:
      typeof primaryIndex === "number" &&
      Number.isInteger(primaryIndex) &&
      parts[primaryIndex]
        ? parts[primaryIndex].id
        : parts[0].id,
    attributes: raw.model.attributes ?? {},
    tags: raw.model.tags ?? [],
  };
  validateProject(pmxlProject(model, parts));
  return { model, parts };
}

async function exportProject(project: StudioProject): Promise<string | null> {
  requireAuth();
  const normalized = normalizeProject(project);
  validateProject(normalized);
  const result = await dialog.showSaveDialog({
    title: "Export Polymons Game",
    defaultPath: `${safeFileName(normalized.name)}.poly`,
    filters: [{ name: "Polymons Game", extensions: ["poly"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const path = result.filePath.toLowerCase().endsWith(".poly")
    ? result.filePath
    : `${result.filePath}.poly`;
  const file: PolyGameFile = {
    format: "polymons-game",
    version: 1,
    project: normalized,
  };
  await writeFile(path, JSON.stringify(file, null, 2));
  return path;
}

async function importProject(): Promise<StudioProject | null> {
  requireAuth();
  const result = await dialog.showOpenDialog({
    title: "Import Polymons Game",
    properties: ["openFile"],
    filters: [{ name: "Polymons Game", extensions: ["poly"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = JSON.parse(
    await readFile(result.filePaths[0], "utf8"),
  ) as Partial<PolyGameFile>;
  if (
    file.format !== "polymons-game" ||
    file.version !== 1 ||
    !file.project
  ) {
    throw new Error("This is not a valid Polymons game file.");
  }
  const now = new Date().toISOString();
  const project = normalizeProject({
    ...file.project,
    id: randomUUID(),
    name: `${file.project.name} (Imported)`.slice(0, 64),
    createdAt: now,
    updatedAt: now,
    publication: null,
  });
  validateProject(project);
  await writeProject(project);
  return project;
}

async function exportPma(input: {
  animation: StudioAnimation;
  parts: SceneObject[];
}): Promise<string | null> {
  requireAuth();
  const result = await dialog.showSaveDialog({
    title: "Export Polymons Animation",
    defaultPath: `${safeFileName(input.animation.name)}.pma`,
    filters: [{ name: "Polymons Animation", extensions: ["pma"] }],
  });
  if (result.canceled || !result.filePath) return null;
  const path = result.filePath.toLowerCase().endsWith(".pma")
    ? result.filePath
    : `${result.filePath}.pma`;
  const file: PmaFile = {
    format: "pma",
    version: 1,
    animation: {
      name: input.animation.name,
      duration: input.animation.duration,
      looped: input.animation.looped,
      keyframes: input.animation.keyframes,
    },
    partNames: Object.fromEntries(
      input.parts.map((part) => [part.id, part.name]),
    ),
  };
  await writeFile(path, JSON.stringify(file, null, 2));
  return path;
}

async function importPma(): Promise<PmaFile | null> {
  requireAuth();
  const result = await dialog.showOpenDialog({
    title: "Import Polymons Animation",
    properties: ["openFile"],
    filters: [{ name: "Polymons Animation", extensions: ["pma"] }],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const file = JSON.parse(
    await readFile(result.filePaths[0], "utf8"),
  ) as Partial<PmaFile>;
  if (
    file.format !== "pma" ||
    file.version !== 1 ||
    !file.animation ||
    !file.partNames
  ) {
    throw new Error("This is not a valid Polymons animation file.");
  }
  return file as PmaFile;
}

async function importSound(): Promise<{
  fileName: string;
  dataUrl: string;
  byteLength: number;
} | null> {
  requireAuth();
  const result = await dialog.showOpenDialog({
    title: "Import Sound",
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["mp3", "wav", "ogg", "m4a", "aac", "webm", "flac"],
      },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const path = result.filePaths[0];
  const data = await readFile(path);
  if (data.byteLength > 2 * 1024 * 1024) {
    throw new Error("Sounds must be 2 MB or smaller.");
  }
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const mimeType: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    webm: "audio/webm",
    flac: "audio/flac",
  };
  if (!mimeType[extension]) throw new Error("Unsupported audio format.");
  return {
    fileName: path.split(/[\\/]/).pop() ?? `sound.${extension}`,
    dataUrl: `data:${mimeType[extension]};base64,${data.toString("base64")}`,
    byteLength: data.byteLength,
  };
}

async function importImage(): Promise<{
  fileName: string;
  dataUrl: string;
  byteLength: number;
} | null> {
  requireAuth();
  const result = await dialog.showOpenDialog({
    title: "Import Image",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif"],
      },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  const data = await readFile(filePath);
  if (data.byteLength > 2 * 1024 * 1024) {
    throw new Error("Images must be 2 MB or smaller.");
  }
  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  const mimeType: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  if (!mimeType[extension]) throw new Error("Unsupported image format.");
  return {
    fileName: filePath.split(/[\\/]/).pop() ?? `image.${extension}`,
    dataUrl: `data:${mimeType[extension]};base64,${data.toString("base64")}`,
    byteLength: data.byteLength,
  };
}

async function listProjects(): Promise<ProjectSummary[]> {
  requireAuth();
  await mkdir(projectsRoot(), { recursive: true });
  const entries = await readdir(projectsRoot(), { withFileTypes: true });
  const projects = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          const project = await readProject(entry.name);
          return {
            id: project.id,
            name: project.name,
            language: project.language,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          };
        } catch {
          return null;
        }
      }),
  );
  return projects
    .filter((project): project is ProjectSummary => project !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#07070a",
    autoHideMenuBar: true,
    title: "Poly Studio",
    webPreferences: {
      ...(previewMode ? {} : { preload: join(__dirname, "preload.cjs") }),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadFile(join(__dirname, "../renderer/index.html"), {
    query: previewMode ? { preview: "1" } : undefined,
  });
  if (captureArgument) {
    const captureUi = captureArgument.startsWith("--studio-capture-ui=");
    const capturePath = captureArgument.slice(captureArgument.indexOf("=") + 1);
    window.webContents.once("did-finish-load", () => {
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 700));
        await window.webContents.executeJavaScript(
          `document.querySelector(".project-card")?.click()`,
        );
        await new Promise((resolve) => setTimeout(resolve, 900));
        if (captureUi) {
          await window.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".tree-root-select")).find((button) => button.textContent?.includes("StarterGui"))?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 240, clientY: 320 }))`,
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
          await window.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".insert-context-menu button")).find((button) => button.textContent?.includes("ScreenGui"))?.click()`,
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
          await window.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".tree-item")).find((button) => button.textContent?.includes("ScreenGui"))?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 240, clientY: 350 }))`,
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
          await window.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".insert-context-menu button")).find((button) => button.textContent?.includes("TextButton"))?.click()`,
          );
        } else {
          await window.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".workspace-tabs button")).find((button) => button.textContent?.includes("Script"))?.click()`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        const image = await window.webContents.capturePage();
        await mkdir(dirname(capturePath), { recursive: true });
        await writeFile(capturePath, image.toPNG());
        app.quit();
      })();
    });
  }
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

void app.whenReady().then(async () => {
  auth = previewMode ? null : await loadAuth();
  const updater = previewMode
    ? null
    : registerUpdater({
        assetName: "PolyStudio.exe",
        productName: "Poly Studio",
      });
  if (
    auth &&
    (!Number.isInteger(auth.user.polymonsId) ||
      typeof auth.user.description !== "string" ||
      !auth.session.expiresAt ||
      auth.session.expiresAt * 1000 < Date.now() + 60_000)
  ) {
    await refreshAuth();
  }

  ipcMain.handle("auth:get", () => auth);
  ipcMain.handle(
    "auth:login",
    async (_event, input: { username: string; password: string }) => {
      const next = await apiRequest<StoredAuth>("/v1/accounts/login", {
        method: "POST",
        body: input,
      });
      await saveAuth(next);
      return next;
    },
  );
  ipcMain.handle("auth:logout", async () => saveAuth(null));
  ipcMain.handle("website:open", () => shell.openExternal(WEBSITE_URL));
  ipcMain.handle("projects:list", listProjects);
  ipcMain.handle(
    "projects:create",
    async (
      _event,
      input: {
        name: string;
        language: StudioLanguage;
        template?: "baseplate" | "tutorial";
      },
    ) => {
      requireAuth();
      const name = input.name.trim();
      if (name.length < 1 || name.length > 64) {
        throw new Error("Project names must be 1-64 characters.");
      }
      if (!["luau", "cpp", "csharp"].includes(input.language)) {
        throw new Error("Choose a supported scripting language.");
      }
      const now = new Date().toISOString();
      const project: StudioProject = {
        version: 2,
        id: randomUUID(),
        name,
        description: "",
        language: input.language,
        createdAt: now,
        updatedAt: now,
        objects:
          input.template === "tutorial"
            ? tutorialObjects()
            : starterObjects(),
        models: [],
        remotes: [],
        scripts:
          input.template === "tutorial"
            ? tutorialScripts(input.language)
            : starterScripts(input.language),
        gui:
          input.template === "tutorial"
            ? tutorialGui()
            : [],
        playerSettings: {
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
        lighting: defaultLighting(),
        leaderstats: [
          {
            id: randomUUID(),
            name: "Coins",
            type: "number",
            defaultValue: 0,
          },
        ],
        animations: [],
        badges: [],
        gamePasses: [],
        developerProducts: [],
        values: [],
        publication: null,
        dataStores: {},
      };
      await writeProject(project);
      return project;
    },
  );
  ipcMain.handle(
    "projects:load",
    (_event, input: { id: string }) => readProject(input.id),
  );
  ipcMain.handle("projects:save", async (_event, project: StudioProject) => {
    requireAuth();
    const next = { ...project, updatedAt: new Date().toISOString() };
    await writeProject(next);
    return next;
  });
  ipcMain.handle("projects:snapshot", async (_event, project: StudioProject) => {
    requireAuth();
    const next = { ...project, updatedAt: new Date().toISOString() };
    await writeProject(next, true);
    return next;
  });
  ipcMain.handle(
    "projects:backups",
    (_event, input: { id: string }) => listProjectBackups(input.id),
  );
  ipcMain.handle(
    "projects:restore",
    (_event, input: { id: string; backupId: string }) =>
      restoreProjectBackup(input.id, input.backupId),
  );
  ipcMain.handle(
    "projects:publish",
    async (
      _event,
      input: {
        project: StudioProject;
        metadata: {
          title: string;
          description: string;
          thumbnailData?: string;
        };
      },
    ) => {
    requireAuth();
      const draft = normalizeProject({
        ...input.project,
        name: input.metadata.title.trim(),
        description: input.metadata.description.trim(),
        updatedAt: new Date().toISOString(),
      });
      await writeProject(draft, true);
      const result = await publishProject(draft, input.metadata);
      const next: StudioProject = {
        ...draft,
        publication: {
          gameId: result.game.id,
          slug: result.game.slug,
          version: result.game.version,
          publishedAt: new Date().toISOString(),
        },
      };
      await writeProject(next);
      return { ...result, project: next };
    },
  );
  ipcMain.handle("projects:export", (_event, project: StudioProject) =>
    exportProject(project),
  );
  ipcMain.handle("projects:import", () => importProject());
  ipcMain.handle("projects:reveal", (_event, input: { id: string }) => {
    requireAuth();
    validateProjectId(input.id);
    shell.showItemInFolder(manifestPath(input.id));
  });
  ipcMain.handle("projects:play", async (_event, input: { id: string }) => {
    requireAuth();
    await readProject(input.id);
    const launch = new URL("polymons://studio");
    launch.searchParams.set("project", input.id);
    const player = await findPlayerExecutable();
    if (player) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(player, [`--studio-project=${input.id}`], {
          detached: true,
          stdio: "ignore",
        });
        child.once("spawn", () => {
          child.unref();
          resolve();
        });
        child.once("error", reject);
      });
      return;
    }
    await shell.openExternal(launch.toString());
  });
  ipcMain.handle(
    "models:export",
    (_event, input: { model: StudioModel; parts: SceneObject[] }) =>
      exportPmxl(input),
  );
  ipcMain.handle("models:import", () => importPmxl());
  ipcMain.handle(
    "animations:export",
    (
      _event,
      input: { animation: StudioAnimation; parts: SceneObject[] },
    ) => exportPma(input),
  );
  ipcMain.handle("animations:import", () => importPma());
  ipcMain.handle("sounds:import", () => importSound());
  ipcMain.handle("images:import", () => importImage());

  createWindow();
  if (updater) {
    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.once("did-finish-load", () => {
      setTimeout(updater.checkAutomatically, 1_500);
    });
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
