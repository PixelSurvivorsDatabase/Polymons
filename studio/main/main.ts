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
  type: "baseplate" | "spawn" | "part";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  anchored: boolean;
  visible?: boolean;
};

type StudioScript = {
  id: string;
  name: string;
  kind: "script" | "localScript";
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
};

type StudioProject = {
  version: 2;
  id: string;
  name: string;
  language: StudioLanguage;
  createdAt: string;
  updatedAt: string;
  objects: SceneObject[];
  scripts: StudioScript[];
  gui: StudioGuiObject[];
  playerSettings: {
    walkSpeed: number;
    jumpPower: number;
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
  const folder =
    script.parent === "ServerScriptService"
      ? "ServerScriptService"
      : script.parent === "StarterPlayerScripts"
        ? "StarterPlayerScripts"
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
    objects: manifest.objects.map((object) => ({ ...object, visible: true })),
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
    playerSettings: { walkSpeed: 18, jumpPower: 10.5 },
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
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : {},
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
      !["baseplate", "spawn", "part"].includes(object.type) ||
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
      (object.visible !== undefined && typeof object.visible !== "boolean")
    ) {
      throw new Error("Invalid project object.");
    }
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
      !["script", "localScript"].includes(script.kind) ||
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
    ) {
      throw new Error("Invalid GUI object.");
    }
  }
  if (
    !project.playerSettings ||
    !Number.isFinite(project.playerSettings.walkSpeed) ||
    !Number.isFinite(project.playerSettings.jumpPower)
  ) {
    throw new Error("Invalid LocalPlayer settings.");
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
    project = manifest;
  } else {
    const source = await readFile(sourcePath(id, manifest.language), "utf8").catch(
      () => "",
    );
    project = migrateLegacyProject(manifest, source);
    await writeProject(project);
  }
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
            `Array.from(document.querySelectorAll(".insert-group button")).find((button) => button.textContent?.includes("ScreenGui"))?.click()`,
          );
          await new Promise((resolve) => setTimeout(resolve, 250));
          await window.webContents.executeJavaScript(
            `Array.from(document.querySelectorAll(".insert-group button")).find((button) => button.textContent?.includes("Button"))?.click()`,
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
        scripts: starterScripts(input.language),
        gui: [],
        playerSettings: { walkSpeed: 18, jumpPower: 10.5 },
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

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
