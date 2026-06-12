import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
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

const API_URL = "https://polymons-server.onrender.com";
const WEBSITE_URL = "https://pixelsurvivorsdatabase.github.io/Polymons/";
const __dirname = dirname(fileURLToPath(import.meta.url));

type StudioLanguage = "luau" | "cpp" | "csharp";

type StudioUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
  type: "baseplate" | "spawn" | "part" | "tool" | "handle" | "humanoidRootPart";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  anchored: boolean;
  visible?: boolean;
  transparency: number;
  material: "plastic" | "metal" | "wood" | "neon";
  canCollide: boolean;
  castShadow: boolean;
  friction?: number;
  restitution?: number;
  mass?: number;
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
  type: "screenGui" | "frame" | "textLabel" | "textButton";
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
};

type StudioProject = {
  version: 2;
  id: string;
  name: string;
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
    maxHealth: number;
  };
  dataStores: Record<string, Record<string, string | number | boolean | null>>;
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
    language: manifest.language,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
    objects: manifest.objects.map((object) => ({
      ...object,
      visible: true,
      transparency: 0,
      material: "plastic",
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
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
      maxHealth: 100,
    },
    dataStores: {},
  };
}

function normalizeProject(project: StudioProject): StudioProject {
  return {
    ...project,
    objects: project.objects.map((object) => ({
      ...object,
      visible: object.visible ?? true,
      transparency: object.transparency ?? 0,
      material: object.material ?? "plastic",
      canCollide: object.canCollide ?? true,
      castShadow: object.castShadow ?? true,
      friction: object.friction ?? 0.82,
      restitution: object.restitution ?? 0.03,
      mass: object.mass ?? 1,
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
    gui: project.gui.map((gui) => ({
      ...gui,
      rotation: gui.rotation ?? 0,
      textSize: gui.textSize ?? 16,
      borderRadius: gui.borderRadius ?? 7,
      zIndex: gui.zIndex ?? 1,
    })),
    playerSettings: {
      health: project.playerSettings.health ?? project.playerSettings.maxHealth ?? 100,
      walkSpeed: project.playerSettings.walkSpeed ?? 18,
      jumpPower: project.playerSettings.jumpPower ?? 10.5,
      cameraFieldOfView: project.playerSettings.cameraFieldOfView ?? 52,
      maxHealth: project.playerSettings.maxHealth ?? 100,
    },
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
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
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
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
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
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      parentId: null,
      modelId: null,
      attributes: {},
      tags: [],
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

async function publishProject(project: StudioProject): Promise<{
  game: { id: string; slug: string; title: string; version: number };
}> {
  validateProject(project);
  let current = requireAuth();
  const request = (accessToken: string) =>
    apiRequest<{
      game: { id: string; slug: string; title: string; version: number };
    }>("/v1/games/publish", {
      method: "POST",
      accessToken,
      body: {
        projectId: project.id,
        title: project.name,
        description: `Created in Poly Studio by ${current.user.displayName}.`,
        genre: "All",
        manifest: project,
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
  return request(current.session.accessToken);
}

async function refreshAuth(): Promise<StoredAuth | null> {
  if (!auth?.session.refreshToken) return null;
  try {
    const next = await apiRequest<StoredAuth>("/v1/accounts/refresh", {
      method: "POST",
      body: { refreshToken: auth.session.refreshToken },
    });
    await saveAuth(next);
    return next;
  } catch {
    await saveAuth(null);
    return null;
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
      !["baseplate", "spawn", "part", "tool", "handle", "humanoidRootPart"].includes(object.type) ||
      !Array.isArray(object.position) ||
      !Array.isArray(object.rotation) ||
      !Array.isArray(object.scale) ||
      object.position.length !== 3 ||
      object.rotation.length !== 3 ||
      object.scale.length !== 3 ||
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
      !["screenGui", "frame", "textLabel", "textButton"].includes(gui.type) ||
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
  if (
    !project.playerSettings ||
    !Number.isFinite(project.playerSettings.health) ||
    !Number.isFinite(project.playerSettings.walkSpeed) ||
    !Number.isFinite(project.playerSettings.jumpPower) ||
    !Number.isFinite(project.playerSettings.cameraFieldOfView) ||
    !Number.isFinite(project.playerSettings.maxHealth)
  ) {
    throw new Error("Invalid LocalPlayer settings.");
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

async function writeProject(project: StudioProject): Promise<void> {
  requireAuth();
  validateProject(project);
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
      maxHealth: 100,
    },
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
        color: part.color,
        anchored: part.anchored,
        visible: part.visible,
        transparency: part.transparency,
        material: part.material,
        canCollide: part.canCollide,
        castShadow: part.castShadow,
        friction: part.friction,
        restitution: part.restitution,
        mass: part.mass,
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
      !["part", "tool", "handle", "humanoidRootPart"].includes(part.type),
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
      color: part.color,
      anchored: part.anchored,
      visible: part.visible,
      transparency: part.transparency,
      material: part.material,
      canCollide: part.canCollide,
      castShadow: part.castShadow,
      friction: part.friction ?? 0.82,
      restitution: part.restitution ?? 0.03,
      mass: part.mass ?? 1,
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
  if (
    auth &&
    (!auth.session.expiresAt ||
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
      input: { name: string; language: StudioLanguage },
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
        language: input.language,
        createdAt: now,
        updatedAt: now,
        objects: starterObjects(),
        models: [],
        remotes: [],
        scripts: starterScripts(input.language),
        gui: [],
        playerSettings: {
          health: 100,
          walkSpeed: 18,
          jumpPower: 10.5,
          cameraFieldOfView: 52,
          maxHealth: 100,
        },
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
  ipcMain.handle("projects:publish", async (_event, project: StudioProject) => {
    requireAuth();
    const next = { ...project, updatedAt: new Date().toISOString() };
    await writeProject(next);
    return publishProject(next);
  });
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
        const child = spawn(player, [launch.toString()], {
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

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
