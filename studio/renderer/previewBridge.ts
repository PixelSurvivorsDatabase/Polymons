function createStarterScript(
  language: StudioLanguage,
  kind: StudioScript["kind"],
): string {
  if (language === "cpp") {
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
        color: "#405946",
        anchored: true,
        visible: true,
      },
      {
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
        name: "Part",
        type: "part",
        position: [0, 2, 0],
        rotation: [0, 0, 0],
        scale: [4, 4, 4],
        color: "#342856",
        anchored: true,
        visible: true,
      },
    ],
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
    playerSettings: { walkSpeed: 18, jumpPower: 10.5 },
  };
}

const isPreview =
  new URLSearchParams(location.search).has("preview");

if (isPreview && !window.polyStudio) {
  const previewAuth: StudioAuth = {
    user: {
      id: "preview-user",
      username: "lava",
      displayName: "lava",
      avatarUrl: null,
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
    revealProject: async () => undefined,
    playProject: async () => undefined,
  };
}
