import { App as NativeApp } from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import {
  POLYMONS_API_URL,
  login as loginAccount,
  refreshSession,
} from "../../src/api";
import { createPreviewProject } from "./previewBridge";

const AUTH_KEY = "poly-studio-mobile-auth-v1";
const DB_NAME = "poly-studio-mobile";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";

const unsupportedUpdate: DesktopUpdateState = {
  status: "unsupported",
  version: null,
  publishedAt: null,
  progress: null,
  message: "Mobile Studio updates are installed through Android packages.",
};

function readAuth(): StudioAuth | null {
  try {
    const value = localStorage.getItem(AUTH_KEY);
    return value ? (JSON.parse(value) as StudioAuth) : null;
  } catch {
    return null;
  }
}

function writeAuth(auth: StudioAuth | null) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
}

function openProjectDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open mobile project storage."));
  });
}

async function projectStoreRequest<T>(
  mode: IDBTransactionMode,
  requestFactory: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openProjectDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(PROJECT_STORE, mode);
    const request = requestFactory(transaction.objectStore(PROJECT_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Mobile project storage failed."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Mobile project storage failed."));
  });
}

function listStoredProjects() {
  return projectStoreRequest<StudioProject[]>("readonly", (store) => store.getAll());
}

function loadStoredProject(id: string) {
  return projectStoreRequest<StudioProject | undefined>("readonly", (store) => store.get(id));
}

function saveStoredProject(project: StudioProject) {
  return projectStoreRequest<IDBValidKey>("readwrite", (store) => store.put(project));
}

function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

function fileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

async function authenticatedRequest<T>(
  path: string,
  body: unknown,
): Promise<T> {
  let auth = readAuth();
  if (!auth) throw new Error("Sign in to publish this game.");
  if (!auth.session.expiresAt || auth.session.expiresAt * 1_000 < Date.now() + 60_000) {
    const renewed = await refreshSession(auth.session.refreshToken);
    auth = renewed as unknown as StudioAuth;
    writeAuth(auth);
  }
  const response = await fetch(`${POLYMONS_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.session.accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result?.error ?? "Polymons could not complete this request.");
  }
  return result;
}

async function publishMobileProject(
  project: StudioProject,
  metadata: { title: string; description: string; thumbnailData?: string },
) {
  const title = metadata.title.trim();
  const description = metadata.description.trim();
  if (!title || title.length > 64) throw new Error("Game names must be 1-64 characters.");
  if (description.length > 2_000) throw new Error("Descriptions must be 2,000 characters or fewer.");
  const result = await authenticatedRequest<{
    game: { id: string; slug: string; title: string; version: number };
  }>("/v1/games/publish", {
    projectId: project.id,
    title,
    description,
    genre: "All",
    thumbnailData: metadata.thumbnailData,
    badges: project.badges,
    gamePasses: project.gamePasses,
    developerProducts: project.developerProducts,
    manifest: { ...project, name: title, description },
  });
  const next: StudioProject = {
    ...project,
    name: title,
    description,
    updatedAt: new Date().toISOString(),
    publication: {
      gameId: result.game.id,
      slug: result.game.slug,
      version: result.game.version,
      publishedAt: new Date().toISOString(),
    },
  };
  await saveStoredProject(next);
  return { ...result, project: next };
}

export async function initializeMobileStudioBridge() {
  document.documentElement.classList.add("poly-studio-mobile");
  await Promise.allSettled([
    StatusBar.setStyle({ style: Style.Light }),
    StatusBar.setBackgroundColor({ color: "#09090d" }),
    StatusBar.setOverlaysWebView({ overlay: false }),
    SplashScreen.hide(),
  ]);

  await NativeApp.addListener("backButton", () => {
    if (document.querySelector(".studio-editor")) {
      window.dispatchEvent(new CustomEvent("poly-studio:mobile-back"));
      return;
    }
    void NativeApp.minimizeApp();
  });

  window.polyStudio = {
    getAuth: async () => readAuth(),
    login: async (username, password) => {
      const auth = (await loginAccount(username, password)) as unknown as StudioAuth;
      writeAuth(auth);
      return auth;
    },
    logout: async () => writeAuth(null),
    openWebsite: async () => {
      window.location.href = "https://pixelsurvivorsdatabase.github.io/Polymons/";
    },
    setPresence: async () => undefined,
    listProjects: async () =>
      (await listStoredProjects())
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ id, name, language, createdAt, updatedAt }) => ({
          id,
          name,
          language,
          createdAt,
          updatedAt,
        })),
    createProject: async ({ name, language }) => {
      const project = createPreviewProject(name.trim(), language);
      await saveStoredProject(project);
      return structuredClone(project);
    },
    loadProject: async (id) => {
      const project = await loadStoredProject(id);
      if (!project) throw new Error("Project not found on this device.");
      return structuredClone(project);
    },
    saveProject: async (project) => {
      const next = { ...structuredClone(project), updatedAt: new Date().toISOString() };
      await saveStoredProject(next);
      return next;
    },
    snapshotProject: async (project) => {
      const next = { ...structuredClone(project), updatedAt: new Date().toISOString() };
      await saveStoredProject(next);
      return next;
    },
    listProjectBackups: async () => [],
    restoreProjectBackup: async (id) => {
      const project = await loadStoredProject(id);
      if (!project) throw new Error("No mobile backup is available.");
      return project;
    },
    publishProject: publishMobileProject,
    exportProject: async (project) => {
      const name = `${project.name.replace(/[^a-z0-9_-]+/gi, "-") || "game"}.poly`;
      downloadJson(name, project);
      return name;
    },
    importProject: async () => {
      const file = await pickFile(".poly,.json,application/json");
      if (!file) return null;
      const project = JSON.parse(await file.text()) as StudioProject;
      if (!project?.id || !Array.isArray(project.objects)) throw new Error("That is not a Poly Studio game file.");
      await saveStoredProject(project);
      return project;
    },
    revealProject: async () => undefined,
    playProject: async () => {
      throw new Error("Mobile playtesting is being connected next. Save and publish to test in Polymons Player for now.");
    },
    exportModel: async ({ model, parts }) => {
      const name = `${model.name.replace(/[^a-z0-9_-]+/gi, "-") || "model"}.pmxl`;
      downloadJson(name, { format: "pmxl", version: 1, model, parts });
      return name;
    },
    importModel: async () => {
      const file = await pickFile(".pmxl,.json,application/json");
      if (!file) return null;
      const value = JSON.parse(await file.text()) as { model?: StudioModel; parts?: StudioObject[] };
      if (!value.model || !Array.isArray(value.parts)) throw new Error("That is not a PMXL model.");
      return { model: value.model, parts: value.parts };
    },
    exportAnimation: async ({ animation, parts }) => {
      const name = `${animation.name.replace(/[^a-z0-9_-]+/gi, "-") || "animation"}.pma`;
      downloadJson(name, { format: "pma", version: 1, animation, parts });
      return name;
    },
    importAnimation: async () => null,
    importSound: async () => {
      const file = await pickFile("audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg");
      return file
        ? { fileName: file.name, dataUrl: await fileDataUrl(file), byteLength: file.size }
        : null;
    },
    importImage: async () => {
      const file = await pickFile("image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp");
      return file
        ? { fileName: file.name, dataUrl: await fileDataUrl(file), byteLength: file.size }
        : null;
    },
    completeCode: async () => ({ suggestion: "", source: "unavailable" }),
    getUpdateState: async () => unsupportedUpdate,
    checkForUpdates: async () => unsupportedUpdate,
    installUpdate: async () => unsupportedUpdate,
    onUpdateState: () => () => undefined,
  };
}
