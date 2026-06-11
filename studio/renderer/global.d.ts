type StudioLanguage = "luau" | "cpp" | "csharp";

type StudioUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type StudioAuth = {
  user: StudioUser;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
    expiresIn: number;
    tokenType: string;
  };
};

type StudioObject = {
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
  objects: StudioObject[];
};

type ProjectSummary = Omit<StudioProject, "script" | "objects">;

interface Window {
  polyStudio: {
    getAuth: () => Promise<StudioAuth | null>;
    login: (username: string, password: string) => Promise<StudioAuth>;
    logout: () => Promise<void>;
    openWebsite: () => Promise<void>;
    listProjects: () => Promise<ProjectSummary[]>;
    createProject: (input: {
      name: string;
      language: StudioLanguage;
    }) => Promise<StudioProject>;
    loadProject: (id: string) => Promise<StudioProject>;
    saveProject: (project: StudioProject) => Promise<StudioProject>;
    revealProject: (id: string) => Promise<void>;
  };
}
