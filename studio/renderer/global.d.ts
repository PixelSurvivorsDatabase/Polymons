type StudioLanguage = "luau" | "cpp" | "csharp";

type StudioSettings = {
  autoSuggestEnabled: boolean;
  polyCodeTrainingEnabled: boolean;
};

type StudioUser = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  tix: number;
  avatarUrl: string | null;
  equippedShirtId:
    | "polymon-shirt"
    | "beta-tester-shirt"
    | "creators-shirt"
    | "orange-polymons-shirt"
    | "polymons-varsity-jacket"
    | null;
  equippedPantsId:
    | "classic-denim-pants"
    | "polymon-pants"
    | "beta-tester-pants"
    | "creators-pants"
    | "orange-polymons-pants"
    | "polymons-varsity-pants"
    | null;
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
  type:
    | "baseplate"
    | "spawn"
    | "part"
    | "tool"
    | "handle"
    | "humanoidRootPart"
    | "sound";
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  shape?: "block" | "sphere" | "cylinder" | "stud";
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
  velocity?: [number, number, number];
  angularVelocity?: [number, number, number];
  soundData?: string;
  soundFileName?: string;
  volume?: number;
  looped?: boolean;
  playbackSpeed?: number;
  rolloffMinDistance?: number;
  rolloffMaxDistance?: number;
  autoplay?: boolean;
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

type StudioValueObject = {
  id: string;
  name: string;
  type: "boolValue" | "numberValue" | "stringValue";
  parent: string;
  value: string | number | boolean;
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
    cameraMinZoomDistance: number;
    cameraMaxZoomDistance: number;
    maxHealth: number;
    sprintEnabled: boolean;
    sprintMultiplier: number;
  };
  lighting: {
    clockTime: number;
    brightness: number;
    ambient: string;
    outdoorAmbient: string;
    skyColor: string;
    fogColor: string;
    fogStart: number;
    fogEnd: number;
    globalShadows: boolean;
    shadowSoftness: number;
    dayNightCycle: boolean;
    dayLengthMinutes: number;
    sunEnabled: boolean;
    moonEnabled: boolean;
    sunTextureData: string;
    moonTextureData: string;
    sunBrightness: number;
    sunGlare: number;
    sunRays: boolean;
    moonBrightness: number;
    moonPhases: boolean;
    moonPhase: number;
  };
  leaderstats: Array<{
    id: string;
    name: string;
    type: "number" | "string";
    defaultValue: number | string;
    showOnLeaderboard?: boolean;
  }>;
  animations: StudioAnimation[];
  badges: Array<{
    id: string;
    name: string;
    description: string;
    iconData: string;
  }>;
  gamePasses: Array<{
    id: string;
    name: string;
    description: string;
    priceTix: number;
  }>;
  developerProducts: Array<{
    id: string;
    name: string;
    description: string;
    priceTix: number;
    effectKey: string | null;
    effectAmount: number;
  }>;
  values: StudioValueObject[];
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

type DesktopUpdateState = {
  status:
    | "unsupported"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "installing"
    | "error";
  version: string | null;
  publishedAt: string | null;
  progress: number | null;
  message: string;
};

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
    snapshotProject: (project: StudioProject) => Promise<StudioProject>;
    listProjectBackups: (
      id: string,
    ) => Promise<Array<{ id: string; name: string; savedAt: string }>>;
    restoreProjectBackup: (
      id: string,
      backupId: string,
    ) => Promise<StudioProject>;
    publishProject: (
      project: StudioProject,
      metadata: {
        title: string;
        description: string;
        thumbnailData?: string;
      },
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
    importSound: () => Promise<{
      fileName: string;
      dataUrl: string;
      byteLength: number;
    } | null>;
    importImage: () => Promise<{
      fileName: string;
      dataUrl: string;
      byteLength: number;
    } | null>;
    completeCode: (input: {
      language: StudioLanguage;
      prompt: string;
      tokens?: number;
      model?: "polycode-13m" | "polycode-28m";
    }) => Promise<{
      suggestion: string;
      source: "polycode" | "unavailable";
    }>;
    getUpdateState: () => Promise<DesktopUpdateState>;
    checkForUpdates: () => Promise<DesktopUpdateState>;
    installUpdate: () => Promise<DesktopUpdateState>;
    onUpdateState: (
      callback: (state: DesktopUpdateState) => void,
    ) => () => void;
  };
}
