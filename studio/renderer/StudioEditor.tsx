import { Canvas, useThree } from "@react-three/fiber";
import {
  Box,
  Boxes,
  Cable,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Database,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  Grid3X3,
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
  Server,
  Settings2,
  Square,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Upload,
  UserRound,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Color, Euler, Object3D, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls as ThreeTransformControls } from "three/examples/jsm/controls/TransformControls.js";
import {
  analyzePolyScript,
  type PolyDiagnostic,
  type PolyProject,
} from "../../src/game/polyProject";
import { createSurfaceTexture } from "../../src/game/surfaceTextures";
import logo from "../../assets/studio/poly-studio-logo-dark.png";
import CodeEditor from "./CodeEditor";

type Selection =
  | { type: "world"; id: string }
  | { type: "model"; id: string }
  | { type: "remote"; id: string }
  | { type: "gui"; id: string }
  | { type: "script"; id: string }
  | { type: "player"; id: "LocalPlayer" }
  | { type: "service"; id: string }
  | null;

type StudioTool = "select" | "move" | "rotate" | "scale";
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
  onExit,
}: {
  auth: StudioAuth;
  initialProject: StudioProject;
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
  const [openMenu, setOpenMenu] = useState<"file" | "project" | null>(null);
  const [message, setMessage] = useState("Ready");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
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
  const activeWorldIds = selectedModel
    ? project.objects
        .filter((object) => object.modelId === selectedModel.id)
        .map((object) => object.id)
    : selectedPartIds;
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.closest(".monaco-editor");
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      } else if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "y"
      ) {
        event.preventDefault();
        redo();
      } else if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault();
        duplicateSelected();
      } else if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault();
        if (event.shiftKey) ungroupModel();
        else createModel();
      } else if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "c"
      ) {
        event.preventDefault();
        copySelected();
      } else if (
        !editing &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "v"
      ) {
        event.preventDefault();
        pasteClipboard();
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        setCommandPalette(true);
      } else if (!editing && event.key === "F2") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".project-title input")?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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
      type === "tool" ? "Tool" : type === "handle" ? "Handle" : "Part";
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
      scale: type === "handle" ? [1, 3, 1] : [4, 4, 4],
      color: "#30254D",
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
        [2, 2, 1],
        "#7F8FA6",
        {
          visible: false,
          transparency: 1,
          canCollide: false,
          attributes: { Health: 100, MaxHealth: 100, RigPart: "Root" },
          tags: ["Humanoid", "RigRoot"],
        },
      ),
      part("Torso", "part", [0, 0, 0], [2, 2, 1], "#5635B8"),
      part("Head", "part", [0, 1.65, 0], [1.55, 1.15, 1.45], "#C9A978"),
      part("Left Arm", "part", [-1.5, 0, 0], [1, 2.05, 1], "#C9A978"),
      part("Right Arm", "part", [1.5, 0, 0], [1, 2.05, 1], "#C9A978"),
      part("Left Leg", "part", [-0.5, -2, 0], [1, 2, 1], "#181A23"),
      part("Right Leg", "part", [0.5, -2, 0], [1, 2, 1], "#181A23"),
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
    if (object.modelId) {
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
    setWorkspace("scene");
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
    const sourceIds = activeWorldIds;
    if (sourceIds.length === 0) return;
    const offset = Math.max(0.1, gridSnap);
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
        position: [object.position[0] + offset, ...object.position.slice(1)] as [
          number,
          number,
          number,
        ],
        modelId: nextModelId,
      };
    }).map((object) => ({
      ...object,
      parentId: object.parentId
        ? idMap.get(object.parentId) ?? null
        : null,
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
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, ...copies],
      models: modelCopy ? [...current.models, modelCopy] : current.models,
    }));
    setSelectedPartIds(copies.map((copy) => copy.id));
    setSelection(
      modelCopy
        ? { type: "model", id: modelCopy.id }
        : copies[0]
          ? { type: "world", id: copies[0].id }
          : null,
    );
    setMessage("Duplicated selection");
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
    const rotationStep = (Math.max(1, angleSnap) * Math.PI) / 180;
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
    const addWorldActions = () => {
      actions.push(
        { label: "Part", icon: <Box size={14} />, run: () => addPart("part", target) },
        { label: "Tool", icon: <Package size={14} />, run: () => addPart("tool", target) },
        { label: "Handle", icon: <Move3D size={14} />, run: () => addPart("handle", target) },
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
          { label: "Linked Sword Template", icon: <Package size={14} />, run: () => addLinkedSword(target) },
          { label: "Script", icon: <FileCode2 size={14} />, run: () => addScript("script", target) },
          { label: "LocalScript", icon: <Code2 size={14} />, run: () => addScript("localScript", target) },
        );
      } else {
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
    return actions;
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
      }));
    }
    setSelection(null);
    setSelectedPartIds([]);
  }

  async function play() {
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
        await window.polyStudio.playProject(saved.id);
        setMessage("Opening Polymons Player...");
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

  async function publish(metadata: { title: string; description: string }) {
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
              <button onClick={openPublishDialog}>
                <Upload size={14} />
                {project.publication ? "Update game" : "Publish game"}
              </button>
            </div>
          )}
        </div>
        <div className="toolbar-group">
          <button title="Select" className={tool === "select" ? "active" : ""} onClick={() => setTool("select")}>
            <MousePointer2 size={17} />
          </button>
          <button title="Move" className={tool === "move" ? "active" : ""} onClick={() => setTool("move")}><Move3D size={17} /></button>
          <button title="Rotate" className={tool === "rotate" ? "active" : ""} onClick={() => setTool("rotate")}><RotateCw size={17} /></button>
          <button title="Scale" className={tool === "scale" ? "active" : ""} onClick={() => setTool("scale")}><Settings2 size={17} /></button>
        </div>
        <div className="toolbar-group">
          <button title="Undo" disabled={undoStack.current.length === 0} onClick={undo}><Undo2 size={17} /></button>
          <button title="Redo" disabled={redoStack.current.length === 0} onClick={redo}><Redo2 size={17} /></button>
          <button title="Duplicate selection" disabled={activeWorldIds.length === 0} onClick={duplicateSelected}><Copy size={16} /></button>
          <button title="Group selection into Model (Ctrl+G)" disabled={activeWorldIds.length < 2} onClick={createModel}><Boxes size={16} /></button>
          <button title="Ungroup Model (Ctrl+Shift+G)" disabled={!selectedModel} onClick={ungroupModel}><Ungroup size={16} /></button>
          <button title="Snap selection to grid" disabled={activeWorldIds.length === 0} onClick={snapSelection}><Grid3X3 size={16} /></button>
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
              min="1"
              max="180"
              step="1"
              value={angleSnap}
              onChange={(event) => setAngleSnap(Math.max(1, Number(event.target.value) || 15))}
            />
          </label>
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
        <button title="Project health" onClick={() => setShowHealth(true)}>
          Health {healthIssues.length > 0 ? `(${healthIssues.length})` : ""}
        </button>
        <button title="Keyboard shortcuts" onClick={() => setShowShortcuts(true)}>
          Shortcuts
        </button>
      </div>

      <div className="editor-workspace">
        <Explorer
          project={project}
          selection={selection}
          selectedPartIds={selectedPartIds}
          onSelectWorld={selectWorld}
          onSelectModel={selectModel}
          onSelect={(next) => {
            setSelection(next);
            if (next.type !== "world" && next.type !== "model") {
              setSelectedPartIds([]);
            }
            if (next.type === "script") setWorkspace("script");
            else if (next.type === "gui") setWorkspace("ui");
            else if (next.type !== "service") setWorkspace("scene");
          }}
          onContextMenu={openContextMenu}
        />

        <section className="editor-center">
          {workspace === "animation" ? (
            <AnimationWorkspace
              project={project}
              onChange={updateProject}
              onExport={(animation) => void exportAnimation(animation)}
              onImport={(rigModelId) => void importAnimation(rigModelId)}
            />
          ) : workspace === "script" && selectedScript ? (
            <ScriptWorkspace
              key={selectedScript.id}
              project={project}
              script={selectedScript}
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
              selectedWorldIds={activeWorldIds}
              selectedGuiId={selectedGui?.id ?? null}
              showGui={workspace === "ui"}
              tool={tool}
              gridSnap={gridSnap}
              angleSnap={angleSnap}
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
              ...current,
              objects: current.objects.map((item) =>
                ids.has(item.id) ? { ...item, ...patch } : item,
              ),
            }));
          }}
          onModelChange={(patch) => {
            if (!selectedModel) return;
            updateProject((current) => ({
              ...current,
              models: current.models.map((model) =>
                model.id === selectedModel.id ? { ...model, ...patch } : model,
              ),
            }));
          }}
          onRemoteChange={(patch) => {
            if (!selectedRemote) return;
            updateProject((current) => ({
              ...current,
              remotes: current.remotes.map((remote) =>
                remote.id === selectedRemote.id ? { ...remote, ...patch } : remote,
              ),
            }));
          }}
          onGuiChange={(patch) => {
            if (!selectedGui) return;
            updateProject((current) => ({
              ...current,
              gui: current.gui.map((item) =>
                item.id === selectedGui.id ? { ...item, ...patch } : item,
              ),
            }));
          }}
          onScriptChange={(patch) => {
            if (!selectedScript) return;
            updateProject((current) => ({
              ...current,
              scripts: current.scripts.map((item) =>
                item.id === selectedScript.id ? { ...item, ...patch } : item,
              ),
            }));
          }}
          onPlayerChange={(patch) =>
            updateProject((current) => ({
              ...current,
              playerSettings: { ...current.playerSettings, ...patch },
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
            <code>Ctrl+D</code><span>Duplicate selection</span>
            <code>Ctrl+G</code><span>Group as Model</span>
            <code>Ctrl+Shift+G</code><span>Ungroup Model</span>
            <code>Ctrl+Shift+P</code><span>Command palette</span>
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
              ["Open Project Health", () => setShowHealth(true)],
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

function PublishDialog({
  project,
  publishing,
  onClose,
  onPublish,
}: {
  project: StudioProject;
  publishing: boolean;
  onClose: () => void;
  onPublish: (metadata: { title: string; description: string }) => void;
}) {
  const [title, setTitle] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  return (
    <div className="studio-modal-layer">
      <button className="studio-modal-backdrop" onClick={onClose} />
      <form
        className="publish-game-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onPublish({ title, description });
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
  onChange,
  onExport,
  onImport,
}: {
  project: StudioProject;
  onChange: (updater: (current: StudioProject) => StudioProject) => void;
  onExport: (animation: StudioAnimation) => void;
  onImport: (rigModelId: string) => void;
}) {
  const rigs = project.models.filter((model) => model.tags.includes("Humanoid"));
  const [rigId, setRigId] = useState(rigs[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState(project.animations[0]?.id ?? "");
  const selected =
    project.animations.find((animation) => animation.id === selectedId) ?? null;
  const parts = project.objects.filter(
    (object) => object.modelId === (selected?.rigModelId ?? rigId),
  );
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [time, setTime] = useState(0);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);

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

  const addKeyframe = () => {
    if (!selected || !partId) return;
    const keyTime = Math.min(selected.duration, Math.max(0, time));
    const pose = {
      rotation: rotation.map(
        (value) => (value * Math.PI) / 180,
      ) as [number, number, number],
    };
    const existing = selected.keyframes.find(
      (keyframe) => Math.abs(keyframe.time - keyTime) < 0.0001,
    );
    const keyframes = existing
      ? selected.keyframes.map((keyframe) =>
          keyframe === existing
            ? { ...keyframe, poses: { ...keyframe.poses, [partId]: pose } }
            : keyframe,
        )
      : [
          ...selected.keyframes,
          { time: keyTime, poses: { [partId]: pose } },
        ].sort((a, b) => a.time - b.time);
    patchAnimation({ keyframes });
  };

  return (
    <div className="animation-workspace">
      <header>
        <div>
          <span>Animation editor</span>
          <h2>Blocky humanoid animation</h2>
        </div>
        <div className="animation-header-actions">
          <button disabled={!rigId} onClick={() => onImport(rigId)}>
            <Upload size={15} /> Import .pma
          </button>
          <button disabled={!selected} onClick={() => selected && onExport(selected)}>
            <Download size={15} /> Export .pma
          </button>
        </div>
      </header>
      {rigs.length === 0 ? (
        <div className="animation-empty">
          <UserRound size={32} />
          <h3>Add a HumanoidRootPart first.</h3>
          <p>Studio will create the full editable humanoid rig automatically.</p>
        </div>
      ) : (
        <div className="animation-layout">
          <aside>
            <label>
              Humanoid rig
              <select value={rigId} onChange={(event) => setRigId(event.target.value)}>
                {rigs.map((rig) => <option key={rig.id} value={rig.id}>{rig.name}</option>)}
              </select>
            </label>
            <button className="animation-create" onClick={createAnimation}>
              <Plus size={15} /> New animation
            </button>
            <div className="animation-list">
              {project.animations.map((animation) => (
                <button
                  key={animation.id}
                  className={animation.id === selectedId ? "active" : ""}
                  onClick={() => {
                    setSelectedId(animation.id);
                    if (animation.rigModelId) setRigId(animation.rigModelId);
                  }}
                >
                  <RotateCw size={14} />
                  <span>{animation.name}</span>
                  <small>{animation.duration.toFixed(2)}s</small>
                </button>
              ))}
            </div>
          </aside>
          <section>
            {selected ? (
              <>
                <div className="animation-fields">
                  <TextField
                    label="Name"
                    value={selected.name}
                    onChange={(name) => patchAnimation({ name })}
                  />
                  <NumberField
                    label="Duration"
                    value={selected.duration}
                    minimum={0.05}
                    maximum={600}
                    step={0.05}
                    onChange={(duration) => patchAnimation({ duration })}
                  />
                  <ToggleField
                    label="Looped"
                    value={selected.looped}
                    onChange={(looped) => patchAnimation({ looped })}
                  />
                </div>
                <div className="keyframe-builder">
                  <h3>Add or update a pose</h3>
                  <label>
                    Limb
                    <select value={partId} onChange={(event) => setPartId(event.target.value)}>
                      {parts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
                    </select>
                  </label>
                  <NumberField
                    label="Time (seconds)"
                    value={time}
                    minimum={0}
                    maximum={selected.duration}
                    step={0.05}
                    onChange={setTime}
                  />
                  <VectorField
                    label="Rotation offset (degrees)"
                    value={rotation}
                    step={1}
                    onChange={setRotation}
                  />
                  <button onClick={addKeyframe}>Set keyframe</button>
                </div>
                <div className="keyframe-list">
                  <h3>Keyframes</h3>
                  {selected.keyframes.map((keyframe, index) => (
                    <div key={`${keyframe.time}-${index}`}>
                      <strong>{keyframe.time.toFixed(2)}s</strong>
                      <span>{Object.keys(keyframe.poses).length} posed part(s)</span>
                      <button
                        title="Delete keyframe"
                        onClick={() =>
                          patchAnimation({
                            keyframes: selected.keyframes.filter(
                              (_, keyframeIndex) => keyframeIndex !== index,
                            ),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <code>Animations.Play("{selected.name}")</code>
              </>
            ) : (
              <div className="animation-empty"><p>Create an animation to begin.</p></div>
            )}
          </section>
        </div>
      )}
    </div>
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
  const scriptsAt = (parent: string) =>
    project.scripts.filter((script) => script.parent === parent);
  const guiRoots = project.gui.filter((gui) => gui.parentId === null);
  const stores = Object.keys(project.dataStores).sort();
  const looseObjects = project.objects.filter(
    (object) => !object.modelId && !object.parentId,
  );

  return (
    <aside className="explorer-panel">
      <PanelHeading icon={<Folder size={15} />} title="Explorer" />
      <div className="tree">
        <TreeRoot
          icon={<Grid3X3 size={14} />}
          label="Workspace"
          active={selection?.type === "service" && selection.id === "Workspace"}
          onSelect={() => onSelect({ type: "service", id: "Workspace" })}
          onContextMenu={(event) =>
            onContextMenu({ type: "service", id: "Workspace" }, event)
          }
        >
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
        </TreeRoot>
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
    </aside>
  );
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
  return (
    <div className="world-tree-node">
      <TreeItem
        active={selectedPartIds.includes(object.id)}
        nested={nested}
        icon={
          object.type === "tool"
            ? <Package size={14} />
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

function CameraControls({ enabled }: { enabled: boolean }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enabled = enabled;
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 4;
    controls.maxDistance = 80;
    const pressed = new Set<string>();
    const forward = new Vector3();
    const right = new Vector3();
    const movement = new Vector3();
    const direction = new Vector3();
    const nextDirection = new Vector3();
    const up = new Vector3(0, 1, 0);
    const supportedKeys = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]);
    const rotateView = (yaw: number, pitch: number) => {
      camera.getWorldDirection(direction).normalize();
      const viewDistance = Math.max(
        1,
        camera.position.distanceTo(controls.target),
      );
      if (yaw !== 0) direction.applyAxisAngle(up, yaw);
      if (pitch !== 0) {
        right.crossVectors(direction, up).normalize();
        nextDirection.copy(direction).applyAxisAngle(right, pitch);
        if (Math.abs(nextDirection.y) < 0.96) {
          direction.copy(nextDirection);
        }
      }
      controls.target
        .copy(camera.position)
        .addScaledVector(direction.normalize(), viewDistance);
    };
    gl.domElement.tabIndex = 0;
    const focusViewport = () => gl.domElement.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (!supportedKeys.has(event.code)) return;
      event.preventDefault();
      pressed.add(event.code);
      if (!event.repeat) {
        const lookStep = Math.PI / 90;
        if (event.code === "ArrowLeft") rotateView(lookStep, 0);
        if (event.code === "ArrowRight") rotateView(-lookStep, 0);
        if (event.code === "ArrowUp") rotateView(0, lookStep);
        if (event.code === "ArrowDown") rotateView(0, -lookStep);
        controls.update();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      pressed.delete(event.code);
    };
    const clearKeys = () => pressed.clear();
    gl.domElement.addEventListener("pointerdown", focusViewport);
    gl.domElement.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);

    let previousTime = performance.now();
    let frameId = requestAnimationFrame(function frame(time) {
      const delta = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      if (enabled && pressed.size > 0) {
        camera.getWorldDirection(direction).normalize();

        const yaw =
          (Number(pressed.has("ArrowLeft")) -
            Number(pressed.has("ArrowRight"))) *
          0.62 *
          delta;
        const pitch =
          (Number(pressed.has("ArrowUp")) -
            Number(pressed.has("ArrowDown"))) *
          0.5 *
          delta;
        if (yaw !== 0 || pitch !== 0) {
          rotateView(yaw, pitch);
          camera.getWorldDirection(direction).normalize();
        }

        forward.copy(direction).setY(0);
        if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1);
        forward.normalize();
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
          );
        if (movement.lengthSq() > 0) {
          movement.normalize().multiplyScalar(8 * delta);
          camera.position.add(movement);
          controls.target.add(movement);
        }
      }
      controls.update();
      frameId = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(frameId);
      gl.domElement.removeEventListener("pointerdown", focusViewport);
      gl.domElement.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      controls.dispose();
    };
  }, [camera, enabled, gl]);
  return null;
}

function SceneViewport({
  objects,
  gui,
  selectedWorldIds,
  selectedGuiId,
  showGui,
  tool,
  gridSnap,
  angleSnap,
  onTransformStart,
  onTransformChange,
  onTransformEnd,
  onSelectWorld,
  onSelectGui,
  onGuiChange,
}: {
  objects: StudioObject[];
  gui: StudioGuiObject[];
  selectedWorldIds: string[];
  selectedGuiId: string | null;
  showGui: boolean;
  tool: StudioTool;
  gridSnap: number;
  angleSnap: number;
  onTransformStart: (center: [number, number, number]) => void;
  onTransformChange: (transform: ViewportTransform) => void;
  onTransformEnd: () => void;
  onSelectWorld: (id: string | null, additive?: boolean) => void;
  onSelectGui: (id: string | null) => void;
  onGuiChange: (id: string, patch: Partial<StudioGuiObject>) => void;
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
  return (
    <div className="scene-viewport">
      <Canvas
        shadows
        camera={{ position: [16, 13, 18], fov: 48, near: 0.1, far: 300 }}
        onPointerMissed={() => {
          if (tool === "select" && !transforming) onSelectWorld(null);
        }}
      >
        <color attach="background" args={["#0B0B10"]} />
        <fog attach="fog" args={["#0B0B10", 45, 120]} />
        <ambientLight intensity={1.2} color="#B9B3D1" />
        <directionalLight position={[-12, 20, 8]} intensity={2.5} color="#F1ECFF" castShadow />
        <gridHelper args={[120, 120, new Color("#3B3150"), new Color("#201D29")]} position={[0, 0.015, 0]} />
        {objects.filter((object) => object.visible !== false).map((object) => (
          <mesh
            key={object.id}
            position={object.position}
            rotation={object.rotation}
            scale={object.scale}
            castShadow={object.castShadow}
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onSelectWorld(
                object.id,
                event.nativeEvent.ctrlKey || event.nativeEvent.metaKey,
              );
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <StudioSurfaceMaterial
              object={object}
              selected={selectedWorldIds.includes(object.id)}
            />
            {selectedWorldIds.includes(object.id) && (
              <mesh scale={1.012}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#B78CFF" wireframe />
              </mesh>
            )}
          </mesh>
        ))}
        {center && tool !== "select" && (
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
        <CameraControls enabled={!transforming} />
      </Canvas>
      {showGui && (
        <GuiPreview
          objects={gui}
          selectedId={selectedGuiId}
          onSelect={onSelectGui}
          onChange={onGuiChange}
        />
      )}
      <div className="viewport-badge">{showGui ? "UI editor" : "Perspective"}</div>
      <div className="viewport-help">
        {tool === "select"
          ? "Click parts to select"
          : `Drag handles to ${tool}`}{" "}
        | WASD move | Arrow keys look | Right drag orbit | Wheel zoom
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
  useEffect(() => () => surfaceTexture?.dispose(), [surfaceTexture]);
  return (
    <meshStandardMaterial
      key={`${object.material}-${object.surfaceTexture}`}
      color={object.color}
      map={surfaceTexture}
      transparent={object.transparency > 0}
      opacity={Math.max(0, Math.min(1, 1 - object.transparency))}
      depthWrite={object.transparency <= 0.02}
      alphaTest={object.transparency >= 1 ? 1 : 0}
      roughness={
        object.material === "metal"
          ? 0.24
          : object.material === "neon"
            ? 0.35
            : object.material === "wood"
              ? 0.9
              : object.surfaceTexture === "none"
                ? 0.38
                : 0.7
      }
      metalness={object.material === "metal" ? 0.82 : 0}
      emissive={selected ? "#2B174D" : "#000000"}
      emissiveIntensity={
        object.material === "neon" ? 0.9 : selected ? 0.75 : 0
      }
    />
  );
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
  tool: Exclude<StudioTool, "select">;
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
      pivot.position.set(...current.center);
      pivot.rotation.set(0, 0, 0);
      pivot.scale.set(1, 1, 1);
      setDragging(true);
      current.onDraggingChange(true);
      current.onTransformStart(current.center);
    };
    const onObjectChange = () => {
      values.current.onTransformChange({
        position: [pivot.position.x, pivot.position.y, pivot.position.z],
        rotation: [pivot.rotation.x, pivot.rotation.y, pivot.rotation.z],
        scale: [pivot.scale.x, pivot.scale.y, pivot.scale.z],
      });
    };
    const onMouseUp = () => {
      setDragging(false);
      values.current.onDraggingChange(false);
      values.current.onTransformEnd();
    };
    controls.addEventListener("mouseDown", onMouseDown);
    controls.addEventListener("objectChange", onObjectChange);
    controls.addEventListener("mouseUp", onMouseUp);
    return () => {
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
    controls.setRotationSnap((Math.max(1, angleSnap) * Math.PI) / 180);
    controls.setScaleSnap(0.1);
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
  onPlayerChange,
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
  onPlayerChange: (patch: Partial<StudioProject["playerSettings"]>) => void;
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
          <PropertySection title="Appearance">
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
            <NumberField label="Transparency" value={world.transparency} minimum={0} maximum={1} step={0.05} onChange={(transparency) => onWorldChange({ transparency })} />
            <ToggleField label="CastShadow" value={world.castShadow} onChange={(castShadow) => onWorldChange({ castShadow })} />
            <ToggleField label="Visible" value={world.visible !== false} onChange={(visible) => onWorldChange({ visible })} />
          </PropertySection>
          <PropertySection title="Physics">
            <ToggleField label="Anchored" value={world.anchored} onChange={(anchored) => onWorldChange({ anchored })} />
            <ToggleField label="CanCollide" value={world.canCollide} onChange={(canCollide) => onWorldChange({ canCollide })} />
            <NumberField label="Friction" value={world.friction ?? 0.82} minimum={0} maximum={2} step={0.05} onChange={(friction) => onWorldChange({ friction })} />
            <NumberField label="Bounciness" value={world.restitution ?? 0.03} minimum={0} maximum={1} step={0.05} onChange={(restitution) => onWorldChange({ restitution })} />
            <NumberField label="Mass" value={world.mass ?? 1} minimum={0.01} maximum={10000} step={0.25} onChange={(mass) => onWorldChange({ mass })} />
            <VectorField label="Velocity" value={world.velocity ?? [0, 0, 0]} step={0.5} onChange={(velocity) => onWorldChange({ velocity })} />
          </PropertySection>
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
                  <TextField label="Image URL" value={gui.imageUrl} onChange={(imageUrl) => onGuiChange({ imageUrl })} />
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
      ) : selection.type === "player" ? (
        <div className="properties-content">
          <ReadOnlyField label="Name" value="LocalPlayer" />
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

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <TextField label="Name" value={value} onChange={onChange} />;
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="property-name">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="property-name">
      {label}
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
      {label}
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
      {label}
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
      {label}
      <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="color-field">
      {label}
      <span>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
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
      <span>{label}</span>
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
  diagnostics,
  onDiagnostics,
  onChange,
}: {
  project: StudioProject;
  script: StudioScript;
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
