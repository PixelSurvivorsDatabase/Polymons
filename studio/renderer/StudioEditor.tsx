import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import {
  Activity,
  Award,
  Box,
  Boxes,
  Cable,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Crosshair,
  Database,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  Grid3X3,
  Image,
  LayoutPanelTop,
  Monitor,
  Package,
  MousePointer2,
  Move3D,
  Play,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Search,
  Server,
  Settings2,
  Square,
  Tickets,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Upload,
  UserRound,
  Volume2,
  CircleHelp,
  Camera,
  PanelLeft,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ACESFilmicToneMapping,
  ArrowHelper,
  Color,
  Euler,
  Object3D,
  PCFSoftShadowMap,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from "three";
import { TransformControls as ThreeTransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  analyzePolyScript,
  type PolyDiagnostic,
  type PolyProject,
} from "../../src/game/polyProject";
import { createSurfaceTexture } from "../../src/game/surfaceTextures";
import {
  R6_ARM_CENTER_Y,
  R6_ARM_SIZE,
  R6_AVATAR_SCALE,
  R6_COLLIDER_HALF_HEIGHT,
  R6_COLLIDER_RADIUS,
  R6_HEAD_CENTER_Y,
  R6_HEAD_SIZE,
  R6_HIP_X,
  R6_HIP_Y,
  R6_LEG_CENTER_Y,
  R6_LEG_SIZE,
  R6_SHOULDER_X,
  R6_SHOULDER_Y,
  R6_TORSO_CENTER_Y,
  R6_TORSO_SIZE,
  R6_VISUAL_OFFSET,
} from "../../src/game/r6Geometry";
import {
  PART_IMAGE_FACE_KEYS,
  hasPartImageFaces,
  normalizePartImageFaces,
  type PartImageFace,
} from "../../src/game/partImageFaces";
import { usePartImageTextures } from "../../src/game/usePartImageTextures";
import { LightingRig } from "../../src/game/LightingRig";
import { normalizedObjGeometry } from "../../src/game/objMesh";
import classicSmileFaceUrl from "../../assets/avatar/faces/classic-smile.png";
import classicHeadObjSource from "../../assets/avatar/heads/classic-head.obj?raw";
import logo from "../../assets/studio/poly-studio-logo-dark.png";
import CodeEditor from "./CodeEditor";
import {
  alignSelectedObjects,
  distributeSelectedObjects,
  type AlignEdge,
  type ArrangeAxis,
} from "./builderTools";

type Selection =
  | { type: "world"; id: string }
  | { type: "model"; id: string }
  | { type: "remote"; id: string }
  | { type: "gui"; id: string }
  | { type: "script"; id: string }
  | { type: "value"; id: string }
  | { type: "player"; id: "LocalPlayer" }
  | { type: "service"; id: string }
  | null;

type StudioTool = "select" | "move" | "rotate" | "scale" | "camera";

type StudioPlaySpawn = {
  position: [number, number, number];
  rotationY: number;
};
type ContextTarget = Exclude<Selection, null>;
type ContextMenuState = {
  x: number;
  y: number;
  target: ContextTarget;
};
type ViewportTransform = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
};

const languageExtension: Record<StudioLanguage, string> = {
  luau: ".luau",
  cpp: ".cpp",
  csharp: ".cs",
};

const languageName: Record<StudioLanguage, string> = {
  luau: "Luau",
  cpp: "C++",
  csharp: "C#",
};

function starterSource(
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
Console::Log("Server script started");
`
      : `#include <poly/client.hpp>

auto player = Players::LocalPlayer;
player.WalkSpeed = 18;
Console::Log("Client script started");
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
Poly.Log("Server script started");
`
      : `using Poly;

var player = Players.LocalPlayer;
player.WalkSpeed = 18;
Poly.Log("Client script started");
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
print("Server script started")
`
    : `local player = Players.LocalPlayer

player.WalkSpeed = 18
print("Client script started")
`;
}

function buttonLocalScriptSource(language: StudioLanguage): string {
  if (language === "cpp") {
    return `#include <poly/client.hpp>

auto button = Script.Parent;
button.Activated.Connect([&]() {
    button.Text = "Clicked";
    Console::Log("Button activated");
});
`;
  }
  if (language === "csharp") {
    return `using Poly;

var button = Script.Parent;
button.Activated += () => {
    button.Text = "Clicked";
    Poly.Log("Button activated");
};
`;
  }
  return `local button = script.Parent

button.Activated:Connect(function()
    button.Text = "Clicked"
    print("Button activated")
end)
`;
}

function nextName(existing: string[], base: string): string {
  if (!existing.includes(base)) return base;
  let number = 2;
  while (existing.includes(`${base}${number}`)) number += 1;
  return `${base}${number}`;
}

type StudioSearchResult = {
  key: string;
  label: string;
  path: string;
  detail: string;
  selection: Exclude<Selection, null>;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isIdentifierName(value: string): boolean {
  return /^[A-Za-z_]\w*$/.test(value);
}

function quoteScriptString(value: string, quote: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(new RegExp(escapeRegExp(quote), "g"), `\\${quote}`);
}

function replaceNameReferences(
  source: string,
  oldName: string,
  newName: string,
  roots: string[],
): string {
  if (!oldName || oldName === newName) return source;
  const oldLiteral = escapeRegExp(oldName);
  let next = source;
  for (const root of roots) {
    const safeRoot = escapeRegExp(root);
    next = next
      .replace(
        new RegExp(`\\b${safeRoot}:FindFirstChild\\(\\s*(["'])${oldLiteral}\\1\\s*\\)`, "g"),
        (_match, quote: string) =>
          `${root}:FindFirstChild(${quote}${quoteScriptString(newName, quote)}${quote})`,
      )
      .replace(
        new RegExp(`\\b${safeRoot}\\.Find\\(\\s*(["'])${oldLiteral}\\1\\s*\\)`, "g"),
        (_match, quote: string) =>
          `${root}.Find(${quote}${quoteScriptString(newName, quote)}${quote})`,
      );
    if (isIdentifierName(oldName) && isIdentifierName(newName)) {
      next = next.replace(
        new RegExp(`\\b${safeRoot}\\.${escapeRegExp(oldName)}\\b`, "g"),
        () => `${root}.${newName}`,
      );
    }
  }
  return next;
}

function projectWithUpdatedReferences(
  project: StudioProject,
  oldName: string,
  newName: string,
  roots: string[],
): StudioProject {
  if (!oldName || oldName === newName) return project;
  let changed = false;
  const scripts = project.scripts.map((script) => {
    const source = replaceNameReferences(script.source, oldName, newName, roots);
    if (source === script.source) return script;
    changed = true;
    return { ...script, source };
  });
  return changed ? { ...project, scripts } : project;
}

function studioParentPath(project: StudioProject, parent: string, visited = new Set<string>()): string {
  if (visited.has(parent)) return "Circular parent";
  const nextVisited = new Set(visited).add(parent);
  const world = project.objects.find((item) => item.id === parent);
  if (world) return studioObjectPath(project, world);
  const model = project.models.find((item) => item.id === parent);
  if (model) return `Workspace / ${model.name}`;
  const gui = project.gui.find((item) => item.id === parent);
  if (gui) return studioGuiPath(project, gui);
  const script = project.scripts.find((item) => item.id === parent);
  if (script) return `${studioParentPath(project, script.parent, nextVisited)} / ${script.name}`;
  const value = project.values.find((item) => item.id === parent);
  if (value) return `${studioParentPath(project, value.parent, nextVisited)} / ${value.name}`;
  return parent;
}

function studioObjectPath(project: StudioProject, object: StudioObject): string {
  const names = [object.name];
  const visited = new Set([object.id]);
  let parentId = object.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = project.objects.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  const model = object.modelId
    ? project.models.find((item) => item.id === object.modelId)
    : null;
  return ["Workspace", model?.name, ...names].filter(Boolean).join(" / ");
}

function studioGuiPath(project: StudioProject, gui: StudioGuiObject): string {
  const names = [gui.name];
  const visited = new Set([gui.id]);
  let parentId = gui.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = project.gui.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parentId;
  }
  return ["StarterGui", ...names].join(" / ");
}

function buildStudioSearchResults(project: StudioProject, query: string): StudioSearchResult[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const results: StudioSearchResult[] = [];
  const add = (
    label: string,
    path: string,
    detail: string,
    selection: Exclude<Selection, null>,
    searchText = "",
  ) => {
    if (`${label} ${path} ${detail} ${searchText}`.toLowerCase().includes(normalized)) {
      results.push({
        key: `${selection.type}:${selection.id}:${results.length}`,
        label,
        path,
        detail,
        selection,
      });
    }
  };

  [
    "Workspace",
    "ServerScriptService",
    "ReplicatedStorage",
    "ServerStorage",
    "Lighting",
    "Players",
    "StarterPlayerScripts",
    "StarterGui",
    "DataStoreService",
    "Sky",
  ].forEach((service) =>
    add(service, service === "Sky" ? "Workspace / Sky" : service, "Service", {
      type: "service",
      id: service,
    }),
  );
  add("LocalPlayer", "Players / LocalPlayer", "Player", {
    type: "player",
    id: "LocalPlayer",
  });
  project.models.forEach((model) =>
    add(model.name, `Workspace / ${model.name}`, "Model", {
      type: "model",
      id: model.id,
    }),
  );
  project.objects.forEach((object) =>
    add(object.name, studioObjectPath(project, object), object.type, {
      type: "world",
      id: object.id,
    }),
  );
  project.scripts.forEach((script) =>
    add(
      script.name,
      `${studioParentPath(project, script.parent)} / ${script.name}`,
      script.source.toLowerCase().includes(normalized)
        ? `${script.kind} source match`
        : script.kind,
      { type: "script", id: script.id },
      script.source,
    ),
  );
  project.gui.forEach((gui) =>
    add(gui.name, studioGuiPath(project, gui), gui.type, {
      type: "gui",
      id: gui.id,
    }),
  );
  project.remotes.forEach((remote) =>
    add(remote.name, `ReplicatedStorage / ${remote.name}`, remote.kind, {
      type: "remote",
      id: remote.id,
    }),
  );
  project.values.forEach((value) =>
    add(value.name, `${studioParentPath(project, value.parent)} / ${value.name}`, value.type, {
      type: "value",
      id: value.id,
    }),
  );
  return results.slice(0, 200);
}

function collectWorldSubtreeIds(rootIds: string[], objects: StudioObject[]): string[] {
  const ids = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of objects) {
      if (object.parentId && ids.has(object.parentId) && !ids.has(object.id)) {
        ids.add(object.id);
        changed = true;
      }
    }
  }
  return objects.filter((object) => ids.has(object.id)).map((object) => object.id);
}

function collectGuiSubtreeIds(rootId: string, gui: StudioGuiObject[]): string[] {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of gui) {
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return gui.filter((item) => ids.has(item.id)).map((item) => item.id);
}

function duplicateNestedScriptsAndValues(
  project: StudioProject,
  parentIdMap: Map<string, string>,
): { scripts: StudioScript[]; values: StudioValueObject[] } {
  const scripts: StudioScript[] = [];
  const values: StudioValueObject[] = [];
  const scriptNames = [...project.scripts.map((script) => script.name)];
  const valueNames = [...project.values.map((value) => value.name)];
  let changed = true;
  while (changed) {
    changed = false;
    for (const script of project.scripts) {
      if (!parentIdMap.has(script.parent) || parentIdMap.has(script.id)) continue;
      const id = crypto.randomUUID();
      const name = nextName(scriptNames, script.name);
      scriptNames.push(name);
      parentIdMap.set(script.id, id);
      scripts.push({
        ...structuredClone(script),
        id,
        name,
        parent: parentIdMap.get(script.parent)!,
      });
      changed = true;
    }
  }
  changed = true;
  while (changed) {
    changed = false;
    for (const value of project.values) {
      if (!parentIdMap.has(value.parent) || parentIdMap.has(value.id)) continue;
      const id = crypto.randomUUID();
      const name = nextName(valueNames, value.name);
      valueNames.push(name);
      parentIdMap.set(value.id, id);
      values.push({
        ...structuredClone(value),
        id,
        name,
        parent: parentIdMap.get(value.parent)!,
      });
      changed = true;
    }
  }
  return { scripts, values };
}

const SCRIPT_API_SECTIONS = [
  {
    title: "Remote Events",
    items: [
      {
        name: "Client to server",
        code: `local remote = ReplicatedStorage.Clicker\n\nbutton.Activated:Connect(function()\n    remote:FireServer()\nend)`,
      },
      {
        name: "Server receives",
        code: `local remote = ReplicatedStorage.Clicker\n\nremote.OnServerEvent:Connect(function(player)\n    Leaderstats:Add(player, "Coins", 1)\nend)`,
      },
    ],
  },
  {
    title: "Remote Functions",
    items: [
      {
        name: "Invoke server",
        code: `local result = ReplicatedStorage.Shop:InvokeServer("BuyUpgrade")\nprint(result)`,
      },
      {
        name: "Server invoke",
        code: `ReplicatedStorage.Shop.OnServerInvoke = function(player, action)\n    return player.leaderstats.Coins.Value\nend`,
      },
    ],
  },
  {
    title: "Leaderstats",
    items: [
      {
        name: "Add or subtract",
        code: `Leaderstats:Add(player, "lava", 1)\nLeaderstats:Subtract(player, "lava", 30)`,
      },
      {
        name: "Direct value path",
        code: `player.leaderstats.lava.Value = player.leaderstats.lava.Value + 1`,
      },
    ],
  },
  {
    title: "Parts and Humanoids",
    items: [
      {
        name: "Touched damage",
        code: `script.Parent.Touched:Connect(function(hit)\n    local player = Players:GetPlayerFromCharacter(hit.Parent)\n    if player then\n        player.Humanoid:TakeDamage(10)\n    end\nend)`,
      },
      {
        name: "Move a part",
        code: `local part = Workspace.Platform\npart.Position = part.Position + Vector3.new(0, 5, 0)`,
      },
    ],
  },
  {
    title: "GUI",
    items: [
      {
        name: "Button activated",
        code: `local button = script.Parent\n\nbutton.Activated:Connect(function()\n    button.Text = "Clicked"\nend)`,
      },
      {
        name: "Open a frame",
        code: `local shop = script.Parent.Parent.ShopGui\nshop.Visible = true`,
      },
    ],
  },
  {
    title: "Effects",
    items: [
      {
        name: "Tween",
        code: `TweenService:Create(script.Parent, 0.5, {\n    Transparency = 0.5,\n    Position = Vector3.new(0, 8, 0),\n}):Play()`,
      },
      {
        name: "Sound",
        code: `local sound = Workspace.blank\nsound:Play()`,
      },
    ],
  },
] satisfies Array<{
  title: string;
  items: Array<{ name: string; code: string }>;
}>;

function guiDefault(
  type: StudioGuiObject["type"],
  parentId: string | null,
  existing: StudioGuiObject[],
): StudioGuiObject {
  const labels = {
    screenGui: "ScreenGui",
    frame: "Frame",
    textLabel: "TextLabel",
    textButton: "TextButton",
    textBox: "TextBox",
    imageLabel: "ImageLabel",
    imageButton: "ImageButton",
    scrollingFrame: "ScrollingFrame",
  };
  return {
    id: crypto.randomUUID(),
    name: nextName(
      existing.map((item) => item.name),
      labels[type],
    ),
    type,
    parentId,
    position: type === "screenGui" ? [0, 0] : [0.08, 0.08],
    size: type === "screenGui" ? [1, 1] : [0.3, 0.14],
    backgroundColor:
      type === "textButton" || type === "imageButton"
        ? "#6F49BB"
        : "#17131F",
    backgroundTransparency: type === "screenGui" ? 1 : 0.08,
    text:
      type === "textLabel"
        ? "Text"
        : type === "textButton"
          ? "Button"
          : type === "textBox"
            ? ""
          : "",
    textColor: "#FFFFFF",
    visible: true,
    rotation: 0,
    textSize: 16,
    borderRadius: 7,
    zIndex: 1,
    anchorPoint: [0, 0],
    clipDescendants: true,
    locked: false,
    imageUrl: "",
    placeholder: type === "textBox" ? "Type here..." : "",
    canvasSize: [1, 1],
  };
}

function scriptParentOptions(
  kind: StudioScript["kind"],
  project: StudioProject,
  currentScriptId?: string,
): Array<{ value: string; label: string }> {
  const invalidScriptParents = new Set<string>();
  if (currentScriptId) {
    invalidScriptParents.add(currentScriptId);
    let changed = true;
    while (changed) {
      changed = false;
      for (const script of project.scripts) {
        if (
          invalidScriptParents.has(script.parent) &&
          !invalidScriptParents.has(script.id)
        ) {
          invalidScriptParents.add(script.id);
          changed = true;
        }
      }
    }
  }
  const services =
    kind === "script"
      ? ["ServerScriptService", "Workspace"]
      : kind === "localScript"
        ? ["StarterPlayerScripts", "StarterGui"]
        : [
            "ReplicatedStorage",
            "ServerScriptService",
            "ServerStorage",
            "StarterPlayerScripts",
            "StarterGui",
          ];
  return [
    ...services.map((service) => ({ value: service, label: service })),
    ...(kind === "script"
      ? [
          ...project.models.map((model) => ({
            value: model.id,
            label: `Workspace / ${model.name}`,
          })),
          ...project.objects.map((object) => ({
            value: object.id,
            label: `Workspace / ${object.name}`,
          })),
        ]
      : []),
    ...(kind === "localScript"
      ? project.objects
          .filter((object) => {
            let current: StudioObject | undefined = object;
            while (current) {
              if (current.type === "tool") return true;
              current = current.parentId
                ? project.objects.find((item) => item.id === current!.parentId)
                : undefined;
            }
            return false;
          })
          .map((object) => ({
            value: object.id,
            label: `Workspace / ${object.name}`,
          }))
      : []),
    ...(kind !== "script"
      ? project.gui.map((item) => ({
          value: item.id,
          label: `StarterGui / ${item.name}`,
        }))
      : []),
    ...(kind === "moduleScript"
      ? [
          ...project.scripts
            .filter((script) => !invalidScriptParents.has(script.id))
            .map((script) => ({
              value: script.id,
              label: `${script.name} / ModuleScript`,
            })),
          ...project.models.map((model) => ({
            value: model.id,
            label: `Workspace / ${model.name}`,
          })),
        ]
      : []),
  ];
}

export default function StudioEditor({
  auth,
  initialProject,
  settings,
  onExit,
}: {
  auth: StudioAuth;
  initialProject: StudioProject;
  settings: StudioSettings;
  onExit: () => void;
}) {
  const [project, setProject] = useState(initialProject);
  const [selection, setSelection] = useState<Selection>(
    initialProject.objects[2]
      ? { type: "world", id: initialProject.objects[2].id }
      : null,
  );
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>(
    initialProject.objects[2] ? [initialProject.objects[2].id] : [],
  );
  const [tool, setTool] = useState<StudioTool>("select");
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [gridSnap, setGridSnap] = useState(1);
  const [angleSnap, setAngleSnap] = useState(15);
  const [workspace, setWorkspace] = useState<
    "scene" | "script" | "ui" | "animation"
  >("scene");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishDialog, setPublishDialog] = useState(false);
  const [badgeDialog, setBadgeDialog] = useState(false);
  const [monetizationDialog, setMonetizationDialog] = useState(false);
  const [historyDialog, setHistoryDialog] = useState(false);
  const [backups, setBackups] = useState<
    Array<{ id: string; name: string; savedAt: string }>
  >([]);
  const [openMenu, setOpenMenu] = useState<
    "file" | "project" | "arrange" | null
  >(null);
  const [physicsDebug, setPhysicsDebug] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<
    "explorer" | "properties" | null
  >(null);
  const [message, setMessage] = useState("Ready");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  const [showSearchEverywhere, setShowSearchEverywhere] = useState(false);
  const [searchEverywhereQuery, setSearchEverywhereQuery] = useState("");
  const [showApiExplorer, setShowApiExplorer] = useState(false);
  const [commandPalette, setCommandPalette] = useState(false);
  const [diagnostics, setDiagnostics] = useState<
    Record<string, PolyDiagnostic[]>
  >({});
  const undoStack = useRef<StudioProject[]>([]);
  const redoStack = useRef<StudioProject[]>([]);
  const viewportTransform = useRef<{
    project: StudioProject;
    objects: StudioObject[];
    center: [number, number, number];
  } | null>(null);
  const clipboard = useRef<StudioObject[]>([]);
  const playHereSpawn = useRef<StudioPlaySpawn>({
    position: [16, 13, 18],
    rotationY: 0,
  });

  const selectedWorld =
    selection?.type === "world"
      ? project.objects.find((object) => object.id === selection.id) ?? null
      : null;
  const selectedGui =
    selection?.type === "gui"
      ? project.gui.find((object) => object.id === selection.id) ?? null
      : null;
  const selectedScript =
    selection?.type === "script"
      ? project.scripts.find((script) => script.id === selection.id) ?? null
      : null;
  const selectedModel =
    selection?.type === "model"
      ? project.models.find((model) => model.id === selection.id) ?? null
      : null;
  const selectedRemote =
    selection?.type === "remote"
      ? project.remotes.find((remote) => remote.id === selection.id) ?? null
      : null;
  const selectedValue =
    selection?.type === "value"
      ? project.values.find((value) => value.id === selection.id) ?? null
      : null;
  const activeWorldIds = selectedModel
    ? project.objects
        .filter((object) => object.modelId === selectedModel.id)
        .map((object) => object.id)
    : selectedPartIds;
  const canDuplicateSelection = Boolean(
    selectedWorld ||
      selectedModel ||
      selectedGui ||
      selectedScript ||
      selectedRemote ||
      selectedValue ||
      activeWorldIds.length > 0,
  );
  const searchEverywhereResults = useMemo(
    () => buildStudioSearchResults(project, searchEverywhereQuery),
    [project, searchEverywhereQuery],
  );
  const healthIssues = useMemo(() => {
    const issues: string[] = [];
    const objectIds = new Set(project.objects.map((object) => object.id));
    const guiIds = new Set(project.gui.map((object) => object.id));
    const names = new Set<string>();
    for (const object of project.objects) {
      if (names.has(object.name)) issues.push(`Duplicate Workspace name: ${object.name}`);
      names.add(object.name);
      if (object.parentId && !objectIds.has(object.parentId)) {
        issues.push(`${object.name} has a missing parent.`);
      }
      if (object.modelId && !project.models.some((model) => model.id === object.modelId)) {
        issues.push(`${object.name} points to a missing Model.`);
      }
    }
    for (const gui of project.gui) {
      if (gui.parentId && !guiIds.has(gui.parentId)) {
        issues.push(`${gui.name} has a missing GUI parent.`);
      }
    }
    for (const script of project.scripts) {
      for (const diagnostic of analyzePolyScript(
        script as import("../../src/game/polyProject").PolyScript,
        project as PolyProject,
      )) {
        if (diagnostic.severity === "error") {
          issues.push(`${script.name}:${diagnostic.line} ${diagnostic.message}`);
        }
      }
    }
    return issues;
  }, [project]);

  useEffect(() => {
    void window.polyStudio.setPresence({
      kind: "editing",
      projectName: project.name,
      language: project.language,
      published: Boolean(project.publication),
    });
  }, [project.language, project.name, project.publication]);

  const save = useCallback(async (): Promise<StudioProject | null> => {
    setSaving(true);
    setMessage("Saving...");
    try {
      const next = await window.polyStudio.saveProject(project);
      setProject(next);
      setDirty(false);
      setMessage("Saved");
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }, [project]);

  useEffect(() => {
    const onMobileBack = () => {
      if (mobilePanel) {
        setMobilePanel(null);
        return;
      }
      if (openMenu) {
        setOpenMenu(null);
        return;
      }
      void save().then((saved) => {
        if (saved) onExit();
      });
    };
    window.addEventListener("poly-studio:mobile-back", onMobileBack);
    return () =>
      window.removeEventListener("poly-studio:mobile-back", onMobileBack);
  }, [mobilePanel, onExit, openMenu, save]);

  async function saveVersion() {
    setSaving(true);
    setMessage("Saving version...");
    try {
      const next = await window.polyStudio.snapshotProject(project);
      setProject(next);
      setDirty(false);
      setMessage("Version saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Version save failed");
    } finally {
      setSaving(false);
    }
  }

  async function openHistory() {
    setOpenMenu(null);
    setMessage("Loading version history...");
    try {
      setBackups(await window.polyStudio.listProjectBackups(project.id));
      setHistoryDialog(true);
      setMessage("Ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load history");
    }
  }

  async function restoreBackup(backupId: string) {
    setSaving(true);
    setMessage("Restoring version...");
    try {
      const restored = await window.polyStudio.restoreProjectBackup(
        project.id,
        backupId,
      );
      setProject(restored);
      setSelection(null);
      setSelectedPartIds([]);
      undoStack.current = [];
      redoStack.current = [];
      setDirty(false);
      setHistoryDialog(false);
      setMessage("Version restored");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Restore failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!dirty || saving || playing || publishing) return;
    const timer = window.setTimeout(() => {
      void save();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [dirty, playing, publishing, save, saving]);

  useEffect(() => {
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [dirty]);

  const shortcutActions = useRef({
    save,
    undo,
    redo,
    duplicateSelected,
    createModel,
    ungroupModel,
    copySelected,
    pasteClipboard,
    removeSelected,
  });
  shortcutActions.current = {
    save,
    undo,
    redo,
    duplicateSelected,
    createModel,
    ungroupModel,
    copySelected,
    pasteClipboard,
    removeSelected,
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.closest(".monaco-editor");
      const commandKey = event.ctrlKey || event.metaKey;
      if (!editing && commandKey && event.code === "Digit1") {
        event.preventDefault();
        setTool("select");
      } else if (!editing && commandKey && event.code === "Digit2") {
        event.preventDefault();
        setTool("move");
      } else if (!editing && commandKey && event.code === "Digit3") {
        event.preventDefault();
        setTool("scale");
      } else if (!editing && commandKey && event.code === "Digit4") {
        event.preventDefault();
        setTool("rotate");
      } else if (commandKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void shortcutActions.current.save();
      } else if (
        !editing &&
        commandKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) shortcutActions.current.redo();
        else shortcutActions.current.undo();
      } else if (
        !editing &&
        commandKey &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        shortcutActions.current.redo();
      } else if (
        !editing &&
        commandKey &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        shortcutActions.current.duplicateSelected();
      } else if (
        !editing &&
        commandKey &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        if (event.shiftKey) shortcutActions.current.ungroupModel();
        else shortcutActions.current.createModel();
      } else if (
        !editing &&
        commandKey &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        shortcutActions.current.copySelected();
      } else if (
        !editing &&
        commandKey &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        shortcutActions.current.pasteClipboard();
      } else if (
        commandKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        setSearchEverywhereQuery("");
        setShowSearchEverywhere(true);
      } else if (
        commandKey &&
        event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setCommandPalette(true);
      } else if (
        !editing &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        shortcutActions.current.removeSelected();
      } else if (!editing && event.key === "F2") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".project-title input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const close = () => setOpenMenu(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [openMenu]);

  function updateProject(updater: (current: StudioProject) => StudioProject) {
    setProject((current) => {
      const next = updater(current);
      if (next === current) return current;
      undoStack.current = [...undoStack.current.slice(-99), structuredClone(current)];
      redoStack.current = [];
      return next;
    });
    setDirty(true);
    setMessage("Unsaved changes");
  }

  function selectSearchResult(next: Exclude<Selection, null>) {
    if (next.type === "world") {
      selectWorld(next.id);
      setWorkspace("scene");
    } else if (next.type === "model") {
      selectModel(next.id);
      setWorkspace("scene");
    } else {
      setSelection(next);
      setSelectedPartIds([]);
      if (next.type === "script") setWorkspace("script");
      else if (next.type === "gui") setWorkspace("ui");
      else setWorkspace("scene");
    }
    setShowSearchEverywhere(false);
  }

  function undo() {
    const previous = undoStack.current.pop();
    if (!previous) return;
    redoStack.current.push(structuredClone(project));
    setProject(previous);
    setSelection(null);
    setSelectedPartIds([]);
    setDirty(true);
    setMessage("Undid change");
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(structuredClone(project));
    setProject(next);
    setSelection(null);
    setSelectedPartIds([]);
    setDirty(true);
    setMessage("Redid change");
  }

  function addPart(
    type: StudioObject["type"] = "part",
    target: ContextTarget = { type: "service", id: "Workspace" },
    shape: NonNullable<StudioObject["shape"]> = "block",
  ) {
    if (type === "humanoidRootPart") {
      addHumanoidRig(target);
      return;
    }
    const parentObject =
      target.type === "world"
        ? project.objects.find((object) => object.id === target.id) ?? null
        : null;
    const parentModel =
      target.type === "model"
        ? project.models.find((model) => model.id === target.id) ?? null
        : null;
    const targetModelId = parentModel?.id ?? parentObject?.modelId ?? null;
    const baseName =
      type === "tool"
        ? "Tool"
        : type === "handle"
          ? "Handle"
          : type === "sound"
            ? "Sound"
            : shape === "sphere"
              ? "Sphere"
              : shape === "cylinder"
                ? "Cylinder"
                : shape === "stud"
                  ? "Stud"
                  : "Part";
    const next: StudioObject = {
      id: crypto.randomUUID(),
      name: nextName(
        project.objects.map((item) => item.name),
        baseName,
      ),
      type,
      position: parentObject
        ? [
            parentObject.position[0],
            parentObject.position[1] + Math.max(1, gridSnap),
            parentObject.position[2],
          ]
        : [0, 2, 0],
      rotation: [0, 0, 0],
      scale:
        type === "handle"
          ? [1, 3, 1]
          : type === "sound"
            ? [0.6, 0.6, 0.6]
            : shape === "stud"
              ? [2, 0.7, 2]
              : [4, 4, 4],
      shape,
      color: "#30254D",
      anchored: true,
      visible: true,
      transparency: 0,
      material: "plastic",
      surfaceTexture: "none",
      canCollide: type !== "sound",
      castShadow: type !== "sound",
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      soundData: "",
      soundFileName: "",
      volume: 0.7,
      looped: false,
      playbackSpeed: 1,
      rolloffMinDistance: 5,
      rolloffMaxDistance: 60,
      autoplay: false,
      parentId: parentObject?.id ?? null,
      modelId: targetModelId,
      attributes: {},
      tags: [],
    };
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, next],
      models: targetModelId
        ? current.models.map((model) =>
            model.id === targetModelId && !model.primaryPartId
              ? { ...model, primaryPartId: next.id }
              : model,
          )
        : current.models,
    }));
    setSelection({ type: "world", id: next.id });
    setSelectedPartIds([next.id]);
    setWorkspace("scene");
  }

  function addHumanoidRig(target: ContextTarget) {
    const targetObject =
      target.type === "world"
        ? project.objects.find((object) => object.id === target.id) ?? null
        : null;
    const origin: [number, number, number] = targetObject
      ? [targetObject.position[0], targetObject.position[1] + 3, targetObject.position[2]]
      : [0, 3, 0];
    const modelId = crypto.randomUUID();
    const rootId = crypto.randomUUID();
    const scaledOffset = (
      x: number,
      y: number,
      z = 0,
    ): [number, number, number] => [
      x * R6_AVATAR_SCALE,
      R6_VISUAL_OFFSET + y * R6_AVATAR_SCALE,
      z * R6_AVATAR_SCALE,
    ];
    const scaledSize = (
      size: [number, number, number],
    ): [number, number, number] => [
      size[0] * R6_AVATAR_SCALE,
      size[1] * R6_AVATAR_SCALE,
      size[2] * R6_AVATAR_SCALE,
    ];
    const part = (
      name: string,
      type: StudioObject["type"],
      offset: [number, number, number],
      scale: [number, number, number],
      color: string,
      options: Partial<StudioObject> = {},
    ): StudioObject => ({
      id: name === "HumanoidRootPart" ? rootId : crypto.randomUUID(),
      name,
      type,
      position: [
        origin[0] + offset[0],
        origin[1] + offset[1],
        origin[2] + offset[2],
      ],
      rotation: [0, 0, 0],
      scale,
      shape: "block",
      color,
      anchored: true,
      visible: true,
      transparency: 0,
      material: "plastic",
      surfaceTexture: "none",
      canCollide: true,
      castShadow: true,
      friction: 0.82,
      restitution: 0.03,
      mass: 1,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      parentId: name === "HumanoidRootPart" ? null : rootId,
      modelId,
      attributes: { RigPart: name },
      tags: ["HumanoidLimb"],
      ...options,
    });
    const parts = [
      part(
        "HumanoidRootPart",
        "humanoidRootPart",
        [0, 0, 0],
        [
          R6_COLLIDER_RADIUS * 2,
          R6_COLLIDER_HALF_HEIGHT * 2,
          R6_COLLIDER_RADIUS * 2,
        ],
        "#7F8FA6",
        {
          visible: false,
          transparency: 1,
          canCollide: false,
          attributes: { Health: 100, MaxHealth: 100, RigPart: "Root" },
          tags: ["Humanoid", "RigRoot"],
        },
      ),
      part(
        "Torso",
        "part",
        scaledOffset(0, R6_TORSO_CENTER_Y),
        scaledSize(R6_TORSO_SIZE),
        "#5635B8",
      ),
      part(
        "Head",
        "part",
        scaledOffset(0, R6_HEAD_CENTER_Y),
        scaledSize([1.25, R6_HEAD_SIZE[1], 1.25]),
        "#C9A978",
      ),
      part(
        "Left Arm",
        "part",
        scaledOffset(-R6_SHOULDER_X, R6_SHOULDER_Y + R6_ARM_CENTER_Y),
        scaledSize(R6_ARM_SIZE),
        "#C9A978",
      ),
      part(
        "Right Arm",
        "part",
        scaledOffset(R6_SHOULDER_X, R6_SHOULDER_Y + R6_ARM_CENTER_Y),
        scaledSize(R6_ARM_SIZE),
        "#C9A978",
      ),
      part(
        "Left Leg",
        "part",
        scaledOffset(-R6_HIP_X, R6_HIP_Y + R6_LEG_CENTER_Y),
        scaledSize(R6_LEG_SIZE),
        "#181A23",
      ),
      part(
        "Right Leg",
        "part",
        scaledOffset(R6_HIP_X, R6_HIP_Y + R6_LEG_CENTER_Y),
        scaledSize(R6_LEG_SIZE),
        "#181A23",
      ),
    ];
    const model: StudioModel = {
      id: modelId,
      name: nextName(project.models.map((item) => item.name), "Humanoid"),
      primaryPartId: rootId,
      attributes: { Health: 100, MaxHealth: 100, RigType: "Blocky6" },
      tags: ["Humanoid", "BlockyRig"],
    };
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, ...parts],
      models: [...current.models, model],
    }));
    setSelection({ type: "model", id: model.id });
    setSelectedPartIds(parts.map((item) => item.id));
    setWorkspace("scene");
    setMessage("Blocky humanoid created");
  }

  function linkedSwordSource(language: StudioLanguage): string {
    if (language === "cpp") {
      return `#include <poly/client.hpp>

auto tool = Script.Parent;
tool.Activated.Connect([&]() {
    Animations::Play("LinkedSwordSwing");
    Combat::DamageNearest(20, 6);
});
`;
    }
    if (language === "csharp") {
      return `using Poly;

var tool = Script.Parent;
tool.Activated += () => {
    Animations.Play("LinkedSwordSwing");
    Combat.DamageNearest(20, 6);
};
`;
    }
    return `local tool = script.Parent

tool.Activated:Connect(function()
    Animations:Play("LinkedSwordSwing")
    Combat:DamageNearest(20, 6)
end)
`;
  }

  function addLinkedSword(target: ContextTarget) {
    const parentObject =
      target.type === "world"
        ? project.objects.find((object) => object.id === target.id) ?? null
        : null;
    const existingTool = parentObject?.type === "tool" ? parentObject : null;
    const modelId =
      target.type === "model"
        ? target.id
        : parentObject?.modelId ?? null;
    const origin: [number, number, number] = parentObject
      ? [parentObject.position[0], parentObject.position[1] + 1.5, parentObject.position[2]]
      : [0, 3, 0];
    const tool: StudioObject =
      existingTool ?? {
        id: crypto.randomUUID(),
        name: nextName(project.objects.map((item) => item.name), "LinkedSword"),
        type: "tool",
        position: origin,
        rotation: [0, 0, 0],
        scale: [0.2, 0.2, 0.2],
        color: "#22242B",
        anchored: true,
        visible: false,
        transparency: 1,
        material: "metal",
        surfaceTexture: "none",
        canCollide: false,
        castShadow: false,
        friction: 0.6,
        restitution: 0,
        mass: 1,
        velocity: [0, 0, 0],
        angularVelocity: [0, 0, 0],
        parentId: parentObject?.id ?? null,
        modelId,
        attributes: { Damage: 20, Range: 6, Cooldown: 0.45 },
        tags: ["LinkedSword", "DamageTool"],
      };
    const makePart = (
      name: string,
      type: StudioObject["type"],
      offset: [number, number, number],
      scale: [number, number, number],
      color: string,
      material: StudioObject["material"],
    ): StudioObject => ({
      id: crypto.randomUUID(),
      name,
      type,
      position: [
        origin[0] + offset[0],
        origin[1] + offset[1],
        origin[2] + offset[2],
      ],
      rotation: [0, 0, 0],
      scale,
      color,
      anchored: true,
      visible: true,
      transparency: 0,
      material,
      surfaceTexture: "none",
      canCollide: false,
      castShadow: true,
      friction: 0.65,
      restitution: 0,
      mass: 0.25,
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
      parentId: tool.id,
      modelId: tool.modelId,
      attributes: {},
      tags: ["LinkedSwordPart"],
    });
    const handle = makePart("Handle", "handle", [0, -1.2, 0], [0.38, 2.2, 0.38], "#372A23", "wood");
    const guard = makePart("Crossguard", "part", [0, 0, 0], [2.1, 0.25, 0.35], "#D5A928", "metal");
    const blade = makePart("Blade", "part", [0, 2.25, 0], [0.48, 4.2, 0.18], "#D7E0E8", "metal");
    const tip = makePart("BladeTip", "part", [0, 4.45, 0], [0.36, 0.35, 0.12], "#EEF4FA", "metal");
    const links = [-0.62, -0.2, 0.22, 0.64].map((x, index) =>
      makePart(
        `GuardLink${index + 1}`,
        "part",
        [x, 0.18 + Math.abs(x) * 0.18, 0],
        [0.23, 0.23, 0.23],
        "#B7851C",
        "metal",
      ),
    );
    const swordParts = [handle, guard, blade, tip, ...links];
    const animation: StudioAnimation = {
      id: crypto.randomUUID(),
      name: nextName(
        project.animations.map((item) => item.name),
        "LinkedSwordSwing",
      ),
      rigModelId: tool.modelId,
      duration: 0.45,
      looped: false,
      keyframes: [
        {
          time: 0,
          poses: Object.fromEntries(
            swordParts.map((part) => [part.id, { rotation: [0, 0, 0] }]),
          ),
        },
        {
          time: 0.16,
          poses: Object.fromEntries(
            swordParts.map((part) => [part.id, { rotation: [0, 0, -1.15] }]),
          ),
        },
        {
          time: 0.32,
          poses: Object.fromEntries(
            swordParts.map((part) => [part.id, { rotation: [0, 0, 0.28] }]),
          ),
        },
        {
          time: 0.45,
          poses: Object.fromEntries(
            swordParts.map((part) => [part.id, { rotation: [0, 0, 0] }]),
          ),
        },
      ],
    };
    const script: StudioScript = {
      id: crypto.randomUUID(),
      name: "LinkedSwordClient",
      kind: "localScript",
      parent: tool.id,
      source: linkedSwordSource(project.language).replace(
        /LinkedSwordSwing/g,
        animation.name,
      ),
    };
    updateProject((current) => ({
      ...current,
      objects: [
        ...current.objects,
        ...(existingTool ? [] : [tool]),
        ...swordParts,
      ],
      scripts: [...current.scripts, script],
      animations: [...current.animations, animation],
    }));
    setSelection({ type: "world", id: tool.id });
    setSelectedPartIds([tool.id, ...swordParts.map((part) => part.id)]);
    setWorkspace("scene");
    setMessage("Linked sword template created");
  }

  function addRemote(kind: StudioRemote["kind"]) {
    const next: StudioRemote = {
      id: crypto.randomUUID(),
      name: nextName(
        project.remotes.map((remote) => remote.name),
        kind === "remoteEvent" ? "RemoteEvent" : "RemoteFunction",
      ),
      kind,
    };
    updateProject((current) => ({
      ...current,
      remotes: [...current.remotes, next],
    }));
    setSelection({ type: "remote", id: next.id });
    setSelectedPartIds([]);
  }

  function addValue(
    type: StudioValueObject["type"],
    target: ContextTarget,
  ) {
    const parent = target.id;
    const baseName =
      type === "boolValue"
        ? "BoolValue"
        : type === "stringValue"
          ? "StringValue"
          : "NumberValue";
    const next: StudioValueObject = {
      id: crypto.randomUUID(),
      name: nextName(project.values.map((value) => value.name), baseName),
      type,
      parent,
      value: type === "boolValue" ? false : type === "stringValue" ? "" : 0,
    };
    updateProject((current) => ({
      ...current,
      values: [...current.values, next],
    }));
    setSelection({ type: "value", id: next.id });
    setSelectedPartIds([]);
  }

  function addEmptyModel() {
    const model: StudioModel = {
      id: crypto.randomUUID(),
      name: nextName(project.models.map((item) => item.name), "Model"),
      primaryPartId: null,
      attributes: {},
      tags: [],
    };
    updateProject((current) => ({
      ...current,
      models: [...current.models, model],
    }));
    setSelection({ type: "model", id: model.id });
    setSelectedPartIds([]);
    setWorkspace("scene");
  }

  function selectWorld(id: string, additive = false) {
    const object = project.objects.find((item) => item.id === id);
    if (!object) return;
    const selectingAnimationLimb =
      workspace === "animation" &&
      object.modelId &&
      (object.tags.includes("HumanoidLimb") ||
        object.type === "humanoidRootPart");
    if (object.modelId && !selectingAnimationLimb) {
      setSelection({ type: "model", id: object.modelId });
      setSelectedPartIds(
        project.objects
          .filter((item) => item.modelId === object.modelId)
          .map((item) => item.id),
      );
      setWorkspace("scene");
      return;
    }
    const ids = additive
      ? selectedPartIds.includes(id)
        ? selectedPartIds.filter((item) => item !== id)
        : [...selectedPartIds, id]
      : [id];
    setSelectedPartIds(ids);
    setSelection(ids.length > 0 ? { type: "world", id: ids[ids.length - 1] } : null);
    setWorkspace(selectingAnimationLimb ? "animation" : "scene");
  }

  function selectAnimationParts(ids: string[]) {
    const validIds = ids.filter((id) =>
      project.objects.some((object) => object.id === id),
    );
    setSelectedPartIds(validIds);
    setSelection(
      validIds.length > 0
        ? { type: "world", id: validIds[validIds.length - 1] }
        : null,
    );
    setWorkspace("animation");
  }

  function selectModel(id: string) {
    setSelection({ type: "model", id });
    setSelectedPartIds(
      project.objects.filter((object) => object.modelId === id).map((object) => object.id),
    );
    setWorkspace("scene");
  }

  function createModel() {
    const partIds = activeWorldIds.filter((id) => {
      const object = project.objects.find((item) => item.id === id);
      return object && !["baseplate", "spawn"].includes(object.type);
    });
    if (partIds.length < 2) {
      setMessage("Select at least two Parts to create a Model.");
      return;
    }
    const model: StudioModel = {
      id: crypto.randomUUID(),
      name: nextName(project.models.map((item) => item.name), "Model"),
      primaryPartId: partIds[0],
      attributes: {},
      tags: [],
    };
    updateProject((current) => {
      const replacedModels = new Set(
        current.objects
          .filter((object) => partIds.includes(object.id) && object.modelId)
          .map((object) => object.modelId!),
      );
      return {
        ...current,
        objects: current.objects.map((object) =>
          partIds.includes(object.id) ? { ...object, modelId: model.id } : object,
        ),
        models: [
          ...current.models.filter((item) => !replacedModels.has(item.id)),
          model,
        ],
      };
    });
    setSelection({ type: "model", id: model.id });
    setSelectedPartIds(partIds);
    setMessage("Model created");
  }

  function ungroupModel() {
    if (!selectedModel) return;
    updateProject((current) => ({
      ...current,
      objects: current.objects.map((object) =>
        object.modelId === selectedModel.id ? { ...object, modelId: null } : object,
      ),
      models: current.models.filter((model) => model.id !== selectedModel.id),
    }));
    setSelection(null);
    setSelectedPartIds([]);
    setMessage("Model ungrouped");
  }

  function duplicateSelected() {
    if (!canDuplicateSelection) return;
    const offset = Math.max(0.1, gridSnap);
    if (selectedWorld || selectedModel || activeWorldIds.length > 0) {
      const sourceIds = collectWorldSubtreeIds(activeWorldIds, project.objects);
      const sourceObjects = project.objects.filter((object) => sourceIds.includes(object.id));
      const nextModelId = selectedModel ? crypto.randomUUID() : null;
      const idMap = new Map<string, string>();
      const usedNames = project.objects.map((item) => item.name);
      const copies = sourceObjects.map((object) => {
        const id = crypto.randomUUID();
        idMap.set(object.id, id);
        const name = nextName(usedNames, object.name);
        usedNames.push(name);
        return {
          ...structuredClone(object),
          id,
          name,
          position: [
            object.position[0] + offset,
            object.position[1],
            object.position[2] + offset,
          ] as [number, number, number],
          modelId: nextModelId,
        };
      }).map((object) => ({
        ...object,
        parentId: object.parentId ? idMap.get(object.parentId) ?? null : null,
      }));
      const modelCopy: StudioModel | null =
        selectedModel && nextModelId
          ? {
              ...structuredClone(selectedModel),
              id: nextModelId,
              name: nextName(project.models.map((item) => item.name), selectedModel.name),
              primaryPartId: selectedModel.primaryPartId
                ? idMap.get(selectedModel.primaryPartId) ?? copies[0]?.id ?? null
                : copies[0]?.id ?? null,
            }
          : null;
      const parentIdMap = new Map<string, string>(idMap);
      if (selectedModel && nextModelId) parentIdMap.set(selectedModel.id, nextModelId);
      const nested = duplicateNestedScriptsAndValues(project, parentIdMap);
      updateProject((current) => ({
        ...current,
        objects: [...current.objects, ...copies],
        models: modelCopy ? [...current.models, modelCopy] : current.models,
        scripts: [...current.scripts, ...nested.scripts],
        values: [...current.values, ...nested.values],
      }));
      setSelectedPartIds(copies.map((copy) => copy.id));
      setSelection(
        modelCopy
          ? { type: "model", id: modelCopy.id }
          : copies[0]
            ? { type: "world", id: copies[0].id }
            : null,
      );
      setMessage("Duplicated selection with children");
      return;
    }

    if (selectedGui) {
      const sourceIds = collectGuiSubtreeIds(selectedGui.id, project.gui);
      const idMap = new Map<string, string>();
      const usedNames = project.gui.map((item) => item.name);
      const copies = project.gui
        .filter((item) => sourceIds.includes(item.id))
        .map((item) => {
          const id = crypto.randomUUID();
          idMap.set(item.id, id);
          const name = nextName(usedNames, item.name);
          usedNames.push(name);
          return {
            ...structuredClone(item),
            id,
            name,
            position: item.id === selectedGui.id
              ? ([item.position[0] + 0.03, item.position[1] + 0.03] as [number, number])
              : item.position,
          };
        })
        .map((item) => ({
          ...item,
          parentId: item.parentId ? idMap.get(item.parentId) ?? null : null,
        }));
      const nested = duplicateNestedScriptsAndValues(project, idMap);
      updateProject((current) => ({
        ...current,
        gui: [...current.gui, ...copies],
        scripts: [...current.scripts, ...nested.scripts],
        values: [...current.values, ...nested.values],
      }));
      const rootId = idMap.get(selectedGui.id);
      if (rootId) setSelection({ type: "gui", id: rootId });
      setWorkspace("ui");
      setSelectedPartIds([]);
      setMessage("Duplicated GUI with children");
      return;
    }

    if (selectedScript) {
      const id = crypto.randomUUID();
      const name = nextName(project.scripts.map((script) => script.name), selectedScript.name);
      const rootCopy: StudioScript = { ...structuredClone(selectedScript), id, name };
      const parentIdMap = new Map([[selectedScript.id, id]]);
      const nested = duplicateNestedScriptsAndValues(project, parentIdMap);
      updateProject((current) => ({
        ...current,
        scripts: [...current.scripts, rootCopy, ...nested.scripts],
        values: [...current.values, ...nested.values],
      }));
      setSelection({ type: "script", id });
      setWorkspace("script");
      setSelectedPartIds([]);
      setMessage("Duplicated script with children");
      return;
    }

    if (selectedRemote) {
      const id = crypto.randomUUID();
      const name = nextName(project.remotes.map((remote) => remote.name), selectedRemote.name);
      updateProject((current) => ({
        ...current,
        remotes: [...current.remotes, { ...structuredClone(selectedRemote), id, name }],
      }));
      setSelection({ type: "remote", id });
      setSelectedPartIds([]);
      setMessage("Duplicated remote");
      return;
    }

    if (selectedValue) {
      const id = crypto.randomUUID();
      const name = nextName(project.values.map((value) => value.name), selectedValue.name);
      const rootCopy: StudioValueObject = { ...structuredClone(selectedValue), id, name };
      const parentIdMap = new Map([[selectedValue.id, id]]);
      const nested = duplicateNestedScriptsAndValues(project, parentIdMap);
      updateProject((current) => ({
        ...current,
        values: [...current.values, rootCopy, ...nested.values],
      }));
      setSelection({ type: "value", id });
      setSelectedPartIds([]);
      setMessage("Duplicated value with children");
    }
  }

  function copySelected() {
    clipboard.current = structuredClone(
      project.objects.filter((object) => activeWorldIds.includes(object.id)),
    );
    setMessage(
      clipboard.current.length === 1
        ? "Copied 1 object"
        : `Copied ${clipboard.current.length} objects`,
    );
  }

  function pasteClipboard() {
    if (clipboard.current.length === 0) return;
    const offset = Math.max(0.1, gridSnap);
    const idMap = new Map<string, string>();
    for (const object of clipboard.current) idMap.set(object.id, crypto.randomUUID());
    const copies = clipboard.current.map((object) => ({
      ...structuredClone(object),
      id: idMap.get(object.id)!,
      name: nextName(project.objects.map((item) => item.name), object.name),
      position: [
        object.position[0] + offset,
        object.position[1],
        object.position[2] + offset,
      ] as [number, number, number],
      parentId: object.parentId ? idMap.get(object.parentId) ?? null : null,
      modelId: null,
    }));
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, ...copies],
    }));
    setSelectedPartIds(copies.map((object) => object.id));
    setSelection({ type: "world", id: copies[copies.length - 1].id });
    setMessage(`Pasted ${copies.length} object${copies.length === 1 ? "" : "s"}`);
  }

  async function exitEditor() {
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    onExit();
  }

  function beginViewportTransform(center: [number, number, number]) {
    if (activeWorldIds.length === 0 || tool === "select") return;
    const ids = new Set(activeWorldIds);
    viewportTransform.current = {
      project: structuredClone(project),
      objects: structuredClone(
        project.objects.filter((object) => ids.has(object.id)),
      ),
      center,
    };
  }

  function updateViewportTransform(transform: ViewportTransform) {
    const session = viewportTransform.current;
    if (!session || tool === "select") return;
    const originals = new Map(
      session.objects.map((object) => [object.id, object]),
    );
    const rotationDelta = new Euler(...transform.rotation);
    setProject((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        const original = originals.get(object.id);
        if (!original) return object;
        if (tool === "move") {
          return {
            ...object,
            position: [
              original.position[0] +
                transform.position[0] -
                session.center[0],
              original.position[1] +
                transform.position[1] -
                session.center[1],
              original.position[2] +
                transform.position[2] -
                session.center[2],
            ],
          };
        }
        const relative = new Vector3(
          original.position[0] - session.center[0],
          original.position[1] - session.center[1],
          original.position[2] - session.center[2],
        );
        if (tool === "rotate") {
          relative.applyEuler(rotationDelta);
          return {
            ...object,
            position: [
              session.center[0] + relative.x,
              session.center[1] + relative.y,
              session.center[2] + relative.z,
            ],
            rotation: [
              original.rotation[0] + transform.rotation[0],
              original.rotation[1] + transform.rotation[1],
              original.rotation[2] + transform.rotation[2],
            ],
          };
        }
        return {
          ...object,
          position: [
            session.center[0] + relative.x * transform.scale[0],
            session.center[1] + relative.y * transform.scale[1],
            session.center[2] + relative.z * transform.scale[2],
          ],
          scale: [
            Math.max(0.1, original.scale[0] * transform.scale[0]),
            Math.max(0.1, original.scale[1] * transform.scale[1]),
            Math.max(0.1, original.scale[2] * transform.scale[2]),
          ],
        };
      }),
    }));
    setDirty(true);
    setMessage(`Using ${tool} tool`);
  }

  function finishViewportTransform() {
    const session = viewportTransform.current;
    if (!session) return;
    undoStack.current = [
      ...undoStack.current.slice(-99),
      session.project,
    ];
    redoStack.current = [];
    viewportTransform.current = null;
    setMessage(`${tool[0].toUpperCase()}${tool.slice(1)} complete`);
  }

  function snapSelection() {
    if (activeWorldIds.length === 0) return;
    const ids = new Set(activeWorldIds);
    const positionStep = Math.max(0.01, gridSnap);
    const rotationStep = (Math.max(0.1, angleSnap) * Math.PI) / 180;
    updateProject((current) => ({
      ...current,
      objects: current.objects.map((object) =>
        ids.has(object.id)
          ? {
              ...object,
              position: object.position.map(
                (value) => Math.round(value / positionStep) * positionStep,
              ) as [number, number, number],
              rotation: object.rotation.map(
                (value) => Math.round(value / rotationStep) * rotationStep,
              ) as [number, number, number],
            }
          : object,
      ),
    }));
    setMessage("Selection snapped to grid");
  }

  function alignSelection(axis: ArrangeAxis, edge: AlignEdge) {
    if (selectedModel || activeWorldIds.length < 2) return;
    updateProject((current) => ({
      ...current,
      objects: alignSelectedObjects(
        current.objects,
        activeWorldIds,
        axis,
        edge,
        selectedWorld?.id,
      ),
    }));
    const axisName = ["X", "Y", "Z"][axis];
    setMessage(`Aligned ${edge} edges on ${axisName}`);
  }

  function distributeSelection(axis: ArrangeAxis) {
    if (selectedModel || activeWorldIds.length < 3) return;
    updateProject((current) => ({
      ...current,
      objects: distributeSelectedObjects(current.objects, activeWorldIds, axis),
    }));
    setMessage(`Distributed selection on ${["X", "Y", "Z"][axis]}`);
  }

  async function exportSelectedModel() {
    if (!selectedModel) return;
    const parts = project.objects.filter((object) => object.modelId === selectedModel.id);
    try {
      const path = await window.polyStudio.exportModel({
        model: selectedModel,
        parts,
      });
      setMessage(path ? "PMXL model exported" : "Export canceled");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not export PMXL model.");
    }
  }

  async function importModel() {
    try {
      const imported = await window.polyStudio.importModel();
      if (!imported) {
        setMessage("Import canceled");
        return;
      }
      const existingNames = project.models.map((model) => model.name);
      const model = {
        ...imported.model,
        name: nextName(existingNames, imported.model.name),
      };
      const objectNames = project.objects.map((object) => object.name);
      const parts = imported.parts.map((part) => {
        const name = nextName(objectNames, part.name);
        objectNames.push(name);
        return { ...part, name };
      });
      updateProject((current) => ({
        ...current,
        objects: [...current.objects, ...parts],
        models: [...current.models, model],
      }));
      setSelection({ type: "model", id: model.id });
      setSelectedPartIds(parts.map((part) => part.id));
      setWorkspace("scene");
      setMessage("PMXL model imported");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import PMXL model.");
    }
  }

  async function exportGame() {
    try {
      const path = await window.polyStudio.exportProject(project);
      setMessage(path ? "Polymons game exported" : "Export canceled");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not export game.",
      );
    }
  }

  async function exportAnimation(animation: StudioAnimation) {
    try {
      const parts = project.objects.filter(
        (object) =>
          !animation.rigModelId || object.modelId === animation.rigModelId,
      );
      const path = await window.polyStudio.exportAnimation({
        animation,
        parts,
      });
      setMessage(path ? "PMA animation exported" : "Export canceled");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not export animation.",
      );
    }
  }

  async function importAnimation(rigModelId: string) {
    try {
      const file = await window.polyStudio.importAnimation();
      if (!file) {
        setMessage("Import canceled");
        return;
      }
      const rigParts = project.objects.filter(
        (object) => object.modelId === rigModelId,
      );
      const targetByName = new Map(rigParts.map((part) => [part.name, part.id]));
      const oldToNew = new Map(
        Object.entries(file.partNames).flatMap(([oldId, name]) => {
          const nextId = targetByName.get(name);
          return nextId ? [[oldId, nextId] as const] : [];
        }),
      );
      const animation: StudioAnimation = {
        ...file.animation,
        id: crypto.randomUUID(),
        name: nextName(
          project.animations.map((item) => item.name),
          file.animation.name,
        ),
        rigModelId,
        keyframes: file.animation.keyframes.map((keyframe) => ({
          time: keyframe.time,
          poses: Object.fromEntries(
            Object.entries(keyframe.poses).flatMap(([oldId, pose]) => {
              const nextId = oldToNew.get(oldId);
              return nextId ? [[nextId, pose] as const] : [];
            }),
          ),
        })),
      };
      updateProject((current) => ({
        ...current,
        animations: [...current.animations, animation],
      }));
      setWorkspace("animation");
      setMessage("PMA animation imported");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not import animation.",
      );
    }
  }

  async function importGame() {
    try {
      const imported = await window.polyStudio.importProject();
      if (!imported) {
        setMessage("Import canceled");
        return;
      }
      setProject(imported);
      setSelection(
        imported.objects[2]
          ? { type: "world", id: imported.objects[2].id }
          : null,
      );
      setSelectedPartIds(imported.objects[2] ? [imported.objects[2].id] : []);
      undoStack.current = [];
      redoStack.current = [];
      setDirty(false);
      setWorkspace("scene");
      setMessage("Imported game opened");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not import game.",
      );
    }
  }

  function addScript(
    kind: StudioScript["kind"],
    target: ContextTarget = { type: "service", id: "ServerScriptService" },
  ) {
    const options = scriptParentOptions(kind, project);
    const parent = options.some((option) => option.value === target.id)
      ? target.id
      : options[0].value;
    const next: StudioScript = {
      id: crypto.randomUUID(),
      name: nextName(
        project.scripts.map((item) => item.name),
        kind === "script"
          ? "Script"
          : kind === "localScript"
            ? "LocalScript"
            : "ModuleScript",
      ),
      kind,
      parent,
      source:
        kind === "localScript" &&
        project.gui.some(
          (gui) =>
            gui.id === parent &&
            (gui.type === "textButton" || gui.type === "imageButton"),
        )
          ? buttonLocalScriptSource(project.language)
          : starterSource(project.language, kind),
    };
    updateProject((current) => ({
      ...current,
      scripts: [...current.scripts, next],
    }));
    setSelection({ type: "script", id: next.id });
    setWorkspace("script");
  }

  function addGui(
    type: StudioGuiObject["type"],
    target: ContextTarget = { type: "service", id: "StarterGui" },
  ) {
    let parentId: string | null = null;
    if (type !== "screenGui") {
      parentId = target.type === "gui" ? target.id : null;
      if (!parentId) return;
    }
    const next = guiDefault(type, parentId, project.gui);
    updateProject((current) => ({
      ...current,
      gui: [...current.gui, next],
    }));
    setSelection({ type: "gui", id: next.id });
    setWorkspace("ui");
  }

  function openContextMenu(
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (
      target.type === "world" &&
      !selectedPartIds.includes(target.id)
    ) {
      selectWorld(target.id);
    }
    else if (target.type === "model") selectModel(target.id);
    else {
      setSelection(target);
      if (target.type !== "script" && target.type !== "gui") {
        setSelectedPartIds([]);
      }
    }
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 230)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 330)),
      target,
    });
  }

  function contextActions(target: ContextTarget) {
    const actions: Array<{
      label: string;
      icon: ReactNode;
      run: () => void;
    }> = [];
    if (
      target.type === "world" ||
      target.type === "model" ||
      target.type === "gui" ||
      target.type === "script" ||
      target.type === "remote" ||
      target.type === "value"
    ) {
      actions.push({
        label: "Duplicate with children",
        icon: <Copy size={14} />,
        run: duplicateSelected,
      });
    }
    const addWorldActions = () => {
      actions.push(
        { label: "Part", icon: <Box size={14} />, run: () => addPart("part", target) },
        { label: "Sphere", icon: <CircleHelp size={14} />, run: () => addPart("part", target, "sphere") },
        { label: "Cylinder", icon: <CircleHelp size={14} />, run: () => addPart("part", target, "cylinder") },
        { label: "Stud", icon: <CircleHelp size={14} />, run: () => addPart("part", target, "stud") },
        { label: "Tool", icon: <Package size={14} />, run: () => addPart("tool", target) },
        { label: "Handle", icon: <Move3D size={14} />, run: () => addPart("handle", target) },
        { label: "Sound", icon: <Volume2 size={14} />, run: () => addPart("sound", target) },
        {
          label: "HumanoidRootPart",
          icon: <UserRound size={14} />,
          run: () => addPart("humanoidRootPart", target),
        },
        {
          label: "Linked Sword Template",
          icon: <Package size={14} />,
          run: () => addLinkedSword(target),
        },
      );
    };
    const addGuiChildren = () => {
      actions.push(
        { label: "Frame", icon: <Square size={14} />, run: () => addGui("frame", target) },
        { label: "TextLabel", icon: <Type size={14} />, run: () => addGui("textLabel", target) },
        {
          label: "TextButton",
          icon: <LayoutPanelTop size={14} />,
          run: () => addGui("textButton", target),
        },
        { label: "TextBox", icon: <Type size={14} />, run: () => addGui("textBox", target) },
        { label: "ImageLabel", icon: <Square size={14} />, run: () => addGui("imageLabel", target) },
        { label: "ImageButton", icon: <LayoutPanelTop size={14} />, run: () => addGui("imageButton", target) },
        { label: "ScrollingFrame", icon: <LayoutPanelTop size={14} />, run: () => addGui("scrollingFrame", target) },
      );
    };
    const addValueChildren = () => {
      actions.push(
        { label: "BoolValue", icon: <Database size={14} />, run: () => addValue("boolValue", target) },
        { label: "NumberValue", icon: <Database size={14} />, run: () => addValue("numberValue", target) },
        { label: "StringValue", icon: <Database size={14} />, run: () => addValue("stringValue", target) },
      );
    };

    if (target.type === "service") {
      if (target.id === "Workspace") {
        addWorldActions();
        actions.push(
          { label: "Model", icon: <Boxes size={14} />, run: addEmptyModel },
          { label: "Import .pmxl", icon: <Upload size={14} />, run: () => void importModel() },
          { label: "Script", icon: <FileCode2 size={14} />, run: () => addScript("script", target) },
        );
      } else if (target.id === "ServerScriptService") {
        actions.push(
          { label: "Script", icon: <FileCode2 size={14} />, run: () => addScript("script", target) },
          { label: "ModuleScript", icon: <Package size={14} />, run: () => addScript("moduleScript", target) },
        );
      } else if (target.id === "ReplicatedStorage") {
        actions.push(
          { label: "ModuleScript", icon: <Package size={14} />, run: () => addScript("moduleScript", target) },
          { label: "RemoteEvent", icon: <Cable size={14} />, run: () => addRemote("remoteEvent") },
          { label: "RemoteFunction", icon: <Cable size={14} />, run: () => addRemote("remoteFunction") },
        );
      } else if (target.id === "ServerStorage") {
        actions.push({
          label: "ModuleScript",
          icon: <Package size={14} />,
          run: () => addScript("moduleScript", target),
        });
      } else if (target.id === "StarterPlayerScripts") {
        actions.push(
          { label: "LocalScript", icon: <Code2 size={14} />, run: () => addScript("localScript", target) },
          { label: "ModuleScript", icon: <Package size={14} />, run: () => addScript("moduleScript", target) },
        );
      } else if (target.id === "StarterGui") {
        actions.push(
          { label: "ScreenGui", icon: <Monitor size={14} />, run: () => addGui("screenGui", target) },
          { label: "LocalScript", icon: <Code2 size={14} />, run: () => addScript("localScript", target) },
          { label: "ModuleScript", icon: <Package size={14} />, run: () => addScript("moduleScript", target) },
        );
      }
    } else if (target.type === "model") {
      addWorldActions();
      actions.push(
        { label: "Script", icon: <FileCode2 size={14} />, run: () => addScript("script", target) },
        { label: "ModuleScript", icon: <Package size={14} />, run: () => addScript("moduleScript", target) },
      );
    } else if (target.type === "world") {
      const object = project.objects.find((item) => item.id === target.id);
      let toolAncestor = object;
      while (toolAncestor && toolAncestor.type !== "tool") {
        toolAncestor = toolAncestor.parentId
          ? project.objects.find(
              (item) => item.id === toolAncestor!.parentId,
            )
          : undefined;
      }
      if (object?.type === "tool") {
        actions.push(
          { label: "Handle", icon: <Move3D size={14} />, run: () => addPart("handle", target) },
          { label: "Sound", icon: <Volume2 size={14} />, run: () => addPart("sound", target) },
          { label: "Linked Sword Template", icon: <Package size={14} />, run: () => addLinkedSword(target) },
          { label: "Script", icon: <FileCode2 size={14} />, run: () => addScript("script", target) },
          { label: "LocalScript", icon: <Code2 size={14} />, run: () => addScript("localScript", target) },
        );
      } else {
        actions.push({
          label: "Sound",
          icon: <Volume2 size={14} />,
          run: () => addPart("sound", target),
        });
        actions.push({
          label: "Script",
          icon: <FileCode2 size={14} />,
          run: () => addScript("script", target),
        });
        if (toolAncestor) {
          actions.push({
            label: "LocalScript",
            icon: <Code2 size={14} />,
            run: () => addScript("localScript", target),
          });
        }
      }
      if (activeWorldIds.length >= 2) {
        actions.push({
          label: "Group selection into Model",
          icon: <Boxes size={14} />,
          run: createModel,
        });
      }
    } else if (target.type === "gui") {
      addGuiChildren();
      actions.push(
        { label: "LocalScript", icon: <Code2 size={14} />, run: () => addScript("localScript", target) },
        { label: "ModuleScript", icon: <Package size={14} />, run: () => addScript("moduleScript", target) },
      );
    } else if (target.type === "script") {
      actions.push({
        label: "ModuleScript",
        icon: <Package size={14} />,
        run: () => addScript("moduleScript", target),
      });
    }
    if (
      target.type === "service" ||
      target.type === "world" ||
      target.type === "model" ||
      target.type === "gui" ||
      target.type === "script" ||
      target.type === "value"
    ) {
      addValueChildren();
    }
    return actions;
  }

  function withoutValuesUnder(
    values: StudioValueObject[],
    parentIds: ReadonlySet<string>,
  ): StudioValueObject[] {
    const removed = new Set(parentIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const value of values) {
        if (removed.has(value.parent) && !removed.has(value.id)) {
          removed.add(value.id);
          changed = true;
        }
      }
    }
    return values.filter((value) => !removed.has(value.id));
  }

  function removeSelected() {
    if (selectedModel) {
      const objectIds = new Set(
        project.objects
          .filter((object) => object.modelId === selectedModel.id)
          .map((object) => object.id),
      );
      updateProject((current) => ({
        ...current,
        objects: current.objects.filter(
          (object) => object.modelId !== selectedModel.id,
        ),
        models: current.models.filter((model) => model.id !== selectedModel.id),
        scripts: current.scripts.filter(
          (script) =>
            script.parent !== selectedModel.id && !objectIds.has(script.parent),
        ),
        values: withoutValuesUnder(
          current.values,
          new Set([selectedModel.id, ...objectIds]),
        ),
      }));
    } else if (selectedRemote) {
      updateProject((current) => ({
        ...current,
        remotes: current.remotes.filter((remote) => remote.id !== selectedRemote.id),
      }));
    } else if (selectedWorld) {
      if (["baseplate", "spawn"].includes(selectedWorld.type)) return;
      const ids = new Set(activeWorldIds);
      let changed = true;
      while (changed) {
        changed = false;
        for (const object of project.objects) {
          if (
            object.parentId &&
            ids.has(object.parentId) &&
            !ids.has(object.id)
          ) {
            ids.add(object.id);
            changed = true;
          }
        }
      }
      updateProject((current) => ({
        ...current,
        objects: current.objects.filter(
          (item) => ["baseplate", "spawn"].includes(item.type) || !ids.has(item.id),
        ),
        scripts: current.scripts.filter((script) => !ids.has(script.parent)),
        values: withoutValuesUnder(current.values, ids),
      }));
    } else if (selectedScript) {
      const ids = new Set([selectedScript.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const script of project.scripts) {
          if (ids.has(script.parent) && !ids.has(script.id)) {
            ids.add(script.id);
            changed = true;
          }
        }
      }
      updateProject((current) => ({
        ...current,
        scripts: current.scripts.filter((item) => !ids.has(item.id)),
        values: withoutValuesUnder(current.values, ids),
      }));
    } else if (selectedGui) {
      const ids = new Set([selectedGui.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of project.gui) {
          if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
            ids.add(item.id);
            changed = true;
          }
        }
      }
      updateProject((current) => ({
        ...current,
        gui: current.gui.filter((item) => !ids.has(item.id)),
        scripts: current.scripts.filter((item) => !ids.has(item.parent)),
        values: withoutValuesUnder(current.values, ids),
      }));
    } else if (selectedValue) {
      const ids = new Set([selectedValue.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const value of project.values) {
          if (ids.has(value.parent) && !ids.has(value.id)) {
            ids.add(value.id);
            changed = true;
          }
        }
      }
      updateProject((current) => ({
        ...current,
        values: current.values.filter((value) => !ids.has(value.id)),
      }));
    }
    setSelection(null);
    setSelectedPartIds([]);
  }

  async function play(mode: "default" | "here" = "default") {
    const allDiagnostics = project.scripts.flatMap((script) =>
      analyzePolyScript(script, project as PolyProject).map((item) => ({
        ...item,
        scriptId: script.id,
      })),
    );
    const error = allDiagnostics.find((item) => item.severity === "error");
    if (error) {
      setSelection({ type: "script", id: error.scriptId });
      setWorkspace("script");
      setMessage("Fix script errors before starting Play.");
      return;
    }
    setPlaying(true);
    const saved = await save();
    if (saved) {
      try {
        await window.polyStudio.playProject(
          saved.id,
          mode === "here" ? playHereSpawn.current : undefined,
        );
        setMessage(
          mode === "here"
            ? "Opening Polymons Player here..."
            : "Opening Polymons Player...",
        );
      } catch (launchError) {
        setMessage(
          launchError instanceof Error
            ? launchError.message
            : "Could not open Polymons Player.",
        );
      }
    }
    setPlaying(false);
  }

  function openPublishDialog() {
    const allDiagnostics = project.scripts.flatMap((script) =>
      analyzePolyScript(script, project as PolyProject),
    );
    if (allDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      setMessage("Fix script errors before publishing.");
      return;
    }
    setPublishDialog(true);
  }

  async function publish(metadata: {
    title: string;
    description: string;
    thumbnailData?: string;
  }) {
    setPublishing(true);
    setMessage(project.publication ? "Updating..." : "Publishing...");
    try {
      const result = await window.polyStudio.publishProject(project, metadata);
      setProject(result.project);
      setDirty(false);
      setPublishDialog(false);
      setMessage(
        `Verified ${result.game.title} version ${result.game.version}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <main className="studio-editor">
      <header className="editor-titlebar">
        <button className="editor-brand" onClick={() => void exitEditor()}>
          <img src={logo} alt="" />
          <span>Poly Studio</span>
        </button>
        <div className="project-title">
          <input
            aria-label="Game name"
            maxLength={64}
            value={project.name}
            onChange={(event) =>
              updateProject((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <span>{dirty ? "Unsaved" : "Saved locally"}</span>
        </div>
        <div className="editor-account">
          <UserRound size={15} />
          {auth.user.displayName}
        </div>
        <button
          className="mobile-title-save"
          type="button"
          aria-label="Save project"
          disabled={saving}
          onClick={() => void save()}
        >
          <Save size={18} />
        </button>
      </header>

      <div className="editor-toolbar">
        <div
          className="studio-menu"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            onClick={() =>
              setOpenMenu((current) => (current === "file" ? null : "file"))
            }
          >
            File
          </button>
          <button
            onClick={() =>
              setOpenMenu((current) =>
                current === "project" ? null : "project",
              )
            }
          >
            Project
          </button>
          {openMenu === "file" && (
            <div className="studio-menu-popover">
              <button onClick={() => void save()}>
                <Save size={14} /> Save game
              </button>
              <button onClick={() => void saveVersion()}>
                <Save size={14} /> Save version
              </button>
              <button onClick={() => void openHistory()}>
                <FolderOpen size={14} /> Version history
              </button>
              <button onClick={() => void importGame()}>
                <Upload size={14} /> Import game
              </button>
              <button onClick={() => void exportGame()}>
                <Download size={14} /> Export game
              </button>
              <button
                onClick={() =>
                  void window.polyStudio.revealProject(project.id)
                }
              >
                <FolderOpen size={14} /> Open folder
              </button>
              <button onClick={() => void exitEditor()}>Back to projects</button>
            </div>
          )}
          {openMenu === "project" && (
            <div className="studio-menu-popover studio-menu-project">
              <button onClick={() => void play()}>
                <Play size={14} /> Playtest
              </button>
              <button onClick={() => void play("here")}>
                <Play size={14} /> Play here
              </button>
              <button onClick={openPublishDialog}>
                <Upload size={14} />
                {project.publication ? "Update game" : "Publish game"}
              </button>
              <button
                onClick={() => {
                  setOpenMenu(null);
                  setBadgeDialog(true);
                }}
              >
                <Award size={14} /> Badges
              </button>
              <button
                onClick={() => {
                  setOpenMenu(null);
                  setMonetizationDialog(true);
                }}
              >
                <Tickets size={14} /> Monetization
              </button>
            </div>
          )}
        </div>
        <div className="toolbar-group tool-selector">
          <button title="Select (Ctrl+1)" className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}>
            <MousePointer2 size={17} />
          </button>
          <button title="Move (Ctrl+2)" className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}><Move3D size={17} /></button>
          <button title="Rotate (Ctrl+4)" className={tool === "rotate" ? "active" : ""} onClick={() => setTool("rotate")}><RotateCw size={17} /></button>
          <button title="Scale (Ctrl+3)" className={tool === "scale" ? "active" : ""} onClick={() => setTool("scale")}><Settings2 size={17} /></button>
          <button
            className={`mobile-camera-tool ${tool === "camera" ? "active" : ""}`}
            title="Camera: drag to look and pinch to move"
            onClick={() => setTool("camera")}
          >
            <Camera size={17} /> Camera
          </button>
        </div>
        <div className="toolbar-group history-tools">
          <button title="Undo" disabled={undoStack.current.length === 0} onClick={undo}><Undo2 size={17} /></button>
          <button title="Redo" disabled={redoStack.current.length === 0} onClick={redo}><Redo2 size={17} /></button>
          <button title="Duplicate selection with children" disabled={!canDuplicateSelection} onClick={duplicateSelected}><Copy size={16} /></button>
          <button title="Group selection into Model (Ctrl+G)" disabled={activeWorldIds.length < 2} onClick={createModel}><Boxes size={16} /></button>
          <button title="Ungroup Model (Ctrl+Shift+G)" disabled={!selectedModel} onClick={ungroupModel}><Ungroup size={16} /></button>
          <button title="Snap selection to grid" disabled={activeWorldIds.length === 0} onClick={snapSelection}><Grid3X3 size={16} /></button>
        </div>
        <div
          className="toolbar-group arrange-tools"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button
            title={selectedModel ? "Ungroup a Model before arranging its Parts" : "Align and distribute selection"}
            disabled={activeWorldIds.length < 2 || Boolean(selectedModel)}
            className={openMenu === "arrange" ? "active" : ""}
            onClick={() =>
              setOpenMenu((current) => (current === "arrange" ? null : "arrange"))
            }
          >
            <Crosshair size={16} /> Arrange
          </button>
          {openMenu === "arrange" && (
            <div className="arrange-popover">
              <header>
                <strong>Align to active Part</strong>
                <span>Min, center, or max edge</span>
              </header>
              {([0, 1, 2] as ArrangeAxis[]).map((axis) => (
                <div className="arrange-row" key={axis}>
                  <strong>{["X", "Y", "Z"][axis]}</strong>
                  {(["min", "center", "max"] as AlignEdge[]).map((edge) => (
                    <button key={edge} onClick={() => alignSelection(axis, edge)}>
                      {edge === "center" ? "Ctr" : edge[0].toUpperCase() + edge.slice(1)}
                    </button>
                  ))}
                  <button
                    title="Evenly distribute centers"
                    disabled={activeWorldIds.length < 3}
                    onClick={() => distributeSelection(axis)}
                  >
                    Space
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            title="Show collider, velocity, and mass debugging"
            className={physicsDebug ? "active" : ""}
            onClick={() => setPhysicsDebug((current) => !current)}
          >
            <Activity size={16} /> Physics
          </button>
        </div>
        <div className="insert-hint">
          <Plus size={13} />
          Right-click Explorer items to insert
        </div>
        <div className="snap-controls">
          <label title="Move and duplicate snap">
            Grid
            <input
              type="number"
              min="0.01"
              step="0.25"
              value={gridSnap}
              onChange={(event) => setGridSnap(Math.max(0.01, Number(event.target.value) || 1))}
            />
          </label>
          <label title="Rotation snap in degrees">
            Angle
            <input
              type="number"
              min="0.1"
              max="180"
              step="0.5"
              value={angleSnap}
              onChange={(event) => setAngleSnap(Math.max(0.1, Number(event.target.value) || 15))}
            />
          </label>
          <div className="angle-presets" aria-label="Rotation snap presets">
            {[15, 30, 45, 90].map((degrees) => (
              <button
                key={degrees}
                type="button"
                className={angleSnap === degrees ? "active" : ""}
                title={`Set rotation snap to ${degrees} degrees`}
                onClick={() => setAngleSnap(degrees)}
              >
                {degrees}°
              </button>
            ))}
          </div>
        </div>
        <div className="workspace-tabs">
          <button
            className={workspace === "scene" ? "active" : ""}
            onClick={() => setWorkspace("scene")}
          >
            <Grid3X3 size={15} /> Scene
          </button>
          <button
            className={workspace === "ui" ? "active" : ""}
            onClick={() => setWorkspace("ui")}
          >
            <Monitor size={15} /> UI
          </button>
          <button
            className={workspace === "script" ? "active" : ""}
            onClick={() => {
              if (!selectedScript && project.scripts[0]) {
                setSelection({ type: "script", id: project.scripts[0].id });
              }
              setWorkspace("script");
            }}
          >
            <Code2 size={15} /> Script
          </button>
          <button
            className={workspace === "animation" ? "active" : ""}
            onClick={() => setWorkspace("animation")}
          >
            <RotateCw size={15} /> Animation
          </button>
        </div>
        <button className="save-button" onClick={() => void save()} disabled={saving}>
          <Save size={16} /> {saving ? "Saving" : "Save"}
        </button>
        <button
          className="publish-button"
          onClick={openPublishDialog}
          disabled={publishing || project.name.trim().length === 0}
        >
          <Upload size={16} />
          {publishing
            ? project.publication
              ? "Updating"
              : "Publishing"
            : project.publication
              ? "Update"
              : "Publish"}
        </button>
        <button className="play-button" onClick={() => void play()} disabled={playing}>
          <Play size={16} fill="currentColor" />
          {playing ? "Opening" : "Play"}
        </button>
        <button
          className="play-here-button"
          onClick={() => void play("here")}
          disabled={playing}
          title="Spawn where the Studio camera is looking from"
        >
          <Play size={16} fill="currentColor" />
          Play Here
        </button>
        <button title="Project health" onClick={() => setShowHealth(true)}>
          Health {healthIssues.length > 0 ? `(${healthIssues.length})` : ""}
        </button>
        <button
          title="Search every object, script, GUI, value, and service"
          onClick={() => {
            setSearchEverywhereQuery("");
            setShowSearchEverywhere(true);
          }}
        >
          <Search size={16} /> Search
        </button>
        <button title="Open scripting API explorer" onClick={() => setShowApiExplorer(true)}>
          <Code2 size={16} /> API
        </button>
        <button title="Keyboard shortcuts" onClick={() => setShowShortcuts(true)}>
          Shortcuts
        </button>
      </div>

      <div
        className={`editor-workspace${mobilePanel ? ` mobile-panel-${mobilePanel}` : ""}`}
      >
        {mobilePanel && (
          <button
            className="mobile-panel-backdrop"
            type="button"
            aria-label="Close panel"
            onClick={() => setMobilePanel(null)}
          />
        )}
        <Explorer
          project={project}
          selection={selection}
          selectedPartIds={selectedPartIds}
          onSelectWorld={(id, additive) => {
            selectWorld(id, additive);
            setMobilePanel(null);
          }}
          onSelectModel={(id) => {
            selectModel(id);
            setMobilePanel(null);
          }}
          onSelect={(next) => {
            setSelection(next);
            if (next.type !== "world" && next.type !== "model") {
              setSelectedPartIds([]);
            }
            if (next.type === "script") setWorkspace("script");
            else if (next.type === "gui") setWorkspace("ui");
            else if (next.type !== "service") setWorkspace("scene");
            setMobilePanel(null);
          }}
          onContextMenu={openContextMenu}
        />

        <section className="editor-center">
          {workspace === "animation" ? (
            <>
              <SceneViewport
                objects={project.objects}
                gui={project.gui}
                lighting={project.lighting}
                selectedWorldIds={activeWorldIds}
                selectedGuiId={selectedGui?.id ?? null}
                showGui={false}
                tool={tool}
                gridSnap={gridSnap}
                angleSnap={angleSnap}
                physicsDebug={physicsDebug}
                onTransformStart={beginViewportTransform}
                onTransformChange={updateViewportTransform}
                onTransformEnd={finishViewportTransform}
                onSelectWorld={(id, additive) => {
                  if (id) selectWorld(id, additive);
                  else {
                    setSelection(null);
                    setSelectedPartIds([]);
                  }
                }}
                onSelectGui={(id) =>
                  setSelection(id ? { type: "gui", id } : null)
                }
                onGuiChange={(id, patch) =>
                  updateProject((current) => ({
                    ...current,
                    gui: current.gui.map((item) =>
                      item.id === id ? { ...item, ...patch } : item,
                    ),
                  }))
                }
                onCameraChange={(spawn) => {
                  playHereSpawn.current = spawn;
                }}
              />
              <AnimationWorkspace
                project={project}
                selectedPartIds={selectedPartIds}
                activeTool={tool}
                onChange={updateProject}
                onSelectParts={selectAnimationParts}
                onToolChange={setTool}
                onExport={(animation) => void exportAnimation(animation)}
                onImport={(rigModelId) => void importAnimation(rigModelId)}
              />
            </>
          ) : workspace === "script" && selectedScript ? (
            <ScriptWorkspace
              key={selectedScript.id}
              project={project}
              script={selectedScript}
              settings={settings}
              diagnostics={diagnostics[selectedScript.id] ?? []}
              onDiagnostics={(next) =>
                setDiagnostics((current) => ({
                  ...current,
                  [selectedScript.id]: next,
                }))
              }
              onChange={(source) =>
                updateProject((current) => ({
                  ...current,
                  scripts: current.scripts.map((script) =>
                    script.id === selectedScript.id
                      ? { ...script, source }
                      : script,
                  ),
                }))
              }
            />
          ) : (
            <SceneViewport
              objects={project.objects}
              gui={project.gui}
              lighting={project.lighting}
              selectedWorldIds={activeWorldIds}
              selectedGuiId={selectedGui?.id ?? null}
              showGui={workspace === "ui"}
              tool={tool}
              gridSnap={gridSnap}
              angleSnap={angleSnap}
              physicsDebug={physicsDebug}
              onTransformStart={beginViewportTransform}
              onTransformChange={updateViewportTransform}
              onTransformEnd={finishViewportTransform}
              onSelectWorld={(id, additive) => {
                if (id) selectWorld(id, additive);
                else {
                  setSelection(null);
                  setSelectedPartIds([]);
                }
              }}
              onSelectGui={(id) =>
                setSelection(id ? { type: "gui", id } : null)
              }
              onGuiChange={(id, patch) =>
                updateProject((current) => ({
                  ...current,
                  gui: current.gui.map((item) =>
                    item.id === id ? { ...item, ...patch } : item,
                  ),
                }))
              }
              onCameraChange={(spawn) => {
                playHereSpawn.current = spawn;
              }}
            />
          )}
        </section>

        <Properties
          project={project}
          selection={selection}
          onWorldChange={(patch) => {
            if (!selectedWorld) return;
            const ids = new Set(activeWorldIds);
            updateProject((current) => ({
              ...projectWithUpdatedReferences(
                current,
                typeof patch.name === "string" ? selectedWorld.name : "",
                typeof patch.name === "string" ? patch.name : "",
                ["Workspace", "workspace"],
              ),
              objects: current.objects.map((item) =>
                ids.has(item.id) ? { ...item, ...patch } : item,
              ),
            }));
          }}
          onModelChange={(patch) => {
            if (!selectedModel) return;
            updateProject((current) => ({
              ...projectWithUpdatedReferences(
                current,
                typeof patch.name === "string" ? selectedModel.name : "",
                typeof patch.name === "string" ? patch.name : "",
                ["Workspace", "workspace"],
              ),
              models: current.models.map((model) =>
                model.id === selectedModel.id ? { ...model, ...patch } : model,
              ),
            }));
          }}
          onRemoteChange={(patch) => {
            if (!selectedRemote) return;
            updateProject((current) => ({
              ...projectWithUpdatedReferences(
                current,
                typeof patch.name === "string" ? selectedRemote.name : "",
                typeof patch.name === "string" ? patch.name : "",
                ["ReplicatedStorage"],
              ),
              remotes: current.remotes.map((remote) =>
                remote.id === selectedRemote.id ? { ...remote, ...patch } : remote,
              ),
            }));
          }}
          onGuiChange={(patch) => {
            if (!selectedGui) return;
            updateProject((current) => ({
              ...projectWithUpdatedReferences(
                current,
                typeof patch.name === "string" ? selectedGui.name : "",
                typeof patch.name === "string" ? patch.name : "",
                ["StarterGui", "PlayerGui"],
              ),
              gui: current.gui.map((item) =>
                item.id === selectedGui.id ? { ...item, ...patch } : item,
              ),
            }));
          }}
          onScriptChange={(patch) => {
            if (!selectedScript) return;
            updateProject((current) => {
              const renamed = projectWithUpdatedReferences(
                current,
                typeof patch.name === "string" ? selectedScript.name : "",
                typeof patch.name === "string" ? patch.name : "",
                ["ReplicatedStorage", "ServerScriptService", "StarterPlayerScripts", "StarterGui"],
              );
              return {
                ...renamed,
                scripts: renamed.scripts.map((item) =>
                  item.id === selectedScript.id ? { ...item, ...patch } : item,
                ),
              };
            });
          }}
          onValueChange={(patch) => {
            if (!selectedValue) return;
            updateProject((current) => ({
              ...projectWithUpdatedReferences(
                current,
                typeof patch.name === "string" ? selectedValue.name : "",
                typeof patch.name === "string" ? patch.name : "",
                [
                  "Workspace",
                  "workspace",
                  "ReplicatedStorage",
                  "ServerStorage",
                  "StarterGui",
                  "PlayerGui",
                  "LocalPlayer",
                  "player",
                ],
              ),
              values: current.values.map((value) =>
                value.id === selectedValue.id ? { ...value, ...patch } : value,
              ),
            }));
          }}
          onPlayerChange={(patch) =>
            updateProject((current) => ({
              ...current,
              playerSettings: { ...current.playerSettings, ...patch },
            }))
          }
          onLightingChange={(patch) =>
            updateProject((current) => ({
              ...current,
              lighting: { ...current.lighting, ...patch },
            }))
          }
          onLeaderstatsChange={(leaderstats) =>
            updateProject((current) => ({ ...current, leaderstats }))
          }
          onDelete={removeSelected}
          onUngroup={ungroupModel}
          onExportModel={() => void exportSelectedModel()}
        />
      </div>

      <nav className="mobile-studio-dock" aria-label="Mobile Studio tools">
        <button
          className={mobilePanel === "explorer" ? "active" : ""}
          onClick={() =>
            setMobilePanel((current) =>
              current === "explorer" ? null : "explorer",
            )
          }
        >
          <PanelLeft size={18} />
          Explorer
        </button>
        <button
          className={!mobilePanel && workspace === "scene" ? "active" : ""}
          onClick={() => {
            setWorkspace("scene");
            setMobilePanel(null);
          }}
        >
          <Grid3X3 size={18} />
          Scene
        </button>
        <button
          className={!mobilePanel && workspace === "ui" ? "active" : ""}
          onClick={() => {
            setWorkspace("ui");
            setMobilePanel(null);
          }}
        >
          <Monitor size={18} />
          UI
        </button>
        <button
          className={!mobilePanel && workspace === "script" ? "active" : ""}
          onClick={() => {
            if (!selectedScript && project.scripts[0]) {
              setSelection({ type: "script", id: project.scripts[0].id });
            }
            setWorkspace("script");
            setMobilePanel(null);
          }}
        >
          <Code2 size={18} />
          Script
        </button>
        <button
          className={mobilePanel === "properties" ? "active" : ""}
          onClick={() =>
            setMobilePanel((current) =>
              current === "properties" ? null : "properties",
            )
          }
        >
          <SlidersHorizontal size={18} />
          Properties
        </button>
      </nav>

      {contextMenu && (
        <div
          className="insert-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <header>
            <strong>Insert object</strong>
            <span>
              {contextMenu.target.type === "service"
                ? contextMenu.target.id
                : contextMenu.target.type === "world"
                  ? project.objects.find(
                      (item) => item.id === contextMenu.target.id,
                    )?.name
                  : contextMenu.target.type === "model"
                    ? project.models.find(
                        (item) => item.id === contextMenu.target.id,
                      )?.name
                    : contextMenu.target.type === "gui"
                      ? project.gui.find(
                          (item) => item.id === contextMenu.target.id,
                        )?.name
                      : contextMenu.target.type === "script"
                        ? project.scripts.find(
                            (item) => item.id === contextMenu.target.id,
                          )?.name
                        : contextMenu.target.type === "value"
                          ? project.values.find(
                              (item) => item.id === contextMenu.target.id,
                            )?.name
                        : contextMenu.target.type}
            </span>
          </header>
          {contextActions(contextMenu.target).length > 0 ? (
            contextActions(contextMenu.target).map((action) => (
              <button
                key={action.label}
                onClick={() => {
                  action.run();
                  setContextMenu(null);
                }}
              >
                {action.icon}
                {action.label}
              </button>
            ))
          ) : (
            <p>Nothing can be inserted here.</p>
          )}
        </div>
      )}

      {publishDialog && (
        <PublishDialog
          project={project}
          publishing={publishing}
          onClose={() => setPublishDialog(false)}
          onPublish={(metadata) => void publish(metadata)}
        />
      )}
      {badgeDialog && (
        <BadgeDialog
          badges={project.badges}
          onClose={() => setBadgeDialog(false)}
          onChange={(badges) =>
            updateProject((current) => ({ ...current, badges }))
          }
        />
      )}
      {monetizationDialog && (
        <MonetizationDialog
          gamePasses={project.gamePasses}
          developerProducts={project.developerProducts}
          onClose={() => setMonetizationDialog(false)}
          onChange={(gamePasses, developerProducts) =>
            updateProject((current) => ({
              ...current,
              gamePasses,
              developerProducts,
            }))
          }
        />
      )}
      {historyDialog && (
        <VersionHistoryDialog
          backups={backups}
          busy={saving}
          onClose={() => setHistoryDialog(false)}
          onRestore={(backupId) => void restoreBackup(backupId)}
        />
      )}

      {showHealth && (
        <StudioInfoDialog title="Project health" onClose={() => setShowHealth(false)}>
          {healthIssues.length === 0 ? (
            <p>No broken references or script errors detected.</p>
          ) : (
            <div className="health-list">
              {healthIssues.map((issue, index) => (
                <button
                  key={`${issue}-${index}`}
                  onClick={() => {
                    const script = project.scripts.find((item) =>
                      issue.startsWith(`${item.name}:`),
                    );
                    if (script) {
                      setSelection({ type: "script", id: script.id });
                      setWorkspace("script");
                      setShowHealth(false);
                    }
                  }}
                >
                  {issue}
                </button>
              ))}
            </div>
          )}
        </StudioInfoDialog>
      )}

      {showShortcuts && (
        <StudioInfoDialog title="Keyboard shortcuts" onClose={() => setShowShortcuts(false)}>
          <div className="shortcut-grid">
            <code>Ctrl+S</code><span>Save</span>
            <code>Ctrl+Z / Ctrl+Y</code><span>Undo / redo</span>
            <code>Ctrl+C / Ctrl+V</code><span>Copy / paste selection</span>
            <code>Ctrl+D</code><span>Duplicate selection with children</span>
            <code>Ctrl+G</code><span>Group as Model</span>
            <code>Ctrl+Shift+G</code><span>Ungroup Model</span>
            <code>Ctrl+Shift+P</code><span>Command palette</span>
            <code>Ctrl+Shift+F</code><span>Search everywhere</span>
            <code>F2</code><span>Rename project</span>
            <code>WASD / Arrows</code><span>Move / look around viewport</span>
          </div>
        </StudioInfoDialog>
      )}

      {commandPalette && (
        <StudioInfoDialog title="Command palette" onClose={() => setCommandPalette(false)}>
          <div className="command-list">
            {[
              ["Save project", () => void save()],
              ["Playtest", () => void play()],
              ["Group selection into Model", createModel],
              ["Duplicate selection", duplicateSelected],
              ["Search everywhere", () => {
                setSearchEverywhereQuery("");
                setShowSearchEverywhere(true);
              }],
              ["Open Script API Explorer", () => setShowApiExplorer(true)],
              ["Open Project Health", () => setShowHealth(true)],
              ["Toggle Physics Debug", () => setPhysicsDebug((current) => !current)],
              ["Switch to Scene", () => setWorkspace("scene")],
              ["Switch to UI", () => setWorkspace("ui")],
              ["Switch to Script", () => setWorkspace("script")],
            ].map(([label, run]) => (
              <button
                key={String(label)}
                onClick={() => {
                  (run as () => void)();
                  setCommandPalette(false);
                }}
              >
                {String(label)}
              </button>
            ))}
          </div>
        </StudioInfoDialog>
      )}

      {showSearchEverywhere && (
        <SearchEverywhereDialog
          query={searchEverywhereQuery}
          results={searchEverywhereResults}
          onQuery={setSearchEverywhereQuery}
          onClose={() => setShowSearchEverywhere(false)}
          onSelect={selectSearchResult}
        />
      )}

      {showApiExplorer && (
        <ScriptApiExplorerDialog
          onClose={() => setShowApiExplorer(false)}
          onCopy={(code) => {
            void navigator.clipboard.writeText(code);
            setMessage("Copied API example");
          }}
        />
      )}

      <footer className="editor-statusbar">
        <span>{message}</span>
        <span>{languageName[project.language]}</span>
        <button onClick={() => void window.polyStudio.revealProject(project.id)}>
          <FolderOpen size={13} /> Open project folder
        </button>
      </footer>
    </main>
  );
}

function StudioInfoDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="studio-modal-layer">
      <button className="studio-modal-backdrop" onClick={onClose} />
      <section className="studio-info-dialog">
        <button className="dialog-close" onClick={onClose}>Close</button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function SearchEverywhereDialog({
  query,
  results,
  onQuery,
  onClose,
  onSelect,
}: {
  query: string;
  results: StudioSearchResult[];
  onQuery: (query: string) => void;
  onClose: () => void;
  onSelect: (selection: Exclude<Selection, null>) => void;
}) {
  return (
    <div className="studio-modal-layer">
      <button className="studio-modal-backdrop" onClick={onClose} />
      <section className="studio-info-dialog studio-search-dialog">
        <button className="dialog-close" onClick={onClose}>Close</button>
        <h2>Search Everywhere</h2>
        <label className="studio-global-search">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && results[0]) {
                onSelect(results[0].selection);
              }
            }}
            placeholder="Search objects, scripts, GUI, remotes, values, services..."
          />
        </label>
        <div className="studio-search-results">
          {results.map((result) => (
            <button key={result.key} onClick={() => onSelect(result.selection)}>
              {explorerResultIcon(result.selection.type)}
              <span>
                <strong>{result.label}</strong>
                <small>{result.path}</small>
              </span>
              <em>{result.detail}</em>
            </button>
          ))}
          {query.trim() && results.length === 0 && <p>No matches.</p>}
          {!query.trim() && <p>Start typing to jump anywhere in the project.</p>}
        </div>
      </section>
    </div>
  );
}

function ScriptApiExplorerDialog({
  onClose,
  onCopy,
}: {
  onClose: () => void;
  onCopy: (code: string) => void;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();
  const sections = SCRIPT_API_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      `${section.title} ${item.name} ${item.code}`.toLowerCase().includes(normalized),
    ),
  })).filter((section) => !normalized || section.items.length > 0);
  return (
    <div className="studio-modal-layer">
      <button className="studio-modal-backdrop" onClick={onClose} />
      <section className="studio-info-dialog studio-api-dialog">
        <button className="dialog-close" onClick={onClose}>Close</button>
        <h2>Script API Explorer</h2>
        <p>Quick examples for common Polymons scripting patterns.</p>
        <label className="studio-global-search">
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search API examples"
          />
        </label>
        <div className="script-api-grid">
          {sections.map((section) => (
            <article key={section.title} className="script-api-section">
              <h3>{section.title}</h3>
              {section.items.map((item) => (
                <div className="script-api-card" key={item.name}>
                  <header>
                    <strong>{item.name}</strong>
                    <button onClick={() => onCopy(item.code)}>Copy</button>
                  </header>
                  <pre>{item.code}</pre>
                </div>
              ))}
            </article>
          ))}
          {sections.length === 0 && <p>No API examples matched.</p>}
        </div>
      </section>
    </div>
  );
}

function VersionHistoryDialog({
  backups,
  busy,
  onClose,
  onRestore,
}: {
  backups: Array<{ id: string; name: string; savedAt: string }>;
  busy: boolean;
  onClose: () => void;
  onRestore: (backupId: string) => void;
}) {
  return (
    <StudioInfoDialog title="Version history" onClose={onClose}>
      <p className="dialog-copy">
        Poly Studio keeps up to 25 local recovery points. Restoring one first
        saves the version you have open now.
      </p>
      <div className="version-history-list">
        {backups.map((backup) => (
          <article key={backup.id}>
            <div>
              <strong>{backup.name}</strong>
              <span>{new Date(backup.savedAt).toLocaleString()}</span>
            </div>
            <button disabled={busy} onClick={() => onRestore(backup.id)}>
              Restore
            </button>
          </article>
        ))}
        {backups.length === 0 && (
          <p className="muted-copy">
            No older versions yet. Use Save version to create one immediately.
          </p>
        )}
      </div>
    </StudioInfoDialog>
  );
}

function BadgeDialog({
  badges,
  onClose,
  onChange,
}: {
  badges: StudioProject["badges"];
  onClose: () => void;
  onChange: (badges: StudioProject["badges"]) => void;
}) {
  function updateBadge(
    badgeId: string,
    patch: Partial<StudioProject["badges"][number]>,
  ) {
    onChange(
      badges.map((badge) =>
        badge.id === badgeId ? { ...badge, ...patch } : badge,
      ),
    );
  }

  return (
    <StudioInfoDialog title="Game badges" onClose={onClose}>
      <p className="dialog-copy">
        Create achievements here, then award one from a server script with
        <code> Badges:Award(player, "Badge Name")</code>.
      </p>
      <div className="badge-editor-list">
        {badges.map((badge) => (
          <article key={badge.id}>
            <button
              className="badge-icon-picker"
              onClick={() =>
                document.getElementById(`badge-icon-${badge.id}`)?.click()
              }
            >
              {badge.iconData ? (
                <img src={badge.iconData} alt="" />
              ) : (
                <Award size={24} />
              )}
            </button>
            <input
              id={`badge-icon-${badge.id}`}
              hidden
              type="file"
              accept="image/png"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                if (file.type !== "image/png" || file.size > 1_000_000) {
                  window.alert("Badge icons must be PNG files up to 1 MB.");
                  return;
                }
                const reader = new FileReader();
                reader.addEventListener("load", () => {
                  if (typeof reader.result === "string") {
                    updateBadge(badge.id, { iconData: reader.result });
                  }
                });
                reader.readAsDataURL(file);
              }}
            />
            <div className="badge-editor-fields">
              <input
                value={badge.name}
                maxLength={64}
                placeholder="Badge name"
                onChange={(event) =>
                  updateBadge(badge.id, { name: event.target.value })
                }
              />
              <textarea
                value={badge.description}
                maxLength={500}
                placeholder="What did the player accomplish?"
                onChange={(event) =>
                  updateBadge(badge.id, { description: event.target.value })
                }
              />
            </div>
            <button
              className="danger-button"
              onClick={() =>
                onChange(badges.filter((item) => item.id !== badge.id))
              }
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
      <button
        className="primary-button"
        disabled={badges.length >= 50}
        onClick={() =>
          onChange([
            ...badges,
            {
              id: crypto.randomUUID(),
              name: `Badge ${badges.length + 1}`,
              description: "",
              iconData: "",
            },
          ])
        }
      >
        <Plus size={15} /> Add badge
      </button>
    </StudioInfoDialog>
  );
}

function MonetizationDialog({
  gamePasses,
  developerProducts,
  onClose,
  onChange,
}: {
  gamePasses: StudioProject["gamePasses"];
  developerProducts: StudioProject["developerProducts"];
  onClose: () => void;
  onChange: (
    gamePasses: StudioProject["gamePasses"],
    developerProducts: StudioProject["developerProducts"],
  ) => void;
}) {
  const updatePass = (
    id: string,
    patch: Partial<StudioProject["gamePasses"][number]>,
  ) => onChange(
    gamePasses.map((pass) => (pass.id === id ? { ...pass, ...patch } : pass)),
    developerProducts,
  );
  const updateProduct = (
    id: string,
    patch: Partial<StudioProject["developerProducts"][number]>,
  ) => onChange(
    gamePasses,
    developerProducts.map((product) =>
      product.id === id ? { ...product, ...patch } : product,
    ),
  );
  return (
    <StudioInfoDialog title="Monetization" onClose={onClose}>
      <p>
        Gamepasses are one-time purchases. Developer products can be bought
        repeatedly and may add to playerdata.
      </p>
      <div className="badge-list">
        <h3>Gamepasses</h3>
        {gamePasses.map((pass) => (
          <article key={pass.id} className="badge-row">
            <div className="badge-fields">
              <input
                value={pass.name}
                placeholder="Gamepass name"
                onChange={(event) => updatePass(pass.id, { name: event.target.value })}
              />
              <input
                type="number"
                min="0"
                value={pass.priceTix}
                onChange={(event) =>
                  updatePass(pass.id, {
                    priceTix: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                  })
                }
              />
              <textarea
                value={pass.description}
                placeholder="Description"
                onChange={(event) =>
                  updatePass(pass.id, { description: event.target.value })
                }
              />
            </div>
            <button
              className="studio-icon-button danger"
              onClick={() =>
                onChange(
                  gamePasses.filter((item) => item.id !== pass.id),
                  developerProducts,
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </article>
        ))}
        <button
          className="studio-secondary"
          disabled={gamePasses.length >= 50}
          onClick={() =>
            onChange(
              [
                ...gamePasses,
                {
                  id: crypto.randomUUID(),
                  name: `Gamepass ${gamePasses.length + 1}`,
                  description: "",
                  priceTix: 0,
                },
              ],
              developerProducts,
            )
          }
        >
          <Plus size={14} /> Add gamepass
        </button>
      </div>
      <div className="badge-list">
        <h3>Developer products</h3>
        {developerProducts.map((product) => (
          <article key={product.id} className="badge-row">
            <div className="badge-fields">
              <input
                value={product.name}
                placeholder="Product name"
                onChange={(event) =>
                  updateProduct(product.id, { name: event.target.value })
                }
              />
              <input
                type="number"
                min="0"
                value={product.priceTix}
                onChange={(event) =>
                  updateProduct(product.id, {
                    priceTix: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                  })
                }
              />
              <input
                value={product.effectKey ?? ""}
                placeholder="PlayerData key, ex: Coins"
                onChange={(event) =>
                  updateProduct(product.id, {
                    effectKey: event.target.value.trim() || null,
                  })
                }
              />
              <input
                type="number"
                value={product.effectAmount}
                onChange={(event) =>
                  updateProduct(product.id, {
                    effectAmount: Number(event.target.value) || 0,
                  })
                }
              />
              <textarea
                value={product.description}
                placeholder="Description"
                onChange={(event) =>
                  updateProduct(product.id, { description: event.target.value })
                }
              />
            </div>
            <button
              className="studio-icon-button danger"
              onClick={() =>
                onChange(
                  gamePasses,
                  developerProducts.filter((item) => item.id !== product.id),
                )
              }
            >
              <Trash2 size={14} />
            </button>
          </article>
        ))}
        <button
          className="studio-secondary"
          disabled={developerProducts.length >= 50}
          onClick={() =>
            onChange(
              gamePasses,
              [
                ...developerProducts,
                {
                  id: crypto.randomUUID(),
                  name: `Product ${developerProducts.length + 1}`,
                  description: "",
                  priceTix: 0,
                  effectKey: null,
                  effectAmount: 0,
                },
              ],
            )
          }
        >
          <Plus size={14} /> Add developer product
        </button>
      </div>
      <p>
        Scripts can use <code>GamePasses:Owns(player, "VIP")</code>,{" "}
        <code>GamePasses:PromptPurchase(player, "VIP")</code>, and{" "}
        <code>DeveloperProducts:PromptPurchase(player, "Coins")</code>.
      </p>
    </StudioInfoDialog>
  );
}

function PublishDialog({
  project,
  publishing,
  onClose,
  onPublish,
}: {
  project: StudioProject;
  publishing: boolean;
  onClose: () => void;
  onPublish: (metadata: {
    title: string;
    description: string;
    thumbnailData?: string;
  }) => void;
}) {
  const [title, setTitle] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [thumbnailData, setThumbnailData] = useState("");
  const thumbnailInput = useRef<HTMLInputElement>(null);
  return (
    <div className="studio-modal-layer">
      <button className="studio-modal-backdrop" onClick={onClose} />
      <form
        className="publish-game-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onPublish({
            title,
            description,
            thumbnailData: thumbnailData || undefined,
          });
        }}
      >
        <button type="button" className="dialog-close" onClick={onClose}>
          Close
        </button>
        <span className="studio-eyebrow">
          {project.publication ? "Update game" : "Publish game"}
        </span>
        <h2>{project.publication ? "Update on Polymons" : "Save to Polymons"}</h2>
        <p>
          The project is checked for script errors, saved locally, uploaded, and
          verified before this window closes.
        </p>
        <label className="project-name-field">
          Game name
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={1}
            maxLength={64}
            autoFocus
            required
          />
        </label>
        <label className="project-name-field publish-description">
          Description
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2_000}
            placeholder="Tell players what this game is about."
          />
          <small>{description.length}/2000</small>
        </label>
        <div className="publish-thumbnail-field">
          <span>Game thumbnail</span>
          <button
            type="button"
            className="publish-thumbnail-preview"
            onClick={() => thumbnailInput.current?.click()}
          >
            {thumbnailData ? (
              <img src={thumbnailData} alt="Game thumbnail preview" />
            ) : (
              <span>
                <Image size={22} />
                Upload PNG, JPG, or WebP
                <small>Recommended: 16:9, up to 2 MB</small>
              </span>
            )}
          </button>
          <input
            className="explorer-search-input"
            ref={thumbnailInput}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 2_000_000) {
                window.alert("Game thumbnails must be 2 MB or smaller.");
                return;
              }
              const reader = new FileReader();
              reader.addEventListener("load", () => {
                if (typeof reader.result === "string") {
                  setThumbnailData(reader.result);
                }
              });
              reader.readAsDataURL(file);
            }}
          />
          {thumbnailData && (
            <button
              type="button"
              className="studio-secondary publish-thumbnail-clear"
              onClick={() => setThumbnailData("")}
            >
              Remove selected thumbnail
            </button>
          )}
        </div>
        {project.publication && (
          <div className="publication-summary">
            Current version {project.publication.version}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" className="studio-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="studio-primary" disabled={publishing}>
            {publishing
              ? project.publication
                ? "Saving and updating..."
                : "Saving and publishing..."
              : project.publication
                ? "Save to Polymons and Update"
                : "Save to Polymons and Publish"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AnimationWorkspace({
  project,
  selectedPartIds,
  activeTool,
  onChange,
  onSelectParts,
  onToolChange,
  onExport,
  onImport,
}: {
  project: StudioProject;
  selectedPartIds: string[];
  activeTool: StudioTool;
  onChange: (updater: (current: StudioProject) => StudioProject) => void;
  onSelectParts: (ids: string[]) => void;
  onToolChange: (tool: StudioTool) => void;
  onExport: (animation: StudioAnimation) => void;
  onImport: (rigModelId: string) => void;
}) {
  const rigs = useMemo(
    () => project.models.filter((model) => model.tags.includes("Humanoid")),
    [project.models],
  );
  const [rigId, setRigId] = useState(rigs[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState(project.animations[0]?.id ?? "");
  const selected =
    project.animations.find((animation) => animation.id === selectedId) ?? null;
  const parts = useMemo(
    () =>
      project.objects.filter(
        (object) => object.modelId === (selected?.rigModelId ?? rigId),
      ),
    [project.objects, rigId, selected?.rigModelId],
  );
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [time, setTime] = useState(0);
  const restPose = useRef(
    new Map<
      string,
      { position: [number, number, number]; rotation: [number, number, number] }
    >(),
  );

  useEffect(() => {
    if (!rigs.some((rig) => rig.id === rigId)) setRigId(rigs[0]?.id ?? "");
  }, [rigId, rigs]);
  useEffect(() => {
    if (!project.animations.some((animation) => animation.id === selectedId)) {
      setSelectedId(project.animations[0]?.id ?? "");
    }
  }, [project.animations, selectedId]);
  useEffect(() => {
    if (!parts.some((part) => part.id === partId)) {
      setPartId(parts[0]?.id ?? "");
    }
  }, [partId, parts]);
  useEffect(() => {
    for (const part of parts) {
      if (!restPose.current.has(part.id)) {
        restPose.current.set(part.id, {
          position: [...part.position],
          rotation: [...part.rotation],
        });
      }
    }
  }, [parts]);
  useEffect(() => {
    const selectedRigPart = selectedPartIds.find((id) =>
      parts.some((part) => part.id === id),
    );
    if (selectedRigPart && selectedRigPart !== partId) {
      setPartId(selectedRigPart);
    }
  }, [partId, parts, selectedPartIds]);

  const patchAnimation = (patch: Partial<StudioAnimation>) => {
    if (!selected) return;
    onChange((current) => ({
      ...current,
      animations: current.animations.map((animation) =>
        animation.id === selected.id ? { ...animation, ...patch } : animation,
      ),
    }));
  };

  const createAnimation = () => {
    if (!rigId) return;
    const next: StudioAnimation = {
      id: crypto.randomUUID(),
      name: nextName(
        project.animations.map((animation) => animation.name),
        "NewAnimation",
      ),
      rigModelId: rigId,
      duration: 1,
      looped: false,
      keyframes: [],
    };
    onChange((current) => ({
      ...current,
      animations: [...current.animations, next],
    }));
    setSelectedId(next.id);
  };

  const poseForObject = (object: StudioObject) => {
    const rest =
      restPose.current.get(object.id) ?? {
        position: [...object.position] as [number, number, number],
        rotation: [...object.rotation] as [number, number, number],
      };
    restPose.current.set(object.id, rest);
    return {
      position: [
        object.position[0] - rest.position[0],
        object.position[1] - rest.position[1],
        object.position[2] - rest.position[2],
      ] as [number, number, number],
      rotation: [
        object.rotation[0] - rest.rotation[0],
        object.rotation[1] - rest.rotation[1],
        object.rotation[2] - rest.rotation[2],
      ] as [number, number, number],
    };
  };

  const mergeKeyframePoses = (
    poses: StudioAnimation["keyframes"][number]["poses"],
  ) => {
    if (!selected || Object.keys(poses).length === 0) return;
    const keyTime = Math.min(selected.duration, Math.max(0, time));
    const existing = selected.keyframes.find(
      (keyframe) => Math.abs(keyframe.time - keyTime) < 0.0001,
    );
    const keyframes = existing
      ? selected.keyframes.map((keyframe) =>
          keyframe === existing
            ? { ...keyframe, poses: { ...keyframe.poses, ...poses } }
            : keyframe,
        )
      : [
          ...selected.keyframes,
          { time: keyTime, poses },
        ].sort((a, b) => a.time - b.time);
    patchAnimation({ keyframes });
  };

  const captureSelectedPose = () => {
    const selectedRigIds = selectedPartIds.filter((id) =>
      parts.some((part) => part.id === id),
    );
    const ids = selectedRigIds.length > 0 ? selectedRigIds : partId ? [partId] : [];
    const poses = Object.fromEntries(
      parts
        .filter((part) => ids.includes(part.id))
        .map((part) => [part.id, poseForObject(part)] as const),
    );
    mergeKeyframePoses(poses);
  };

  const captureWholeRigPose = () => {
    mergeKeyframePoses(
      Object.fromEntries(parts.map((part) => [part.id, poseForObject(part)] as const)),
    );
  };

  const setCurrentAsRestPose = () => {
    for (const part of parts) {
      restPose.current.set(part.id, {
        position: [...part.position],
        rotation: [...part.rotation],
      });
    }
  };

  const poseAtTime = useCallback((objectId: string, keyTime: number) => {
    if (!selected) return null;
    const posed = selected.keyframes
      .filter((keyframe) => keyframe.poses[objectId])
      .sort((a, b) => a.time - b.time);
    if (posed.length === 0) return null;
    const before =
      [...posed].reverse().find((keyframe) => keyframe.time <= keyTime) ?? posed[0];
    const after =
      posed.find((keyframe) => keyframe.time >= keyTime) ?? posed[posed.length - 1];
    const span = Math.max(0.0001, after.time - before.time);
    const alpha = before === after ? 0 : (keyTime - before.time) / span;
    const interpolate = (
      first: [number, number, number] | undefined,
      second: [number, number, number] | undefined,
    ): [number, number, number] => {
      const a = first ?? [0, 0, 0];
      const b = second ?? a;
      return [
        a[0] + (b[0] - a[0]) * alpha,
        a[1] + (b[1] - a[1]) * alpha,
        a[2] + (b[2] - a[2]) * alpha,
      ];
    };
    return {
      position: interpolate(
        before.poses[objectId].position,
        after.poses[objectId].position,
      ),
      rotation: interpolate(
        before.poses[objectId].rotation,
        after.poses[objectId].rotation,
      ),
    };
  }, [selected]);

  const applyPoseAtCurrentTime = useCallback((targetTime: number) => {
    if (!selected) return;
    const keyTime = Math.min(selected.duration, Math.max(0, targetTime));
    onChange((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!parts.some((part) => part.id === object.id)) return object;
        const rest = restPose.current.get(object.id);
        const pose = poseAtTime(object.id, keyTime);
        if (!rest || !pose) return object;
        return {
          ...object,
          position: [
            rest.position[0] + pose.position[0],
            rest.position[1] + pose.position[1],
            rest.position[2] + pose.position[2],
          ],
          rotation: [
            rest.rotation[0] + pose.rotation[0],
            rest.rotation[1] + pose.rotation[1],
            rest.rotation[2] + pose.rotation[2],
          ],
        };
      }),
    }));
  }, [onChange, parts, poseAtTime, selected]);

  const resetRigToRestPose = () => {
    onChange((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        const rest = restPose.current.get(object.id);
        return rest
          ? {
              ...object,
              position: [...rest.position],
              rotation: [...rest.rotation],
            }
          : object;
      }),
    }));
  };

  const [windowState, setWindowState] = useState({
    x: 18,
    y: 18,
    width: 560,
    height: 300,
    minimized: false,
  });
  const [playingPreview, setPlayingPreview] = useState(false);
  const fps = 60;
  const frame = selected ? Math.round(time * fps) : 0;
  const totalFrames = selected
    ? Math.max(1, Math.round(selected.duration * fps))
    : 60;
  const timelineFrames = useMemo(() => {
    const interval = totalFrames <= 90 ? 10 : totalFrames <= 180 ? 15 : 30;
    const frames: number[] = [];
    for (let cursor = 0; cursor <= totalFrames; cursor += interval) {
      frames.push(cursor);
    }
    if (!frames.includes(totalFrames)) frames.push(totalFrames);
    return frames;
  }, [totalFrames]);
  const selectedRig = rigs.find((rig) => rig.id === (selected?.rigModelId ?? rigId));
  const keyframeCount = selected?.keyframes.reduce(
    (total, keyframe) => total + Object.keys(keyframe.poses).length,
    0,
  ) ?? 0;
  const posedFramesForPart = (id: string) =>
    selected?.keyframes
      .filter((keyframe) => keyframe.poses[id])
      .map((keyframe) => Math.round(keyframe.time * fps)) ?? [];
  const setFrame = (nextFrame: number, apply = false) => {
    if (!selected) return;
    const nextTime = Math.min(
      selected.duration,
      Math.max(0, nextFrame / fps),
    );
    setTime(nextTime);
    if (apply) applyPoseAtCurrentTime(nextTime);
  };
  const moveFrame = (delta: number) => setFrame(frame + delta, true);
  const jumpToNearestKeyframe = (direction: -1 | 1) => {
    if (!selected) return;
    const frames = selected.keyframes
      .map((keyframe) => Math.round(keyframe.time * fps))
      .sort((a, b) => a - b);
    const target =
      direction < 0
        ? [...frames].reverse().find((candidate) => candidate < frame)
        : frames.find((candidate) => candidate > frame);
    if (target !== undefined) setFrame(target, true);
  };
  const startWindowDrag = (
    event: ReactPointerEvent<HTMLElement>,
    mode: "move" | "resize",
  ) => {
    event.preventDefault();
    const origin = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      ...windowState,
    };
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - origin.pointerX;
      const dy = moveEvent.clientY - origin.pointerY;
      setWindowState((current) =>
        mode === "move"
          ? {
              ...current,
              x: Math.max(8, origin.x + dx),
              y: Math.max(8, origin.y + dy),
            }
          : {
              ...current,
              width: Math.max(390, origin.width + dx),
              height: Math.max(210, origin.height + dy),
            },
      );
    };
    const onUp = () => {
      target.releasePointerCapture?.(event.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  useEffect(() => {
    if (!playingPreview || !selected) return;
    let frameId = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const delta = (now - previous) / 1000;
      previous = now;
      setTime((current) => {
        if (!selected) return current;
        let next = current + delta;
        if (next > selected.duration) {
          if (selected.looped) next %= selected.duration;
          else {
            next = selected.duration;
            setPlayingPreview(false);
          }
        }
        applyPoseAtCurrentTime(next);
        return next;
      });
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [applyPoseAtCurrentTime, playingPreview, selected]);

  return (
    <section
      className={`animation-floating-window${windowState.minimized ? " minimized" : ""}`}
      style={{
        left: windowState.x,
        top: windowState.y,
        width: windowState.width,
        height: windowState.minimized ? undefined : windowState.height,
      }}
    >
      <header
        className="animation-titlebar"
        onPointerDown={(event) => startWindowDrag(event, "move")}
      >
        <div>
          <RotateCw size={14} />
          <strong>{selected?.name ?? "Animation"} - Poly Animator</strong>
        </div>
        <button
          type="button"
          title={windowState.minimized ? "Restore" : "Minimize"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() =>
            setWindowState((current) => ({
              ...current,
              minimized: !current.minimized,
            }))
          }
        >
          {windowState.minimized ? "□" : "–"}
        </button>
      </header>

      {!windowState.minimized && (
        <>
          <nav className="animation-menu-row">
            <button onClick={createAnimation}>File</button>
            <button onClick={captureSelectedPose} disabled={!selected}>Keyframe</button>
            <button onClick={() => setFrame(frame - 1, true)} disabled={!selected}>Frame</button>
            <button onClick={() => onToolChange("camera")}>Camera</button>
            <button onClick={setCurrentAsRestPose} disabled={!selected}>Options</button>
            <button onClick={() => onImport(rigId)} disabled={!rigId}>Import</button>
            <button onClick={() => selected && onExport(selected)} disabled={!selected}>Export</button>
          </nav>

          {rigs.length === 0 ? (
            <div className="animation-empty floating-empty">
              <UserRound size={28} />
              <h3>Add a HumanoidRootPart first.</h3>
              <p>Studio will create the full editable humanoid rig automatically.</p>
            </div>
          ) : (
            <div className="moon-animator-body">
              <aside className="moon-track-panel">
                <div className="moon-toolbar">
                  <button title="New animation" onClick={createAnimation}>
                    <Plus size={14} />
                  </button>
                  <button title="Move tool" className={activeTool === "move" ? "active" : ""} onClick={() => onToolChange("move")}>
                    <Move3D size={14} />
                  </button>
                  <button title="Rotate tool" className={activeTool === "rotate" ? "active" : ""} onClick={() => onToolChange("rotate")}>
                    <RotateCw size={14} />
                  </button>
                  <button title="Set selected frame" disabled={!selected} onClick={captureSelectedPose}>
                    ●
                  </button>
                  <span>{keyframeCount} keyframes</span>
                </div>

                <label className="moon-select">
                  <span>Rig</span>
                  <select
                    value={rigId}
                    onChange={(event) => {
                      setRigId(event.target.value);
                      onSelectParts(
                        project.objects
                          .filter((object) => object.modelId === event.target.value)
                          .map((object) => object.id),
                      );
                    }}
                  >
                    {rigs.map((rig) => (
                      <option key={rig.id} value={rig.id}>{rig.name}</option>
                    ))}
                  </select>
                </label>

                <label className="moon-select">
                  <span>Clip</span>
                  <select
                    value={selectedId}
                    onChange={(event) => {
                      setSelectedId(event.target.value);
                      const animation = project.animations.find((item) => item.id === event.target.value);
                      if (animation?.rigModelId) setRigId(animation.rigModelId);
                    }}
                  >
                    {project.animations.map((animation) => (
                      <option key={animation.id} value={animation.id}>{animation.name}</option>
                    ))}
                  </select>
                </label>

                {selected && (
                  <div className="moon-track-list">
                    <button
                      className="moon-track rig"
                      onClick={() => onSelectParts(parts.map((part) => part.id))}
                    >
                      <ChevronDown size={13} />
                      <Folder size={13} />
                      <strong>{selectedRig?.name ?? "R6"}</strong>
                      <span>{selected.duration.toFixed(2)}s</span>
                    </button>
                    <button className="moon-track event">
                      <ChevronRight size={13} />
                      <Activity size={13} />
                      <span>Events</span>
                      <small>{selected.keyframes.length}</small>
                    </button>
                    <button
                      className="moon-track group"
                      onClick={() => onSelectParts(parts.map((part) => part.id))}
                    >
                      <ChevronDown size={13} />
                      <Boxes size={13} />
                      <span>Rig</span>
                      <small>{parts.length}</small>
                    </button>
                    {parts.map((part) => (
                      <button
                        key={part.id}
                        className={`moon-track limb${part.id === partId ? " active" : ""}`}
                        onClick={() => {
                          setPartId(part.id);
                          onSelectParts([part.id]);
                        }}
                      >
                        <ChevronRight size={12} />
                        <span>{part.name}</span>
                        <small title="Visible in viewport">●</small>
                        <i title="Keyframes">{posedFramesForPart(part.id).length}</i>
                      </button>
                    ))}
                  </div>
                )}
              </aside>

              <main className="moon-timeline-panel">
                {selected ? (
                  <>
                    <div className="moon-timeline-top">
                      <button onClick={() => setPlayingPreview((current) => !current)}>
                        {playingPreview ? "Pause" : "Play"}
                      </button>
                      <button onClick={() => moveFrame(-1)}>-1</button>
                      <strong>{frame}</strong>
                      <button onClick={() => moveFrame(1)}>+1</button>
                      <button className="moon-primary-action" onClick={captureSelectedPose}>
                        Add Frame
                      </button>
                      <button onClick={() => partId && onSelectParts([partId])}>
                        Select Limb
                      </button>
                      <label>
                        FPS
                        <span>{fps}</span>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={selected.looped}
                          onChange={(event) => patchAnimation({ looped: event.target.checked })}
                        />
                        Loop
                      </label>
                      <NumberField
                        label="Length"
                        value={selected.duration}
                        minimum={0.05}
                        maximum={600}
                        step={0.05}
                        onChange={(duration) => patchAnimation({ duration })}
                      />
                    </div>

                    <div className="moon-ruler">
                      {timelineFrames.map((tick) => (
                        <button
                          key={tick}
                          style={{ left: `${(tick / totalFrames) * 100}%` }}
                          onClick={() => setFrame(tick, true)}
                        >
                          {tick}
                        </button>
                      ))}
                      <input
                        type="range"
                        min={0}
                        max={totalFrames}
                        value={frame}
                        onChange={(event) => setFrame(Number(event.target.value), true)}
                      />
                    </div>

                    <div className="moon-timeline-grid">
                      <div className="moon-playhead" style={{ left: `${(frame / totalFrames) * 100}%` }} />
                      <div className="moon-event-row">
                        {selected.keyframes.map((keyframe, index) => (
                          <button
                            key={`${keyframe.time}-${index}`}
                            className="moon-key event"
                            title={`${Math.round(keyframe.time * fps)} frame event`}
                            style={{ left: `${(Math.round(keyframe.time * fps) / totalFrames) * 100}%` }}
                            onClick={() => setFrame(Math.round(keyframe.time * fps), true)}
                          />
                        ))}
                      </div>
                      {parts.map((part) => (
                        <div key={part.id} className="moon-key-row">
                          {posedFramesForPart(part.id).map((posedFrame) => (
                            <button
                              key={`${part.id}-${posedFrame}`}
                              className={`moon-key${part.id === partId ? " selected" : ""}`}
                              style={{ left: `${(posedFrame / totalFrames) * 100}%` }}
                              onClick={() => {
                                setPartId(part.id);
                                onSelectParts([part.id]);
                                setFrame(posedFrame, true);
                              }}
                            />
                          ))}
                        </div>
                      ))}
                    </div>

                    <div className="moon-action-bar">
                      <strong>Simple flow:</strong>
                      <span>1. Select limb</span>
                      <span>2. Rotate/move it</span>
                      <span>3. Click Add Frame</span>
                      <span>4. Move frame and pose again</span>
                      <details className="moon-advanced-actions">
                        <summary>Advanced</summary>
                        <button onClick={captureWholeRigPose}>Set full rig frame</button>
                        <button onClick={() => applyPoseAtCurrentTime(time)}>Apply frame</button>
                        <button onClick={resetRigToRestPose}>Reset rig</button>
                        <button onClick={setCurrentAsRestPose}>Use current as rest</button>
                        <button onClick={() => jumpToNearestKeyframe(-1)}>Prev key</button>
                        <button onClick={() => jumpToNearestKeyframe(1)}>Next key</button>
                      </details>
                    </div>
                    <code className="moon-code">Animations.Play("{selected.name}")</code>
                  </>
                ) : (
                  <div className="animation-empty floating-empty">
                    <p>Create an animation to begin.</p>
                    <button onClick={createAnimation}>New animation</button>
                  </div>
                )}
              </main>
            </div>
          )}

          <span
            className="animation-resize-handle"
            onPointerDown={(event) => startWindowDrag(event, "resize")}
          />
        </>
      )}
    </section>
  );
}

function Explorer({
  project,
  selection,
  selectedPartIds,
  onSelectWorld,
  onSelectModel,
  onSelect,
  onContextMenu,
}: {
  project: StudioProject;
  selection: Selection;
  selectedPartIds: string[];
  onSelectWorld: (id: string, additive?: boolean) => void;
  onSelectModel: (id: string) => void;
  onSelect: (selection: Exclude<Selection, null>) => void;
  onContextMenu: (
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
}) {
  const [query, setQuery] = useState("");
  const [revealVersion, setRevealVersion] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const scriptsAt = (parent: string) =>
    project.scripts.filter((script) => script.parent === parent);
  const valuesAt = (parent: string) =>
    project.values.filter((value) => value.parent === parent);
  const guiRoots = project.gui.filter((gui) => gui.parentId === null);
  const stores = Object.keys(project.dataStores).sort();
  const looseObjects = project.objects.filter(
    (object) => !object.modelId && !object.parentId,
  );
  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    const results: Array<{
      key: string;
      label: string;
      path: string;
      detail: string;
      selection: Exclude<Selection, null>;
    }> = [];
    const add = (
      label: string,
      path: string,
      detail: string,
      nextSelection: Exclude<Selection, null>,
    ) => {
      if (`${label} ${path} ${detail}`.toLowerCase().includes(normalized)) {
        results.push({
          key: `${nextSelection.type}:${nextSelection.id}`,
          label,
          path,
          detail,
          selection: nextSelection,
        });
      }
    };
    const objectPath = (object: StudioObject) => {
      const names = [object.name];
      const visited = new Set([object.id]);
      let parentId = object.parentId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = project.objects.find((item) => item.id === parentId);
        if (!parent) break;
        names.unshift(parent.name);
        parentId = parent.parentId;
      }
      const model = object.modelId
        ? project.models.find((item) => item.id === object.modelId)
        : null;
      return ["Workspace", model?.name, ...names].filter(Boolean).join(" / ");
    };
    const guiPath = (gui: StudioGuiObject) => {
      const names = [gui.name];
      const visited = new Set([gui.id]);
      let parentId = gui.parentId;
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = project.gui.find((item) => item.id === parentId);
        if (!parent) break;
        names.unshift(parent.name);
        parentId = parent.parentId;
      }
      return ["StarterGui", ...names].join(" / ");
    };
    const parentPath = (parent: string, visited = new Set<string>()): string => {
      if (visited.has(parent)) return "Circular parent";
      const nextVisited = new Set(visited).add(parent);
      const world = project.objects.find((item) => item.id === parent);
      if (world) return objectPath(world);
      const model = project.models.find((item) => item.id === parent);
      if (model) return `Workspace / ${model.name}`;
      const gui = project.gui.find((item) => item.id === parent);
      if (gui) return guiPath(gui);
      const script = project.scripts.find((item) => item.id === parent);
      if (script) return `${parentPath(script.parent, nextVisited)} / ${script.name}`;
      const value = project.values.find((item) => item.id === parent);
      if (value) return `${parentPath(value.parent, nextVisited)} / ${value.name}`;
      return parent;
    };

    [
      "Workspace",
      "ServerScriptService",
      "ReplicatedStorage",
      "ServerStorage",
      "Lighting",
      "Players",
      "StarterPlayerScripts",
      "StarterGui",
      "DataStoreService",
      "Sky",
    ].forEach((service) =>
      add(service, service === "Sky" ? "Workspace / Sky" : service, "Service", {
        type: "service",
        id: service,
      }),
    );
    add("LocalPlayer", "Players / LocalPlayer", "Player", {
      type: "player",
      id: "LocalPlayer",
    });
    project.models.forEach((model) =>
      add(model.name, `Workspace / ${model.name}`, "Model", {
        type: "model",
        id: model.id,
      }),
    );
    project.objects.forEach((object) =>
      add(object.name, objectPath(object), object.type, {
        type: "world",
        id: object.id,
      }),
    );
    project.scripts.forEach((script) =>
      add(script.name, `${parentPath(script.parent)} / ${script.name}`, script.kind, {
        type: "script",
        id: script.id,
      }),
    );
    project.gui.forEach((gui) =>
      add(gui.name, guiPath(gui), gui.type, { type: "gui", id: gui.id }),
    );
    project.remotes.forEach((remote) =>
      add(remote.name, `ReplicatedStorage / ${remote.name}`, remote.kind, {
        type: "remote",
        id: remote.id,
      }),
    );
    project.values.forEach((value) =>
      add(value.name, `${parentPath(value.parent)} / ${value.name}`, value.type, {
        type: "value",
        id: value.id,
      }),
    );
    return results.slice(0, 150);
  }, [project, query]);

  const selectSearchResult = (next: Exclude<Selection, null>) => {
    if (next.type === "world") onSelectWorld(next.id);
    else if (next.type === "model") onSelectModel(next.id);
    else onSelect(next);
  };

  const revealSelected = () => {
    setQuery("");
    setRevealVersion((current) => current + 1);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        panelRef.current
          ?.querySelector<HTMLElement>(".tree-item.active, .tree-root.active")
          ?.scrollIntoView({ block: "center" });
      });
    });
  };

  return (
    <aside className="explorer-panel" ref={panelRef}>
      <PanelHeading icon={<Folder size={15} />} title="Explorer" />
      <div className="explorer-tools">
        <label>
          <Search size={13} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Search objects"
            aria-label="Search Explorer"
          />
        </label>
        <button
          title="Reveal selected in Explorer"
          aria-label="Reveal selected in Explorer"
          disabled={!selection}
          onClick={revealSelected}
        >
          <Crosshair size={14} />
        </button>
      </div>
      {query.trim() ? (
        <div className="explorer-results">
          <header>{searchResults.length} results</header>
          {searchResults.map((result) => {
            const active =
              result.selection.type === "world"
                ? selectedPartIds.includes(result.selection.id)
                : selection?.type === result.selection.type &&
                  selection.id === result.selection.id;
            return (
              <button
                key={result.key}
                className={active ? "active" : ""}
                onClick={() => selectSearchResult(result.selection)}
                onContextMenu={(event) => onContextMenu(result.selection, event)}
              >
                {explorerResultIcon(result.selection.type)}
                <span>
                  <strong>{result.label}</strong>
                  <small>{result.path}</small>
                </span>
                <em>{result.detail}</em>
              </button>
            );
          })}
          {searchResults.length === 0 && <p>No Explorer items matched.</p>}
        </div>
      ) : (
      <div className="tree" key={revealVersion}>
        <TreeRoot
          icon={<Grid3X3 size={14} />}
          label="Workspace"
          active={selection?.type === "service" && selection.id === "Workspace"}
          onSelect={() => onSelect({ type: "service", id: "Workspace" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "Workspace" }, event)
          }
        >
          <TreeItem
            active={selection?.type === "service" && selection.id === "Sky"}
            icon={<Sun size={14} />}
            label="Sky"
            onClick={() => onSelect({ type: "service", id: "Sky" })}
          />
          {project.models.map((model) => (
            <ModelTree
              key={model.id}
              model={model}
              project={project}
              selection={selection}
              selectedPartIds={selectedPartIds}
              active={selection?.type === "model" && selection.id === model.id}
              onSelectModel={() => onSelectModel(model.id)}
              onSelectWorld={onSelectWorld}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {looseObjects.map((object) => (
            <WorldTree
              key={object.id}
              object={object}
              project={project}
              selection={selection}
              selectedPartIds={selectedPartIds}
              onSelectWorld={onSelectWorld}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {scriptsAt("Workspace").map((script) => (
            <ScriptTree
              key={script.id}
              script={script}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {valuesAt("Workspace").map((value) => (
            <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Server size={14} />}
          label="ServerScriptService"
          active={selection?.type === "service" && selection.id === "ServerScriptService"}
          onSelect={() => onSelect({ type: "service", id: "ServerScriptService" })}
          onContextMenu={(event) =>
            onContextMenu(
              { type: "service", id: "ServerScriptService" },
              event,
            )
          }
        >
          {scriptsAt("ServerScriptService").map((script) => (
            <ScriptTree
              key={script.id}
              script={script}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {valuesAt("ServerScriptService").map((value) => (
            <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Package size={14} />}
          label="ReplicatedStorage"
          active={selection?.type === "service" && selection.id === "ReplicatedStorage"}
          onSelect={() => onSelect({ type: "service", id: "ReplicatedStorage" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "ReplicatedStorage" }, event)
          }
        >
          {scriptsAt("ReplicatedStorage").map((script) => (
            <ScriptTree
              key={script.id}
              script={script}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {project.remotes.map((remote) => (
            <TreeItem
              key={remote.id}
              active={selection?.type === "remote" && selection.id === remote.id}
              icon={<Cable size={14} />}
              label={remote.name}
              onClick={() => onSelect({ type: "remote", id: remote.id })}
              onContextMenu={(event) =>
                onContextMenu({ type: "remote", id: remote.id }, event)
              }
            />
          ))}
          {valuesAt("ReplicatedStorage").map((value) => (
            <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Folder size={14} />}
          label="ServerStorage"
          active={selection?.type === "service" && selection.id === "ServerStorage"}
          onSelect={() => onSelect({ type: "service", id: "ServerStorage" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "ServerStorage" }, event)
          }
        >
          {scriptsAt("ServerStorage").map((script) => (
            <ScriptTree
              key={script.id}
              script={script}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {valuesAt("ServerStorage").map((value) => (
            <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </TreeRoot>
        <TreeItem
          active={selection?.type === "service" && selection.id === "Lighting"}
          icon={<Sun size={14} />}
          label="Lighting"
          onClick={() => onSelect({ type: "service", id: "Lighting" })}
        />
        <TreeRoot
          icon={<UserRound size={14} />}
          label="Players"
          active={selection?.type === "service" && selection.id === "Players"}
          onSelect={() => onSelect({ type: "service", id: "Players" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "Players" }, event)
          }
        >
          <TreeItem
            active={selection?.type === "player"}
            icon={<UserRound size={14} />}
            label="LocalPlayer"
            onClick={() => onSelect({ type: "player", id: "LocalPlayer" })}
            onContextMenu={(event) =>
              onContextMenu({ type: "player", id: "LocalPlayer" }, event)
            }
          />
        </TreeRoot>
        <TreeRoot
          icon={<UserRound size={14} />}
          label="StarterPlayer"
          active={selection?.type === "service" && selection.id === "StarterPlayerScripts"}
          onSelect={() => onSelect({ type: "service", id: "StarterPlayerScripts" })}
          onContextMenu={(event) =>
            onContextMenu(
              { type: "service", id: "StarterPlayerScripts" },
              event,
            )
          }
        >
          <div className="tree-nested-root">
            <Folder size={13} />
            <strong>StarterPlayerScripts</strong>
          </div>
          {scriptsAt("StarterPlayerScripts").map((script) => (
            <ScriptTree
              key={script.id}
              script={script}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              nested
            />
          ))}
          {valuesAt("StarterPlayerScripts").map((value) => (
            <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} nested />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Monitor size={14} />}
          label="StarterGui"
          active={selection?.type === "service" && selection.id === "StarterGui"}
          onSelect={() => onSelect({ type: "service", id: "StarterGui" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "StarterGui" }, event)
          }
        >
          {scriptsAt("StarterGui").map((script) => (
            <ScriptTree
              key={script.id}
              script={script}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {guiRoots.map((gui) => (
            <GuiTree
              key={gui.id}
              gui={gui}
              project={project}
              selection={selection}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
            />
          ))}
          {valuesAt("StarterGui").map((value) => (
            <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Database size={14} />}
          label="DataStoreService"
          active={selection?.type === "service" && selection.id === "DataStoreService"}
          onSelect={() => onSelect({ type: "service", id: "DataStoreService" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "DataStoreService" }, event)
          }
        >
          {stores.map((store) => (
            <TreeItem
              key={store}
              active={false}
              icon={<Database size={13} />}
              label={store}
              onClick={() => onSelect({ type: "service", id: "DataStoreService" })}
              onContextMenu={(event) =>
                onContextMenu(
                  { type: "service", id: "DataStoreService" },
                  event,
                )
              }
            />
          ))}
        </TreeRoot>
      </div>
      )}
    </aside>
  );
}

function explorerResultIcon(type: Exclude<Selection, null>["type"]) {
  if (type === "world") return <Box size={14} />;
  if (type === "model") return <Boxes size={14} />;
  if (type === "script") return <FileCode2 size={14} />;
  if (type === "gui") return <Monitor size={14} />;
  if (type === "remote") return <Cable size={14} />;
  if (type === "value") return <Database size={14} />;
  if (type === "player") return <UserRound size={14} />;
  return <Folder size={14} />;
}

function TreeRoot({
  icon,
  label,
  active,
  onSelect,
  onContextMenu,
  children,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onSelect: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="tree-service">
      <div
        className={active ? "tree-root active" : "tree-root"}
        onContextMenu={onContextMenu}
      >
        <button
          className="tree-expander"
          title={expanded ? `Collapse ${label}` : `Expand ${label}`}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button className="tree-root-select" onClick={onSelect}>
          {icon}
          <strong>{label}</strong>
        </button>
      </div>
      {expanded && children}
    </div>
  );
}

function TreeItem({
  active,
  icon,
  label,
  nested = false,
  onClick,
  onContextMenu,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  nested?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`${active ? "tree-item active" : "tree-item"}${nested ? " nested" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className="tree-spacer" />
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ValueTree({
  value,
  project,
  selection,
  onSelect,
  onContextMenu,
  nested = false,
}: {
  value: StudioValueObject;
  project: StudioProject;
  selection: Selection;
  onSelect: (selection: Exclude<Selection, null>) => void;
  onContextMenu: (
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  nested?: boolean;
}) {
  const children = project.values.filter((item) => item.parent === value.id);
  return (
    <div className="value-tree-node">
      <TreeItem
        active={selection?.type === "value" && selection.id === value.id}
        nested={nested}
        icon={<Database size={14} />}
        label={value.name}
        onClick={() => onSelect({ type: "value", id: value.id })}
        onContextMenu={(event) =>
          onContextMenu({ type: "value", id: value.id }, event)
        }
      />
      {children.map((child) => (
        <ValueTree
          key={child.id}
          value={child}
          project={project}
          selection={selection}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          nested
        />
      ))}
    </div>
  );
}

function ModelTree({
  model,
  project,
  selection,
  selectedPartIds,
  active,
  onSelectModel,
  onSelectWorld,
  onSelect,
  onContextMenu,
}: {
  model: StudioModel;
  project: StudioProject;
  selection: Selection;
  selectedPartIds: string[];
  active: boolean;
  onSelectModel: () => void;
  onSelectWorld: (id: string, additive?: boolean) => void;
  onSelect: (selection: Exclude<Selection, null>) => void;
  onContextMenu: (
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const parts = project.objects.filter(
    (object) =>
      object.modelId === model.id &&
      (!object.parentId ||
        !project.objects.some(
          (parent) =>
            parent.id === object.parentId && parent.modelId === model.id,
        )),
  );
  return (
    <div className="model-tree">
      <div
        className={active ? "tree-root active" : "tree-root"}
        onContextMenu={(event) =>
          onContextMenu({ type: "model", id: model.id }, event)
        }
      >
        <button
          className="tree-expander"
          onClick={() => setExpanded((current) => !current)}
          title={expanded ? "Collapse Model" : "Expand Model"}
        >
          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <button className="tree-root-select" onClick={onSelectModel}>
          <Boxes size={14} />
          <strong>{model.name}</strong>
        </button>
      </div>
      {expanded &&
        parts.map((part) => (
          <WorldTree
            key={part.id}
            object={part}
            project={project}
            selection={selection}
            selectedPartIds={selectedPartIds}
            onSelectWorld={onSelectWorld}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            nested
          />
        ))}
      {project.scripts
        .filter((script) => script.parent === model.id)
        .map((script) => (
          <ScriptTree
            key={script.id}
            script={script}
            project={project}
            selection={selection}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
            nested
          />
        ))}
      {project.values
        .filter((value) => value.parent === model.id)
        .map((value) => (
          <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} nested />
        ))}
    </div>
  );
}

function WorldTree({
  object,
  project,
  selection,
  selectedPartIds,
  onSelectWorld,
  onSelect,
  onContextMenu,
  nested = false,
}: {
  object: StudioObject;
  project: StudioProject;
  selection: Selection;
  selectedPartIds: string[];
  onSelectWorld: (id: string, additive?: boolean) => void;
  onSelect: (selection: Exclude<Selection, null>) => void;
  onContextMenu: (
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  nested?: boolean;
}) {
  const children = project.objects.filter(
    (item) => item.parentId === object.id,
  );
  const scripts = project.scripts.filter(
    (script) => script.parent === object.id,
  );
  const values = project.values.filter((value) => value.parent === object.id);
  return (
    <div className="world-tree-node">
      <TreeItem
        active={selectedPartIds.includes(object.id)}
        nested={nested}
        icon={
          object.type === "tool"
            ? <Package size={14} />
            : object.type === "sound"
              ? <Volume2 size={14} />
            : object.type === "humanoidRootPart"
              ? <UserRound size={14} />
              : object.type === "part" || object.type === "handle"
                ? <Box size={14} />
                : <Grid3X3 size={14} />
        }
        label={object.name}
        onClick={(event) =>
          onSelectWorld(object.id, event.ctrlKey || event.metaKey)
        }
        onContextMenu={(event) =>
          onContextMenu({ type: "world", id: object.id }, event)
        }
      />
      {children.map((child) => (
        <WorldTree
          key={child.id}
          object={child}
          project={project}
          selection={selection}
          selectedPartIds={selectedPartIds}
          onSelectWorld={onSelectWorld}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          nested
        />
      ))}
      {scripts.map((script) => (
        <ScriptTree
          key={script.id}
          script={script}
          project={project}
          selection={selection}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          nested
        />
      ))}
      {values.map((value) => (
        <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} nested />
      ))}
    </div>
  );
}

function ScriptTreeItem({
  script,
  active,
  nested = false,
  onClick,
  onContextMenu,
}: {
  script: StudioScript;
  active: boolean;
  nested?: boolean;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <TreeItem
      active={active}
      nested={nested}
      icon={<FileCode2 size={14} />}
      label={script.name}
      onClick={onClick}
      onContextMenu={onContextMenu}
    />
  );
}

function ScriptTree({
  script,
  project,
  selection,
  onSelect,
  onContextMenu,
  nested = false,
}: {
  script: StudioScript;
  project: StudioProject;
  selection: Selection;
  onSelect: (selection: Exclude<Selection, null>) => void;
  onContextMenu: (
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  nested?: boolean;
}) {
  const children = project.scripts.filter((item) => item.parent === script.id);
  const values = project.values.filter((value) => value.parent === script.id);
  return (
    <div className="script-tree-node">
      <ScriptTreeItem
        script={script}
        nested={nested}
        active={selection?.type === "script" && selection.id === script.id}
        onClick={() => onSelect({ type: "script", id: script.id })}
        onContextMenu={(event) =>
          onContextMenu({ type: "script", id: script.id }, event)
        }
      />
      {children.map((child) => (
        <ScriptTree
          key={child.id}
          script={child}
          project={project}
          selection={selection}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          nested
        />
      ))}
      {values.map((value) => (
        <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} nested />
      ))}
    </div>
  );
}

function GuiTree({
  gui,
  project,
  selection,
  onSelect,
  onContextMenu,
  depth = 0,
}: {
  gui: StudioGuiObject;
  project: StudioProject;
  selection: Selection;
  onSelect: (selection: Exclude<Selection, null>) => void;
  onContextMenu: (
    target: ContextTarget,
    event: React.MouseEvent<HTMLElement>,
  ) => void;
  depth?: number;
}) {
  const children = project.gui.filter((item) => item.parentId === gui.id);
  const scripts = project.scripts.filter((script) => script.parent === gui.id);
  const values = project.values.filter((value) => value.parent === gui.id);
  return (
    <div className="gui-tree-node" style={{ "--tree-depth": depth } as React.CSSProperties}>
      <TreeItem
        active={selection?.type === "gui" && selection.id === gui.id}
        icon={gui.type === "screenGui" ? <Monitor size={14} /> : <Square size={14} />}
        label={gui.name}
        onClick={() => onSelect({ type: "gui", id: gui.id })}
        onContextMenu={(event) =>
          onContextMenu({ type: "gui", id: gui.id }, event)
        }
      />
      {children.map((child) => (
        <GuiTree
          key={child.id}
          gui={child}
          project={project}
          selection={selection}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          depth={depth + 1}
        />
      ))}
      {scripts.map((script) => (
        <ScriptTree
          key={script.id}
          script={script}
          project={project}
          selection={selection}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          nested
        />
      ))}
      {values.map((value) => (
        <ValueTree key={value.id} value={value} project={project} selection={selection} onSelect={onSelect} onContextMenu={onContextMenu} nested />
      ))}
    </div>
  );
}

function PanelHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <header className="panel-heading">
      {icon}
      <strong>{title}</strong>
    </header>
  );
}

function CameraControls({
  enabled,
  touchLookEnabled,
}: {
  enabled: boolean;
  touchLookEnabled: boolean;
}) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const pressed = new Set<string>();
    const forward = new Vector3();
    const right = new Vector3();
    const movement = new Vector3();
    const up = new Vector3(0, 1, 0);
    camera.rotation.order = "YXZ";
    let yaw = camera.rotation.y;
    let pitch = camera.rotation.x;
    let looking = false;
    let activePointerId: number | null = null;
    let rightMouseHeld = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let dollyVelocity = 0;
    const touchPoints = new Map<number, { x: number; y: number }>();
    let pinchDistance: number | null = null;
    const supportedKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "KeyQ",
      "KeyE",
      "ShiftLeft",
      "ShiftRight",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]);
    const applyLook = (yawDelta: number, pitchDelta: number) => {
      yaw -= yawDelta;
      pitch = Math.max(
        -Math.PI * 0.495,
        Math.min(Math.PI * 0.495, pitch - pitchDelta),
      );
      camera.rotation.set(pitch, yaw, 0, "YXZ");
    };
    gl.domElement.tabIndex = 0;
    const onPointerDown = (event: PointerEvent) => {
      gl.domElement.focus({ preventScroll: true });
      if (event.pointerType === "touch") {
        if (!enabled || !touchLookEnabled) return;
        event.preventDefault();
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        gl.domElement.setPointerCapture(event.pointerId);
        if (touchPoints.size === 1) {
          looking = true;
          activePointerId = event.pointerId;
          lastPointerX = event.clientX;
          lastPointerY = event.clientY;
        } else {
          looking = false;
          activePointerId = null;
          const points = [...touchPoints.values()];
          pinchDistance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
        }
        return;
      }
      if (!enabled || event.button !== 2) return;
      event.preventDefault();
      rightMouseHeld = true;
      looking = true;
      activePointerId = event.pointerId;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      gl.domElement.style.cursor = "grabbing";
      const captureFallback = () => {
        if (
          rightMouseHeld &&
          activePointerId === event.pointerId &&
          !gl.domElement.hasPointerCapture(event.pointerId)
        ) {
          gl.domElement.setPointerCapture(event.pointerId);
        }
      };
      try {
        const lockRequest = gl.domElement.requestPointerLock();
        if (lockRequest) void lockRequest.catch(captureFallback);
      } catch {
        captureFallback();
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        if (!enabled || !touchLookEnabled || !touchPoints.has(event.pointerId)) {
          return;
        }
        event.preventDefault();
        touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touchPoints.size >= 2) {
          const points = [...touchPoints.values()];
          const nextDistance = Math.hypot(
            points[0].x - points[1].x,
            points[0].y - points[1].y,
          );
          if (pinchDistance !== null) {
            camera.getWorldDirection(forward).normalize();
            camera.position.addScaledVector(
              forward,
              (nextDistance - pinchDistance) * 0.035,
            );
          }
          pinchDistance = nextDistance;
          return;
        }
      }
      if (!enabled || !looking || event.pointerId !== activePointerId) return;
      if (document.pointerLockElement === gl.domElement) return;
      const clientDeltaX = event.clientX - lastPointerX;
      const clientDeltaY = event.clientY - lastPointerY;
      const deltaX = event.movementX || clientDeltaX;
      const deltaY = event.movementY || clientDeltaY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      applyLook(deltaX * 0.0032, deltaY * 0.0032);
    };
    const stopLooking = (event?: PointerEvent) => {
      if (event?.pointerType === "touch") {
        touchPoints.delete(event.pointerId);
        if (gl.domElement.hasPointerCapture(event.pointerId)) {
          gl.domElement.releasePointerCapture(event.pointerId);
        }
        pinchDistance = null;
        const remaining = touchPoints.entries().next().value as
          | [number, { x: number; y: number }]
          | undefined;
        if (remaining) {
          looking = true;
          activePointerId = remaining[0];
          lastPointerX = remaining[1].x;
          lastPointerY = remaining[1].y;
        } else {
          looking = false;
          activePointerId = null;
        }
        return;
      }
      if (
        event &&
        activePointerId !== null &&
        event.pointerId !== activePointerId
      ) {
        return;
      }
      if (
        activePointerId !== null &&
        gl.domElement.hasPointerCapture(activePointerId)
      ) {
        gl.domElement.releasePointerCapture(activePointerId);
      }
      rightMouseHeld = false;
      looking = false;
      activePointerId = null;
      gl.domElement.style.cursor = "";
      if (document.pointerLockElement === gl.domElement) {
        void document.exitPointerLock();
      }
    };
    const onLockedMouseMove = (event: MouseEvent) => {
      if (
        !enabled ||
        !rightMouseHeld ||
        document.pointerLockElement !== gl.domElement
      ) {
        return;
      }
      applyLook(event.movementX * 0.0032, event.movementY * 0.0032);
    };
    const onDocumentMouseUp = (event: MouseEvent) => {
      if (event.button !== 2 || !rightMouseHeld) return;
      stopLooking();
    };
    const onWheel = (event: WheelEvent) => {
      if (!enabled) return;
      event.preventDefault();
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.55 : 0.018;
      dollyVelocity = Math.max(
        -14,
        Math.min(14, dollyVelocity - event.deltaY * scale),
      );
    };
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!supportedKeys.has(event.code)) return;
      event.preventDefault();
      pressed.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
    };
    const clearKeys = () => pressed.clear();
    const onWindowBlur = () => {
      clearKeys();
      stopLooking();
    };
    gl.domElement.addEventListener("pointerdown", onPointerDown);
    gl.domElement.addEventListener("pointermove", onPointerMove);
    gl.domElement.addEventListener("pointerup", stopLooking);
    gl.domElement.addEventListener("pointercancel", stopLooking);
    gl.domElement.addEventListener("wheel", onWheel, { passive: false });
    gl.domElement.addEventListener("contextmenu", preventContextMenu);
    gl.domElement.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousemove", onLockedMouseMove);
    document.addEventListener("mouseup", onDocumentMouseUp);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    let previousTime = performance.now();
    let frameId = requestAnimationFrame(function frame(time) {
      const delta = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      if (enabled) {
        const yawInput =
          (Number(pressed.has("ArrowRight")) -
            Number(pressed.has("ArrowLeft"))) *
          1.65 *
          delta;
        const pitchInput =
          (Number(pressed.has("ArrowDown")) -
            Number(pressed.has("ArrowUp"))) *
          1.35 *
          delta;
        if (yawInput !== 0 || pitchInput !== 0) {
          applyLook(yawInput, pitchInput);
        }

        camera.getWorldDirection(forward).normalize();
        if (Math.abs(dollyVelocity) > 0.001) {
          const dollyStep = dollyVelocity * (1 - Math.exp(-18 * delta));
          camera.position.addScaledVector(forward, dollyStep);
          dollyVelocity -= dollyStep;
        } else {
          dollyVelocity = 0;
        }
        right.crossVectors(forward, up).normalize();
        movement
          .set(0, 0, 0)
          .addScaledVector(
            forward,
            Number(pressed.has("KeyW")) - Number(pressed.has("KeyS")),
          )
          .addScaledVector(
            right,
            Number(pressed.has("KeyD")) - Number(pressed.has("KeyA")),
          )
          .addScaledVector(
            up,
            Number(pressed.has("KeyE")) - Number(pressed.has("KeyQ")),
          );
        if (movement.lengthSq() > 0) {
          const fast =
            pressed.has("ShiftLeft") || pressed.has("ShiftRight");
          movement.normalize().multiplyScalar((fast ? 30 : 11.5) * delta);
          camera.position.add(movement);
        }
      }
      frameId = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(frameId);
      stopLooking();
      gl.domElement.removeEventListener("pointerdown", onPointerDown);
      gl.domElement.removeEventListener("pointermove", onPointerMove);
      gl.domElement.removeEventListener("pointerup", stopLooking);
      gl.domElement.removeEventListener("pointercancel", stopLooking);
      gl.domElement.removeEventListener("wheel", onWheel);
      gl.domElement.removeEventListener("contextmenu", preventContextMenu);
      gl.domElement.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousemove", onLockedMouseMove);
      document.removeEventListener("mouseup", onDocumentMouseUp);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [camera, enabled, gl, touchLookEnabled]);
  return null;
}

function ViewportCameraTracker({
  onCameraChange,
}: {
  onCameraChange: (spawn: StudioPlaySpawn) => void;
}) {
  const { camera } = useThree();
  const forward = useRef(new Vector3());
  const last = useRef("");

  useFrame(() => {
    camera.getWorldDirection(forward.current);
    const rotationY = Math.atan2(-forward.current.x, -forward.current.z);
    const position: [number, number, number] = [
      camera.position.x,
      camera.position.y,
      camera.position.z,
    ];
    const key = `${position.map((value) => value.toFixed(2)).join(",")}:${rotationY.toFixed(3)}`;
    if (key === last.current) return;
    last.current = key;
    onCameraChange({ position, rotationY });
  });

  return null;
}

function SceneViewport({
  objects,
  gui,
  lighting,
  selectedWorldIds,
  selectedGuiId,
  showGui,
  tool,
  gridSnap,
  angleSnap,
  physicsDebug,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
  onSelectWorld,
  onSelectGui,
  onGuiChange,
  onCameraChange,
}: {
  objects: StudioObject[];
  gui: StudioGuiObject[];
  lighting: StudioProject["lighting"];
  selectedWorldIds: string[];
  selectedGuiId: string | null;
  showGui: boolean;
  tool: StudioTool;
  gridSnap: number;
  angleSnap: number;
  physicsDebug: boolean;
  onTransformStart: (center: [number, number, number]) => void;
  onTransformChange: (transform: ViewportTransform) => void;
  onTransformEnd: () => void;
  onSelectWorld: (id: string | null, additive?: boolean) => void;
  onSelectGui: (id: string | null) => void;
  onGuiChange: (id: string, patch: Partial<StudioGuiObject>) => void;
  onCameraChange: (spawn: StudioPlaySpawn) => void;
}) {
  const [transforming, setTransforming] = useState(false);
  const selectedObjects = objects.filter((object) =>
    selectedWorldIds.includes(object.id),
  );
  const center = selectedObjects.length
    ? selectedObjects.reduce<[number, number, number]>(
        (value, object) => [
          value[0] + object.position[0] / selectedObjects.length,
          value[1] + object.position[1] / selectedObjects.length,
          value[2] + object.position[2] / selectedObjects.length,
        ] as [number, number, number],
        [0, 0, 0],
      )
    : null;
  const selectedMass = selectedObjects.reduce(
    (total, object) => total + Math.max(0.01, object.mass ?? 1),
    0,
  );
  const selectedSpeed = selectedObjects.reduce((highest, object) => {
    const velocity = object.velocity ?? [0, 0, 0];
    return Math.max(highest, Math.hypot(...velocity));
  }, 0);
  const mobileViewport = document.documentElement.classList.contains(
    "poly-studio-mobile",
  );
  return (
    <div className="scene-viewport">
      <Canvas
        shadows={mobileViewport ? false : "soft"}
        dpr={mobileViewport ? [0.55, 0.85] : [1, 1.5]}
        camera={{ position: [16, 13, 18], fov: 48, near: 0.1, far: 300 }}
        gl={{
          antialias: !mobileViewport,
          powerPreference: "high-performance",
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.08,
        }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = PCFSoftShadowMap;
        }}
        onPointerMissed={(event) => {
          if (
            event.button === 0 &&
            tool === "select" &&
            !transforming
          ) {
            onSelectWorld(null);
          }
        }}
      >
        <LightingRig lighting={lighting} />
        <gridHelper args={[120, 120, new Color("#3B3150"), new Color("#201D29")]} position={[0, 0.015, 0]} />
        {objects.filter((object) => object.visible !== false).map((object) => (
          <mesh
            key={object.id}
            position={object.position}
            rotation={object.rotation}
            scale={object.scale}
            castShadow={object.castShadow}
            receiveShadow
            onPointerDown={(event) => {
              if (tool === "camera") return;
              if (event.button !== 0) return;
              event.stopPropagation();
              onSelectWorld(
                object.id,
                event.nativeEvent.ctrlKey || event.nativeEvent.metaKey,
              );
            }}
          >
            {object.type === "sound" ? (
              <>
                <sphereGeometry args={[0.5, 18, 12]} />
                <meshStandardMaterial
                  color="#9B6DFF"
                  emissive="#4A238B"
                  emissiveIntensity={0.8}
                  wireframe
                />
              </>
            ) : (
              <>
                <StudioObjectGeometry object={object} />
                <StudioSurfaceMaterial
                  object={object}
                  selected={selectedWorldIds.includes(object.id)}
                />
                {isStudioHumanoidHead(object) && <StudioHeadFace />}
              </>
            )}
            {selectedWorldIds.includes(object.id) && (
              <mesh scale={1.012}>
                <StudioObjectGeometry object={object} />
                <meshBasicMaterial color="#B78CFF" wireframe />
              </mesh>
            )}
            {physicsDebug && object.type !== "sound" && (
              <mesh scale={1.018} renderOrder={5}>
                <StudioObjectGeometry object={object} />
                <meshBasicMaterial
                  color={
                    !object.canCollide
                      ? "#FFB45B"
                      : object.anchored
                        ? "#67A8FF"
                        : "#49E1A7"
                  }
                  wireframe
                  transparent
                  opacity={0.88}
                  depthTest={false}
                  depthWrite={false}
                />
              </mesh>
            )}
          </mesh>
        ))}
        {physicsDebug &&
          objects
            .filter((object) => object.visible !== false)
            .map((object) => (
              <PhysicsVelocityArrow key={object.id} object={object} />
            ))}
        {center && tool !== "select" && tool !== "camera" && (
          <ViewportTransformControls
            center={center}
            tool={tool}
            gridSnap={gridSnap}
            angleSnap={angleSnap}
            onDraggingChange={setTransforming}
            onTransformStart={onTransformStart}
            onTransformChange={onTransformChange}
            onTransformEnd={onTransformEnd}
          />
        )}
        <CameraControls
          enabled={!transforming}
          touchLookEnabled={tool === "camera"}
        />
        <ViewportCameraTracker onCameraChange={onCameraChange} />
      </Canvas>
      {physicsDebug && (
        <aside className="physics-debug-panel">
          <strong>Physics debug</strong>
          <div><i className="physics-anchored" /> Anchored collider</div>
          <div><i className="physics-dynamic" /> Dynamic collider</div>
          <div><i className="physics-disabled" /> Collision disabled</div>
          {selectedObjects.length > 0 ? (
            <dl>
              <div><dt>Selected</dt><dd>{selectedObjects.length}</dd></div>
              <div><dt>Total mass</dt><dd>{selectedMass.toFixed(2)}</dd></div>
              <div><dt>Top speed</dt><dd>{selectedSpeed.toFixed(2)}</dd></div>
            </dl>
          ) : (
            <small>Select Parts to inspect mass and velocity.</small>
          )}
        </aside>
      )}
      {showGui && (
        <GuiPreview
          objects={gui}
          selectedId={selectedGuiId}
          onSelect={onSelectGui}
          onChange={onGuiChange}
        />
      )}
      <div className="viewport-badge">
        {showGui ? "UI editor" : "Perspective"}{physicsDebug ? " · Physics" : ""}
      </div>
      <div className="viewport-help">
        {tool === "select"
          ? "Click parts to select"
          : tool === "camera"
            ? "Drag to look | Pinch to move"
            : `Drag handles to ${tool}`}{" "}
        | WASD move | Q/E vertical | Right drag look | Wheel dolly
      </div>
    </div>
  );
}

function StudioSurfaceMaterial({
  object,
  selected,
}: {
  object: StudioObject;
  selected: boolean;
}) {
  const surfaceTexture = useMemo(
    () => createSurfaceTexture(object.surfaceTexture),
    [object.surfaceTexture],
  );
  const imageTextures = usePartImageTextures(object.imageFaces);
  const hasImages = hasPartImageFaces(object.imageFaces);
  useEffect(() => () => surfaceTexture?.dispose(), [surfaceTexture]);
  const common = {
    color: object.color,
    transparent: object.transparency > 0,
    opacity: Math.max(0, Math.min(1, 1 - object.transparency)),
    depthWrite: object.transparency <= 0.02,
    alphaTest: object.transparency >= 1 ? 1 : 0,
    roughness:
      object.material === "metal"
        ? 0.24
        : object.material === "neon"
          ? 0.35
          : object.material === "wood"
            ? 0.9
            : object.surfaceTexture === "none"
              ? 0.38
              : 0.7,
    metalness: object.material === "metal" ? 0.82 : 0,
    emissive: selected ? "#2B174D" : "#000000",
    emissiveIntensity:
      object.material === "neon" ? 0.9 : selected ? 0.75 : 0,
  };
  if (hasImages && (object.shape ?? "block") === "block") {
    return (
      <>
        {([
          ["right", 0],
          ["left", 1],
          ["top", 2],
          ["bottom", 3],
          ["back", 4],
          ["front", 5],
        ] as const).map(([face, index]) => (
          <meshStandardMaterial
            key={`${object.material}-${object.surfaceTexture}-${face}-${object.imageFaces?.[face] ?? object.imageFaces?.all ?? ""}`}
            attach={`material-${index}`}
            map={imageTextures[face] ?? imageTextures.all ?? surfaceTexture}
            {...common}
          />
        ))}
      </>
    );
  }
  return (
    <meshStandardMaterial
      key={`${object.material}-${object.surfaceTexture}-${object.imageFaces?.all ?? object.imageFaces?.front ?? ""}`}
      map={imageTextures.all ?? imageTextures.front ?? surfaceTexture}
      {...common}
    />
  );
}

function PhysicsVelocityArrow({ object }: { object: StudioObject }) {
  const [velocityX, velocityY, velocityZ] = object.velocity ?? [0, 0, 0];
  const speed = Math.hypot(velocityX, velocityY, velocityZ);
  const arrow = useMemo(() => {
    const direction = new Vector3(velocityX, velocityY, velocityZ);
    if (direction.lengthSq() < 0.0001) direction.set(0, 1, 0);
    else direction.normalize();
    const length = Math.min(12, Math.max(0.8, speed * 0.35));
    return new ArrowHelper(
      direction,
      new Vector3(0, 0, 0),
      length,
      "#FFE06B",
      Math.min(0.45, length * 0.22),
      Math.min(0.3, length * 0.14),
    );
  }, [speed, velocityX, velocityY, velocityZ]);

  useEffect(
    () => () => {
      arrow.line.geometry.dispose();
      const lineMaterials = Array.isArray(arrow.line.material)
        ? arrow.line.material
        : [arrow.line.material];
      lineMaterials.forEach((material) => material.dispose());
      arrow.cone.geometry.dispose();
      const coneMaterials = Array.isArray(arrow.cone.material)
        ? arrow.cone.material
        : [arrow.cone.material];
      coneMaterials.forEach((material) => material.dispose());
    },
    [arrow],
  );

  if (speed < 0.01) return null;
  return <primitive object={arrow} position={object.position} />;
}

function ViewportTransformControls({
  center,
  tool,
  gridSnap,
  angleSnap,
  onDraggingChange,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
}: {
  center: [number, number, number];
  tool: Exclude<StudioTool, "select" | "camera">;
  gridSnap: number;
  angleSnap: number;
  onDraggingChange: (dragging: boolean) => void;
  onTransformStart: (center: [number, number, number]) => void;
  onTransformChange: (transform: ViewportTransform) => void;
  onTransformEnd: () => void;
}) {
  const { camera, gl, scene } = useThree();
  const pivot = useMemo(() => new Object3D(), []);
  const controlsRef = useRef<ThreeTransformControls | null>(null);
  const pendingTransform = useRef<ViewportTransform | null>(null);
  const transformFrame = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const values = useRef({
    center,
    onDraggingChange,
    onTransformStart,
    onTransformChange,
    onTransformEnd,
  });
  values.current = {
    center,
    onDraggingChange,
    onTransformStart,
    onTransformChange,
    onTransformEnd,
  };

  useEffect(() => {
    if (dragging) return;
    pivot.position.set(...center);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
  }, [center, dragging, pivot, tool]);

  useEffect(() => {
    const controls = new ThreeTransformControls(camera, gl.domElement);
    controlsRef.current = controls;
    const helper = controls.getHelper();
    controls.attach(pivot);
    scene.add(pivot);
    scene.add(helper);

    const onMouseDown = () => {
      const current = values.current;
      pendingTransform.current = null;
      pivot.position.set(...current.center);
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      setDragging(true);
      current.onDraggingChange(true);
      current.onTransformStart(current.center);
    };
    const flushTransform = () => {
      transformFrame.current = null;
      const next = pendingTransform.current;
      pendingTransform.current = null;
      if (next) values.current.onTransformChange(next);
    };
    const onObjectChange = () => {
      pendingTransform.current = {
        position: [pivot.position.x, pivot.position.y, pivot.position.z],
        rotation: [pivot.rotation.x, pivot.rotation.y, pivot.rotation.z],
        scale: [pivot.scale.x, pivot.scale.y, pivot.scale.z],
      };
      if (transformFrame.current === null) {
        transformFrame.current = requestAnimationFrame(flushTransform);
      }
    };
    const onMouseUp = () => {
      if (transformFrame.current !== null) {
        cancelAnimationFrame(transformFrame.current);
        transformFrame.current = null;
      }
      flushTransform();
      setDragging(false);
      values.current.onDraggingChange(false);
      values.current.onTransformEnd();
    };
    controls.addEventListener("mouseDown", onMouseDown);
    controls.addEventListener("objectChange", onObjectChange);
    controls.addEventListener("mouseUp", onMouseUp);
    return () => {
      if (transformFrame.current !== null) {
        cancelAnimationFrame(transformFrame.current);
        transformFrame.current = null;
      }
      pendingTransform.current = null;
      controls.removeEventListener("mouseDown", onMouseDown);
      controls.removeEventListener("objectChange", onObjectChange);
      controls.removeEventListener("mouseUp", onMouseUp);
      controls.detach();
      controls.dispose();
      controlsRef.current = null;
      scene.remove(helper);
      scene.remove(pivot);
    };
  }, [camera, gl, pivot, scene]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    controls.setMode(
      tool === "move" ? "translate" : tool === "rotate" ? "rotate" : "scale",
    );
    controls.setTranslationSnap(Math.max(0.01, gridSnap));
    controls.setRotationSnap((Math.max(0.1, angleSnap) * Math.PI) / 180);
    controls.setScaleSnap(0.1);
    controls.setSpace(tool === "rotate" ? "local" : "world");
  }, [angleSnap, gridSnap, tool]);

  return null;
}

function GuiPreview({
  objects,
  selectedId,
  onSelect,
  onChange,
}: {
  objects: StudioGuiObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, patch: Partial<StudioGuiObject>) => void;
}) {
  const roots = objects.filter(
    (object) => object.type === "screenGui" && object.parentId === null,
  );
  return (
    <div className="studio-gui-preview" onClick={() => onSelect(null)}>
      {roots.map((root) => (
        <GuiPreviewNode
          key={root.id}
          object={root}
          objects={objects}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={onChange}
        />
      ))}
      {roots.length === 0 && (
        <div className="gui-empty-hint">Add a ScreenGui to start building UI.</div>
      )}
    </div>
  );
}

function GuiPreviewNode({
  object,
  objects,
  selectedId,
  onSelect,
  onChange,
}: {
  object: StudioGuiObject;
  objects: StudioGuiObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<StudioGuiObject>) => void;
}) {
  if (!object.visible) return null;
  const children = objects.filter((item) => item.parentId === object.id);
  if (object.type === "screenGui") {
    return (
      <>
        {children.map((child) => (
          <GuiPreviewNode
            key={child.id}
            object={child}
            objects={objects}
            selectedId={selectedId}
            onSelect={onSelect}
            onChange={onChange}
          />
        ))}
      </>
    );
  }
  return (
    <div
      className={`studio-gui-object studio-gui-${object.type}${selectedId === object.id ? " selected" : ""}`}
      style={{
        left: `${(object.position[0] - object.anchorPoint[0] * object.size[0]) * 100}%`,
        top: `${(object.position[1] - object.anchorPoint[1] * object.size[1]) * 100}%`,
        width: `${object.size[0] * 100}%`,
        height: `${object.size[1] * 100}%`,
        backgroundColor: object.backgroundColor,
        opacity: Math.max(0, Math.min(1, 1 - object.backgroundTransparency)),
        color: object.textColor,
        transform: `rotate(${object.rotation}deg)`,
        fontSize: `${object.textSize}px`,
        borderRadius: `${object.borderRadius}px`,
        zIndex: object.zIndex,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(object.id);
      }}
      onPointerDown={(event) => {
        if (object.locked || event.button !== 0) return;
        event.stopPropagation();
        onSelect(object.id);
        const root = event.currentTarget.closest(".studio-gui-preview");
        if (!(root instanceof HTMLElement)) return;
        const bounds = root.getBoundingClientRect();
        const startX = event.clientX;
        const startY = event.clientY;
        const startPosition = object.position;
        const move = (moveEvent: PointerEvent) => {
          onChange(object.id, {
            position: [
              Math.max(
                0,
                Math.min(
                  1,
                  Math.round(
                    (startPosition[0] +
                      (moveEvent.clientX - startX) / bounds.width) *
                      1000,
                  ) / 1000,
                ),
              ),
              Math.max(
                0,
                Math.min(
                  1,
                  Math.round(
                    (startPosition[1] +
                      (moveEvent.clientY - startY) / bounds.height) *
                      1000,
                  ) / 1000,
                ),
              ),
            ],
          });
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      {object.imageUrl &&
        (object.type === "imageLabel" || object.type === "imageButton") && (
          <img src={object.imageUrl} alt="" draggable={false} />
        )}
      {["textLabel", "textButton", "textBox"].includes(object.type)
        ? object.text
        : null}
      {children.map((child) => (
        <GuiPreviewNode
          key={child.id}
          object={child}
          objects={objects}
          selectedId={selectedId}
          onSelect={onSelect}
          onChange={onChange}
        />
      ))}
      {selectedId === object.id && !object.locked && (
        <button
          className="gui-resize-handle"
          aria-label="Resize GUI object"
          onPointerDown={(event) => {
            event.stopPropagation();
            const root = event.currentTarget.closest(".studio-gui-preview");
            if (!(root instanceof HTMLElement)) return;
            const bounds = root.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startSize = object.size;
            const move = (moveEvent: PointerEvent) => {
              onChange(object.id, {
                size: [
                  Math.max(
                    0.01,
                    Math.min(
                      1,
                      startSize[0] + (moveEvent.clientX - startX) / bounds.width,
                    ),
                  ),
                  Math.max(
                    0.01,
                    Math.min(
                      1,
                      startSize[1] + (moveEvent.clientY - startY) / bounds.height,
                    ),
                  ),
                ],
              });
            };
            const up = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
          }}
        />
      )}
    </div>
  );
}

function Properties({
  project,
  selection,
  onWorldChange,
  onModelChange,
  onRemoteChange,
  onGuiChange,
  onScriptChange,
  onValueChange,
  onPlayerChange,
  onLightingChange,
  onLeaderstatsChange,
  onDelete,
  onUngroup,
  onExportModel,
}: {
  project: StudioProject;
  selection: Selection;
  onWorldChange: (patch: Partial<StudioObject>) => void;
  onModelChange: (patch: Partial<StudioModel>) => void;
  onRemoteChange: (patch: Partial<StudioRemote>) => void;
  onGuiChange: (patch: Partial<StudioGuiObject>) => void;
  onScriptChange: (patch: Partial<StudioScript>) => void;
  onValueChange: (patch: Partial<StudioValueObject>) => void;
  onPlayerChange: (patch: Partial<StudioProject["playerSettings"]>) => void;
  onLightingChange: (patch: Partial<StudioProject["lighting"]>) => void;
  onLeaderstatsChange: (leaderstats: StudioProject["leaderstats"]) => void;
  onDelete: () => void;
  onUngroup: () => void;
  onExportModel: () => void;
}) {
  const world =
    selection?.type === "world"
      ? project.objects.find((item) => item.id === selection.id)
      : null;
  const gui =
    selection?.type === "gui"
      ? project.gui.find((item) => item.id === selection.id)
      : null;
  const script =
    selection?.type === "script"
      ? project.scripts.find((item) => item.id === selection.id)
      : null;
  const model =
    selection?.type === "model"
      ? project.models.find((item) => item.id === selection.id)
      : null;
  const remote =
    selection?.type === "remote"
      ? project.remotes.find((item) => item.id === selection.id)
      : null;
  const value =
    selection?.type === "value"
      ? project.values.find((item) => item.id === selection.id)
      : null;

  return (
    <aside className="properties-panel">
      <PanelHeading icon={<Settings2 size={15} />} title="Properties" />
      {!selection ? (
        <div className="nothing-selected">
          <MousePointer2 size={26} />
          <p>Select an object to edit it.</p>
        </div>
      ) : world ? (
        <div className="properties-content">
          <NameField value={world.name} onChange={(name) => onWorldChange({ name })} />
          <PropertySection title="Transform">
            <VectorField label="Position" value={world.position} onChange={(position) => onWorldChange({ position })} />
            <VectorField
              label="Rotation (degrees)"
              step={1}
              value={world.rotation.map(
                (value) => (value * 180) / Math.PI,
              ) as [number, number, number]}
              onChange={(rotation) =>
                onWorldChange({
                  rotation: rotation.map(
                    (value) => (value * Math.PI) / 180,
                  ) as [number, number, number],
                })
              }
            />
            <VectorField label="Size" value={world.scale} minimum={0.1} onChange={(scale) => onWorldChange({ scale })} />
          </PropertySection>
          {world.type === "sound" && (
            <PropertySection title="Sound">
              <ReadOnlyField
                label="Audio file"
                value={world.soundFileName || "No audio selected"}
              />
              <button
                className="property-action-button"
                onClick={async () => {
                  const imported = await window.polyStudio.importSound();
                  if (!imported) return;
                  onWorldChange({
                    soundData: imported.dataUrl,
                    soundFileName: imported.fileName,
                  });
                }}
              >
                <Upload size={14} />
                Upload audio
              </button>
              <NumberField label="Volume" value={world.volume ?? 0.7} minimum={0} maximum={1} step={0.05} onChange={(volume) => onWorldChange({ volume })} />
              <NumberField label="PlaybackSpeed" value={world.playbackSpeed ?? 1} minimum={0.25} maximum={4} step={0.05} onChange={(playbackSpeed) => onWorldChange({ playbackSpeed })} />
              <ToggleField label="Looped" value={world.looped ?? false} onChange={(looped) => onWorldChange({ looped })} />
              <ToggleField label="Autoplay" value={world.autoplay ?? false} onChange={(autoplay) => onWorldChange({ autoplay })} />
              <NumberField label="Min distance" value={world.rolloffMinDistance ?? 5} minimum={0.1} maximum={1000} step={0.5} onChange={(rolloffMinDistance) => onWorldChange({ rolloffMinDistance })} />
              <NumberField label="Max distance" value={world.rolloffMaxDistance ?? 60} minimum={world.rolloffMinDistance ?? 5} maximum={10000} step={1} onChange={(rolloffMaxDistance) => onWorldChange({ rolloffMaxDistance })} />
            </PropertySection>
          )}
          {world.type !== "sound" && <PropertySection title="Appearance">
            <SelectField
              label="Shape"
              value={world.shape ?? "block"}
              options={[
                { value: "block", label: "Block" },
                { value: "sphere", label: "Sphere" },
                { value: "cylinder", label: "Cylinder" },
                { value: "stud", label: "Stud" },
              ]}
              onChange={(shape) =>
                onWorldChange({
                  shape: shape as NonNullable<StudioObject["shape"]>,
                })
              }
            />
            <ColorField label="Color" value={world.color} onChange={(color) => onWorldChange({ color })} />
            <SelectField
              label="Material"
              value={world.material}
              options={[
                { value: "plastic", label: "Plastic" },
                { value: "metal", label: "Metal" },
                { value: "wood", label: "Wood" },
                { value: "neon", label: "Neon" },
              ]}
              onChange={(material) => onWorldChange({ material: material as StudioObject["material"] })}
            />
            <SelectField
              label="Surface texture"
              value={world.surfaceTexture}
              options={[
                { value: "none", label: "None" },
                { value: "brick", label: "Brick" },
                { value: "wood", label: "Wood grain" },
                { value: "concrete", label: "Concrete" },
                { value: "grass", label: "Grass" },
                { value: "fabric", label: "Fabric" },
                { value: "marble", label: "Marble" },
              ]}
              onChange={(surfaceTexture) =>
                onWorldChange({
                  surfaceTexture:
                    surfaceTexture as StudioObject["surfaceTexture"],
                })
              }
            />
            <PartImageFacesField
              value={world.imageFaces}
              onChange={(imageFaces) => onWorldChange({ imageFaces })}
            />
            <NumberField label="Transparency" value={world.transparency} minimum={0} maximum={1} step={0.05} onChange={(transparency) => onWorldChange({ transparency })} />
            <ToggleField label="CastShadow" value={world.castShadow} onChange={(castShadow) => onWorldChange({ castShadow })} />
            <ToggleField label="Visible" value={world.visible !== false} onChange={(visible) => onWorldChange({ visible })} />
          </PropertySection>}
          {world.type !== "sound" && <PropertySection title="Physics">
            <ToggleField label="Anchored" value={world.anchored} onChange={(anchored) => onWorldChange({ anchored })} />
            <ToggleField label="CanCollide" value={world.canCollide} onChange={(canCollide) => onWorldChange({ canCollide })} />
            <NumberField label="Friction" value={world.friction ?? 0.82} minimum={0} maximum={2} step={0.05} onChange={(friction) => onWorldChange({ friction })} />
            <NumberField label="Bounciness" value={world.restitution ?? 0.03} minimum={0} maximum={1} step={0.05} onChange={(restitution) => onWorldChange({ restitution })} />
            <NumberField label="Mass" value={world.mass ?? 1} minimum={0.01} maximum={10000} step={0.25} onChange={(mass) => onWorldChange({ mass })} />
            <VectorField label="Velocity" value={world.velocity ?? [0, 0, 0]} step={0.5} onChange={(velocity) => onWorldChange({ velocity })} />
            <VectorField
              label="Rotation speed (deg/s)"
              value={(world.angularVelocity ?? [0, 0, 0]).map(
                (value) => (value * 180) / Math.PI,
              ) as [number, number, number]}
              step={5}
              onChange={(degrees) =>
                onWorldChange({
                  angularVelocity: degrees.map(
                    (value) => (value * Math.PI) / 180,
                  ) as [number, number, number],
                })
              }
            />
          </PropertySection>}
          <PropertySection title="Gameplay data">
            {world.type === "humanoidRootPart" && (
              <>
                <NumberField
                  label="Health"
                  value={Number(world.attributes.Health ?? 100)}
                  minimum={0}
                  maximum={500}
                  step={1}
                  onChange={(Health) =>
                    onWorldChange({
                      attributes: { ...world.attributes, Health },
                    })
                  }
                />
                <NumberField
                  label="MaxHealth"
                  value={Number(world.attributes.MaxHealth ?? 100)}
                  minimum={1}
                  maximum={500}
                  step={1}
                  onChange={(MaxHealth) =>
                    onWorldChange({
                      attributes: { ...world.attributes, MaxHealth },
                    })
                  }
                />
              </>
            )}
            <TagsField value={world.tags} onChange={(tags) => onWorldChange({ tags })} />
            <JsonAttributesField
              value={world.attributes}
              onChange={(attributes) => onWorldChange({ attributes })}
            />
          </PropertySection>
          {!["baseplate", "spawn"].includes(world.type) && <DeleteButton onClick={onDelete} />}
        </div>
      ) : model ? (
        <div className="properties-content">
          <NameField value={model.name} onChange={(name) => onModelChange({ name })} />
          <PropertySection title="Model">
            <ReadOnlyField
              label="Parts"
              value={String(project.objects.filter((object) => object.modelId === model.id).length)}
            />
            <SelectField
              label="Primary Part"
              value={model.primaryPartId ?? ""}
              options={project.objects
                .filter((object) => object.modelId === model.id)
                .map((object) => ({ value: object.id, label: object.name }))}
              onChange={(primaryPartId) => onModelChange({ primaryPartId })}
            />
          </PropertySection>
          <PropertySection title="Gameplay data">
            {model.tags.includes("Humanoid") && (
              <>
                <NumberField
                  label="Health"
                  value={Number(model.attributes.Health ?? 100)}
                  minimum={0}
                  maximum={500}
                  step={1}
                  onChange={(Health) =>
                    onModelChange({
                      attributes: { ...model.attributes, Health },
                    })
                  }
                />
                <NumberField
                  label="MaxHealth"
                  value={Number(model.attributes.MaxHealth ?? 100)}
                  minimum={1}
                  maximum={500}
                  step={1}
                  onChange={(MaxHealth) =>
                    onModelChange({
                      attributes: { ...model.attributes, MaxHealth },
                    })
                  }
                />
              </>
            )}
            <TagsField value={model.tags} onChange={(tags) => onModelChange({ tags })} />
            <JsonAttributesField
              value={model.attributes}
              onChange={(attributes) => onModelChange({ attributes })}
            />
          </PropertySection>
          <button className="model-action" onClick={onExportModel}>
            <Download size={15} /> Export .pmxl
          </button>
          <button className="model-action" onClick={onUngroup}>
            <Ungroup size={15} /> Ungroup model
          </button>
          <DeleteButton onClick={onDelete} />
        </div>
      ) : remote ? (
        <div className="properties-content">
          <NameField value={remote.name} onChange={(name) => onRemoteChange({ name })} />
          <PropertySection title="Networking">
            <ReadOnlyField
              label="Type"
              value={remote.kind === "remoteEvent" ? "RemoteEvent" : "RemoteFunction"}
            />
            <ReadOnlyField label="Parent" value="ReplicatedStorage" />
          </PropertySection>
          <DeleteButton onClick={onDelete} />
        </div>
      ) : gui ? (
        <div className="properties-content">
          <NameField value={gui.name} onChange={(name) => onGuiChange({ name })} />
          {gui.type !== "screenGui" && (
            <>
              <PropertySection title="Layout">
                <Vector2Field label="Position (scale)" value={gui.position} onChange={(position) => onGuiChange({ position })} />
                <Vector2Field label="Size (scale)" value={gui.size} minimum={0.01} onChange={(size) => onGuiChange({ size })} />
                <Vector2Field label="Anchor point" value={gui.anchorPoint} minimum={0} onChange={(anchorPoint) => onGuiChange({ anchorPoint })} />
                <NumberField label="Rotation" value={gui.rotation} minimum={-360} maximum={360} step={1} onChange={(rotation) => onGuiChange({ rotation })} />
                <NumberField label="ZIndex" value={gui.zIndex} minimum={0} maximum={1000} step={1} onChange={(zIndex) => onGuiChange({ zIndex })} />
              </PropertySection>
              <PropertySection title="Appearance">
                <ColorField label="Background" value={gui.backgroundColor} onChange={(backgroundColor) => onGuiChange({ backgroundColor })} />
                <NumberField label="Transparency" value={gui.backgroundTransparency} minimum={0} maximum={1} step={0.05} onChange={(backgroundTransparency) => onGuiChange({ backgroundTransparency })} />
                <NumberField label="Corner radius" value={gui.borderRadius} minimum={0} maximum={100} step={1} onChange={(borderRadius) => onGuiChange({ borderRadius })} />
                {["textLabel", "textButton", "textBox"].includes(gui.type) && (
                  <>
                    <TextField label="Text" value={gui.text} onChange={(text) => onGuiChange({ text })} />
                    <ColorField label="Text color" value={gui.textColor} onChange={(textColor) => onGuiChange({ textColor })} />
                    <NumberField label="Text size" value={gui.textSize} minimum={1} maximum={200} step={1} onChange={(textSize) => onGuiChange({ textSize })} />
                  </>
                )}
                {gui.type === "textBox" && (
                  <TextField label="Placeholder" value={gui.placeholder} onChange={(placeholder) => onGuiChange({ placeholder })} />
                )}
                {(gui.type === "imageLabel" || gui.type === "imageButton") && (
                  <>
                    <TextField label="Image URL" value={gui.imageUrl.startsWith("data:") ? "" : gui.imageUrl} onChange={(imageUrl) => onGuiChange({ imageUrl })} />
                    <button
                      className="property-action-button"
                      onClick={async () => {
                        const imported = await window.polyStudio.importImage();
                        if (!imported) return;
                        onGuiChange({ imageUrl: imported.dataUrl });
                      }}
                    >
                      <Upload size={14} />
                      Upload image
                    </button>
                    {gui.imageUrl && (
                      <button
                        className="property-action-button"
                        onClick={() => onGuiChange({ imageUrl: "" })}
                      >
                        <Trash2 size={14} />
                        Clear image
                      </button>
                    )}
                  </>
                )}
                {gui.type === "scrollingFrame" && (
                  <Vector2Field label="Canvas size" value={gui.canvasSize} minimum={0.01} onChange={(canvasSize) => onGuiChange({ canvasSize })} />
                )}
              </PropertySection>
            </>
          )}
          <ToggleField label="Visible" value={gui.visible} onChange={(visible) => onGuiChange({ visible })} />
          <ToggleField label="Clip descendants" value={gui.clipDescendants} onChange={(clipDescendants) => onGuiChange({ clipDescendants })} />
          <ToggleField label="Locked" value={gui.locked} onChange={(locked) => onGuiChange({ locked })} />
          <DeleteButton onClick={onDelete} />
        </div>
      ) : script ? (
        <div className="properties-content">
          <NameField value={script.name} onChange={(name) => onScriptChange({ name })} />
          <PropertySection title="Execution">
            <ReadOnlyField
              label="Type"
              value={
                script.kind === "script"
                  ? "Server Script"
                  : script.kind === "localScript"
                    ? "LocalScript"
                    : "ModuleScript"
              }
            />
            <SelectField
              label="Parent"
              value={script.parent}
              options={scriptParentOptions(script.kind, project, script.id)}
              onChange={(parent) => onScriptChange({ parent })}
            />
            <ReadOnlyField label="Language" value={languageName[project.language]} />
          </PropertySection>
          <DeleteButton onClick={onDelete} />
        </div>
      ) : value ? (
        <div className="properties-content">
          <NameField value={value.name} onChange={(name) => onValueChange({ name })} />
          <PropertySection title="Value">
            <ReadOnlyField
              label="Type"
              value={
                value.type === "boolValue"
                  ? "BoolValue"
                  : value.type === "stringValue"
                    ? "StringValue"
                    : "NumberValue"
              }
            />
            {value.type === "boolValue" ? (
              <ToggleField
                label="Value"
                value={Boolean(value.value)}
                onChange={(next) => onValueChange({ value: next })}
              />
            ) : value.type === "stringValue" ? (
              <TextField
                label="Value"
                value={String(value.value)}
                onChange={(next) => onValueChange({ value: next })}
              />
            ) : (
              <NumberField
                label="Value"
                value={Number(value.value)}
                minimum={-1_000_000_000}
                maximum={1_000_000_000}
                step={1}
                onChange={(next) => onValueChange({ value: next })}
              />
            )}
            <ReadOnlyField label="Parent" value={value.parent} />
          </PropertySection>
          <DeleteButton onClick={onDelete} />
        </div>
      ) : selection.type === "player" ? (
        <div className="properties-content">
          <ReadOnlyField label="Name" value="LocalPlayer" />
          <PropertySection title="Player data">
            <ReadOnlyField label="UserId" value="Current account ID at runtime" />
            <ReadOnlyField label="Username" value="Current account username" />
            <ReadOnlyField label="DisplayName" value="Current account display name" />
          </PropertySection>
          <PropertySection title="Character">
            <NumberField label="Health" value={project.playerSettings.health} minimum={0} maximum={project.playerSettings.maxHealth} step={1} onChange={(health) => onPlayerChange({ health })} />
            <NumberField label="WalkSpeed" value={project.playerSettings.walkSpeed} minimum={1} maximum={500} step={1} onChange={(walkSpeed) => onPlayerChange({ walkSpeed })} />
            <NumberField label="JumpPower" value={project.playerSettings.jumpPower} minimum={1} maximum={500} step={0.5} onChange={(jumpPower) => onPlayerChange({ jumpPower })} />
            <NumberField label="MaxHealth" value={project.playerSettings.maxHealth} minimum={1} maximum={500} step={1} onChange={(maxHealth) => onPlayerChange({ maxHealth })} />
            <ToggleField label="SprintEnabled" value={project.playerSettings.sprintEnabled} onChange={(sprintEnabled) => onPlayerChange({ sprintEnabled })} />
            <NumberField label="SprintMultiplier" value={project.playerSettings.sprintMultiplier} minimum={1} maximum={5} step={0.1} onChange={(sprintMultiplier) => onPlayerChange({ sprintMultiplier })} />
          </PropertySection>
          <PropertySection title="Camera">
            <NumberField label="Field of view" value={project.playerSettings.cameraFieldOfView} minimum={20} maximum={120} step={1} onChange={(cameraFieldOfView) => onPlayerChange({ cameraFieldOfView })} />
            <NumberField label="Minimum zoom" value={project.playerSettings.cameraMinZoomDistance} minimum={1} maximum={project.playerSettings.cameraMaxZoomDistance} step={1} onChange={(cameraMinZoomDistance) => onPlayerChange({ cameraMinZoomDistance })} />
            <NumberField label="Maximum zoom" value={project.playerSettings.cameraMaxZoomDistance} minimum={project.playerSettings.cameraMinZoomDistance} maximum={200} step={1} onChange={(cameraMaxZoomDistance) => onPlayerChange({ cameraMaxZoomDistance })} />
          </PropertySection>
          <PropertySection title="Leaderstats">
            <LeaderstatsField
              value={project.leaderstats}
              onChange={onLeaderstatsChange}
            />
          </PropertySection>
        </div>
      ) : selection.type === "service" && selection.id === "Sky" ? (
        <div className="properties-content">
          <ReadOnlyField label="Name" value="Sky" />
          <PropertySection title="Day and night">
            <ToggleField
              label="DayNightCycle"
              value={project.lighting.dayNightCycle}
              onChange={(dayNightCycle) => onLightingChange({ dayNightCycle })}
            />
            <NumberField
              label="DayLengthMinutes"
              value={project.lighting.dayLengthMinutes}
              minimum={0.5}
              maximum={240}
              step={0.5}
              onChange={(dayLengthMinutes) =>
                onLightingChange({ dayLengthMinutes })
              }
            />
          </PropertySection>
          <PropertySection title="Sun">
            <ToggleField
              label="SunEnabled"
              value={project.lighting.sunEnabled}
              onChange={(sunEnabled) => onLightingChange({ sunEnabled })}
            />
            <ImageUploadField
              label="Sun PNG"
              value={project.lighting.sunTextureData}
              onChange={(sunTextureData) =>
                onLightingChange({ sunTextureData })
              }
            />
            <NumberField
              label="SunBrightness"
              value={project.lighting.sunBrightness}
              minimum={0}
              maximum={8}
              step={0.1}
              onChange={(sunBrightness) => onLightingChange({ sunBrightness })}
            />
            <NumberField
              label="SunGlare"
              value={project.lighting.sunGlare}
              minimum={0}
              maximum={2}
              step={0.05}
              onChange={(sunGlare) => onLightingChange({ sunGlare })}
            />
            <ToggleField
              label="SunRays"
              value={project.lighting.sunRays}
              onChange={(sunRays) => onLightingChange({ sunRays })}
            />
          </PropertySection>
          <PropertySection title="Moon">
            <ToggleField
              label="MoonEnabled"
              value={project.lighting.moonEnabled}
              onChange={(moonEnabled) => onLightingChange({ moonEnabled })}
            />
            <ImageUploadField
              label="Moon PNG"
              value={project.lighting.moonTextureData}
              onChange={(moonTextureData) =>
                onLightingChange({ moonTextureData })
              }
            />
            <NumberField
              label="MoonBrightness"
              value={project.lighting.moonBrightness}
              minimum={0}
              maximum={4}
              step={0.05}
              onChange={(moonBrightness) =>
                onLightingChange({ moonBrightness })
              }
            />
            <ToggleField
              label="MoonPhases"
              value={project.lighting.moonPhases}
              onChange={(moonPhases) => onLightingChange({ moonPhases })}
            />
            <NumberField
              label="MoonPhase"
              value={project.lighting.moonPhase}
              minimum={0}
              maximum={1}
              step={0.05}
              onChange={(moonPhase) => onLightingChange({ moonPhase })}
            />
          </PropertySection>
        </div>
      ) : selection.type === "service" && selection.id === "Lighting" ? (
        <div className="properties-content">
          <ReadOnlyField label="Name" value="Lighting" />
          <PropertySection title="Time and brightness">
            <NumberField
              label="ClockTime"
              value={project.lighting.clockTime}
              minimum={0}
              maximum={24}
              step={0.25}
              onChange={(clockTime) => onLightingChange({ clockTime })}
            />
            <NumberField
              label="Brightness"
              value={project.lighting.brightness}
              minimum={0}
              maximum={8}
              step={0.1}
              onChange={(brightness) => onLightingChange({ brightness })}
            />
          </PropertySection>
          <PropertySection title="Colors">
            <ColorField label="Ambient" value={project.lighting.ambient} onChange={(ambient) => onLightingChange({ ambient })} />
            <ColorField label="OutdoorAmbient" value={project.lighting.outdoorAmbient} onChange={(outdoorAmbient) => onLightingChange({ outdoorAmbient })} />
            <ColorField label="SkyColor" value={project.lighting.skyColor} onChange={(skyColor) => onLightingChange({ skyColor })} />
            <ColorField label="FogColor" value={project.lighting.fogColor} onChange={(fogColor) => onLightingChange({ fogColor })} />
          </PropertySection>
          <PropertySection title="Fog">
            <NumberField
              label="FogStart"
              value={project.lighting.fogStart}
              minimum={0}
              maximum={Math.max(0, project.lighting.fogEnd - 1)}
              step={1}
              onChange={(fogStart) => onLightingChange({ fogStart })}
            />
            <NumberField
              label="FogEnd"
              value={project.lighting.fogEnd}
              minimum={project.lighting.fogStart + 1}
              maximum={10_000}
              step={5}
              onChange={(fogEnd) => onLightingChange({ fogEnd })}
            />
          </PropertySection>
          <PropertySection title="Shadows">
            <ToggleField
              label="GlobalShadows"
              value={project.lighting.globalShadows}
              onChange={(globalShadows) => onLightingChange({ globalShadows })}
            />
            <NumberField
              label="ShadowSoftness"
              value={project.lighting.shadowSoftness}
              minimum={0}
              maximum={1}
              step={0.05}
              onChange={(shadowSoftness) => onLightingChange({ shadowSoftness })}
            />
          </PropertySection>
        </div>
      ) : selection.type === "service" ? (
        <div className="properties-content">
          <ReadOnlyField label="Name" value={selection.id} />
          <PropertySection title="Service">
            <ReadOnlyField
              label="Purpose"
              value={
                selection.id === "DataStoreService"
                  ? "Persistent server data"
                  : selection.id === "ReplicatedStorage"
                    ? "Shared modules"
                    : selection.id === "ServerStorage"
                      ? "Server-only modules"
                      : "Project container"
              }
            />
          </PropertySection>
        </div>
      ) : null}
    </aside>
  );
}

function PropertySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="property-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

const PROPERTY_HELP: Record<string, string> = {
  Name: "The name scripts and Explorer use to identify this object.",
  Position: "The object's X, Y, and Z location in the world.",
  "Rotation (degrees)": "The object's X, Y, and Z angles in degrees.",
  Size: "The object's width, height, and depth.",
  Color: "The base color used to render this object.",
  Material: "Changes how the surface reflects light.",
  "Surface texture": "Adds a visible surface pattern. None uses smooth plastic.",
  "Part images": "Uploads images onto all faces or individual block faces.",
  Transparency: "0 is fully visible. 1 is fully invisible.",
  CastShadow: "Controls whether this object casts a shadow.",
  Visible: "Hides or shows the object without deleting it.",
  Anchored: "Anchored objects stay fixed and are not moved by physics.",
  CanCollide: "When enabled, players and other physical parts cannot pass through.",
  Friction: "How strongly surfaces resist sliding. Higher values stop movement faster.",
  Bounciness: "How much energy is returned after a collision. 0 does not bounce; 1 is very springy.",
  Mass: "How strongly a moving part resists pushes and affects other parts in collisions. Mass does not make gravity accelerate it faster.",
  Velocity: "Starting movement speed on the X, Y, and Z axes in world units per second.",
  "Rotation speed (deg/s)": "Starting spin around the X, Y, and Z axes, shown in degrees per second.",
  Volume: "Sound loudness from 0 to 1.",
  PlaybackSpeed: "How quickly the sound plays. Values above 1 play faster.",
  Looped: "Restarts the sound automatically when it reaches the end.",
  Autoplay: "Starts the sound as soon as the game loads.",
  "Min distance": "Distance where a 3D sound begins getting quieter.",
  "Max distance": "Distance where a 3D sound can no longer be heard.",
  Health: "The object's current health.",
  MaxHealth: "The highest health value this object can have.",
  DayNightCycle: "Moves the sun and moon automatically while the game runs.",
  DayLengthMinutes: "Real minutes required for one complete in-game day.",
  SunBrightness: "Strength of direct sunlight and its highlights.",
  SunGlare: "Size and opacity of the glow around the sun.",
  SunRays: "Adds stronger directional sunlight and contrast.",
  MoonBrightness: "Strength of moonlight during nighttime.",
  MoonPhases: "Automatically varies the visible moon phase.",
  MoonPhase: "Manual moon phase from 0 (new moon) to 1 (full moon).",
};

function PropertyLabel({ label }: { label: string }) {
  const help = PROPERTY_HELP[label];
  return (
    <span className="property-label">
      <span>{label}</span>
      {help && (
        <span className="property-help" tabIndex={0} aria-label={`${label} help`}>
          <CircleHelp size={12} />
          <span className="property-tooltip">{help}</span>
        </span>
      )}
    </span>
  );
}

function StudioPartGeometry({
  shape,
}: {
  shape: NonNullable<StudioObject["shape"]>;
}) {
  if (shape === "sphere") {
    return <sphereGeometry args={[0.5, 32, 20]} />;
  }
  if (shape === "cylinder" || shape === "stud") {
    return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
  }
  return <boxGeometry args={[1, 1, 1]} />;
}

function isStudioHumanoidHead(object: StudioObject): boolean {
  return (
    object.attributes.RigPart === "Head" ||
    (object.name === "Head" && object.tags.includes("HumanoidLimb"))
  );
}

function StudioHeadGeometry() {
  const geometry = useMemo(
    () => normalizedObjGeometry(classicHeadObjSource, [1, 1, 1]),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <primitive object={geometry} attach="geometry" />;
}

function StudioHeadFace() {
  const faceTexture = useLoader(TextureLoader, classicSmileFaceUrl);
  faceTexture.colorSpace = SRGBColorSpace;
  return (
    <mesh
      name="StudioHeadFace"
      position={[0, -0.035, -0.515]}
      rotation={[0, Math.PI, 0]}
      renderOrder={3}
    >
      <planeGeometry args={[0.82, 0.55]} />
      <meshBasicMaterial
        map={faceTexture}
        transparent
        alphaTest={0.08}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped={false}
      />
    </mesh>
  );
}

function StudioObjectGeometry({ object }: { object: StudioObject }) {
  if (isStudioHumanoidHead(object)) {
    return <StudioHeadGeometry />;
  }
  return <StudioPartGeometry shape={object.shape ?? "block"} />;
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <TextField label="Name" value={value} onChange={onChange} />;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="property-name">
      <PropertyLabel label={label} />
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="property-name">
      <PropertyLabel label={label} />
      <input value={value} readOnly />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="property-name">
      <PropertyLabel label={label} />
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TagsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <TextField
      label="Tags (comma separated)"
      value={value.join(", ")}
      onChange={(raw) =>
        onChange(
          [...new Set(raw.split(",").map((tag) => tag.trim()).filter(Boolean))],
        )
      }
    />
  );
}

function JsonAttributesField({
  value,
  onChange,
}: {
  value: Record<string, string | number | boolean | null>;
  onChange: (value: Record<string, string | number | boolean | null>) => void;
}) {
  const [draft, setDraft] = useState(JSON.stringify(value, null, 2));
  useEffect(() => {
    setDraft(JSON.stringify(value, null, 2));
  }, [value]);
  return (
    <label className="property-name attribute-field">
      Attributes (JSON)
      <textarea
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          try {
            const parsed = JSON.parse(draft) as Record<string, unknown>;
            if (
              !parsed ||
              Array.isArray(parsed) ||
              typeof parsed !== "object" ||
              Object.values(parsed).some(
                (entry) =>
                  entry !== null &&
                  typeof entry !== "string" &&
                  typeof entry !== "number" &&
                  typeof entry !== "boolean",
              )
            ) {
              throw new Error();
            }
            onChange(parsed as Record<string, string | number | boolean | null>);
          } catch {
            setDraft(JSON.stringify(value, null, 2));
          }
        }}
      />
    </label>
  );
}

function LeaderstatsField({
  value,
  onChange,
}: {
  value: StudioProject["leaderstats"];
  onChange: (value: StudioProject["leaderstats"]) => void;
}) {
  return (
    <div className="leaderstats-editor">
      {value.map((stat) => (
        <div className="leaderstat-row" key={stat.id}>
          <input
            aria-label="Leaderstat name"
            maxLength={24}
            value={stat.name}
            onChange={(event) =>
              onChange(
                value.map((item) =>
                  item.id === stat.id
                    ? { ...item, name: event.target.value }
                    : item,
                ),
              )
            }
          />
          <select
            aria-label="Leaderstat type"
            value={stat.type}
            onChange={(event) => {
              const type = event.target.value as "number" | "string";
              onChange(
                value.map((item) =>
                  item.id === stat.id
                    ? {
                        ...item,
                        type,
                        defaultValue:
                          type === "number"
                            ? Number(item.defaultValue) || 0
                            : String(item.defaultValue),
                      }
                    : item,
                ),
              );
            }}
          >
            <option value="number">Number</option>
            <option value="string">Text</option>
          </select>
          <input
            aria-label="Leaderstat default value"
            type={stat.type === "number" ? "number" : "text"}
            maxLength={64}
            value={stat.defaultValue}
            onChange={(event) =>
              onChange(
                value.map((item) =>
                  item.id === stat.id
                    ? {
                        ...item,
                        defaultValue:
                          stat.type === "number"
                            ? Number(event.target.value)
                            : event.target.value,
                      }
                    : item,
                ),
              )
            }
          />
          <label
            className="leaderstat-visible"
            title="Show this stat on the in-game leaderboard"
          >
            <input
              aria-label={`Show ${stat.name} on leaderboard`}
              type="checkbox"
              checked={stat.showOnLeaderboard !== false}
              onChange={(event) =>
                onChange(
                  value.map((item) =>
                    item.id === stat.id
                      ? {
                          ...item,
                          showOnLeaderboard: event.target.checked,
                        }
                      : item,
                  ),
                )
              }
            />
            Show
          </label>
          <button
            type="button"
            title={`Delete ${stat.name}`}
            onClick={() =>
              onChange(value.filter((item) => item.id !== stat.id))
            }
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="leaderstat-add"
        disabled={value.length >= 12}
        onClick={() =>
          onChange([
            ...value,
            {
              id: crypto.randomUUID(),
              name: nextName(
                value.map((item) => item.name),
                "Coins",
              ),
              type: "number",
              defaultValue: 0,
              showOnLeaderboard: true,
            },
          ])
        }
      >
        <Plus size={13} /> Add leaderstat
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  minimum,
  maximum,
  step,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="property-name number-field">
      <PropertyLabel label={label} />
      <input
        type="number"
        value={value}
        min={minimum}
        max={maximum}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle-field">
      <PropertyLabel label={label} />
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-field">
      <PropertyLabel label={label} />
      <span>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

function ImageUploadField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="property-image-upload">
      <PropertyLabel label={label} />
      {value && <img src={value} alt="" />}
      <div>
        <button type="button" onClick={() => input.current?.click()}>
          {value ? "Replace" : "Upload"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || file.size > 1_000_000) return;
          const reader = new FileReader();
          reader.addEventListener("load", () => {
            if (typeof reader.result === "string") onChange(reader.result);
          });
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
}

const PART_IMAGE_FACE_LABELS: Record<PartImageFace, string> = {
  all: "All faces image",
  front: "Front image",
  back: "Back image",
  left: "Left image",
  right: "Right image",
  top: "Top image",
  bottom: "Bottom image",
};

function PartImageFacesField({
  value,
  onChange,
}: {
  value?: StudioPartImageFaces;
  onChange: (value: StudioPartImageFaces) => void;
}) {
  const imageFaces = normalizePartImageFaces(value);
  const setFace = (face: PartImageFace, image: string) => {
    const next: StudioPartImageFaces = { ...imageFaces };
    if (image) next[face] = image;
    else delete next[face];
    onChange(next);
  };
  const hasImages = hasPartImageFaces(imageFaces);
  return (
    <div className="part-image-faces">
      <div className="part-image-faces-heading">
        <PropertyLabel label="Part images" />
        {hasImages && (
          <button type="button" onClick={() => onChange({})}>
            Clear all
          </button>
        )}
      </div>
      <p>
        Upload an image for every face, or override one side at a time. Images
        render on block parts; round shapes use the all/front image.
      </p>
      {PART_IMAGE_FACE_KEYS.map((face) => (
        <ImageUploadField
          key={face}
          label={PART_IMAGE_FACE_LABELS[face]}
          value={imageFaces[face] ?? ""}
          onChange={(image) => setFace(face, image)}
        />
      ))}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="delete-object" onClick={onClick}>
      <Trash2 size={15} /> Delete object
    </button>
  );
}

function VectorField({
  label,
  value,
  minimum,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  minimum?: number;
  step?: number;
  onChange: (value: [number, number, number]) => void;
}) {
  return (
    <div className="vector-field">
      <PropertyLabel label={label} />
      <div>
        {(["X", "Y", "Z"] as const).map((axis, index) => (
          <label key={axis}>
            {axis}
            <input
              type="number"
              step={step}
              min={minimum}
              value={Number(value[index].toFixed(2))}
              onChange={(event) => {
                const next = [...value] as [number, number, number];
                next[index] = Number(event.target.value);
                onChange(next);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function Vector2Field({
  label,
  value,
  minimum,
  onChange,
}: {
  label: string;
  value: [number, number];
  minimum?: number;
  onChange: (value: [number, number]) => void;
}) {
  return (
    <div className="vector-field vector-field-2">
      <span>{label}</span>
      <div>
        {(["X", "Y"] as const).map((axis, index) => (
          <label key={axis}>
            {axis}
            <input
              type="number"
              step="0.01"
              min={minimum}
              value={Number(value[index].toFixed(3))}
              onChange={(event) => {
                const next = [...value] as [number, number];
                next[index] = Number(event.target.value);
                onChange(next);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function ScriptWorkspace({
  project,
  script,
  settings,
  diagnostics,
  onDiagnostics,
  onChange,
}: {
  project: StudioProject;
  script: StudioScript;
  settings: StudioSettings;
  diagnostics: PolyDiagnostic[];
  onDiagnostics: (diagnostics: PolyDiagnostic[]) => void;
  onChange: (source: string) => void;
}) {
  const counts = useMemo(
    () => ({
      errors: diagnostics.filter((item) => item.severity === "error").length,
      warnings: diagnostics.filter((item) => item.severity === "warning").length,
    }),
    [diagnostics],
  );
  const executionLabel =
    script.kind === "script"
      ? "Server"
      : script.kind === "localScript"
        ? "Client"
        : "Module";
  return (
    <div className="script-workspace">
      <header className="script-tabbar">
        <div className="script-tab active">
          <FileCode2 size={15} />
          {script.name}{languageExtension[project.language]}
          <small>{executionLabel}</small>
        </div>
      </header>
      <CodeEditor
        script={script}
        project={project}
        settings={settings}
        onChange={onChange}
        onDiagnostics={onDiagnostics}
      />
      <div className="problems-panel">
        <header>
          <strong>Problems</strong>
          <span>{counts.errors} errors</span>
          <span>{counts.warnings} warnings</span>
        </header>
        {diagnostics.length === 0 ? (
          <p>No problems detected.</p>
        ) : (
          diagnostics.map((diagnostic, index) => (
            <div className={`problem problem-${diagnostic.severity}`} key={`${diagnostic.line}-${index}`}>
              <strong>{diagnostic.severity}</strong>
              <span>{diagnostic.message}</span>
              <code>Line {diagnostic.line}</code>
            </div>
          ))
        )}
      </div>
      <footer className="script-status">
        <span>{languageName[project.language]}</span>
        <span>{executionLabel}</span>
        <span>UTF-8</span>
        <span>{script.source.split("\n").length} lines</span>
      </footer>
    </div>
  );
}
