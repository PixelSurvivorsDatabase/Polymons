export type PolyLanguage = "luau" | "cpp" | "csharp";
export type PolyScriptKind = "script" | "localScript" | "moduleScript";
export type PolyScriptParent =
  | "ServerScriptService"
  | "StarterPlayerScripts"
  | string;

export type PolyWorldObject = {
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
  attributes: Record<string, PolyStoredValue>;
  tags: string[];
};

export type PolyModel = {
  id: string;
  name: string;
  primaryPartId: string | null;
  attributes: Record<string, PolyStoredValue>;
  tags: string[];
};

export type PolyRemote = {
  id: string;
  name: string;
  kind: "remoteEvent" | "remoteFunction";
};

export type PolyGuiObject = {
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

export type PolyScript = {
  id: string;
  name: string;
  kind: PolyScriptKind;
  parent: PolyScriptParent;
  source: string;
};

export type PolyPlayerSettings = {
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

export type PolyLeaderstat = {
  id: string;
  name: string;
  type: "number" | "string";
  defaultValue: number | string;
};

export type PolyAnimationPose = {
  position?: [number, number, number];
  rotation?: [number, number, number];
};

export type PolyAnimation = {
  id: string;
  name: string;
  rigModelId: string | null;
  duration: number;
  looped: boolean;
  keyframes: Array<{
    time: number;
    poses: Record<string, PolyAnimationPose>;
  }>;
};

export type PolyStoredValue = string | number | boolean | null;

export type PolyProject = {
  version: 2;
  id: string;
  name: string;
  description: string;
  language: PolyLanguage;
  createdAt: string;
  updatedAt: string;
  objects: PolyWorldObject[];
  models: PolyModel[];
  remotes: PolyRemote[];
  scripts: PolyScript[];
  gui: PolyGuiObject[];
  playerSettings: PolyPlayerSettings;
  leaderstats: PolyLeaderstat[];
  animations: PolyAnimation[];
  publication?: {
    gameId: string;
    slug: string;
    version: number;
    publishedAt: string;
  } | null;
  dataStores: Record<string, Record<string, PolyStoredValue>>;
};

export type PolyDiagnostic = {
  line: number;
  column: number;
  endColumn: number;
  severity: "error" | "warning";
  message: string;
};

export type PolyRuntimeResult = {
  project: PolyProject;
  diagnostics: Array<PolyDiagnostic & { scriptId: string; scriptName: string }>;
  output: Array<{
    level: "info" | "warning" | "error";
    message: string;
    scriptName: string;
  }>;
  animationRequests: string[];
  animationVersion: number;
  tweenRequests: PolyTweenRequest[];
  tweenVersion: number;
  soundRequests: PolySoundRequest[];
  soundVersion: number;
};

export type PolySoundRequest = {
  id: string;
  objectId: string;
  action: "play" | "pause" | "stop";
};

export type PolyTweenRequest = {
  id: string;
  objectId: string;
  duration: number;
  easingStyle: "Linear" | "Quad" | "Cubic";
  easingDirection: "In" | "Out" | "InOut";
  from: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    transparency: number;
    color: string;
  };
  to: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    transparency: number;
    color: string;
  };
};

type Reference =
  | { kind: "world"; id: string }
  | { kind: "gui"; id: string }
  | { kind: "player"; id: "LocalPlayer" }
  | { kind: "remote"; id: string };

const WORLD_PROPERTIES = new Set([
  "Name",
  "Position",
  "Rotation",
  "Size",
  "Color",
  "Anchored",
  "Visible",
  "Transparency",
  "Material",
  "Texture",
  "CanCollide",
  "CastShadow",
  "Friction",
  "Restitution",
  "Mass",
  "Velocity",
  "Volume",
  "Looped",
  "PlaybackSpeed",
  "RollOffMinDistance",
  "RollOffMaxDistance",
  "Autoplay",
]);
const GUI_PROPERTIES = new Set([
  "Name",
  "Position",
  "Size",
  "BackgroundColor",
  "BackgroundTransparency",
  "Text",
  "TextColor",
  "Visible",
  "Rotation",
  "TextSize",
  "BorderRadius",
  "ZIndex",
  "AnchorPoint",
  "ClipDescendants",
  "Locked",
  "Image",
  "Placeholder",
  "CanvasSize",
]);
const PLAYER_PROPERTIES = new Set([
  "Health",
  "WalkSpeed",
  "JumpPower",
  "CameraFieldOfView",
  "CameraMinZoomDistance",
  "CameraMaxZoomDistance",
  "MaxHealth",
  "SprintEnabled",
  "SprintMultiplier",
]);

const SERVER_SCRIPT_PARENTS = new Set(["Workspace", "ServerScriptService"]);
const LOCAL_SCRIPT_PARENTS = new Set(["StarterPlayerScripts", "StarterGui"]);
const MODULE_SCRIPT_PARENTS = new Set([
  "ReplicatedStorage",
  "ServerScriptService",
  "ServerStorage",
  "StarterPlayerScripts",
  "StarterGui",
]);

function cloneProject(project: PolyProject): PolyProject {
  return structuredClone(project);
}

export function normalizePolyProject(project: PolyProject): PolyProject {
  const normalized = cloneProject(project);
  normalized.objects = normalized.objects.map((object) => ({
    ...object,
    visible: object.visible ?? true,
    transparency: object.transparency ?? 0,
    material: object.material ?? "plastic",
    surfaceTexture: object.surfaceTexture ?? "none",
    canCollide: object.canCollide ?? true,
    castShadow: object.castShadow ?? true,
    friction: object.friction ?? 0.82,
    restitution: object.restitution ?? 0.03,
    mass: object.mass ?? 1,
    velocity: object.velocity ?? [0, 0, 0],
    soundData: object.soundData ?? "",
    soundFileName: object.soundFileName ?? "",
    volume: Math.max(0, Math.min(1, object.volume ?? 0.7)),
    looped: object.looped ?? false,
    playbackSpeed: Math.max(0.25, Math.min(4, object.playbackSpeed ?? 1)),
    rolloffMinDistance: Math.max(0.1, object.rolloffMinDistance ?? 5),
    rolloffMaxDistance: Math.max(
      Math.max(0.1, object.rolloffMinDistance ?? 5),
      object.rolloffMaxDistance ?? 60,
    ),
    autoplay: object.autoplay ?? false,
    parentId: object.parentId ?? null,
    modelId: object.modelId ?? null,
    attributes: object.attributes ?? {},
    tags: object.tags ?? [],
  }));
  normalized.models = (normalized.models ?? []).map((model) => ({
    ...model,
    primaryPartId: model.primaryPartId ?? null,
    attributes: model.attributes ?? {},
    tags: model.tags ?? [],
  }));
  normalized.remotes ??= [];
  normalized.gui = normalized.gui.map((gui) => ({
    ...gui,
    rotation: gui.rotation ?? 0,
    textSize: gui.textSize ?? 16,
    borderRadius: gui.borderRadius ?? 7,
    zIndex: gui.zIndex ?? 1,
    anchorPoint: gui.anchorPoint ?? [0, 0],
    clipDescendants: gui.clipDescendants ?? true,
    locked: gui.locked ?? false,
    imageUrl: gui.imageUrl ?? "",
    placeholder: gui.placeholder ?? "",
    canvasSize: gui.canvasSize ?? [1, 1],
  }));
  normalized.playerSettings = {
    health:
      normalized.playerSettings?.health ??
      normalized.playerSettings?.maxHealth ??
      100,
    walkSpeed: normalized.playerSettings?.walkSpeed ?? 18,
    jumpPower: normalized.playerSettings?.jumpPower ?? 10.5,
    cameraFieldOfView:
      normalized.playerSettings?.cameraFieldOfView ?? 55,
    cameraMinZoomDistance: Math.max(
      1,
      Math.min(200, normalized.playerSettings?.cameraMinZoomDistance ?? 10),
    ),
    cameraMaxZoomDistance: Math.max(
      Math.max(
        1,
        Math.min(200, normalized.playerSettings?.cameraMinZoomDistance ?? 10),
      ),
      Math.min(200, normalized.playerSettings?.cameraMaxZoomDistance ?? 80),
    ),
    maxHealth: normalized.playerSettings?.maxHealth ?? 100,
    sprintEnabled: normalized.playerSettings?.sprintEnabled ?? true,
    sprintMultiplier: normalized.playerSettings?.sprintMultiplier ?? 1.5,
  };
  normalized.description ??= "";
  normalized.leaderstats = (normalized.leaderstats ?? []).map((stat) => ({
    ...stat,
    type: stat.type === "string" ? "string" : "number",
    defaultValue:
      stat.type === "string"
        ? String(stat.defaultValue ?? "")
        : Number.isFinite(Number(stat.defaultValue))
          ? Number(stat.defaultValue)
          : 0,
  }));
  normalized.animations = (normalized.animations ?? []).map((animation) => ({
    ...animation,
    rigModelId: animation.rigModelId ?? null,
    duration: Math.max(0.05, Number(animation.duration) || 1),
    looped: animation.looped ?? false,
    keyframes: (animation.keyframes ?? [])
      .map((keyframe) => ({
        time: Math.max(0, Number(keyframe.time) || 0),
        poses: keyframe.poses ?? {},
      }))
      .sort((a, b) => a.time - b.time),
  }));
  normalized.publication ??= null;
  normalized.dataStores ??= {};
  return normalized;
}

function lineDiagnostic(
  line: number,
  source: string,
  message: string,
  severity: PolyDiagnostic["severity"] = "error",
): PolyDiagnostic {
  const first = Math.max(0, source.search(/\S/));
  return {
    line,
    column: first + 1,
    endColumn: Math.max(first + 2, source.length + 1),
    severity,
    message,
  };
}

function referenceByName(
  project: PolyProject,
  container: "Workspace" | "PlayerGui" | "ReplicatedStorage",
  name: string,
): Reference | null {
  if (container === "Workspace") {
    const object = project.objects.find((item) => item.name === name);
    return object ? { kind: "world", id: object.id } : null;
  }
  if (container === "PlayerGui") {
    const gui = project.gui.find((item) => item.name === name);
    return gui ? { kind: "gui", id: gui.id } : null;
  }
  const remote = project.remotes.find((item) => item.name === name);
  return remote ? { kind: "remote", id: remote.id } : null;
}

function findReferenceDeclaration(
  source: string,
  project: PolyProject,
  script?: PolyScript,
): { variable: string; reference: Reference | null; requestedName: string } | null {
  const scriptParentMatch = source.match(
    /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*(?:script|Script)\.Parent\s*;?/,
  );
  if (scriptParentMatch && script) {
    const worldParent = project.objects.find(
      (item) => item.id === script.parent,
    );
    return {
      variable: scriptParentMatch[1],
      reference: worldParent
        ? { kind: "world", id: worldParent.id }
        : project.gui.some((item) => item.id === script.parent)
          ? { kind: "gui", id: script.parent }
          : null,
      requestedName: "script.Parent",
    };
  }

  const objectMatch =
    source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*(Workspace|workspace|PlayerGui|ReplicatedStorage)(?::FindFirstChild|\.Find)\(\s*["']([^"']+)["']\s*\)\s*;?/,
    ) ??
    source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*(Workspace|workspace|PlayerGui|ReplicatedStorage)\.([A-Za-z_]\w*)\s*;?/,
    );
  if (objectMatch) {
    const container =
      objectMatch[2].toLowerCase() === "workspace"
        ? "Workspace"
        : objectMatch[2] === "PlayerGui"
          ? "PlayerGui"
          : "ReplicatedStorage";
    return {
      variable: objectMatch[1],
      reference: referenceByName(project, container, objectMatch[3]),
      requestedName: objectMatch[3],
    };
  }

  const playerMatch = source.match(
    /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*Players(?:\.|::)LocalPlayer\s*;?/,
  );
  if (playerMatch) {
    return {
      variable: playerMatch[1],
      reference: { kind: "player", id: "LocalPlayer" },
      requestedName: "LocalPlayer",
    };
  }
  return null;
}

function findDirectReference(
  expression: string,
  project: PolyProject,
  script?: PolyScript,
): Reference | null {
  if (
    /^(?:script|Script)\.Parent$/.test(expression) &&
    script
  ) {
    if (project.objects.some((item) => item.id === script.parent)) {
      return { kind: "world", id: script.parent };
    }
    if (project.gui.some((item) => item.id === script.parent)) {
      return { kind: "gui", id: script.parent };
    }
  }
  const direct = expression.match(
    /^(Workspace|workspace|PlayerGui|ReplicatedStorage)\.([A-Za-z_]\w*)$/,
  );
  if (direct) {
    return referenceByName(
      project,
      direct[1].toLowerCase() === "workspace"
        ? "Workspace"
        : direct[1] === "PlayerGui"
          ? "PlayerGui"
          : "ReplicatedStorage",
      direct[2],
    );
  }
  if (/^Players(?:\.|::)LocalPlayer$/.test(expression)) {
    return { kind: "player", id: "LocalPlayer" };
  }
  return null;
}

type ScriptEventHandler = {
  event: "MouseButton1Click" | "Activated" | "Touched" | "TouchEnded";
  target: string;
  parameters: string[];
  prelude: string;
  body: string;
  line: number;
  closed: boolean;
  startIndex: number;
  endIndex: number;
};

type RemoteHandler = {
  side: "server" | "client";
  kind: "event" | "function";
  target: string;
  parameters: string[];
  prelude: string;
  body: string;
  line: number;
  closed: boolean;
  startIndex: number;
  endIndex: number;
};

type InputScriptHandler = {
  event: "InputBegan" | "InputEnded";
  parameters: string[];
  prelude: string;
  body: string;
  keyCode: string | null;
  line: number;
  closed: boolean;
  startIndex: number;
  endIndex: number;
};

function parameterNames(source: string): string[] {
  return source
    .split(",")
    .map((parameter) => parameter.trim())
    .filter(Boolean)
    .map((parameter) => parameter.match(/([A-Za-z_]\w*)\s*$/)?.[1] ?? "")
    .filter(Boolean);
}

function callbackEndIndex(
  lines: string[],
  startIndex: number,
  syntax: "luau" | "brace",
  endPattern: RegExp,
): { endIndex: number; closed: boolean } {
  if (syntax === "luau") {
    let nestedBlocks = 0;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const line = lines[index].trim();
      if (
        /^(?:local\s+)?function\b/.test(line) ||
        /^if\b.*\bthen\s*$/.test(line) ||
        /^(?:for|while)\b.*\bdo\s*$/.test(line) ||
        /^repeat\b/.test(line)
      ) {
        nestedBlocks += 1;
      }
      if (/^end\b/.test(line) || /^until\b/.test(line)) {
        if (nestedBlocks > 0) {
          nestedBlocks -= 1;
          continue;
        }
      }
      if (nestedBlocks === 0 && endPattern.test(lines[index])) {
        return { endIndex: index, closed: true };
      }
    }
    return { endIndex: lines.length - 1, closed: false };
  }

  let depth = 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    depth += (lines[index].match(/\{/g) ?? []).length;
    depth -= (lines[index].match(/\}/g) ?? []).length;
    if (index > startIndex && depth <= 0 && endPattern.test(lines[index])) {
      return { endIndex: index, closed: true };
    }
  }
  return { endIndex: lines.length - 1, closed: false };
}

function remoteHandlers(script: PolyScript): RemoteHandler[] {
  const lines = script.source.split("\n");
  const handlers: RemoteHandler[] = [];
  const target = String.raw`([A-Za-z_]\w*|ReplicatedStorage\.[A-Za-z_]\w*)`;
  const patterns = [
    {
      side: "server" as const,
      kind: "event" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnServerEvent\s*:\s*Connect\s*\(\s*function\s*\(([^)]*)\)\s*$`,
      ),
      end: /^\s*end\s*\)\s*;?\s*$/,
    },
    {
      side: "server" as const,
      kind: "event" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnServerEvent\s*\+=\s*\(([^)]*)\)\s*=>\s*\{\s*$`,
      ),
      end: /^\s*}\s*;?\s*$/,
    },
    {
      side: "server" as const,
      kind: "event" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnServerEvent\.Connect\s*\(\s*\[[^\]]*\]\s*\(([^)]*)\)\s*\{\s*$`,
      ),
      end: /^\s*}\s*\)\s*;?\s*$/,
    },
    {
      side: "server" as const,
      kind: "function" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnServerInvoke\s*=\s*function\s*\(([^)]*)\)\s*$`,
      ),
      end: /^\s*end\s*;?\s*$/,
    },
    {
      side: "server" as const,
      kind: "function" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnServerInvoke\s*=\s*\(([^)]*)\)\s*=>\s*\{\s*$`,
      ),
      end: /^\s*}\s*;?\s*$/,
    },
    {
      side: "server" as const,
      kind: "function" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnServerInvoke\s*=\s*\[[^\]]*\]\s*\(([^)]*)\)\s*\{\s*$`,
      ),
      end: /^\s*}\s*;?\s*$/,
    },
    {
      side: "client" as const,
      kind: "event" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnClientEvent\s*:\s*Connect\s*\(\s*function\s*\(([^)]*)\)\s*$`,
      ),
      end: /^\s*end\s*\)\s*;?\s*$/,
    },
    {
      side: "client" as const,
      kind: "event" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnClientEvent\s*\+=\s*\(([^)]*)\)\s*=>\s*\{\s*$`,
      ),
      end: /^\s*}\s*;?\s*$/,
    },
    {
      side: "client" as const,
      kind: "event" as const,
      start: new RegExp(
        String.raw`^\s*${target}\.OnClientEvent\.Connect\s*\(\s*\[[^\]]*\]\s*\(([^)]*)\)\s*\{\s*$`,
      ),
      end: /^\s*}\s*\)\s*;?\s*$/,
    },
  ];

  for (let index = 0; index < lines.length; index += 1) {
    let matched:
      | {
          kind: "event" | "function";
          side: "server" | "client";
          match: RegExpMatchArray;
          end: RegExp;
        }
      | undefined;
    for (const pattern of patterns) {
      const match = lines[index].match(pattern.start);
      if (match) {
        matched = {
          side: pattern.side,
          kind: pattern.kind,
          match,
          end: pattern.end,
        };
        break;
      }
    }
    if (!matched) continue;

    const { endIndex, closed } = callbackEndIndex(
      lines,
      index,
      matched.end.source.includes("end") ? "luau" : "brace",
      matched.end,
    );
    handlers.push({
      side: matched.side,
      kind: matched.kind,
      target: matched.match[1],
      parameters: parameterNames(matched.match[2]),
      prelude: lines.slice(0, index).join("\n"),
      body: lines.slice(index + 1, closed ? endIndex : lines.length).join("\n"),
      line: index + 1,
      closed,
      startIndex: index,
      endIndex,
    });
    index = endIndex;
  }
  return handlers;
}

function remoteServerHandlers(script: PolyScript): RemoteHandler[] {
  return remoteHandlers(script).filter((handler) => handler.side === "server");
}

function remoteClientHandlers(script: PolyScript): RemoteHandler[] {
  return remoteHandlers(script).filter((handler) => handler.side === "client");
}

function inputScriptHandlers(script: PolyScript): InputScriptHandler[] {
  const lines = script.source.split("\n");
  const handlers: InputScriptHandler[] = [];
  const patterns = [
    {
      start:
        /^\s*(?:UserInputService|Input)\.(InputBegan|InputEnded)\s*:\s*Connect\s*\(\s*function\s*\(([^)]*)\)\s*$/,
      end: /^\s*end\s*\)\s*;?\s*$/,
    },
    {
      start:
        /^\s*(?:UserInputService|Input)\.(InputBegan|InputEnded)\s*\+=\s*\(([^)]*)\)\s*=>\s*\{\s*$/,
      end: /^\s*}\s*;?\s*$/,
    },
    {
      start:
        /^\s*(?:UserInputService|Input)\.(InputBegan|InputEnded)\.Connect\s*\(\s*\[[^\]]*\]\s*\(([^)]*)\)\s*\{\s*$/,
      end: /^\s*}\s*\)\s*;?\s*$/,
    },
  ];

  for (let index = 0; index < lines.length; index += 1) {
    let match: RegExpMatchArray | null = null;
    let endPattern = patterns[0].end;
    for (const pattern of patterns) {
      match = lines[index].match(pattern.start);
      if (match) {
        endPattern = pattern.end;
        break;
      }
    }
    if (!match) continue;
    const { endIndex, closed } = callbackEndIndex(
      lines,
      index,
      endPattern.source.includes("end") ? "luau" : "brace",
      endPattern,
    );
    const body = lines.slice(index + 1, closed ? endIndex : lines.length).join("\n");
    const keyCode =
      body.match(
        /(?:Enum\.KeyCode\.|Key\.Enum\.|KeyCode\.|KeyCode::)([A-Za-z0-9_]+)/,
      )?.[1] ?? null;
    handlers.push({
      event: match[1] as InputScriptHandler["event"],
      parameters: parameterNames(match[2] ?? ""),
      prelude: lines.slice(0, index).join("\n"),
      body,
      keyCode,
      line: index + 1,
      closed,
      startIndex: index,
      endIndex,
    });
    index = endIndex;
  }
  return handlers;
}

function scriptEventHandlers(script: PolyScript): ScriptEventHandler[] {
  const lines = script.source.split("\n");
  const handlers: ScriptEventHandler[] = [];
  const target =
    String.raw`((?:script|Script)\.Parent|[A-Za-z_]\w*|(?:Workspace|workspace)\.[A-Za-z_]\w*)`;
  const startPatterns = [
    new RegExp(
      String.raw`^\s*${target}\.(MouseButton1Click|Activated|Touched|TouchEnded)\s*:\s*Connect\s*\(\s*function\s*\(([^)]*)\)\s*$`,
    ),
    new RegExp(
      String.raw`^\s*${target}\.(MouseButton1Click|Activated|Touched|TouchEnded)\s*\+=\s*\(([^)]*)\)\s*=>\s*\{\s*$`,
    ),
    new RegExp(
      String.raw`^\s*${target}\.(MouseButton1Click|Activated|Touched|TouchEnded)\.Connect\s*\(\s*\[[^\]]*\]\s*\(([^)]*)\)\s*\{\s*$`,
    ),
  ];
  const endPatterns = [
    /^\s*end\s*\)\s*;?\s*$/,
    /^\s*}\s*;?\s*$/,
    /^\s*}\s*\)\s*;?\s*$/,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    let startMatch: RegExpMatchArray | null = null;
    let syntaxIndex = -1;
    for (let candidate = 0; candidate < startPatterns.length; candidate += 1) {
      startMatch = lines[index].match(startPatterns[candidate]);
      if (startMatch) {
        syntaxIndex = candidate;
        break;
      }
    }
    if (!startMatch) continue;

    const { endIndex, closed } = callbackEndIndex(
      lines,
      index,
      syntaxIndex === 0 ? "luau" : "brace",
      endPatterns[syntaxIndex],
    );
    handlers.push({
      target: startMatch[1],
      event: startMatch[2] as ScriptEventHandler["event"],
      parameters: parameterNames(startMatch[3] ?? ""),
      prelude: lines.slice(0, index).join("\n"),
      body: lines.slice(index + 1, closed ? endIndex : lines.length).join("\n"),
      line: index + 1,
      closed,
      startIndex: index,
      endIndex,
    });
    index = endIndex;
  }
  return handlers;
}

function guiEventHandlers(script: PolyScript): ScriptEventHandler[] {
  return scriptEventHandlers(script).filter(
    (handler) => handler.event !== "Touched" && handler.event !== "TouchEnded",
  );
}

function touchedEventHandlers(script: PolyScript): ScriptEventHandler[] {
  return scriptEventHandlers(script).filter(
    (handler) => handler.event === "Touched" || handler.event === "TouchEnded",
  );
}

function withoutEventHandlers(script: PolyScript): string {
  const lines = script.source.split("\n");
  const ignored = new Set<number>();
  for (const handler of [
    ...scriptEventHandlers(script),
    ...remoteHandlers(script),
    ...inputScriptHandlers(script),
  ]) {
    for (
      let index = handler.startIndex;
      index <= handler.endIndex;
      index += 1
    ) {
      ignored.add(index);
    }
  }
  return lines.filter((_, index) => !ignored.has(index)).join("\n");
}

function handlerTargetReference(
  target: string,
  prelude: string,
  script: PolyScript,
  project: PolyProject,
): Reference | null {
  const direct = findDirectReference(target, project, script);
  if (direct) return direct;
  for (const source of prelude.split("\n")) {
    const declaration = findReferenceDeclaration(source, project, script);
    if (declaration?.variable === target && declaration.reference) {
      return declaration.reference;
    }
  }
  return null;
}

function eventTargetReference(
  handler: ScriptEventHandler,
  script: PolyScript,
  project: PolyProject,
): Reference | null {
  return handlerTargetReference(
    handler.target,
    handler.prelude,
    script,
    project,
  );
}

function parseNumbers(value: string, count: number): number[] | null {
  const constructor = value.match(
    /(?:Vector[23](?:::new|\.new)?|new\s+Vector[23])\s*\(([^)]+)\)/i,
  );
  if (!constructor) return null;
  const numbers = constructor[1]
    .split(",")
    .map((part) => Number(part.trim()))
    .filter(Number.isFinite);
  return numbers.length === count ? numbers : null;
}

function parseString(value: string): string | null {
  const match = value.trim().match(/^["'](.*)["']\s*;?$/);
  return match ? match[1] : null;
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().replace(/;$/, "").toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.trim().replace(/;$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStoredValue(value: string): PolyStoredValue | undefined {
  const stringValue = parseString(value);
  if (stringValue !== null) return stringValue;
  const booleanValue = parseBoolean(value);
  if (booleanValue !== null) return booleanValue;
  const numberValue = parseNumber(value);
  if (numberValue !== null) return numberValue;
  if (value.trim().replace(/;$/, "") === "nil" || value.trim() === "null") {
    return null;
  }
  return undefined;
}

function rawStoredValue(value: PolyStoredValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "nil";
  return String(value);
}

function moduleExports(script: PolyScript): Record<string, PolyStoredValue> {
  const exports: Record<string, PolyStoredValue> = {};
  const source =
    script.source.match(/return\s*\{([\s\S]*?)\}/)?.[1] ?? script.source;
  const pattern =
    /(?:Module(?:::|\.)Export\(\s*["']([A-Za-z_]\w*)["']\s*,\s*([^)\n]+)\)|([A-Za-z_]\w*)\s*=\s*([^,\n}]+))/g;
  for (const match of source.matchAll(pattern)) {
    const key = match[1] ?? match[3];
    const raw = match[2] ?? match[4];
    const value = parseStoredValue(raw);
    if (key && value !== undefined) exports[key] = value;
  }
  return exports;
}

function findModuleDeclaration(
  source: string,
  project: PolyProject,
): {
  variable: string;
  module: PolyScript | null;
  requestedName: string;
} | null {
  const match = source.match(
    /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*(?:require|Modules(?:::|\.)Require)\(\s*["']([^"']+)["']\s*\)\s*;?/,
  );
  if (!match) return null;
  return {
    variable: match[1],
    module:
      project.scripts.find(
        (script) =>
          script.kind === "moduleScript" && script.name === match[2],
      ) ?? null,
    requestedName: match[2],
  };
}

function findDataStoreDeclaration(
  source: string,
): { variable: string; storeName: string } | null {
  const match = source.match(
    /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*DataStoreService(?::GetDataStore|\.GetDataStore|::GetDataStore)\(\s*["']([^"']+)["']\s*\)\s*;?/,
  );
  return match ? { variable: match[1], storeName: match[2] } : null;
}

function resolveRawValue(
  rawValue: string,
  values: Map<string, PolyStoredValue>,
  modules: Map<string, Record<string, PolyStoredValue>>,
): string {
  const normalized = rawValue.trim().replace(/;$/, "");
  if (values.has(normalized)) return rawStoredValue(values.get(normalized)!);
  const moduleValue = normalized.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
  if (moduleValue) {
    const value = modules.get(moduleValue[1])?.[moduleValue[2]];
    if (value !== undefined) return rawStoredValue(value);
  }
  return rawValue;
}

function referencePropertyValue(
  project: PolyProject,
  reference: Reference,
  property: string,
): PolyStoredValue | undefined {
  if (reference.kind !== "player") return undefined;
  const leaderstat = project.leaderstats.find((stat) => stat.name === property);
  if (leaderstat) return leaderstat.defaultValue;
  if (property === "Health") return project.playerSettings.health;
  if (property === "MaxHealth") return project.playerSettings.maxHealth;
  if (property === "WalkSpeed") return project.playerSettings.walkSpeed;
  if (property === "JumpPower") return project.playerSettings.jumpPower;
  if (property === "CameraFieldOfView") {
    return project.playerSettings.cameraFieldOfView;
  }
  if (property === "CameraMinZoomDistance") {
    return project.playerSettings.cameraMinZoomDistance;
  }
  if (property === "CameraMaxZoomDistance") {
    return project.playerSettings.cameraMaxZoomDistance;
  }
  if (property === "SprintEnabled") {
    return project.playerSettings.sprintEnabled;
  }
  if (property === "SprintMultiplier") {
    return project.playerSettings.sprintMultiplier;
  }
  return undefined;
}

function resolveAssignmentValue(
  rawValue: string,
  project: PolyProject,
  variables: Map<string, Reference>,
  values: Map<string, PolyStoredValue>,
  modules: Map<string, Record<string, PolyStoredValue>>,
): string {
  const expression = rawValue.trim().replace(/;$/, "");
  const arithmetic = expression.match(
    /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)\s*([+\-*/])\s*(.+)$/,
  );
  if (arithmetic) {
    const reference = variables.get(arithmetic[1]);
    const left = reference
      ? referencePropertyValue(project, reference, arithmetic[2])
      : undefined;
    const right = parseNumber(resolveRawValue(arithmetic[4], values, modules));
    if (typeof left === "number" && right !== null) {
      const result = {
        "+": left + right,
        "-": left - right,
        "*": left * right,
        "/": right === 0 ? Number.NaN : left / right,
      }[arithmetic[3]];
      if (Number.isFinite(result)) return String(result);
    }
  }
  const propertyRead = expression.match(
    /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/,
  );
  if (propertyRead) {
    const reference = variables.get(propertyRead[1]);
    const value = reference
      ? referencePropertyValue(project, reference, propertyRead[2])
      : undefined;
    if (value !== undefined) return rawStoredValue(value);
  }
  return resolveRawValue(rawValue, values, modules);
}

function resolveExpressionValue(
  rawValue: string,
  project: PolyProject,
  variables: Map<string, Reference>,
  values: Map<string, PolyStoredValue>,
  modules: Map<string, Record<string, PolyStoredValue>>,
): PolyStoredValue | undefined {
  const expression = rawValue.trim().replace(/;$/, "");
  const binary = expression.match(/^(.+?)\s*([+\-*/])\s*(.+)$/);
  if (binary) {
    const operand = (source: string): PolyStoredValue | undefined => {
      const property = source.trim().match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
      if (property) {
        const reference = variables.get(property[1]);
        if (reference) {
          const value = referencePropertyValue(project, reference, property[2]);
          if (value !== undefined) return value;
        }
      }
      return parseStoredValue(resolveRawValue(source, values, modules));
    };
    const left = operand(binary[1]);
    const right = operand(binary[3]);
    if (typeof left === "number" && typeof right === "number") {
      const result = {
        "+": left + right,
        "-": left - right,
        "*": left * right,
        "/": right === 0 ? Number.NaN : left / right,
      }[binary[2]];
      return Number.isFinite(result) ? result : undefined;
    }
    if (binary[2] === "+" && (typeof left === "string" || typeof right === "string")) {
      return `${left ?? ""}${right ?? ""}`;
    }
  }
  const property = expression.match(/^([A-Za-z_]\w*)\.([A-Za-z_]\w*)$/);
  if (property) {
    const reference = variables.get(property[1]);
    if (reference) {
      const value = referencePropertyValue(project, reference, property[2]);
      if (value !== undefined) return value;
    }
  }
  return parseStoredValue(resolveRawValue(expression, values, modules));
}

function propertySetFor(
  reference: Reference,
  project: PolyProject,
): Set<string> {
  if (reference.kind === "world") return WORLD_PROPERTIES;
  if (reference.kind === "gui") return GUI_PROPERTIES;
  if (reference.kind === "remote") return new Set();
  return new Set([
    ...PLAYER_PROPERTIES,
    ...project.leaderstats.map((stat) => stat.name),
  ]);
}

function remoteCallError(
  project: PolyProject,
  reference: Reference,
  method: string,
  script: PolyScript,
): string | null {
  if (reference.kind !== "remote") return "This value is not a remote object.";
  const remote = project.remotes.find((item) => item.id === reference.id);
  if (!remote) return "The referenced remote no longer exists.";
  const eventMethods = new Set(["FireServer", "FireClient", "FireAllClients"]);
  const functionMethods = new Set(["InvokeServer", "InvokeClient"]);
  if (remote.kind === "remoteEvent" && !eventMethods.has(method)) {
    return `${remote.name} is a RemoteEvent and cannot use ${method}.`;
  }
  if (remote.kind === "remoteFunction" && !functionMethods.has(method)) {
    return `${remote.name} is a RemoteFunction and cannot use ${method}.`;
  }
  if (
    script.kind === "localScript" &&
    !["FireServer", "InvokeServer"].includes(method)
  ) {
    return `${method} can only be called by a server Script.`;
  }
  if (
    script.kind === "script" &&
    !["FireClient", "FireAllClients", "InvokeClient"].includes(method)
  ) {
    return `${method} can only be called by a LocalScript.`;
  }
  if (script.kind === "moduleScript") {
    return "ModuleScripts cannot call remotes until required by a running script.";
  }
  return null;
}

function assignProperty(
  project: PolyProject,
  reference: Reference,
  property: string,
  rawValue: string,
): string | null {
  if (reference.kind === "remote") {
    return "Remote objects do not expose editable properties.";
  }
  if (!propertySetFor(reference, project).has(property)) {
    return `${property} is not a supported property for this object.`;
  }

  if (reference.kind === "world") {
    const object = project.objects.find((item) => item.id === reference.id);
    if (!object) return "The referenced Workspace object no longer exists.";
    if (property === "Name") {
      const value = parseString(rawValue);
      if (value === null) return "Name must be a string.";
      object.name = value;
    } else if (property === "Color") {
      const value = parseString(rawValue);
      if (!value || !/^#[0-9a-f]{6}$/i.test(value)) {
        return 'Color must be a hex string such as "#7a4cff".';
      }
      object.color = value;
    } else if (property === "Anchored") {
      const value = parseBoolean(rawValue);
      if (value === null) return "Anchored must be true or false.";
      object.anchored = value;
    } else if (property === "Visible") {
      const value = parseBoolean(rawValue);
      if (value === null) return "Visible must be true or false.";
      object.visible = value;
    } else if (property === "Transparency") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0 || value > 1) {
        return "Transparency must be between 0 and 1.";
      }
      object.transparency = value;
    } else if (property === "Material") {
      const value = parseString(rawValue)?.toLowerCase();
      if (!value || !["plastic", "metal", "wood", "neon"].includes(value)) {
        return "Material must be Plastic, Metal, Wood, or Neon.";
      }
      object.material = value as PolyWorldObject["material"];
    } else if (property === "Texture") {
      const value = parseString(rawValue)?.toLowerCase();
      const textures = [
        "none",
        "brick",
        "wood",
        "concrete",
        "grass",
        "fabric",
        "marble",
      ];
      if (!value || !textures.includes(value)) {
        return "Texture must be None, Brick, Wood, Concrete, Grass, Fabric, or Marble.";
      }
      object.surfaceTexture = value as PolyWorldObject["surfaceTexture"];
    } else if (property === "CanCollide") {
      const value = parseBoolean(rawValue);
      if (value === null) return "CanCollide must be true or false.";
      object.canCollide = value;
    } else if (property === "CastShadow") {
      const value = parseBoolean(rawValue);
      if (value === null) return "CastShadow must be true or false.";
      object.castShadow = value;
    } else if (property === "Friction") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0 || value > 2) {
        return "Friction must be between 0 and 2.";
      }
      object.friction = value;
    } else if (property === "Restitution") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0 || value > 1) {
        return "Restitution must be between 0 and 1.";
      }
      object.restitution = value;
    } else if (property === "Mass") {
      const value = parseNumber(rawValue);
      if (value === null || value <= 0 || value > 10_000) {
        return "Mass must be greater than 0 and no greater than 10000.";
      }
      object.mass = value;
    } else if (property === "Velocity") {
      const value = parseNumbers(rawValue, 3);
      if (!value) return "Velocity must be Vector3.new(x, y, z).";
      object.velocity = value as [number, number, number];
    } else if (property === "Volume") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0 || value > 1) {
        return "Volume must be between 0 and 1.";
      }
      object.volume = value;
    } else if (property === "Looped" || property === "Autoplay") {
      const value = parseBoolean(rawValue);
      if (value === null) return `${property} must be true or false.`;
      if (property === "Looped") object.looped = value;
      if (property === "Autoplay") object.autoplay = value;
    } else if (property === "PlaybackSpeed") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0.25 || value > 4) {
        return "PlaybackSpeed must be between 0.25 and 4.";
      }
      object.playbackSpeed = value;
    } else if (property === "RollOffMinDistance") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0.1 || value > 1_000) {
        return "RollOffMinDistance must be between 0.1 and 1000.";
      }
      object.rolloffMinDistance = value;
      object.rolloffMaxDistance = Math.max(value, object.rolloffMaxDistance ?? 60);
    } else if (property === "RollOffMaxDistance") {
      const value = parseNumber(rawValue);
      if (
        value === null ||
        value < (object.rolloffMinDistance ?? 5) ||
        value > 10_000
      ) {
        return "RollOffMaxDistance must be at least RollOffMinDistance and no greater than 10000.";
      }
      object.rolloffMaxDistance = value;
    } else {
      const value = parseNumbers(rawValue, 3);
      if (!value) return `${property} must be Vector3.new(x, y, z).`;
      const vector = value as [number, number, number];
      if (property === "Position") object.position = vector;
      if (property === "Rotation") object.rotation = vector;
      if (property === "Size") object.scale = vector;
    }
    return null;
  }

  if (reference.kind === "gui") {
    const gui = project.gui.find((item) => item.id === reference.id);
    if (!gui) return "The referenced PlayerGui object no longer exists.";
    if (
      [
        "Name",
        "Text",
        "BackgroundColor",
        "TextColor",
        "Image",
        "Placeholder",
      ].includes(property)
    ) {
      const value = parseString(rawValue);
      if (value === null) return `${property} must be a string.`;
      if (
        ["BackgroundColor", "TextColor"].includes(property) &&
        !/^#[0-9a-f]{6}$/i.test(value)
      ) {
        return `${property} must be a hex color string.`;
      }
      if (property === "Name") gui.name = value;
      if (property === "Text") gui.text = value;
      if (property === "BackgroundColor") gui.backgroundColor = value;
      if (property === "TextColor") gui.textColor = value;
      if (property === "Image") gui.imageUrl = value;
      if (property === "Placeholder") gui.placeholder = value;
    } else if (
      property === "Visible" ||
      property === "ClipDescendants" ||
      property === "Locked"
    ) {
      const value = parseBoolean(rawValue);
      if (value === null) return `${property} must be true or false.`;
      if (property === "Visible") gui.visible = value;
      if (property === "ClipDescendants") gui.clipDescendants = value;
      if (property === "Locked") gui.locked = value;
    } else if (property === "BackgroundTransparency") {
      const value = parseNumber(rawValue);
      if (value === null || value < 0 || value > 1) {
        return "BackgroundTransparency must be between 0 and 1.";
      }
      gui.backgroundTransparency = value;
    } else if (
      ["Rotation", "TextSize", "BorderRadius", "ZIndex"].includes(property)
    ) {
      const value = parseNumber(rawValue);
      if (value === null) return `${property} must be a number.`;
      if (property === "Rotation") gui.rotation = value;
      if (property === "TextSize") gui.textSize = Math.max(1, value);
      if (property === "BorderRadius") gui.borderRadius = Math.max(0, value);
      if (property === "ZIndex") gui.zIndex = Math.round(value);
    } else {
      const value = parseNumbers(rawValue, 2);
      if (!value) return `${property} must be Vector2.new(x, y).`;
      const vector = value as [number, number];
      if (property === "Position") gui.position = vector;
      if (property === "Size") gui.size = vector;
      if (property === "AnchorPoint") gui.anchorPoint = vector;
      if (property === "CanvasSize") gui.canvasSize = vector;
    }
    return null;
  }

  const leaderstat = project.leaderstats.find((stat) => stat.name === property);
  if (leaderstat) {
    if (leaderstat.type === "number") {
      const value = parseNumber(rawValue);
      if (value === null) return `${property} must be a number.`;
      leaderstat.defaultValue = value;
    } else {
      const value = parseString(rawValue);
      if (value === null) return `${property} must be a string.`;
      leaderstat.defaultValue = value;
    }
    return null;
  }

  if (property === "SprintEnabled") {
    const value = parseBoolean(rawValue);
    if (value === null) return "SprintEnabled must be true or false.";
    project.playerSettings.sprintEnabled = value;
    return null;
  }
  const value = parseNumber(rawValue);
  if (property === "Health") {
    if (value === null || value < 0 || value > 500) {
      return "Health must be between 0 and 500.";
    }
    project.playerSettings.health = Math.min(
      value,
      project.playerSettings.maxHealth,
    );
    return null;
  }
  if (value === null || value <= 0 || value > 500) {
    return `${property} must be a positive number no greater than 500.`;
  }
  if (property === "WalkSpeed") project.playerSettings.walkSpeed = value;
  if (property === "JumpPower") project.playerSettings.jumpPower = value;
  if (property === "CameraFieldOfView") {
    if (value < 20 || value > 120) {
      return "CameraFieldOfView must be between 20 and 120.";
    }
    project.playerSettings.cameraFieldOfView = value;
    return null;
  }
  if (property === "CameraMinZoomDistance") {
    if (value < 1 || value > 200) {
      return "CameraMinZoomDistance must be between 1 and 200.";
    }
    if (value > project.playerSettings.cameraMaxZoomDistance) {
      return "CameraMinZoomDistance cannot exceed CameraMaxZoomDistance.";
    }
    project.playerSettings.cameraMinZoomDistance = value;
    return null;
  }
  if (property === "CameraMaxZoomDistance") {
    if (value < 1 || value > 200) {
      return "CameraMaxZoomDistance must be between 1 and 200.";
    }
    if (value < project.playerSettings.cameraMinZoomDistance) {
      return "CameraMaxZoomDistance cannot be below CameraMinZoomDistance.";
    }
    project.playerSettings.cameraMaxZoomDistance = value;
    return null;
  }
  if (property === "MaxHealth") {
    project.playerSettings.maxHealth = value;
    project.playerSettings.health = Math.min(
      project.playerSettings.health,
      value,
    );
  }
  if (property === "SprintMultiplier") {
    if (value < 1 || value > 5) {
      return "SprintMultiplier must be between 1 and 5.";
    }
    project.playerSettings.sprintMultiplier = value;
  }
  return null;
}

function delimiterDiagnostics(source: string): PolyDiagnostic[] {
  const diagnostics: PolyDiagnostic[] = [];
  const stack: Array<{ value: string; line: number; column: number }> = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let line = 1;
  let column = 0;
  let quote: string | null = null;
  let escaped = false;

  for (const character of source) {
    column += 1;
    if (character === "\n") {
      line += 1;
      column = 0;
      quote = null;
      escaped = false;
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) {
      stack.push({ value: character, line, column });
    } else if (")]}".includes(character)) {
      const opening = stack.pop();
      if (!opening || opening.value !== pairs[character]) {
        diagnostics.push({
          line,
          column,
          endColumn: column + 1,
          severity: "error",
          message: `Unexpected '${character}'.`,
        });
      }
    }
  }
  for (const opening of stack) {
    diagnostics.push({
      line: opening.line,
      column: opening.column,
      endColumn: opening.column + 1,
      severity: "error",
      message: `Missing closing delimiter for '${opening.value}'.`,
    });
  }
  return diagnostics;
}

function syntaxDiagnostics(
  script: PolyScript,
  language: PolyLanguage,
): PolyDiagnostic[] {
  const diagnostics: PolyDiagnostic[] = [];
  const lines = script.source.split("\n");

  lines.forEach((source, index) => {
    const trimmed = source.trim();
    if (/=\s*;?$/.test(trimmed) && !/[=!<>]=\s*;?$/.test(trimmed)) {
      diagnostics.push(
        lineDiagnostic(index + 1, source, "Expected a value after '='."),
      );
    }
    if (
      language !== "luau" &&
      trimmed &&
      !trimmed.startsWith("//") &&
      !trimmed.startsWith("#") &&
      !trimmed.endsWith(";") &&
      !trimmed.endsWith("{") &&
      !trimmed.endsWith("}") &&
      /^(?:var|auto|const\s+auto|[A-Za-z_]\w*(?:\.|::))/.test(trimmed)
    ) {
      diagnostics.push(
        lineDiagnostic(index + 1, source, "Expected ';' at the end of this line."),
      );
    }
  });

  if (language !== "luau") return diagnostics;
  const blocks: Array<{ kind: string; line: number; column: number }> = [];
  lines.forEach((source, index) => {
    const code = source.replace(/--.*$/, "").trim();
    if (!code) return;
    if (/^end\b/.test(code)) {
      const opening = blocks.pop();
      if (!opening) {
        diagnostics.push(
          lineDiagnostic(index + 1, source, "Unexpected 'end'."),
        );
      }
      return;
    }
    if (/^until\b/.test(code)) {
      const opening = blocks.pop();
      if (!opening || opening.kind !== "repeat") {
        diagnostics.push(
          lineDiagnostic(index + 1, source, "Unexpected 'until'."),
        );
      }
      return;
    }
    let kind: string | null = null;
    if (
      /^(?:local\s+)?function\b/.test(code) ||
      /\.(?:MouseButton1Click|Activated|Touched|TouchEnded|OnServerEvent|OnClientEvent|InputBegan|InputEnded)\s*:\s*Connect\s*\(\s*function\b/.test(
        code,
      ) ||
      /\.OnServerInvoke\s*=\s*function\b/.test(code)
    ) {
      kind = "function";
    }
    else if (/^if\b.*\bthen\s*$/.test(code)) kind = "if";
    else if (/^(?:for|while)\b.*\bdo\s*$/.test(code)) kind = "loop";
    else if (/^repeat\b/.test(code)) kind = "repeat";
    if (kind) {
      blocks.push({
        kind,
        line: index + 1,
        column: Math.max(1, source.search(/\S/) + 1),
      });
    }
  });
  for (const block of blocks) {
    diagnostics.push({
      line: block.line,
      column: block.column,
      endColumn: block.column + block.kind.length,
      severity: "error",
      message:
        block.kind === "repeat"
          ? "This repeat block is missing 'until'."
          : `This ${block.kind} block is missing 'end'.`,
    });
  }
  return diagnostics;
}

export function analyzePolyScript(
  script: PolyScript,
  project: PolyProject,
): PolyDiagnostic[] {
  project = normalizePolyProject(project);
  const diagnostics = [
    ...delimiterDiagnostics(script.source),
    ...syntaxDiagnostics(script, project.language),
  ];
  const buttonHandlers = guiEventHandlers(script);
  const touchHandlers = touchedEventHandlers(script);
  const serverRemoteHandlers = remoteServerHandlers(script);
  const clientRemoteHandlers = remoteClientHandlers(script);
  const inputHandlers = inputScriptHandlers(script);
  const guiScriptParent = project.gui.find(
    (item) => item.id === script.parent,
  );
  if (buttonHandlers.length > 0 && script.kind !== "localScript") {
    diagnostics.push({
      line: buttonHandlers[0].line,
      column: 1,
      endColumn: 2,
      severity: "error",
      message: "Button activation events can only run in a LocalScript.",
    });
  }
  if (
    buttonHandlers.length > 0 &&
    guiScriptParent?.type !== "textButton" &&
    guiScriptParent?.type !== "imageButton"
  ) {
    diagnostics.push({
      line: buttonHandlers[0].line,
      column: 1,
      endColumn: 2,
      severity: "error",
      message:
        "MouseButton1Click and Activated require a TextButton or ImageButton parent.",
    });
  }
  for (const handler of buttonHandlers.filter((item) => !item.closed)) {
    diagnostics.push({
      line: handler.line,
      column: 1,
      endColumn: 2,
      severity: "error",
      message: `${handler.event} is missing its closing callback delimiter.`,
    });
  }
  if (touchHandlers.length > 0 && script.kind !== "script") {
    diagnostics.push({
      line: touchHandlers[0].line,
      column: 1,
      endColumn: 2,
      severity: "error",
      message: "Touch events must run in a server Script.",
    });
  }
  for (const handler of touchHandlers) {
    const reference = eventTargetReference(handler, script, project);
    if (reference?.kind !== "world") {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: "Touch events require a Workspace Part.",
      });
    }
    if (!handler.closed) {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: `${handler.event} is missing its closing callback delimiter.`,
      });
    }
  }
  for (const handler of serverRemoteHandlers) {
    const reference = handlerTargetReference(
      handler.target,
      handler.prelude,
      script,
      project,
    );
    const remote =
      reference?.kind === "remote"
        ? project.remotes.find((item) => item.id === reference.id)
        : null;
    if (script.kind !== "script") {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: "OnServerEvent and OnServerInvoke must run in a server Script.",
      });
    } else if (!remote) {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: "The remote callback target could not be resolved.",
      });
    } else if (
      (handler.kind === "event" && remote.kind !== "remoteEvent") ||
      (handler.kind === "function" && remote.kind !== "remoteFunction")
    ) {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message:
          handler.kind === "event"
            ? "OnServerEvent requires a RemoteEvent."
            : "OnServerInvoke requires a RemoteFunction.",
      });
    }
    if (!handler.closed) {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: `${
          handler.kind === "event" ? "OnServerEvent" : "OnServerInvoke"
        } is missing its closing callback delimiter.`,
      });
    }
  }
  for (const handler of clientRemoteHandlers) {
    const reference = handlerTargetReference(
      handler.target,
      handler.prelude,
      script,
      project,
    );
    const remote =
      reference?.kind === "remote"
        ? project.remotes.find((item) => item.id === reference.id)
        : null;
    if (script.kind !== "localScript") {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: "OnClientEvent must run in a LocalScript.",
      });
    } else if (!remote || remote.kind !== "remoteEvent") {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: "OnClientEvent requires a RemoteEvent.",
      });
    }
    if (!handler.closed) {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: "OnClientEvent is missing its closing callback delimiter.",
      });
    }
  }
  for (const handler of inputHandlers) {
    if (script.kind !== "localScript") {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: `${handler.event} must run in a LocalScript.`,
      });
    }
    if (!handler.closed) {
      diagnostics.push({
        line: handler.line,
        column: 1,
        endColumn: 2,
        severity: "error",
        message: `${handler.event} is missing its closing callback delimiter.`,
      });
    }
  }
  const validationProject = cloneProject(project);
  const variables = new Map<string, Reference>();
  const modules = new Map<string, Record<string, PolyStoredValue>>();
  const stores = new Map<string, string>();
  const values = new Map<string, PolyStoredValue>();
  for (const handler of [
    ...serverRemoteHandlers,
    ...clientRemoteHandlers,
    ...inputHandlers,
  ]) {
    for (const parameter of handler.parameters) values.set(parameter, null);
  }
  const lines = script.source.split("\n");
  const remoteHandlerBoundaries = new Set<number>();
  for (const handler of [
    ...serverRemoteHandlers,
    ...clientRemoteHandlers,
    ...inputHandlers,
  ]) {
    remoteHandlerBoundaries.add(handler.startIndex);
    remoteHandlerBoundaries.add(handler.endIndex);
  }

  lines.forEach((source, index) => {
    if (remoteHandlerBoundaries.has(index)) return;
    const line = index + 1;
    const trimmed = source.trim();
    if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("//")) return;

    const moduleDeclaration = findModuleDeclaration(source, project);
    if (moduleDeclaration) {
      if (!moduleDeclaration.module) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            `No ModuleScript named "${moduleDeclaration.requestedName}" exists.`,
          ),
        );
      } else {
        modules.set(
          moduleDeclaration.variable,
          moduleExports(moduleDeclaration.module),
        );
      }
      return;
    }

    const dataStoreDeclaration = findDataStoreDeclaration(source);
    if (dataStoreDeclaration) {
      if (script.kind === "localScript") {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            "LocalScripts cannot access DataStoreService.",
          ),
        );
      } else {
        stores.set(
          dataStoreDeclaration.variable,
          dataStoreDeclaration.storeName,
        );
      }
      return;
    }

    const dataGet = source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)(?::|\.)(?:GetAsync|Get)\(\s*["']([^"']+)["']\s*\)\s*;?/,
    );
    if (dataGet) {
      const storeName = stores.get(dataGet[2]);
      if (!storeName) {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown data store variable ${dataGet[2]}.`),
        );
      } else {
        values.set(
          dataGet[1],
          validationProject.dataStores[storeName]?.[dataGet[3]] ?? null,
        );
      }
      return;
    }

    const dataSet = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.)(?:SetAsync|Set)\(\s*["']([^"']+)["']\s*,\s*(.+?)\s*\)\s*;?\s*$/,
    );
    if (dataSet) {
      if (!stores.has(dataSet[1])) {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown data store variable ${dataSet[1]}.`),
        );
      } else {
        const value = parseStoredValue(
          resolveRawValue(dataSet[3], values, modules),
        );
        if (value === undefined) {
          diagnostics.push(
            lineDiagnostic(
              line,
              source,
              "Data store values must be strings, numbers, booleans, or nil.",
            ),
          );
          return;
        }
        const storeName = stores.get(dataSet[1])!;
        validationProject.dataStores[storeName] ??= {};
        validationProject.dataStores[storeName][dataSet[2]] = value;
      }
      return;
    }

    const attributeGet = source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)(?::|\.)(?:GetAttribute)\(\s*["']([^"']+)["']\s*\)\s*;?/,
    );
    if (attributeGet) {
      const reference = variables.get(attributeGet[2]);
      if (!reference || reference.kind !== "world") {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown world object variable ${attributeGet[2]}.`),
        );
      } else {
        const object = validationProject.objects.find(
          (item) => item.id === reference.id,
        );
        values.set(attributeGet[1], object?.attributes[attributeGet[3]] ?? null);
      }
      return;
    }

    const attributeSet = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.)(?:SetAttribute)\(\s*["']([^"']+)["']\s*,\s*(.+?)\s*\)\s*;?\s*$/,
    );
    if (attributeSet) {
      const reference = variables.get(attributeSet[1]);
      const value = parseStoredValue(
        resolveRawValue(attributeSet[3], values, modules),
      );
      if (!reference || reference.kind !== "world") {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown world object variable ${attributeSet[1]}.`),
        );
      } else if (value === undefined) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            "Attributes must be strings, numbers, booleans, or nil.",
          ),
        );
      } else {
        const object = validationProject.objects.find(
          (item) => item.id === reference.id,
        );
        if (object) object.attributes[attributeSet[2]] = value;
      }
      return;
    }

    const tagCall = source.match(
      /^\s*CollectionService(?::|\.|::)(AddTag|RemoveTag)\(\s*([A-Za-z_]\w*)\s*,\s*["']([^"']+)["']\s*\)\s*;?\s*$/,
    );
    if (tagCall) {
      const reference = variables.get(tagCall[2]);
      if (!reference || reference.kind !== "world") {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown world object variable ${tagCall[2]}.`),
        );
      } else if (tagCall[3].length > 64) {
        diagnostics.push(lineDiagnostic(line, source, "Tags cannot exceed 64 characters."));
      }
      return;
    }

    const declaration = findReferenceDeclaration(source, project, script);
    if (declaration) {
      if (!declaration.reference) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            `No object named "${declaration.requestedName}" exists in that container.`,
          ),
        );
      } else {
        variables.set(declaration.variable, declaration.reference);
        if (
          script.kind === "script" &&
          (declaration.reference.kind === "gui" ||
            declaration.reference.kind === "player")
        ) {
          diagnostics.push(
            lineDiagnostic(
              line,
              source,
              "Server scripts cannot access PlayerGui or Players.LocalPlayer.",
            ),
          );
        }
      }
      return;
    }

    const soundCall = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.|::)(Play|Pause|Stop)\s*\(\s*\)\s*;?\s*$/,
    );
    if (soundCall) {
      const reference = variables.get(soundCall[1]);
      if (!reference) return;
      const object =
        reference?.kind === "world"
          ? validationProject.objects.find((item) => item.id === reference.id)
          : null;
      if (object?.type !== "sound") {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            `${soundCall[1]} must reference a Sound object.`,
          ),
        );
      }
      return;
    }

    const remoteCall = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.|::)(FireServer|FireClient|FireAllClients|InvokeServer|InvokeClient)\s*\(/,
    );
    if (remoteCall) {
      const reference = variables.get(remoteCall[1]);
      if (!reference) {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown remote variable ${remoteCall[1]}.`),
        );
      } else {
        const error = remoteCallError(project, reference, remoteCall[2], script);
        if (error) diagnostics.push(lineDiagnostic(line, source, error));
      }
      return;
    }
    const remoteInvoke = source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)(?::|\.|::)(InvokeServer|InvokeClient)\s*\(/,
    );
    if (remoteInvoke) {
      const reference = variables.get(remoteInvoke[2]);
      if (!reference) {
        diagnostics.push(
          lineDiagnostic(line, source, `Unknown remote variable ${remoteInvoke[2]}.`),
        );
      } else {
        const error = remoteCallError(project, reference, remoteInvoke[3], script);
        if (error) diagnostics.push(lineDiagnostic(line, source, error));
        else values.set(remoteInvoke[1], null);
      }
      return;
    }

    const assignment = source.match(
      /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
    );
    if (assignment) {
      const reference =
        variables.get(assignment[1]) ??
        findDirectReference(assignment[1], project, script);
      if (!reference) {
        if (
          assignment[1].startsWith("Workspace.") ||
          assignment[1].startsWith("workspace.") ||
          assignment[1].startsWith("PlayerGui.")
        ) {
          diagnostics.push(
            lineDiagnostic(line, source, `Could not resolve ${assignment[1]}.`),
          );
        }
        return;
      }
      if (
        script.kind === "script" &&
        (reference.kind === "gui" || reference.kind === "player")
      ) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            "Server scripts cannot change client-only objects.",
          ),
        );
        return;
      }
      if (!propertySetFor(reference, project).has(assignment[2])) {
        diagnostics.push(
          lineDiagnostic(
            line,
            source,
            `${assignment[2]} is not a supported property for this object.`,
          ),
        );
      } else if (
        !(
          values.has(assignment[3].trim().replace(/;$/, "")) &&
          values.get(assignment[3].trim().replace(/;$/, "")) === null
        )
      ) {
        const valueError = assignProperty(
          validationProject,
          reference,
          assignment[2],
          resolveRawValue(assignment[3], values, modules),
        );
        if (valueError) {
          diagnostics.push(lineDiagnostic(line, source, valueError));
        }
      }
    }
  });

  const guiParent = project.gui.some((item) => item.id === script.parent);
  const worldParent = project.objects.find((item) => item.id === script.parent);
  const modelParent = project.models.some((item) => item.id === script.parent);
  const scriptParent = project.scripts.some((item) => item.id === script.parent);
  let toolParent = worldParent;
  while (toolParent && toolParent.type !== "tool") {
    toolParent = toolParent.parentId
      ? project.objects.find((item) => item.id === toolParent!.parentId)
      : undefined;
  }
  if (
    script.kind === "script" &&
    !SERVER_SCRIPT_PARENTS.has(script.parent) &&
    !worldParent &&
    !modelParent
  ) {
    diagnostics.push({
      line: 1,
      column: 1,
      endColumn: 2,
      severity: "error",
      message:
        "Server Scripts must be in Workspace, ServerScriptService, or a Workspace object or Model.",
    });
  }
  if (
    script.kind === "localScript" &&
    !LOCAL_SCRIPT_PARENTS.has(script.parent) &&
    !guiParent &&
    !toolParent
  ) {
    diagnostics.push({
      line: 1,
      column: 1,
      endColumn: 2,
      severity: "error",
      message:
        "LocalScripts must be in StarterPlayerScripts, StarterGui, a GUI object, or a Tool.",
    });
  }
  if (
    script.kind === "moduleScript" &&
    !MODULE_SCRIPT_PARENTS.has(script.parent) &&
    !guiParent &&
    !scriptParent &&
    !modelParent
  ) {
    diagnostics.push({
      line: 1,
      column: 1,
      endColumn: 2,
      severity: "error",
      message:
        "ModuleScripts must be in another script, a Model, GUI, or shared storage container.",
    });
  }
  return diagnostics;
}

function outputCall(source: string): { level: "info" | "warning"; text: string } | null {
  const match = source.match(
    /^\s*(print|warn|Poly\.Log|Poly\.Warn|Console::(?:Log|Warn))\s*\(\s*["'](.*)["']\s*\)\s*;?\s*$/,
  );
  if (!match) return null;
  return {
    level: /warn/i.test(match[1]) ? "warning" : "info",
    text: match[2],
  };
}

function callArguments(
  source: string,
  values: Map<string, PolyStoredValue>,
  modules: Map<string, Record<string, PolyStoredValue>>,
): PolyStoredValue[] {
  const argumentsList: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  let depth = 0;
  for (const character of source) {
    if (quote) {
      current += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === "(") {
      depth += 1;
      current += character;
    } else if (character === ")") {
      depth = Math.max(0, depth - 1);
      current += character;
    } else if (character === "," && depth === 0) {
      argumentsList.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) argumentsList.push(current.trim());
  return argumentsList.map((argument) => {
    const resolved = resolveRawValue(argument, values, modules);
    return parseStoredValue(resolved) ?? null;
  });
}

function remoteCallbackValues(
  handler: RemoteHandler,
  argumentsList: PolyStoredValue[],
  includePlayer = true,
): Map<string, PolyStoredValue> {
  const values = new Map<string, PolyStoredValue>();
  let argumentOffset = 0;
  if (includePlayer && handler.parameters[0]) {
    values.set(handler.parameters[0], "LocalPlayer");
    argumentOffset = 1;
  }
  for (let index = argumentOffset; index < handler.parameters.length; index += 1) {
    values.set(
      handler.parameters[index],
      argumentsList[index - argumentOffset] ?? null,
    );
  }
  return values;
}

function requestedTweens(
  source: string,
  script: PolyScript,
  project: PolyProject,
): PolyTweenRequest[] {
  const references = new Map<string, Reference>();
  for (const line of source.split("\n")) {
    const declaration = findReferenceDeclaration(line, project, script);
    if (declaration?.reference) {
      references.set(declaration.variable, declaration.reference);
    }
  }

  const compact = source.replace(/\s*\n\s*/g, " ");
  const creations = new Map<
    string,
    {
      target: Reference;
      duration: number;
      easingStyle: PolyTweenRequest["easingStyle"];
      easingDirection: PolyTweenRequest["easingDirection"];
      goals: string;
    }
  >();
  const createPattern =
    /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*TweenService(?::Create|\.Create|::Create)\(\s*([A-Za-z_]\w*)\s*,\s*(?:TweenInfo(?:\.new)?|new\s+TweenInfo)\s*\(\s*(\d+(?:\.\d+)?)([^)]*)\)\s*,\s*(.+?)\)\s*;?(?=\s*[A-Za-z_]\w*(?::|\.|::)Play|\s*$)/g;
  for (const match of compact.matchAll(createPattern)) {
    const target = references.get(match[2]);
    if (target?.kind !== "world") continue;
    const style =
      match[4].match(/EasingStyle(?:\.|::)(Linear|Quad|Cubic)/)?.[1] ??
      "Linear";
    const direction =
      match[4].match(/EasingDirection(?:\.|::)(InOut|In|Out)/)?.[1] ?? "Out";
    creations.set(match[1], {
      target,
      duration: Math.max(0.01, Number(match[3]) || 0.01),
      easingStyle: style as PolyTweenRequest["easingStyle"],
      easingDirection: direction as PolyTweenRequest["easingDirection"],
      goals: match[5],
    });
  }

  const requests: PolyTweenRequest[] = [];
  for (const [variable, tween] of creations) {
    const playPattern = new RegExp(
      String.raw`\b${variable}(?::|\.|::)Play\s*\(\s*\)`,
    );
    if (!playPattern.test(compact)) continue;
    const object = project.objects.find((item) => item.id === tween.target.id);
    if (!object) continue;
    const from = {
      position: [...object.position] as [number, number, number],
      rotation: [...object.rotation] as [number, number, number],
      scale: [...object.scale] as [number, number, number],
      transparency: object.transparency,
      color: object.color,
    };
    const vectorGoal = (property: string) =>
      tween.goals.match(
        new RegExp(
          String.raw`\b${property}\s*=\s*((?:new\s+)?Vector3(?:(?:::new|\.new))?\s*\([^)]+\))`,
          "i",
        ),
      )?.[1];
    const position = vectorGoal("Position");
    const rotation = vectorGoal("Rotation");
    const size = vectorGoal("Size");
    const transparency = tween.goals.match(
      /\bTransparency\s*=\s*(-?\d+(?:\.\d+)?)/i,
    )?.[1];
    const color = tween.goals.match(/\bColor\s*=\s*["'](#[0-9a-f]{6})["']/i)?.[1];
    if (position) assignProperty(project, tween.target, "Position", position);
    if (rotation) assignProperty(project, tween.target, "Rotation", rotation);
    if (size) assignProperty(project, tween.target, "Size", size);
    if (transparency) {
      assignProperty(project, tween.target, "Transparency", transparency);
    }
    if (color) assignProperty(project, tween.target, "Color", JSON.stringify(color));
    const updated = project.objects.find((item) => item.id === tween.target.id);
    if (!updated) continue;
    requests.push({
      id: `${script.id}-${variable}-${Date.now()}-${requests.length}`,
      objectId: updated.id,
      duration: tween.duration,
      easingStyle: tween.easingStyle,
      easingDirection: tween.easingDirection,
      from,
      to: {
        position: [...updated.position],
        rotation: [...updated.rotation],
        scale: [...updated.scale],
        transparency: updated.transparency,
        color: updated.color,
      },
    });
  }
  return requests;
}

function dispatchRemoteServerEvent(
  project: PolyProject,
  remoteId: string,
  argumentsList: PolyStoredValue[],
  output: PolyRuntimeResult["output"],
  depth: number,
  tweenRequests: PolyTweenRequest[],
  soundRequests: PolySoundRequest[],
): void {
  if (depth > 8) {
    output.push({
      level: "error",
      message: "Remote callback depth exceeded the safe limit.",
      scriptName: "Runtime",
    });
    return;
  }
  for (const script of project.scripts.filter((item) => item.kind === "script")) {
    for (const handler of remoteServerHandlers(script).filter(
      (candidate) => candidate.kind === "event" && candidate.closed,
    )) {
      const reference = handlerTargetReference(
        handler.target,
        handler.prelude,
        script,
        project,
      );
      if (reference?.kind !== "remote" || reference.id !== remoteId) continue;
      executeScript(
        script,
        project,
        output,
        `${handler.prelude}\n${handler.body}`,
        remoteCallbackValues(handler, argumentsList),
        depth + 1,
        undefined,
        tweenRequests,
        soundRequests,
      );
    }
  }
}

function dispatchRemoteServerFunction(
  project: PolyProject,
  remoteId: string,
  argumentsList: PolyStoredValue[],
  output: PolyRuntimeResult["output"],
  depth: number,
  tweenRequests: PolyTweenRequest[],
  soundRequests: PolySoundRequest[],
): PolyStoredValue {
  if (depth > 8) {
    output.push({
      level: "error",
      message: "Remote callback depth exceeded the safe limit.",
      scriptName: "Runtime",
    });
    return null;
  }
  for (const script of project.scripts.filter((item) => item.kind === "script")) {
    for (const handler of remoteServerHandlers(script).filter(
      (candidate) => candidate.kind === "function" && candidate.closed,
    )) {
      const reference = handlerTargetReference(
        handler.target,
        handler.prelude,
        script,
        project,
      );
      if (reference?.kind !== "remote" || reference.id !== remoteId) continue;
      return (
        executeScript(
          script,
          project,
          output,
          `${handler.prelude}\n${handler.body}`,
          remoteCallbackValues(handler, argumentsList),
          depth + 1,
          undefined,
          tweenRequests,
          soundRequests,
        ) ?? null
      );
    }
  }
  return null;
}

function dispatchRemoteClientEvent(
  project: PolyProject,
  remoteId: string,
  argumentsList: PolyStoredValue[],
  output: PolyRuntimeResult["output"],
  depth: number,
  tweenRequests: PolyTweenRequest[],
  soundRequests: PolySoundRequest[],
): void {
  if (depth > 8) {
    output.push({
      level: "error",
      message: "Remote callback depth exceeded the safe limit.",
      scriptName: "Runtime",
    });
    return;
  }
  for (const script of project.scripts.filter((item) => item.kind === "localScript")) {
    for (const handler of remoteClientHandlers(script).filter(
      (candidate) => candidate.kind === "event" && candidate.closed,
    )) {
      const reference = handlerTargetReference(
        handler.target,
        handler.prelude,
        script,
        project,
      );
      if (reference?.kind !== "remote" || reference.id !== remoteId) continue;
      executeScript(
        script,
        project,
        output,
        `${handler.prelude}\n${handler.body}`,
        remoteCallbackValues(handler, argumentsList, false),
        depth + 1,
        undefined,
        tweenRequests,
        soundRequests,
      );
    }
  }
}

function executeScript(
  script: PolyScript,
  project: PolyProject,
  output: PolyRuntimeResult["output"],
  sourceOverride?: string,
  initialValues?: ReadonlyMap<string, PolyStoredValue>,
  remoteDepth = 0,
  initialReferences?: ReadonlyMap<string, Reference>,
  tweenRequests: PolyTweenRequest[] = [],
  soundRequests: PolySoundRequest[] = [],
): PolyStoredValue | undefined {
  const variables = new Map<string, Reference>(initialReferences);
  const modules = new Map<string, Record<string, PolyStoredValue>>();
  const stores = new Map<string, string>();
  const values = new Map<string, PolyStoredValue>(initialValues);
  const sourceText = sourceOverride ?? withoutEventHandlers(script);
  tweenRequests.push(...requestedTweens(sourceText, script, project));
  for (const source of sourceText.split("\n")) {
    const returnValue = source.match(/^\s*return\s+(.+?)\s*;?\s*$/);
    if (returnValue) {
      return (
        resolveExpressionValue(
          returnValue[1],
          project,
          variables,
          values,
          modules,
        ) ?? null
      );
    }
    const moduleDeclaration = findModuleDeclaration(source, project);
    if (moduleDeclaration?.module) {
      modules.set(
        moduleDeclaration.variable,
        moduleExports(moduleDeclaration.module),
      );
      continue;
    }
    const dataDelete = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.)(?:RemoveAsync|Delete)\(\s*["']([^"']+)["']\s*\)\s*;?\s*$/,
    );
    if (dataDelete) {
      const storeName = stores.get(dataDelete[1]);
      if (storeName) delete project.dataStores[storeName]?.[dataDelete[2]];
      continue;
    }
    const leaderstatCall = source.match(
      /^\s*Leaderstats(?::|\.|::)(Set|Add)\(\s*[^,]+\s*,\s*["']([^"']+)["']\s*,\s*(.+?)\s*\)\s*;?\s*$/,
    );
    if (leaderstatCall) {
      const stat = project.leaderstats.find(
        (candidate) => candidate.name === leaderstatCall[2],
      );
      if (!stat) {
        output.push({
          level: "error",
          message: `Leaderstat ${leaderstatCall[2]} does not exist.`,
          scriptName: script.name,
        });
      } else if (stat.type === "number") {
        const value = Number(
          resolveRawValue(leaderstatCall[3], values, modules).replace(/;$/, ""),
        );
        if (!Number.isFinite(value)) {
          output.push({
            level: "error",
            message: `${stat.name} must be set to a number.`,
            scriptName: script.name,
          });
        } else {
          stat.defaultValue =
            leaderstatCall[1] === "Add"
              ? Number(stat.defaultValue) + value
              : value;
        }
      } else if (leaderstatCall[1] === "Add") {
        output.push({
          level: "error",
          message: `${stat.name} is a string and cannot use Add.`,
          scriptName: script.name,
        });
      } else {
        stat.defaultValue =
          parseString(resolveRawValue(leaderstatCall[3], values, modules)) ??
          String(leaderstatCall[3]);
      }
      continue;
    }
    const dataStoreDeclaration = findDataStoreDeclaration(source);
    if (dataStoreDeclaration) {
      stores.set(dataStoreDeclaration.variable, dataStoreDeclaration.storeName);
      project.dataStores[dataStoreDeclaration.storeName] ??= {};
      continue;
    }
    const dataGet = source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)(?::|\.)(?:GetAsync|Get)\(\s*["']([^"']+)["']\s*\)\s*;?/,
    );
    if (dataGet) {
      const storeName = stores.get(dataGet[2]);
      if (storeName) {
        values.set(
          dataGet[1],
          project.dataStores[storeName]?.[dataGet[3]] ?? null,
        );
      }
      continue;
    }
    const dataSet = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.)(?:SetAsync|Set)\(\s*["']([^"']+)["']\s*,\s*(.+?)\s*\)\s*;?\s*$/,
    );
    if (dataSet) {
      const storeName = stores.get(dataSet[1]);
      const value = parseStoredValue(
        resolveRawValue(dataSet[3], values, modules),
      );
      if (storeName && value !== undefined) {
        project.dataStores[storeName] ??= {};
        project.dataStores[storeName][dataSet[2]] = value;
      }
      continue;
    }
    const attributeGet = source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)(?::|\.)(?:GetAttribute)\(\s*["']([^"']+)["']\s*\)\s*;?/,
    );
    if (attributeGet) {
      const reference = variables.get(attributeGet[2]);
      if (reference?.kind === "world") {
        const object = project.objects.find((item) => item.id === reference.id);
        values.set(attributeGet[1], object?.attributes[attributeGet[3]] ?? null);
      }
      continue;
    }
    const attributeSet = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.)(?:SetAttribute)\(\s*["']([^"']+)["']\s*,\s*(.+?)\s*\)\s*;?\s*$/,
    );
    if (attributeSet) {
      const reference = variables.get(attributeSet[1]);
      const value = parseStoredValue(
        resolveRawValue(attributeSet[3], values, modules),
      );
      if (reference?.kind === "world" && value !== undefined) {
        const object = project.objects.find((item) => item.id === reference.id);
        if (object) object.attributes[attributeSet[2]] = value;
      }
      continue;
    }
    const tagCall = source.match(
      /^\s*CollectionService(?::|\.|::)(AddTag|RemoveTag)\(\s*([A-Za-z_]\w*)\s*,\s*["']([^"']+)["']\s*\)\s*;?\s*$/,
    );
    if (tagCall) {
      const reference = variables.get(tagCall[2]);
      if (reference?.kind === "world") {
        const object = project.objects.find((item) => item.id === reference.id);
        if (object) {
          object.tags =
            tagCall[1] === "AddTag"
              ? [...new Set([...object.tags, tagCall[3]])]
              : object.tags.filter((tag) => tag !== tagCall[3]);
        }
      }
      continue;
    }
    const declaration = findReferenceDeclaration(source, project, script);
    if (declaration?.reference) {
      variables.set(declaration.variable, declaration.reference);
      continue;
    }
    const soundCall = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.|::)(Play|Pause|Stop)\s*\(\s*\)\s*;?\s*$/,
    );
    if (soundCall) {
      const reference = variables.get(soundCall[1]);
      if (!reference) continue;
      const object =
        reference?.kind === "world"
          ? project.objects.find((item) => item.id === reference.id)
          : null;
      if (object?.type === "sound") {
        soundRequests.push({
          id: `${script.id}-${object.id}-${Date.now()}-${soundRequests.length}`,
          objectId: object.id,
          action: soundCall[2].toLowerCase() as PolySoundRequest["action"],
        });
      } else {
        output.push({
          level: "error",
          message: `${soundCall[1]} is not a Sound object.`,
          scriptName: script.name,
        });
      }
      continue;
    }
    const remoteCall = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.|::)(FireServer|FireClient|FireAllClients|InvokeServer|InvokeClient)\s*\((.*?)\)\s*;?\s*$/,
    );
    if (remoteCall) {
      const reference = variables.get(remoteCall[1]);
      if (reference?.kind === "remote") {
        const remote = project.remotes.find((item) => item.id === reference.id);
        const error = remoteCallError(project, reference, remoteCall[2], script);
        if (remote && !error) {
          const argumentsList = callArguments(
            remoteCall[3],
            values,
            modules,
          );
          if (remoteCall[2] === "FireServer") {
            dispatchRemoteServerEvent(
              project,
              remote.id,
              argumentsList,
              output,
              remoteDepth,
              tweenRequests,
              soundRequests,
            );
          } else if (remoteCall[2] === "FireAllClients") {
            dispatchRemoteClientEvent(
              project,
              remote.id,
              argumentsList,
              output,
              remoteDepth,
              tweenRequests,
              soundRequests,
            );
          } else if (remoteCall[2] === "FireClient") {
            dispatchRemoteClientEvent(
              project,
              remote.id,
              argumentsList.slice(1),
              output,
              remoteDepth,
              tweenRequests,
              soundRequests,
            );
          }
          output.push({
            level: "info",
            message: `${remote.name}.${remoteCall[2]}(${remoteCall[3]})`,
            scriptName: script.name,
          });
        }
      }
      continue;
    }
    const remoteInvoke = source.match(
      /(?:local|var|auto(?:\s*&)?|const\s+auto(?:\s*&)?)[\s]+([A-Za-z_]\w*)\s*=\s*([A-Za-z_]\w*)(?::|\.|::)(InvokeServer|InvokeClient)\s*\((.*?)\)\s*;?\s*$/,
    );
    if (remoteInvoke) {
      const reference = variables.get(remoteInvoke[2]);
      if (reference?.kind === "remote") {
        const remote = project.remotes.find((item) => item.id === reference.id);
        const error = remoteCallError(project, reference, remoteInvoke[3], script);
        if (remote && !error) {
          const argumentsList = callArguments(
            remoteInvoke[4],
            values,
            modules,
          );
          values.set(
            remoteInvoke[1],
            remoteInvoke[3] === "InvokeServer"
              ? dispatchRemoteServerFunction(
                  project,
                  remote.id,
                  argumentsList,
                  output,
                  remoteDepth,
                  tweenRequests,
                  soundRequests,
                )
              : null,
          );
          output.push({
            level: "info",
            message: `${remote.name}.${remoteInvoke[3]}(${remoteInvoke[4]})`,
            scriptName: script.name,
          });
        }
      }
      continue;
    }
    const logged = outputCall(source);
    if (logged) {
      output.push({
        level: logged.level,
        message: logged.text,
        scriptName: script.name,
      });
      continue;
    }
    const assignment = source.match(
      /^\s*([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\.([A-Za-z_]\w*)\s*=\s*(.+?)\s*$/,
    );
    if (!assignment) continue;
    const reference =
      variables.get(assignment[1]) ??
      findDirectReference(assignment[1], project, script);
    if (!reference) continue;
    const error = assignProperty(
      project,
      reference,
      assignment[2],
      resolveAssignmentValue(
        assignment[3],
        project,
        variables,
        values,
        modules,
      ),
    );
    if (error) {
      output.push({ level: "error", message: error, scriptName: script.name });
    }
  }
}

function requestedAnimations(source: string, project: PolyProject): string[] {
  const requests: string[] = [];
  const pattern =
    /Animations(?:(?:::|\.)Play|:Play)\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(pattern)) {
    if (
      project.animations.some((animation) => animation.name === match[1]) &&
      !requests.includes(match[1])
    ) {
      requests.push(match[1]);
    }
  }
  return requests;
}

function applyNearestDamage(
  source: string,
  project: PolyProject,
  toolId: string,
  output: PolyRuntimeResult["output"],
  scriptName: string,
) {
  const match = source.match(
    /Combat(?:(?:::|\.)DamageNearest|:DamageNearest)\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/,
  );
  if (!match) return;
  const damage = Math.max(0, Math.min(500, Number(match[1])));
  const range = Math.max(0, Math.min(100, Number(match[2])));
  const tool = project.objects.find((object) => object.id === toolId);
  if (!tool) return;
  const target = project.models
    .filter(
      (model) =>
        model.tags.includes("Humanoid") &&
        model.id !== tool.modelId &&
        Number(model.attributes.Health ?? 100) > 0,
    )
    .map((model) => {
      const root = project.objects.find(
        (object) =>
          object.modelId === model.id && object.type === "humanoidRootPart",
      );
      if (!root) return null;
      const distance = Math.hypot(
        root.position[0] - tool.position[0],
        root.position[1] - tool.position[1],
        root.position[2] - tool.position[2],
      );
      return { model, root, distance };
    })
    .filter(
      (
        candidate,
      ): candidate is {
        model: PolyModel;
        root: PolyWorldObject;
        distance: number;
      } => Boolean(candidate && candidate.distance <= range),
    )
    .sort((a, b) => a.distance - b.distance)[0];
  if (!target) {
    output.push({
      level: "info",
      message: "Sword swing did not hit a Humanoid.",
      scriptName,
    });
    return;
  }
  const health = Math.max(
    0,
    Number(target.model.attributes.Health ?? 100) - damage,
  );
  target.model.attributes.Health = health;
  target.root.attributes.Health = health;
  output.push({
    level: "info",
    message: `${target.model.name} took ${damage} damage (${health} HP remaining).`,
    scriptName,
  });
}

export function activatePolyGui(
  input: PolyProject,
  guiObjectId: string,
): PolyRuntimeResult {
  const project = normalizePolyProject(input);
  const scripts = project.scripts.filter(
    (script) =>
      script.kind === "localScript" &&
      script.parent === guiObjectId &&
      project.gui.some(
        (gui) =>
          gui.id === guiObjectId &&
          (gui.type === "textButton" || gui.type === "imageButton"),
      ),
  );
  const diagnostics = scripts.flatMap((script) =>
    analyzePolyScript(script, project).map((diagnostic) => ({
      ...diagnostic,
      scriptId: script.id,
      scriptName: script.name,
    })),
  );
  const output: PolyRuntimeResult["output"] = [];
  const animationRequests: string[] = [];
  const tweenRequests: PolyTweenRequest[] = [];
  const soundRequests: PolySoundRequest[] = [];

  for (const script of scripts) {
    if (
      diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      continue;
    }
    for (const handler of guiEventHandlers(script)) {
      executeScript(
        script,
        project,
        output,
        `${handler.prelude}\n${handler.body}`,
        undefined,
        0,
        undefined,
        tweenRequests,
        soundRequests,
      );
      for (const name of requestedAnimations(handler.body, project)) {
        if (!animationRequests.includes(name)) animationRequests.push(name);
      }
    }
  }

  return {
    project,
    diagnostics,
    output,
    animationRequests,
    animationVersion: animationRequests.length > 0 ? 1 : 0,
    tweenRequests,
    tweenVersion: tweenRequests.length > 0 ? 1 : 0,
    soundRequests,
    soundVersion: soundRequests.length > 0 ? 1 : 0,
  };
}

export function activatePolyTool(
  input: PolyProject,
  toolId: string,
): PolyRuntimeResult {
  const project = normalizePolyProject(input);
  const tool = project.objects.find(
    (object) => object.id === toolId && object.type === "tool",
  );
  const scripts = tool
    ? project.scripts.filter(
        (script) =>
          script.kind === "localScript" &&
          (script.parent === toolId ||
            project.objects.some(
              (object) =>
                object.id === script.parent && object.parentId === toolId,
            )),
      )
    : [];
  const diagnostics = scripts.flatMap((script) =>
    analyzePolyScript(script, project).map((diagnostic) => ({
      ...diagnostic,
      scriptId: script.id,
      scriptName: script.name,
    })),
  );
  const output: PolyRuntimeResult["output"] = [];
  const animationRequests: string[] = [];
  const tweenRequests: PolyTweenRequest[] = [];
  const soundRequests: PolySoundRequest[] = [];
  for (const script of scripts) {
    for (const handler of guiEventHandlers(script).filter(
      (candidate) => candidate.event === "Activated",
    )) {
      executeScript(
        script,
        project,
        output,
        `${handler.prelude}\n${handler.body}`,
        undefined,
        0,
        undefined,
        tweenRequests,
        soundRequests,
      );
      applyNearestDamage(handler.body, project, toolId, output, script.name);
      for (const name of requestedAnimations(handler.body, project)) {
        if (!animationRequests.includes(name)) animationRequests.push(name);
      }
    }
  }
  return {
    project,
    diagnostics,
    output,
    animationRequests,
    animationVersion: animationRequests.length > 0 ? 1 : 0,
    tweenRequests,
    tweenVersion: tweenRequests.length > 0 ? 1 : 0,
    soundRequests,
    soundVersion: soundRequests.length > 0 ? 1 : 0,
  };
}

export function activatePolyTouched(
  input: PolyProject,
  worldObjectId: string,
  event: "Touched" | "TouchEnded" = "Touched",
): PolyRuntimeResult {
  const project = normalizePolyProject(input);
  const scripts = project.scripts.filter(
    (script) =>
      script.kind === "script" &&
      touchedEventHandlers(script).some(
        (handler) =>
          handler.event === event &&
          eventTargetReference(handler, script, project)?.kind === "world" &&
          eventTargetReference(handler, script, project)?.id === worldObjectId,
      ),
  );
  const diagnostics = scripts.flatMap((script) =>
    analyzePolyScript(script, project).map((diagnostic) => ({
      ...diagnostic,
      scriptId: script.id,
      scriptName: script.name,
    })),
  );
  const output: PolyRuntimeResult["output"] = [];
  const animationRequests: string[] = [];
  const tweenRequests: PolyTweenRequest[] = [];
  const soundRequests: PolySoundRequest[] = [];

  for (const script of scripts) {
    if (
      diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      continue;
    }
    for (const handler of touchedEventHandlers(script)) {
      if (handler.event !== event) continue;
      const reference = eventTargetReference(handler, script, project);
      if (reference?.kind !== "world" || reference.id !== worldObjectId) continue;
      executeScript(
        script,
        project,
        output,
        `${handler.prelude}\n${handler.body}`,
        undefined,
        0,
        handler.parameters[0]
          ? new Map([
              [
                handler.parameters[0],
                { kind: "player", id: "LocalPlayer" } as const,
              ],
            ])
          : undefined,
        tweenRequests,
        soundRequests,
      );
      for (const name of requestedAnimations(handler.body, project)) {
        if (!animationRequests.includes(name)) animationRequests.push(name);
      }
    }
  }

  return {
    project,
    diagnostics,
    output,
    animationRequests,
    animationVersion: animationRequests.length > 0 ? 1 : 0,
    tweenRequests,
    tweenVersion: tweenRequests.length > 0 ? 1 : 0,
    soundRequests,
    soundVersion: soundRequests.length > 0 ? 1 : 0,
  };
}

export function activatePolyInput(
  input: PolyProject,
  keyCode: string,
  event: "InputBegan" | "InputEnded" = "InputBegan",
): PolyRuntimeResult {
  const project = normalizePolyProject(input);
  const scripts = project.scripts.filter(
    (script) =>
      script.kind === "localScript" &&
      inputScriptHandlers(script).some(
        (handler) =>
          handler.event === event &&
          (!handler.keyCode ||
            handler.keyCode.toLowerCase() === keyCode.toLowerCase()),
      ),
  );
  const diagnostics = scripts.flatMap((script) =>
    analyzePolyScript(script, project).map((diagnostic) => ({
      ...diagnostic,
      scriptId: script.id,
      scriptName: script.name,
    })),
  );
  const output: PolyRuntimeResult["output"] = [];
  const animationRequests: string[] = [];
  const tweenRequests: PolyTweenRequest[] = [];
  const soundRequests: PolySoundRequest[] = [];
  for (const script of scripts) {
    if (
      diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      continue;
    }
    for (const handler of inputScriptHandlers(script)) {
      if (
        handler.event !== event ||
        (handler.keyCode &&
          handler.keyCode.toLowerCase() !== keyCode.toLowerCase())
      ) {
        continue;
      }
      executeScript(
        script,
        project,
        output,
        `${handler.prelude}\n${handler.body}`,
        handler.parameters[0]
          ? new Map([[handler.parameters[0], keyCode]])
          : undefined,
        0,
        undefined,
        tweenRequests,
        soundRequests,
      );
      for (const name of requestedAnimations(handler.body, project)) {
        if (!animationRequests.includes(name)) animationRequests.push(name);
      }
    }
  }
  return {
    project,
    diagnostics,
    output,
    animationRequests,
    animationVersion: animationRequests.length > 0 ? 1 : 0,
    tweenRequests,
    tweenVersion: tweenRequests.length > 0 ? 1 : 0,
    soundRequests,
    soundVersion: soundRequests.length > 0 ? 1 : 0,
  };
}

export function executePolyCommand(
  input: PolyRuntimeResult,
  rawCommand: string,
): PolyRuntimeResult {
  const command = rawCommand.trim();
  if (!command) return input;

  const project = normalizePolyProject(input.project);
  const output = [...input.output];
  const reply = (
    message: string,
    level: "info" | "warning" | "error" = "info",
  ) => output.push({ level, message, scriptName: "Command" });
  const tokens =
    command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) =>
      token.replace(/^(['"])(.*)\1$/, "$2"),
    ) ?? [];
  const root = tokens[0]?.toLowerCase();

  if (root === "help") {
    reply(
      "Commands: leaderstats set/add, data get/set/delete, player sprint, run, clear, help",
    );
  } else if (root === "clear") {
    return { ...input, project, output: [] };
  } else if (root === "leaderstats") {
    const action = tokens[1]?.toLowerCase();
    const statName = tokens[3];
    const stat = project.leaderstats.find(
      (candidate) => candidate.name.toLowerCase() === statName?.toLowerCase(),
    );
    if (!["set", "add"].includes(action) || !stat || tokens[4] === undefined) {
      reply("Usage: leaderstats set|add <player> <stat> <value>", "error");
    } else if (stat.type === "number") {
      const value = Number(tokens[4]);
      if (!Number.isFinite(value)) {
        reply("Leaderstat value must be a number.", "error");
      } else {
        stat.defaultValue =
          action === "add" ? Number(stat.defaultValue) + value : value;
        reply(`${stat.name} is now ${stat.defaultValue}.`);
      }
    } else if (action === "add") {
      reply("String leaderstats cannot use add.", "error");
    } else {
      stat.defaultValue = tokens.slice(4).join(" ");
      reply(`${stat.name} is now ${stat.defaultValue}.`);
    }
  } else if (root === "data") {
    const action = tokens[1]?.toLowerCase();
    const storeName = tokens[2];
    const key = tokens[3];
    if (!storeName || !key || !["get", "set", "delete"].includes(action)) {
      reply("Usage: data get|set|delete <store> <key> [value]", "error");
    } else if (action === "get") {
      reply(
        `${storeName}.${key} = ${JSON.stringify(
          project.dataStores[storeName]?.[key] ?? null,
        )}`,
      );
    } else if (action === "delete") {
      delete project.dataStores[storeName]?.[key];
      reply(`Deleted ${storeName}.${key}.`);
    } else {
      const rawValue = tokens.slice(4).join(" ");
      const value = parseStoredValue(rawValue);
      if (value === undefined) {
        reply(
          "Data value must be a string, number, boolean, or null.",
          "error",
        );
      } else {
        project.dataStores[storeName] ??= {};
        project.dataStores[storeName][key] = value;
        reply(`Saved ${storeName}.${key}.`);
      }
    }
  } else if (root === "player" && tokens[2]?.toLowerCase() === "sprint") {
    const enabled = tokens[3]?.toLowerCase();
    if (!["on", "off"].includes(enabled)) {
      reply("Usage: player <name> sprint on|off", "error");
    } else {
      project.playerSettings.sprintEnabled = enabled === "on";
      reply(`Sprinting ${enabled}.`);
    }
  } else if (root === "run") {
    const name = tokens.slice(1).join(" ");
    const script = project.scripts.find(
      (candidate) => candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (!script) {
      reply(`Script "${name}" was not found.`, "error");
    } else {
      executeScript(script, project, output);
      reply(`Ran ${script.name}.`);
    }
  } else {
    reply(`Unknown command: ${tokens[0]}. Type help for commands.`, "error");
  }

  return { ...input, project, output };
}

export function runPolyProject(input: PolyProject): PolyRuntimeResult {
  const project = normalizePolyProject(input);
  const diagnostics = project.scripts.flatMap((script) =>
    analyzePolyScript(script, project).map((diagnostic) => ({
      ...diagnostic,
      scriptId: script.id,
      scriptName: script.name,
    })),
  );
  const output: PolyRuntimeResult["output"] = [];
  const animationRequests: string[] = [];
  const tweenRequests: PolyTweenRequest[] = [];
  const soundRequests: PolySoundRequest[] = [];

  for (const script of project.scripts.filter((item) => item.kind === "script")) {
    if (
      !diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      executeScript(
        script,
        project,
        output,
        undefined,
        undefined,
        0,
        undefined,
        tweenRequests,
        soundRequests,
      );
      for (const name of requestedAnimations(script.source, project)) {
        if (!animationRequests.includes(name)) animationRequests.push(name);
      }
    }
  }
  for (const script of project.scripts.filter(
    (item) => item.kind === "localScript",
  )) {
    if (
      !diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      executeScript(
        script,
        project,
        output,
        undefined,
        undefined,
        0,
        undefined,
        tweenRequests,
        soundRequests,
      );
      for (const name of requestedAnimations(script.source, project)) {
        if (!animationRequests.includes(name)) animationRequests.push(name);
      }
    }
  }

  return {
    project,
    diagnostics,
    output,
    animationRequests,
    animationVersion: animationRequests.length > 0 ? 1 : 0,
    tweenRequests,
    tweenVersion: tweenRequests.length > 0 ? 1 : 0,
    soundRequests,
    soundVersion: soundRequests.length > 0 ? 1 : 0,
  };
}
