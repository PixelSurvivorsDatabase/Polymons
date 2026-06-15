import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
} from "electron";

const API_URL = "https://polymons-server.onrender.com";
const __dirname = dirname(fileURLToPath(import.meta.url));

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type AdminSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  expiresIn: number;
  tokenType: string;
};

type StoredAuth = {
  user: AdminUser;
  session: AdminSession;
};

let auth: StoredAuth | null = null;

app.setName("Poly Admin");

function sessionPath(): string {
  return join(app.getPath("userData"), "owner-session.bin");
}

async function loadAuth(): Promise<StoredAuth | null> {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const encrypted = await readFile(sessionPath());
    return JSON.parse(safeStorage.decryptString(encrypted)) as StoredAuth;
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
    throw new Error(result?.error ?? "Poly Admin could not complete the request.");
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

async function ownerRequest<T>(path: string): Promise<T> {
  if (!auth) throw new Error("Sign in with the Polymons owner account.");
  const request = (accessToken: string) =>
    apiRequest<T>(path, { accessToken });
  try {
    return await request(auth.session.accessToken);
  } catch (error) {
    const renewed = await refreshAuth();
    if (!renewed) throw error;
    return request(renewed.session.accessToken);
  }
}

async function ownerPost<T>(path: string, body: unknown): Promise<T> {
  if (!auth) throw new Error("Sign in with the Polymons owner account.");
  const request = (accessToken: string) =>
    apiRequest<T>(path, { method: "POST", body, accessToken });
  try {
    return await request(auth.session.accessToken);
  } catch (error) {
    const renewed = await refreshAuth();
    if (!renewed) throw error;
    return request(renewed.session.accessToken);
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#08080b",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void window.loadFile(join(__dirname, "../renderer/index.html"));
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  void app.whenReady().then(async () => {
    auth = await loadAuth();

    ipcMain.handle("auth:get", () => auth);
    ipcMain.handle(
      "auth:login",
      async (_event, input: { username: string; password: string }) => {
        const next = await apiRequest<StoredAuth>("/v1/accounts/login", {
          method: "POST",
          body: input,
        });
        await apiRequest("/v1/admin/accounts?page=1&perPage=10", {
          accessToken: next.session.accessToken,
        });
        await saveAuth(next);
        return next;
      },
    );
    ipcMain.handle("auth:logout", async () => {
      await saveAuth(null);
    });
    ipcMain.handle(
      "accounts:list",
      (_event, input: { page: number; perPage: number }) => {
        const page = Math.max(1, Math.floor(input.page));
        const perPage = Math.min(200, Math.max(10, Math.floor(input.perPage)));
        return ownerRequest(
          `/v1/admin/accounts?page=${page}&perPage=${perPage}`,
        );
      },
    );
    ipcMain.handle(
      "accounts:inventory",
      (
        _event,
        input: {
          userId: string;
          itemId: string;
          owned: boolean;
          equip?: boolean;
        },
      ) =>
        ownerPost(
          `/v1/admin/accounts/${encodeURIComponent(input.userId)}/inventory`,
          {
            itemId: input.itemId,
            owned: input.owned,
            equip: input.equip,
          },
        ),
    );
    ipcMain.handle(
      "accounts:tix",
      (
        _event,
        input: {
          userId: string;
          mode: "add" | "set";
          amount: number;
        },
      ) =>
        ownerPost(
          `/v1/admin/accounts/${encodeURIComponent(input.userId)}/tix`,
          {
            mode: input.mode,
            amount: input.amount,
          },
        ),
    );
    ipcMain.handle("catalog:list", () =>
      ownerRequest("/v1/admin/catalog-submissions"),
    );
    ipcMain.handle(
      "catalog:review",
      (
        _event,
        input: {
          itemId: string;
          status: "approved" | "rejected";
          reason?: string;
        },
      ) =>
        ownerPost(
          `/v1/admin/catalog-submissions/${encodeURIComponent(input.itemId)}/review`,
          {
            status: input.status,
            reason: input.reason ?? "",
          },
        ),
    );

    createWindow();
  });

  app.on("window-all-closed", () => app.quit());
}
