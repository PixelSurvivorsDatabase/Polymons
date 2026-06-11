function createStarterScript(language: StudioLanguage): string {
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

function createPreviewProject(
  name: string,
  language: StudioLanguage,
): StudioProject {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name,
    language,
    createdAt: now,
    updatedAt: now,
    script: createStarterScript(language),
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
      },
    ],
  };
}

const isPreview =
  location.protocol.startsWith("http") &&
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
      [...projects.values()].map(
        ({ script: _script, objects: _objects, ...project }) => {
          void _script;
          void _objects;
          return project;
        },
      ),
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
  };
}
