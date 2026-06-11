import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
const __dirname = dirname(fileURLToPath(import.meta.url));

type PlayerUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
  game: string;
  websocketUrl: string;
};

let mainWindow: BrowserWindow | null = null;
let pendingLaunch: LaunchRequest | null = null;
let auth: StoredAuth | null = null;

function sessionPath(): string {
  return join(app.getPath("userData"), "session.bin");
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

function parseLaunch(value: string): LaunchRequest | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "polymons:" || url.hostname !== "play") return null;
    const websocketUrl = url.searchParams.get("ws");
    const game = url.searchParams.get("game") ?? "baseplate";
    if (!websocketUrl || !websocketUrl.startsWith("wss://")) return null;
    return { game, websocketUrl };
  } catch {
    return null;
  }
}

function findLaunch(args: string[]): LaunchRequest | null {
  for (const arg of args) {
    if (arg.startsWith("polymons://")) {
      const launch = parseLaunch(arg);
      if (launch) return launch;
    }
  }
  return null;
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

function registerProtocol(): void {
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
    execFile("reg.exe", args, () => undefined);
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
    const launch = findLaunch(argv);
    if (launch) sendLaunch(launch);
  });

  void app.whenReady().then(async () => {
    registerProtocol();
    auth = await loadAuth();
    const initialLaunch = findLaunch(process.argv);
    if (initialLaunch) pendingLaunch = initialLaunch;

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
    ipcMain.handle("launch:get", () => pendingLaunch);
    ipcMain.handle("game:play", async (_event, input: { gameId: string }) => {
      if (!auth) throw new Error("Sign in to play.");
      try {
        return await apiRequest<{ playSession: { websocketUrl: string } }>(
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
        return apiRequest<{ playSession: { websocketUrl: string } }>(
          "/v1/play-sessions",
          {
            method: "POST",
            accessToken: renewed.session.accessToken,
            body: input,
          },
        );
      }
    });
    createWindow();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
