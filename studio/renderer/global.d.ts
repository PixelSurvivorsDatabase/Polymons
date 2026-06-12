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
  visible?: boolean;
  transparency: number;
  material: "plastic" | "metal" | "wood" | "neon";
  canCollide: boolean;
  castShadow: boolean;
  modelId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  tags: string[];
};

type StudioModel = {
  id: string;
  name: string;
  primaryPartId: string | null;
  attributes: Record<string, string | number | boolean | null>;
  tags: string[];
};

type StudioRemote = {
  id: string;
  name: string;
  kind: "remoteEvent" | "remoteFunction";
};

type StudioScript = {
  id: string;
  name: string;
  kind: "script" | "localScript" | "moduleScript";
  parent: "ServerScriptService" | "StarterPlayerScripts" | string;
  source: string;
};

type StudioGuiObject = {
  id: string;
  name: string;
  type: "screenGui" | "frame" | "textLabel" | "textButton";
  parentId: string | null;
  position: [number, number];
  size: [number, number];
  backgroundColor: string;
  backgroundTransparency: number;
  text: string;
  textColor: string;
  visible: boolean;
  rotation: number;
  textSize: number;
  borderRadius: number;
  zIndex: number;
};

type StudioProject = {
  version: 2;
  id: string;
  name: string;
  language: StudioLanguage;
  createdAt: string;
  updatedAt: string;
  objects: StudioObject[];
  models: StudioModel[];
  remotes: StudioRemote[];
  scripts: StudioScript[];
  gui: StudioGuiObject[];
  playerSettings: {
    walkSpeed: number;
    jumpPower: number;
    cameraFieldOfView: number;
    maxHealth: number;
  };
  dataStores: Record<string, Record<string, string | number | boolean | null>>;
};

type ProjectSummary = Pick<
  StudioProject,
  "id" | "name" | "language" | "createdAt" | "updatedAt"
>;

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
    playProject: (id: string) => Promise<void>;
    exportModel: (input: {
      model: StudioModel;
      parts: StudioObject[];
    }) => Promise<string | null>;
    importModel: () => Promise<{
      model: StudioModel;
      parts: StudioObject[];
    } | null>;
  };
}
