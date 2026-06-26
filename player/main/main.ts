import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  safeStorage,
  shell,
} from "electron";
import {
  DiscordPresenceClient,
  type PolymonsPresence,
} from "./discordPresence.js";
import { registerUpdater } from "./updater.js";

const API_URL = "https://polymons-server.onrender.com";
const __dirname = dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

type PlayerUser = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  tix: number;
  avatarUrl: string | null;
  equippedShirtId: string | null;
  equippedPantsId: string | null;
  equippedHairId?: string | null;
  equippedHatId?: string | null;
  equippedShirtTextureUrl: string | null;
  equippedPantsTextureUrl: string | null;
  equippedHairModelUrl?: string | null;
  equippedHairModelFormat?: string | null;
  equippedHatModelUrl?: string | null;
  equippedHatModelFormat?: string | null;
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
  spawn?: [number, number, number];
  rotationY?: number;
};

type ProtocolRequest = {
  accountTicket: string | null;
  launch: LaunchRequest | null;
};

let mainWindow: BrowserWindow | null = null;
let pendingLaunch: LaunchRequest | null = null;
let auth: StoredAuth | null = null;
let startupComplete = false;
let queuedProtocolRequest: ProtocolRequest | null = null;
const discordPresence = new DiscordPresenceClient();
const captureArgument = !app.isPackaged
  ? process.argv.find((argument) =>
      argument.startsWith("--player-capture-studio="),
    )
  : undefined;

function sessionPath(): string {
  return join(app.getPath("userData"), "session.bin");
}

function macUntestedNoticePath(): string {
  return join(app.getPath("userData"), "mac-untested-notice-v1.txt");
}

async function showMacUntestedNoticeOnce(window: BrowserWindow): Promise<void> {
  if (process.platform !== "darwin" || !app.isPackaged) return;
  const markerPath = macUntestedNoticePath();
  try {
    await readFile(markerPath);
    return;
  } catch {
    // Missing marker means this user has not seen the note yet.
  }
  await dialog.showMessageBox(window, {
    type: "warning",
    buttons: ["I understand"],
    defaultId: 0,
    title: "Note from lava",
    message: "Note from lava",
    detail:
      "This macOS version of Polymons Player may be extremely buggy because it is still untested. Please watch for bugs and report them when you see them.",
    noLink: true,
  });
  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(markerPath, new Date().toISOString(), "utf8");
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

async function authenticatedApiRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<T> {
  if (!auth) throw new Error("Sign in to continue.");
  try {
    return await apiRequest<T>(path, {
      ...options,
      accessToken: auth.session.accessToken,
    });
  } catch {
    const renewed = await refreshAuth();
    if (!renewed) throw new Error("Sign in again to continue.");
    return apiRequest<T>(path, {
      ...options,
      accessToken: renewed.session.accessToken,
    });
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
      const spawn = parseStudioSpawn(url.searchParams.get("spawn"));
      const rotationY = parseStudioYaw(url.searchParams.get("yaw"));
      return {
        accountTicket: null,
        launch: {
          mode: "studio",
          projectId,
          ...(spawn ? { spawn } : {}),
          ...(rotationY !== undefined ? { rotationY } : {}),
        },
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

function mergeProtocolRequests(
  current: ProtocolRequest | null,
  next: ProtocolRequest | null,
): ProtocolRequest | null {
  if (!current) return next;
  if (!next) return current;
  return {
    accountTicket: next.accountTicket ?? current.accountTicket,
    launch: next.launch ?? current.launch,
  };
}

function dispatchProtocolRequest(request: ProtocolRequest): void {
  if (!startupComplete) {
    queuedProtocolRequest = mergeProtocolRequests(
      queuedProtocolRequest,
      request,
    );
    return;
  }
  void handleProtocolRequest(request);
}

function parseStudioSpawn(value: string | null): [number, number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((part) => Number(part));
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isFinite(part) || Math.abs(part) > 100_000)
  ) {
    return undefined;
  }
  return [parts[0], parts[1], parts[2]];
}

function parseStudioYaw(value: string | null): number | undefined {
  if (!value) return undefined;
  const yaw = Number(value);
  return Number.isFinite(yaw) ? yaw : undefined;
}

function findProtocolRequest(args: string[]): ProtocolRequest | null {
  const studioSpawn = parseStudioSpawn(
    args
      .find((arg) => arg.startsWith("--studio-spawn="))
      ?.slice("--studio-spawn=".length) ?? null,
  );
  const studioYaw = parseStudioYaw(
    args
      .find((arg) => arg.startsWith("--studio-yaw="))
      ?.slice("--studio-yaw=".length) ?? null,
  );
  for (const arg of args) {
    if (arg.startsWith("--studio-project=")) {
      const projectId = arg.slice("--studio-project=".length);
      if (/^[a-f0-9-]{36}$/i.test(projectId)) {
        return {
          accountTicket: null,
          launch: {
            mode: "studio",
            projectId,
            ...(studioSpawn ? { spawn: studioSpawn } : {}),
            ...(studioYaw !== undefined ? { rotationY: studioYaw } : {}),
          },
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
  if (!app.isPackaged) return;
  if (process.platform === "darwin") {
    app.setAsDefaultProtocolClient("polymons");
    return;
  }
  if (process.platform !== "win32") return;
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
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      (input.control || (process.platform === "darwin" && input.meta)) &&
      ["W", "A", "S", "D", "R"].includes(input.key.toUpperCase())
    ) {
      event.preventDefault();
    }
  });
  void mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  mainWindow.webContents.once("did-finish-load", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void showMacUntestedNoticeOnce(mainWindow).catch((error) => {
      console.error("Could not show macOS first-run notice.", error);
    });
  });
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
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on("open-url", (event, url) => {
    event.preventDefault();
    const request = parseProtocolRequest(url);
    if (request) dispatchProtocolRequest(request);
  });

  app.on("second-instance", (_event, argv) => {
    const request = findProtocolRequest(argv);
    if (request) dispatchProtocolRequest(request);
  });

  void app.whenReady().then(async () => {
    try {
      await registerProtocol();
    } catch (error) {
      console.error("Could not register the Polymons protocol.", error);
    }
    auth = await loadAuth();
    if (auth) {
      await refreshAuth();
    }
    const initialRequest = findProtocolRequest(process.argv);

    const updater = registerUpdater({
      assetName: {
        win32: "PolymonsPlayer.exe",
        darwin: "PolymonsPlayer-mac-${arch}.dmg",
      },
      productName: "Polymons Player",
    });
    discordPresence.setPresence({
      kind: "idle",
      details: "Browsing games",
      state: "In Polymons Player",
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
    ipcMain.handle("games:library", () =>
      authenticatedApiRequest("/v1/games/library"),
    );
    ipcMain.handle("servers:friends", () =>
      authenticatedApiRequest("/v1/servers/friends"),
    );
    ipcMain.handle("servers:game", (_event, input: { gameId: string }) =>
      apiRequest(`/v1/games/${encodeURIComponent(input.gameId)}/servers`),
    );
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
      "presence:set",
      (_event, input: PolymonsPresence) => {
        if (!input || typeof input !== "object") return;
        if (input.kind === "playing" && typeof input.gameTitle === "string") {
          discordPresence.setPresence({
            kind: "playing",
            gameTitle: input.gameTitle.slice(0, 128),
            playerCount:
              typeof input.playerCount === "number" &&
              Number.isFinite(input.playerCount)
                ? Math.max(0, Math.floor(input.playerCount))
                : undefined,
            gameUrl:
              typeof input.gameUrl === "string" &&
              input.gameUrl.startsWith("https://")
                ? input.gameUrl.slice(0, 256)
                : undefined,
          });
          return;
        }
        if (
          input.kind === "studio-test" &&
          typeof input.projectName === "string"
        ) {
          discordPresence.setPresence({
            kind: "studio-test",
            projectName: input.projectName.slice(0, 128),
          });
          return;
        }
        if (input.kind === "idle") {
          discordPresence.setPresence({
            kind: "idle",
            details:
              typeof input.details === "string"
                ? input.details.slice(0, 128)
                : undefined,
            state:
              typeof input.state === "string"
                ? input.state.slice(0, 128)
                : undefined,
          });
        }
      },
    );
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
      "badges:award",
      (_event, input: { gameId: string; badgeName: string }) =>
        authenticatedApiRequest(
          `/v1/games/${encodeURIComponent(input.gameId)}/badges/award`,
          {
            method: "POST",
            body: { badgeName: input.badgeName },
          },
        ),
    );
    ipcMain.handle(
      "game:entitlements",
      (_event, input: { gameId: string }) =>
        authenticatedApiRequest(
          `/v1/games/${encodeURIComponent(input.gameId)}/entitlements`,
        ),
    );
    ipcMain.handle(
      "gamepasses:purchase",
      (_event, input: { gameId: string; passId: string }) =>
        authenticatedApiRequest(
          `/v1/games/${encodeURIComponent(input.gameId)}/gamepasses/${encodeURIComponent(input.passId)}/purchase`,
          { method: "POST" },
        ),
    );
    ipcMain.handle(
      "products:purchase",
      (_event, input: { gameId: string; productId: string }) =>
        authenticatedApiRequest(
          `/v1/games/${encodeURIComponent(input.gameId)}/products/${encodeURIComponent(input.productId)}/purchase`,
          { method: "POST" },
        ),
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
    startupComplete = true;
    const startupRequest = mergeProtocolRequests(
      initialRequest,
      queuedProtocolRequest,
    );
    queuedProtocolRequest = null;
    if (startupRequest) await handleProtocolRequest(startupRequest);
  });
}

app.on("activate", () => {
  if (startupComplete && BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  discordPresence.destroy();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
