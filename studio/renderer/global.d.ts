type StudioLanguage = "luau" | "cpp" | "csharp";

type StudioUser = {
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
  type: "baseplate" | "spawn" | "part" | "tool" | "handle" | "humanoidRootPart";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  anchored: boolean;
  visible?: boolean;
  transparency: number;
  material: "plastic" | "metal" | "wood" | "neon";
  surfaceTexture:
    | "none"
    | "brick"
    | "wood"
    | "concrete"
    | "grass"
    | "fabric"
    | "marble";
  canCollide: boolean;
  castShadow: boolean;
  friction?: number;
  restitution?: number;
  mass?: number;
  parentId?: string | null;
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
  type:
    | "screenGui"
    | "frame"
    | "textLabel"
    | "textButton"
    | "textBox"
    | "imageLabel"
    | "imageButton"
    | "scrollingFrame";
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
  anchorPoint: [number, number];
  clipDescendants: boolean;
  locked: boolean;
  imageUrl: string;
  placeholder: string;
  canvasSize: [number, number];
};

type StudioAnimation = {
  id: string;
  name: string;
  rigModelId: string | null;
  duration: number;
  looped: boolean;
  keyframes: Array<{
    time: number;
    poses: Record<
      string,
      {
        position?: [number, number, number];
        rotation?: [number, number, number];
      }
    >;
  }>;
};

type StudioProject = {
  version: 2;
  id: string;
  name: string;
  description: string;
  language: StudioLanguage;
  createdAt: string;
  updatedAt: string;
  objects: StudioObject[];
  models: StudioModel[];
  remotes: StudioRemote[];
  scripts: StudioScript[];
  gui: StudioGuiObject[];
  playerSettings: {
    health: number;
    walkSpeed: number;
    jumpPower: number;
    cameraFieldOfView: number;
    maxHealth: number;
    sprintEnabled: boolean;
    sprintMultiplier: number;
  };
  leaderstats: Array<{
    id: string;
    name: string;
    type: "number" | "string";
    defaultValue: number | string;
  }>;
  animations: StudioAnimation[];
  publication: {
    gameId: string;
    slug: string;
    version: number;
    publishedAt: string;
  } | null;
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
      template?: "baseplate" | "tutorial";
    }) => Promise<StudioProject>;
    loadProject: (id: string) => Promise<StudioProject>;
    saveProject: (project: StudioProject) => Promise<StudioProject>;
    publishProject: (
      project: StudioProject,
      metadata: { title: string; description: string },
    ) => Promise<{
      game: { id: string; slug: string; title: string; version: number };
      project: StudioProject;
    }>;
    exportProject: (project: StudioProject) => Promise<string | null>;
    importProject: () => Promise<StudioProject | null>;
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
    exportAnimation: (input: {
      animation: StudioAnimation;
      parts: StudioObject[];
    }) => Promise<string | null>;
    importAnimation: () => Promise<{
      format: "pma";
      version: 1;
      animation: Omit<StudioAnimation, "id" | "rigModelId">;
      partNames: Record<string, string>;
    } | null>;
  };
}
