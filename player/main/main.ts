import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
} from "electron";
import { registerUpdater } from "./updater.js";

const API_URL = "https://polymons-server.onrender.com";
const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

type PlayerUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  equippedShirtId:
    | "polymon-shirt"
    | "beta-tester-shirt"
    | "creators-shirt"
    | null;
};

type PlayerSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  expiresIn: number;
  tokenType: string;
};

type StoredAuth = {
  user: PlayerUser;
  session: PlayerSession;
};

type LaunchRequest = {
  mode: "online";
  game: string;
  websocketUrl: string;
} | {
  mode: "studio";
  projectId: string;
};

type ProtocolRequest = {
  accountTicket: string | null;
  launch: LaunchRequest | null;
};

let mainWindow: BrowserWindow | null = null;
let pendingLaunch: LaunchRequest | null = null;
let auth: StoredAuth | null = null;
const captureArgument = !app.isPackaged
  ? process.argv.find((argument) =>
      argument.startsWith("--player-capture-studio="),
    )
  : undefined;

function sessionPath(): string {
  return join(app.getPath("userData"), "session.bin");
}

function projectsRoot(): string {
  if (!app.isPackaged && process.env.POLY_STUDIO_PROJECTS_ROOT) {
    return process.env.POLY_STUDIO_PROJECTS_ROOT;
  }
  return join(app.getPath("documents"), "Poly Studio Projects");
}

function validateProjectId(id: string): void {
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    throw new Error("Invalid Studio project.");
  }
}

function projectDataPath(id: string): string {
  validateProjectId(id);
  return join(projectsRoot(), id, "data-stores.json");
}

function validateDataStores(value: unknown): asserts value is Record<
  string,
  Record<string, string | number | boolean | null>
> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid project data stores.");
  }
  const stores = Object.entries(value);
  if (stores.length > 100) throw new Error("Too many project data stores.");
  for (const [storeName, store] of stores) {
    if (
      storeName.length < 1 ||
      storeName.length > 64 ||
      !store ||
      typeof store !== "object" ||
      Array.isArray(store)
    ) {
      throw new Error("Invalid project data store.");
    }
    const entries = Object.entries(store);
    if (entries.length > 5_000) throw new Error("Project data store is too large.");
    for (const [key, entry] of entries) {
      if (
        key.length < 1 ||
        key.length > 128 ||
        !(
          entry === null ||
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean"
        )
      ) {
        throw new Error("Invalid project data entry.");
      }
    }
  }
}

async function loadStudioProject(id: string): Promise<unknown> {
  validateProjectId(id);
  const path = join(projectsRoot(), id, "project.poly.json");
  const project = JSON.parse(await readFile(path, "utf8")) as {
    id?: unknown;
    version?: unknown;
    dataStores?: unknown;
  };
  if (project.id !== id || project.version !== 2) {
    throw new Error("This Studio project needs to be opened and saved again.");
  }
  const persisted = await readFile(projectDataPath(id), "utf8")
    .then((value) => JSON.parse(value) as unknown)
    .catch(() => null);
  if (persisted) {
    validateDataStores(persisted);
    project.dataStores = persisted;
  }
  return project;
}

async function saveStudioDataStores(
  id: string,
  dataStores: unknown,
): Promise<void> {
  validateProjectId(id);
  validateDataStores(dataStores);
  const serialized = JSON.stringify(dataStores, null, 2);
  if (Buffer.byteLength(serialized, "utf8") > 2_000_000) {
    throw new Error("Project data stores exceed the local size limit.");
  }
  await writeFile(projectDataPath(id), serialized);
}

async function loadAuth(): Promise<StoredAuth | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await readFile(sessionPath());
    return JSON.parse(
      safeStorage.decryptString(encrypted),
    ) as StoredAuth;
  } catch {
    return null;
  }
}

async function saveAuth(next: StoredAuth | null): Promise<void> {
  auth = next;
  if (!safeStorage.isEncryptionAvailable()) return;
  await mkdir(app.getPath("userData"), { recursive: true });
  const value = next ? JSON.stringify(next) : "";
  await writeFile(sessionPath(), safeStorage.encryptString(value));
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
    throw new Error(result?.error ?? "Polymons could not complete the request.");
  }
  return result as T;
}

async function refreshAuth(): Promise<StoredAuth | null> {
  if (!auth) return null;
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

function parseProtocolRequest(value: string): ProtocolRequest | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "polymons:" ||
      !["account", "play", "studio"].includes(url.hostname)
    ) {
      return null;
    }
    const accountTicket = url.searchParams.get("link");
    if (accountTicket && accountTicket.length > 256) return null;
    if (url.hostname === "account") {
      return accountTicket ? { accountTicket, launch: null } : null;
    }
    if (url.hostname === "studio") {
      const projectId = url.searchParams.get("project");
      if (!projectId || !/^[a-f0-9-]{36}$/i.test(projectId)) return null;
      return {
        accountTicket: null,
        launch: { mode: "studio", projectId },
      };
    }

    const websocketUrl = url.searchParams.get("ws");
    const game = url.searchParams.get("game") ?? "baseplate";
    if (!websocketUrl || !websocketUrl.startsWith("wss://")) return null;
    return {
      accountTicket,
      launch: { mode: "online", game, websocketUrl },
    };
  } catch {
    return null;
  }
}

function findProtocolRequest(args: string[]): ProtocolRequest | null {
  for (const arg of args) {
    if (arg.startsWith("--studio-project=")) {
      const projectId = arg.slice("--studio-project=".length);
      if (/^[a-f0-9-]{36}$/i.test(projectId)) {
        return {
          accountTicket: null,
          launch: { mode: "studio", projectId },
        };
      }
    }
    if (arg.startsWith("polymons://")) {
      const request = parseProtocolRequest(arg);
      if (request) return request;
    }
  }
  return null;
}

async function redeemAccountLink(ticket: string): Promise<StoredAuth> {
  const next = await apiRequest<StoredAuth>(
    "/v1/player-account-links/redeem",
    {
      method: "POST",
      body: { ticket },
    },
  );
  await saveAuth(next);
  return next;
}

function sendLaunch(launch: LaunchRequest): void {
  pendingLaunch = launch;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("launch:open", launch);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

async function handleProtocolRequest(
  request: ProtocolRequest,
): Promise<void> {
  try {
    if (request.accountTicket) {
      const next = await redeemAccountLink(request.accountTicket);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("auth:changed", next);
      }
    }
    if (request.launch) sendLaunch(request.launch);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  } catch (error) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(
        "protocol:error",
        error instanceof Error
          ? error.message
          : "Could not connect the website account.",
      );
      mainWindow.show();
      mainWindow.focus();
    }
  }
}

async function registerProtocol(): Promise<void> {
  if (process.platform !== "win32" || !app.isPackaged) return;
  const executable = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath;
  const key = "HKCU\\Software\\Classes\\polymons";
  const commands = [
    ["ADD", key, "/ve", "/d", "URL:Polymons Player", "/f"],
    ["ADD", key, "/v", "URL Protocol", "/d", "", "/f"],
    [
      "ADD",
      `${key}\\shell\\open\\command`,
      "/ve",
      "/d",
      `"${executable}" "%1"`,
      "/f",
    ],
  ];
  for (const args of commands) {
    await execFileAsync("reg.exe", args);
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#0c0b12",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  if (captureArgument) {
    const capturePath = captureArgument.slice(
      "--player-capture-studio=".length,
    );
    mainWindow.webContents.once("did-finish-load", () => {
      void (async () => {
        await new Promise((resolve) => setTimeout(resolve, 3_500));
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const image = await mainWindow.webContents.capturePage();
        await mkdir(dirname(capturePath), { recursive: true });
        await writeFile(capturePath, image.toPNG());
        app.quit();
      })();
    });
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const request = findProtocolRequest(argv);
    if (request) void handleProtocolRequest(request);
  });

  void app.whenReady().then(async () => {
    try {
      await registerProtocol();
    } catch (error) {
      console.error("Could not register the Polymons protocol.", error);
    }
    auth = await loadAuth();
    const initialRequest = findProtocolRequest(process.argv);
    if (initialRequest?.accountTicket) {
      try {
        await redeemAccountLink(initialRequest.accountTicket);
      } catch {
        // The renderer reports a useful error after it opens.
      }
    }
    if (initialRequest?.launch) pendingLaunch = initialRequest.launch;

    const updater = registerUpdater({
      assetName: "PolymonsPlayer.exe",
      productName: "Polymons Player",
    });
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
    ipcMain.handle(
      "auth:signup",
      async (
        _event,
        input: {
          username: string;
          password: string;
          displayName?: string;
        },
      ) => {
        const next = await apiRequest<StoredAuth>("/v1/accounts/signup", {
          method: "POST",
          body: input,
        });
        await saveAuth(next);
        return next;
      },
    );
    ipcMain.handle("auth:logout", async () => {
      await saveAuth(null);
    });
    ipcMain.handle("games:list", () => apiRequest("/v1/games"));
    ipcMain.handle("friends:list", async () => {
      if (!auth) throw new Error("Sign in to view friends.");
      const request = (accessToken: string) =>
        apiRequest("/v1/friends", { accessToken });
      try {
        return await request(auth.session.accessToken);
      } catch {
        const renewed = await refreshAuth();
        if (!renewed) throw new Error("Sign in again to view friends.");
        return request(renewed.session.accessToken);
      }
    });
    ipcMain.handle("launch:get", () => pendingLaunch);
    ipcMain.handle(
      "studio:project",
      (_event, input: { id: string }) => loadStudioProject(input.id),
    );
    ipcMain.handle(
      "studio:save-data",
      (_event, input: { id: string; dataStores: unknown }) =>
        saveStudioDataStores(input.id, input.dataStores),
    );
    ipcMain.handle("game:play", async (_event, input: { gameId: string }) => {
      if (!auth) throw new Error("Sign in to play.");
      try {
        return await apiRequest<{
          playSession: {
            game: { id: string; slug: string; title: string };
            websocketUrl: string;
          };
        }>(
          "/v1/play-sessions",
          {
            method: "POST",
            accessToken: auth.session.accessToken,
            body: input,
          },
        );
      } catch {
        const renewed = await refreshAuth();
        if (!renewed) throw new Error("Sign in again to play.");
        return apiRequest<{
          playSession: {
            game: { id: string; slug: string; title: string };
            websocketUrl: string;
          };
        }>(
          "/v1/play-sessions",
          {
            method: "POST",
            accessToken: renewed.session.accessToken,
            body: input,
          },
        );
      }
    });
    ipcMain.handle("game:get", (_event, input: { gameId: string }) =>
      apiRequest(`/v1/games/${encodeURIComponent(input.gameId)}`),
    );
    ipcMain.handle(
      "friends:request",
      async (_event, input: { username: string }) => {
        if (!auth) throw new Error("Sign in to send a friend request.");
        if (
          !auth.session.expiresAt ||
          auth.session.expiresAt * 1000 < Date.now() + 60_000
        ) {
          const renewed = await refreshAuth();
          if (!renewed) throw new Error("Sign in again to send a friend request.");
        }
        const send = (accessToken: string) =>
          apiRequest("/v1/friends/request", {
            method: "POST",
            accessToken,
            body: input,
          });
        return send(auth!.session.accessToken);
      },
    );
    createWindow();
    mainWindow?.webContents.once("did-finish-load", () => {
      setTimeout(updater.checkAutomatically, 1_500);
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
