function createStarterScript(
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
    return kind === "script"
      ? `#include <poly/server.hpp>

auto part = Workspace.Find("Part");
part.Color = "#6F49BB";
`
      : `#include <poly/client.hpp>

auto player = Players::LocalPlayer;
player.WalkSpeed = 18;
`;
  }
  if (language === "csharp") {
    if (kind === "moduleScript") {
      return `using Poly;

Module.Export("WalkSpeed", 22);
Module.Export("Accent", "#6F49BB");
`;
    }
    return kind === "script"
      ? `using Poly;

var part = Workspace.Find("Part");
part.Color = "#6F49BB";
`
      : `using Poly;

var player = Players.LocalPlayer;
player.WalkSpeed = 18;
`;
  }
  if (kind === "moduleScript") {
    return `return {
    WalkSpeed = 22,
    Accent = "#6F49BB",
}
`;
  }
  return kind === "script"
    ? `local part = Workspace:FindFirstChild("Part")

part.Color = "#6F49BB"
`
    : `local player = Players.LocalPlayer

player.WalkSpeed = 18
`;
}

function createPreviewProject(
  name: string,
  language: StudioLanguage,
): StudioProject {
  const now = new Date().toISOString();
  return {
    version: 2,
    id: crypto.randomUUID(),
    name,
    description: "",
    language,
    createdAt: now,
    updatedAt: now,
    objects: [
      {
        id: crypto.randomUUID(),
        name: "Baseplate",
        type: "baseplate",
        position: [0, -0.5, 0],
        rotation: [0, 0, 0],
        scale: [40, 1, 40],
        shape: "block",
        color: "#405946",
        anchored: true,
        visible: true,
        transparency: 0,
        material: "plastic",
        surfaceTexture: "grass",
        canCollide: true,
        castShadow: true,
        modelId: null,
        attributes: {},
        tags: [],
      },
      {
        id: crypto.randomUUID(),
        name: "Spawn",
        type: "spawn",
        position: [0, 0.15, 5],
        rotation: [0, 0, 0],
        scale: [4, 0.3, 4],
        shape: "block",
        color: "#5b3d91",
        anchored: true,
        visible: true,
        transparency: 0,
        material: "neon",
        surfaceTexture: "none",
        canCollide: true,
        castShadow: true,
        modelId: null,
        attributes: {},
        tags: [],
      },
      {
        id: crypto.randomUUID(),
        name: "Part",
        type: "part",
        position: [0, 2, 0],
        rotation: [0, 0, 0],
        scale: [4, 4, 4],
        shape: "block",
        color: "#342856",
        anchored: true,
        visible: true,
        transparency: 0,
        material: "plastic",
        surfaceTexture: "brick",
        canCollide: true,
        castShadow: true,
        modelId: null,
        attributes: {},
        tags: [],
      },
    ],
    models: [],
    remotes: [],
    scripts: [
      {
        id: crypto.randomUUID(),
        name: "Main",
        kind: "script",
        parent: "ServerScriptService",
        source: createStarterScript(language, "script"),
      },
      {
        id: crypto.randomUUID(),
        name: "Client",
        kind: "localScript",
        parent: "StarterPlayerScripts",
        source: createStarterScript(language, "localScript"),
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
    lighting: {
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
    },
    leaderstats: [
      {
        id: crypto.randomUUID(),
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
}

const isPreview =
  new URLSearchParams(location.search).has("preview");

if (isPreview && !window.polyStudio) {
  const previewUpdateState: DesktopUpdateState =
    new URLSearchParams(location.search).get("update") === "ready"
      ? {
          status: "ready",
          version: "preview",
          publishedAt: new Date().toISOString(),
          progress: 1,
          message: "Update downloaded. Restart when you are ready.",
        }
      : {
          status: "unsupported",
          version: null,
          publishedAt: null,
          progress: null,
          message: "Updates are unavailable in preview mode.",
        };
  const previewAuth: StudioAuth = {
    user: {
      id: "preview-user",
      polymonsId: 2,
      username: "lava",
      displayName: "lava",
      description: "",
      tix: 840,
      avatarUrl: null,
      equippedShirtId: "polymon-shirt",
      equippedPantsId: "classic-denim-pants",
      avatarAppearance: {
        face: "classic-smile",
        bodyColors: {
          head: "#e7bd91",
          torso: "#7650d8",
          leftArm: "#e7bd91",
          rightArm: "#e7bd91",
          leftLeg: "#313542",
          rightLeg: "#313542",
        },
        accessories: [],
      },
    },
    session: {
      accessToken: "preview",
      refreshToken: "preview",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      expiresIn: 3600,
      tokenType: "bearer",
    },
  };
  const projects = new Map<string, StudioProject>();
  const starter = createPreviewProject("Baseplate", "luau");
  projects.set(starter.id, starter);

  window.polyStudio = {
    getAuth: async () => previewAuth,
    login: async () => previewAuth,
    logout: async () => undefined,
    openWebsite: async () => undefined,
    listProjects: async () =>
      [...projects.values()].map((project) => ({
        id: project.id,
        name: project.name,
        language: project.language,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
    createProject: async ({ name, language }) => {
      const project = createPreviewProject(name.trim(), language);
      projects.set(project.id, project);
      return structuredClone(project);
    },
    loadProject: async (id) => {
      const project = projects.get(id);
      if (!project) throw new Error("Project not found.");
      return structuredClone(project);
    },
    saveProject: async (project) => {
      const next = {
        ...structuredClone(project),
        updatedAt: new Date().toISOString(),
      };
      projects.set(next.id, next);
      return next;
    },
    snapshotProject: async (project) => {
      const next = {
        ...structuredClone(project),
        updatedAt: new Date().toISOString(),
      };
      projects.set(next.id, next);
      return next;
    },
    listProjectBackups: async () => [],
    restoreProjectBackup: async (id) => {
      const project = projects.get(id);
      if (!project) throw new Error("Project not found.");
      return structuredClone(project);
    },
    publishProject: async (project, metadata) => {
      const next = {
        ...project,
        name: metadata.title,
        description: metadata.description,
        publication: {
          gameId: project.id,
          slug: metadata.title.toLowerCase().replace(/\s+/g, "-"),
          version: (project.publication?.version ?? 0) + 1,
          publishedAt: new Date().toISOString(),
        },
      };
      projects.set(next.id, next);
      return {
        game: {
        id: project.id,
          slug: next.publication.slug,
          title: next.name,
          version: next.publication.version,
        },
        project: next,
      };
    },
    exportProject: async () => "preview.poly",
    importProject: async () => null,
    revealProject: async () => undefined,
    playProject: async () => undefined,
    exportModel: async () => "preview.pmxl",
    importModel: async () => null,
    exportAnimation: async () => "preview.pma",
    importAnimation: async () => null,
    importSound: async () => null,
    importImage: async () => null,
    completeCode: async () => ({ suggestion: "", source: "unavailable" }),
    getUpdateState: async () => previewUpdateState,
    checkForUpdates: async () => previewUpdateState,
    installUpdate: async () => previewUpdateState,
    onUpdateState: () => () => undefined,
  };
}
