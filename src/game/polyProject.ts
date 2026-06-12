export type PolyLanguage = "luau" | "cpp" | "csharp";
export type PolyScriptKind = "script" | "localScript" | "moduleScript";
export type PolyScriptParent =
  | "ServerScriptService"
  | "StarterPlayerScripts"
  | string;

export type PolyWorldObject = {
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
  maxHealth: number;
};

export type PolyLeaderstat = {
  id: string;
  name: string;
  type: "number" | "string";
  defaultValue: number | string;
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
]);
const PLAYER_PROPERTIES = new Set([
  "Health",
  "WalkSpeed",
  "JumpPower",
  "CameraFieldOfView",
  "MaxHealth",
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
    maxHealth: normalized.playerSettings?.maxHealth ?? 100,
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

type GuiEventHandler = {
  event: "MouseButton1Click" | "Activated";
  prelude: string;
  body: string;
  line: number;
  closed: boolean;
  startIndex: number;
  endIndex: number;
};

function guiEventHandlers(script: PolyScript): GuiEventHandler[] {
  const lines = script.source.split("\n");
  const handlers: GuiEventHandler[] = [];
  const startPatterns = [
    /^\s*(?:script\.Parent|[A-Za-z_]\w*)\.(MouseButton1Click|Activated)\s*:\s*Connect\s*\(\s*function\s*\([^)]*\)\s*$/,
    /^\s*(?:Script\.Parent|[A-Za-z_]\w*)\.(MouseButton1Click|Activated)\s*\+=\s*\([^)]*\)\s*=>\s*\{\s*$/,
    /^\s*(?:Script\.Parent|[A-Za-z_]\w*)\.(MouseButton1Click|Activated)\.Connect\s*\(.*\{\s*$/,
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

    let endIndex = lines.length - 1;
    let closed = false;
    for (let candidate = index + 1; candidate < lines.length; candidate += 1) {
      if (endPatterns[syntaxIndex].test(lines[candidate])) {
        endIndex = candidate;
        closed = true;
        break;
      }
    }
    handlers.push({
      event: startMatch[1] as GuiEventHandler["event"],
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

function withoutGuiEventHandlers(script: PolyScript): string {
  const lines = script.source.split("\n");
  const ignored = new Set<number>();
  for (const handler of guiEventHandlers(script)) {
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
    if (["Name", "Text", "BackgroundColor", "TextColor"].includes(property)) {
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
    } else if (property === "Visible") {
      const value = parseBoolean(rawValue);
      if (value === null) return "Visible must be true or false.";
      gui.visible = value;
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

  const value = parseNumber(rawValue);
  if (value === null || value <= 0 || value > 500) {
    return `${property} must be a positive number no greater than 500.`;
  }
  if (property === "WalkSpeed") project.playerSettings.walkSpeed = value;
  if (property === "Health") {
    project.playerSettings.health = Math.min(
      value,
      project.playerSettings.maxHealth,
    );
  }
  if (property === "JumpPower") project.playerSettings.jumpPower = value;
  if (property === "CameraFieldOfView") {
    if (value < 20 || value > 120) {
      return "CameraFieldOfView must be between 20 and 120.";
    }
    project.playerSettings.cameraFieldOfView = value;
  }
  if (property === "MaxHealth") {
    project.playerSettings.maxHealth = value;
    project.playerSettings.health = Math.min(
      project.playerSettings.health,
      value,
    );
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
      /\.(?:MouseButton1Click|Activated)\s*:\s*Connect\s*\(\s*function\b/.test(
        code,
      )
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
  if (buttonHandlers.length > 0 && guiScriptParent?.type !== "textButton") {
    diagnostics.push({
      line: buttonHandlers[0].line,
      column: 1,
      endColumn: 2,
      severity: "error",
      message: "MouseButton1Click and Activated require a TextButton parent.",
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
  const validationProject = cloneProject(project);
  const variables = new Map<string, Reference>();
  const modules = new Map<string, Record<string, PolyStoredValue>>();
  const stores = new Map<string, string>();
  const values = new Map<string, PolyStoredValue>();
  const lines = script.source.split("\n");

  lines.forEach((source, index) => {
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
      } else {
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

function executeScript(
  script: PolyScript,
  project: PolyProject,
  output: PolyRuntimeResult["output"],
  sourceOverride?: string,
): void {
  const variables = new Map<string, Reference>();
  const modules = new Map<string, Record<string, PolyStoredValue>>();
  const stores = new Map<string, string>();
  const values = new Map<string, PolyStoredValue>();
  const sourceText = sourceOverride ?? withoutGuiEventHandlers(script);
  for (const source of sourceText.split("\n")) {
    const moduleDeclaration = findModuleDeclaration(source, project);
    if (moduleDeclaration?.module) {
      modules.set(
        moduleDeclaration.variable,
        moduleExports(moduleDeclaration.module),
      );
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
    const remoteCall = source.match(
      /^\s*([A-Za-z_]\w*)(?::|\.|::)(FireServer|FireClient|FireAllClients|InvokeServer|InvokeClient)\s*\((.*?)\)\s*;?\s*$/,
    );
    if (remoteCall) {
      const reference = variables.get(remoteCall[1]);
      if (reference?.kind === "remote") {
        const remote = project.remotes.find((item) => item.id === reference.id);
        const error = remoteCallError(project, reference, remoteCall[2], script);
        if (remote && !error) {
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
          values.set(remoteInvoke[1], null);
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
      resolveRawValue(assignment[3], values, modules),
    );
    if (error) {
      output.push({ level: "error", message: error, scriptName: script.name });
    }
  }
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
        (gui) => gui.id === guiObjectId && gui.type === "textButton",
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
      );
    }
  }

  return { project, diagnostics, output };
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

  for (const script of project.scripts.filter((item) => item.kind === "script")) {
    if (
      !diagnostics.some(
        (diagnostic) =>
          diagnostic.scriptId === script.id && diagnostic.severity === "error",
      )
    ) {
      executeScript(script, project, output);
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
      executeScript(script, project, output);
    }
  }

  return { project, diagnostics, output };
}
