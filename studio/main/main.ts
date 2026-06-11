import { randomUUID } from "node:crypto";
import {
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
};

type StudioProject = {
  id: string;
  name: string;
  language: StudioLanguage;
  createdAt: string;
  updatedAt: string;
  script: string;
  objects: SceneObject[];
};

type ProjectSummary = Omit<StudioProject, "script" | "objects">;

let auth: StoredAuth | null = null;

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

function sourceExtension(language: StudioLanguage): string {
  if (language === "cpp") return "cpp";
  if (language === "csharp") return "cs";
  return "luau";
}

function sourcePath(id: string, language: StudioLanguage): string {
  return join(projectDirectory(id), "src", `Main.${sourceExtension(language)}`);
}

function starterScript(language: StudioLanguage): string {
  if (language === "cpp") {
    return `#include <poly/studio.hpp>

void onStart(poly::Game& game) {
    game.log("Hello from Poly Studio");
}
`;
  }
  if (language === "csharp") {
    return `using Poly;

public class Main : GameScript
{
    public override void OnStart()
    {
        Log("Hello from Poly Studio");
    }
}
`;
  }
  return `local game = require("@poly/game")

game:onStart(function()
    print("Hello from Poly Studio")
end)
`;
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
  if (typeof project.script !== "string" || project.script.length > 2_000_000) {
    throw new Error("Invalid project script.");
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
      typeof object.anchored !== "boolean"
    ) {
      throw new Error("Invalid project object.");
    }
  }
}

async function readProject(id: string): Promise<StudioProject> {
  requireAuth();
  const manifest = JSON.parse(
    await readFile(manifestPath(id), "utf8"),
  ) as Omit<StudioProject, "script">;
  const script = await readFile(sourcePath(id, manifest.language), "utf8");
  const project = { ...manifest, script };
  validateProject(project);
  return project;
}

async function writeProject(project: StudioProject): Promise<void> {
  requireAuth();
  validateProject(project);
  const directory = projectDirectory(project.id);
  await mkdir(join(directory, "src"), { recursive: true });
  const { script, ...manifest } = project;
  await Promise.all([
    writeFile(manifestPath(project.id), JSON.stringify(manifest, null, 2)),
    writeFile(sourcePath(project.id, project.language), script),
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
          const { script: _script, objects: _objects, ...summary } = project;
          void _script;
          void _objects;
          return summary;
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
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadFile(join(__dirname, "../renderer/index.html"));
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

void app.whenReady().then(async () => {
  auth = await loadAuth();
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
        id: randomUUID(),
        name,
        language: input.language,
        createdAt: now,
        updatedAt: now,
        script: starterScript(input.language),
        objects: starterObjects(),
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

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
