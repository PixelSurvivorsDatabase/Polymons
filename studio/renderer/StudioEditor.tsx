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
import { Color } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  analyzePolyScript,
  type PolyDiagnostic,
  type PolyProject,
} from "../../src/game/polyProject";
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
    backgroundColor: type === "textButton" ? "#6F49BB" : "#17131F",
    backgroundTransparency: type === "screenGui" ? 1 : 0.08,
    text:
      type === "textLabel"
        ? "Text"
        : type === "textButton"
          ? "Button"
          : "",
    textColor: "#FFFFFF",
    visible: true,
    rotation: 0,
    textSize: 16,
    borderRadius: 7,
    zIndex: 1,
  };
}

function scriptParentOptions(
  kind: StudioScript["kind"],
  gui: StudioGuiObject[],
): Array<{ value: string; label: string }> {
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
    ...gui
      .filter((item) => item.type === "screenGui" || item.type === "frame")
      .map((item) => ({ value: item.id, label: `StarterGui / ${item.name}` })),
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
  const [gridSnap, setGridSnap] = useState(1);
  const [angleSnap, setAngleSnap] = useState(15);
  const [workspace, setWorkspace] = useState<"scene" | "script" | "ui">("scene");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [diagnostics, setDiagnostics] = useState<
    Record<string, PolyDiagnostic[]>
  >({});
  const undoStack = useRef<StudioProject[]>([]);
  const redoStack = useRef<StudioProject[]>([]);

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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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

  function addPart(type: StudioObject["type"] = "part") {
    const baseName =
      type === "humanoidRootPart"
        ? "HumanoidRootPart"
        : type === "tool"
          ? "Tool"
          : type === "handle"
            ? "Handle"
            : "Part";
    const next: StudioObject = {
      id: crypto.randomUUID(),
      name: nextName(
        project.objects.map((item) => item.name),
        baseName,
      ),
      type,
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scale:
        type === "handle"
          ? [1, 3, 1]
          : type === "humanoidRootPart"
            ? [2, 2, 1]
            : [4, 4, 4],
      color: type === "humanoidRootPart" ? "#7F8FA6" : "#30254D",
      anchored: true,
      visible: true,
      transparency: 0,
      material: "plastic",
      canCollide: true,
      castShadow: true,
      modelId: null,
      attributes:
        type === "humanoidRootPart"
          ? { Health: 100, MaxHealth: 100 }
          : {},
      tags: type === "humanoidRootPart" ? ["Humanoid"] : [],
    };
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, next],
    }));
    setSelection({ type: "world", id: next.id });
    setSelectedPartIds([next.id]);
    setWorkspace("scene");
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
    });
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

  function transformSelection(
    axis: 0 | 1 | 2,
    direction: 1 | -1,
  ) {
    if (activeWorldIds.length === 0 || tool === "select") return;
    const ids = new Set(activeWorldIds);
    const selected = project.objects.filter((object) => ids.has(object.id));
    const center = selected.reduce(
      (value, object) => [
        value[0] + object.position[0] / selected.length,
        value[1] + object.position[1] / selected.length,
        value[2] + object.position[2] / selected.length,
      ],
      [0, 0, 0],
    );
    const moveStep = Math.max(0.01, gridSnap) * direction;
    const angle = (Math.max(1, angleSnap) * Math.PI * direction) / 180;
    const scaleFactor = direction > 0 ? 1.1 : 0.9;
    updateProject((current) => ({
      ...current,
      objects: current.objects.map((object) => {
        if (!ids.has(object.id)) return object;
        if (tool === "move") {
          const position = [...object.position] as [number, number, number];
          position[axis] =
            Math.round((position[axis] + moveStep) / Math.max(0.01, gridSnap)) *
            Math.max(0.01, gridSnap);
          return { ...object, position };
        }
        if (tool === "rotate") {
          const rotation = [...object.rotation] as [number, number, number];
          rotation[axis] += angle;
          const relative = [
            object.position[0] - center[0],
            object.position[1] - center[1],
            object.position[2] - center[2],
          ];
          const position = [...object.position] as [number, number, number];
          const first = axis === 0 ? 1 : 0;
          const second = axis === 2 ? 1 : 2;
          position[first] =
            center[first] +
            relative[first] * Math.cos(angle) -
            relative[second] * Math.sin(angle);
          position[second] =
            center[second] +
            relative[first] * Math.sin(angle) +
            relative[second] * Math.cos(angle);
          return { ...object, rotation, position };
        }
        const scale = [...object.scale] as [number, number, number];
        scale[axis] = Math.max(0.1, scale[axis] * scaleFactor);
        const position = [...object.position] as [number, number, number];
        position[axis] = center[axis] + (position[axis] - center[axis]) * scaleFactor;
        return { ...object, scale, position };
      }),
    }));
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

  function addScript(kind: StudioScript["kind"]) {
    const options = scriptParentOptions(kind, project.gui);
    const selectedParent =
      selection?.type === "service"
        ? selection.id
        : selection?.type === "gui"
          ? selection.id
          : null;
    const parent =
      options.some((option) => option.value === selectedParent)
        ? selectedParent!
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
      source: starterSource(project.language, kind),
    };
    updateProject((current) => ({
      ...current,
      scripts: [...current.scripts, next],
    }));
    setSelection({ type: "script", id: next.id });
    setWorkspace("script");
  }

  function addGui(type: StudioGuiObject["type"]) {
    let parentId: string | null = null;
    let extra: StudioGuiObject[] = [];
    if (type !== "screenGui") {
      if (
        selectedGui &&
        (selectedGui.type === "screenGui" || selectedGui.type === "frame")
      ) {
        parentId = selectedGui.id;
      } else {
        let screen = project.gui.find((item) => item.type === "screenGui");
        if (!screen) {
          screen = guiDefault("screenGui", null, project.gui);
          extra = [screen];
        }
        parentId = screen.id;
      }
    }
    const next = guiDefault(type, parentId, [...project.gui, ...extra]);
    updateProject((current) => ({
      ...current,
      gui: [...current.gui, ...extra, next],
    }));
    setSelection({ type: "gui", id: next.id });
    setWorkspace("ui");
  }

  function removeSelected() {
    if (selectedModel) {
      updateProject((current) => ({
        ...current,
        objects: current.objects.filter(
          (object) => object.modelId !== selectedModel.id,
        ),
        models: current.models.filter((model) => model.id !== selectedModel.id),
      }));
    } else if (selectedRemote) {
      updateProject((current) => ({
        ...current,
        remotes: current.remotes.filter((remote) => remote.id !== selectedRemote.id),
      }));
    } else if (selectedWorld) {
      if (["baseplate", "spawn"].includes(selectedWorld.type)) return;
      const ids = new Set(activeWorldIds);
      updateProject((current) => ({
        ...current,
        objects: current.objects.filter(
          (item) => ["baseplate", "spawn"].includes(item.type) || !ids.has(item.id),
        ),
      }));
    } else if (selectedScript) {
      updateProject((current) => ({
        ...current,
        scripts: current.scripts.filter((item) => item.id !== selectedScript.id),
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

  async function publish() {
    const allDiagnostics = project.scripts.flatMap((script) =>
      analyzePolyScript(script, project as PolyProject),
    );
    if (allDiagnostics.some((diagnostic) => diagnostic.severity === "error")) {
      setMessage("Fix script errors before publishing.");
      return;
    }
    setPublishing(true);
    setMessage("Publishing...");
    try {
      const result = await window.polyStudio.publishProject(project);
      setDirty(false);
      setMessage(
        `Published ${result.game.title} version ${result.game.version}`,
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
        <button className="editor-brand" onClick={() => void onExit()}>
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
          <button title="Snap selection to grid" disabled={activeWorldIds.length === 0} onClick={snapSelection}><Grid3X3 size={16} /></button>
        </div>
        <div className="insert-group">
          <button onClick={() => addPart()}><Plus size={14} /> Part</button>
          <button onClick={() => addPart("tool")}><Package size={14} /> Tool</button>
          <button onClick={() => addPart("handle")}><Move3D size={14} /> Handle</button>
          <button onClick={() => addPart("humanoidRootPart")}><UserRound size={14} /> HumanoidRoot</button>
          <button onClick={createModel} disabled={activeWorldIds.length < 2}><Boxes size={14} /> Model</button>
          <button onClick={() => void importModel()}><Upload size={14} /> PMXL</button>
          <button onClick={() => addScript("script")}><FileCode2 size={14} /> Script</button>
          <button onClick={() => addScript("localScript")}><Code2 size={14} /> LocalScript</button>
          <button onClick={() => addScript("moduleScript")}><Package size={14} /> Module</button>
          <button onClick={() => addRemote("remoteEvent")}><Cable size={14} /> RemoteEvent</button>
          <button onClick={() => addRemote("remoteFunction")}><Cable size={14} /> RemoteFunction</button>
          <button onClick={() => addGui("screenGui")}><Monitor size={14} /> ScreenGui</button>
          <button onClick={() => addGui("frame")}><Square size={14} /> Frame</button>
          <button onClick={() => addGui("textLabel")}><Type size={14} /> Text</button>
          <button onClick={() => addGui("textButton")}><LayoutPanelTop size={14} /> Button</button>
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
        </div>
        <button className="save-button" onClick={() => void save()} disabled={saving}>
          <Save size={16} /> {saving ? "Saving" : "Save"}
        </button>
        <button
          className="publish-button"
          onClick={() => void publish()}
          disabled={publishing || project.name.trim().length === 0}
        >
          <Upload size={16} />
          {publishing ? "Publishing" : "Publish"}
        </button>
        <button className="play-button" onClick={() => void play()} disabled={playing}>
          <Play size={16} fill="currentColor" />
          {playing ? "Opening" : "Play"}
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
        />

        <section className="editor-center">
          {workspace === "script" && selectedScript ? (
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
              onTransform={transformSelection}
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
          onDelete={removeSelected}
          onUngroup={ungroupModel}
          onExportModel={() => void exportSelectedModel()}
        />
      </div>

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

function Explorer({
  project,
  selection,
  selectedPartIds,
  onSelectWorld,
  onSelectModel,
  onSelect,
}: {
  project: StudioProject;
  selection: Selection;
  selectedPartIds: string[];
  onSelectWorld: (id: string, additive?: boolean) => void;
  onSelectModel: (id: string) => void;
  onSelect: (selection: Exclude<Selection, null>) => void;
}) {
  const scriptsAt = (parent: string) =>
    project.scripts.filter((script) => script.parent === parent);
  const guiRoots = project.gui.filter((gui) => gui.parentId === null);
  const stores = Object.keys(project.dataStores).sort();
  const looseObjects = project.objects.filter((object) => !object.modelId);

  return (
    <aside className="explorer-panel">
      <PanelHeading icon={<Folder size={15} />} title="Explorer" />
      <div className="tree">
        <TreeRoot
          icon={<Grid3X3 size={14} />}
          label="Workspace"
          active={selection?.type === "service" && selection.id === "Workspace"}
          onSelect={() => onSelect({ type: "service", id: "Workspace" })}
        >
          {project.models.map((model) => (
            <ModelTree
              key={model.id}
              model={model}
              project={project}
              active={selection?.type === "model" && selection.id === model.id}
              onSelectModel={() => onSelectModel(model.id)}
              onSelectWorld={onSelectWorld}
            />
          ))}
          {looseObjects.map((object) => (
            <TreeItem
              key={object.id}
              active={selectedPartIds.includes(object.id)}
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
              onClick={(event) => onSelectWorld(object.id, event.ctrlKey || event.metaKey)}
            />
          ))}
          {scriptsAt("Workspace").map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Server size={14} />}
          label="ServerScriptService"
          active={selection?.type === "service" && selection.id === "ServerScriptService"}
          onSelect={() => onSelect({ type: "service", id: "ServerScriptService" })}
        >
          {scriptsAt("ServerScriptService").map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Package size={14} />}
          label="ReplicatedStorage"
          active={selection?.type === "service" && selection.id === "ReplicatedStorage"}
          onSelect={() => onSelect({ type: "service", id: "ReplicatedStorage" })}
        >
          {scriptsAt("ReplicatedStorage").map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
          {project.remotes.map((remote) => (
            <TreeItem
              key={remote.id}
              active={selection?.type === "remote" && selection.id === remote.id}
              icon={<Cable size={14} />}
              label={remote.name}
              onClick={() => onSelect({ type: "remote", id: remote.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Folder size={14} />}
          label="ServerStorage"
          active={selection?.type === "service" && selection.id === "ServerStorage"}
          onSelect={() => onSelect({ type: "service", id: "ServerStorage" })}
        >
          {scriptsAt("ServerStorage").map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<UserRound size={14} />}
          label="Players"
          active={selection?.type === "service" && selection.id === "Players"}
          onSelect={() => onSelect({ type: "service", id: "Players" })}
        >
          <TreeItem
            active={selection?.type === "player"}
            icon={<UserRound size={14} />}
            label="LocalPlayer"
            onClick={() => onSelect({ type: "player", id: "LocalPlayer" })}
          />
        </TreeRoot>
        <TreeRoot
          icon={<UserRound size={14} />}
          label="StarterPlayer"
          active={selection?.type === "service" && selection.id === "StarterPlayerScripts"}
          onSelect={() => onSelect({ type: "service", id: "StarterPlayerScripts" })}
        >
          <div className="tree-nested-root">
            <Folder size={13} />
            <strong>StarterPlayerScripts</strong>
          </div>
          {scriptsAt("StarterPlayerScripts").map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              nested
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Monitor size={14} />}
          label="StarterGui"
          active={selection?.type === "service" && selection.id === "StarterGui"}
          onSelect={() => onSelect({ type: "service", id: "StarterGui" })}
        >
          {scriptsAt("StarterGui").map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
          {guiRoots.map((gui) => (
            <GuiTree
              key={gui.id}
              gui={gui}
              project={project}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </TreeRoot>
        <TreeRoot
          icon={<Database size={14} />}
          label="DataStoreService"
          active={selection?.type === "service" && selection.id === "DataStoreService"}
          onSelect={() => onSelect({ type: "service", id: "DataStoreService" })}
        >
          {stores.map((store) => (
            <TreeItem
              key={store}
              active={false}
              icon={<Database size={13} />}
              label={store}
              onClick={() => onSelect({ type: "service", id: "DataStoreService" })}
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
  children,
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="tree-service">
      <div className={active ? "tree-root active" : "tree-root"}>
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
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  nested?: boolean;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`${active ? "tree-item active" : "tree-item"}${nested ? " nested" : ""}`}
      onClick={onClick}
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
  active,
  onSelectModel,
  onSelectWorld,
}: {
  model: StudioModel;
  project: StudioProject;
  active: boolean;
  onSelectModel: () => void;
  onSelectWorld: (id: string, additive?: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const parts = project.objects.filter((object) => object.modelId === model.id);
  return (
    <div className="model-tree">
      <div className={active ? "tree-root active" : "tree-root"}>
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
          <TreeItem
            key={part.id}
            active={active}
            nested
            icon={<Box size={13} />}
            label={part.name}
            onClick={() => onSelectWorld(part.id)}
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
}: {
  script: StudioScript;
  active: boolean;
  nested?: boolean;
  onClick: () => void;
}) {
  return (
    <TreeItem
      active={active}
      nested={nested}
      icon={<FileCode2 size={14} />}
      label={script.name}
      onClick={onClick}
    />
  );
}

function GuiTree({
  gui,
  project,
  selection,
  onSelect,
  depth = 0,
}: {
  gui: StudioGuiObject;
  project: StudioProject;
  selection: Selection;
  onSelect: (selection: Exclude<Selection, null>) => void;
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
      />
      {children.map((child) => (
        <GuiTree
          key={child.id}
          gui={child}
          project={project}
          selection={selection}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
      {scripts.map((script) => (
        <ScriptTreeItem
          key={script.id}
          script={script}
          nested
          active={selection?.type === "script" && selection.id === script.id}
          onClick={() => onSelect({ type: "script", id: script.id })}
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

function CameraControls() {
  const { camera, gl } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 4;
    controls.maxDistance = 80;
    let frameId = requestAnimationFrame(function frame() {
      controls.update();
      frameId = requestAnimationFrame(frame);
    });
    return () => {
      cancelAnimationFrame(frameId);
      controls.dispose();
    };
  }, [camera, gl]);
  return null;
}

function SceneViewport({
  objects,
  gui,
  selectedWorldIds,
  selectedGuiId,
  showGui,
  tool,
  onTransform,
  onSelectWorld,
  onSelectGui,
}: {
  objects: StudioObject[];
  gui: StudioGuiObject[];
  selectedWorldIds: string[];
  selectedGuiId: string | null;
  showGui: boolean;
  tool: StudioTool;
  onTransform: (axis: 0 | 1 | 2, direction: 1 | -1) => void;
  onSelectWorld: (id: string | null, additive?: boolean) => void;
  onSelectGui: (id: string | null) => void;
}) {
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
        onPointerMissed={() => onSelectWorld(null)}
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
            <meshStandardMaterial
              color={object.color}
              transparent={object.transparency > 0}
              opacity={1 - object.transparency}
              roughness={
                object.material === "metal"
                  ? 0.24
                  : object.material === "neon"
                    ? 0.35
                    : object.material === "wood"
                      ? 0.9
                      : 0.7
              }
              metalness={object.material === "metal" ? 0.82 : 0}
              emissive={selectedWorldIds.includes(object.id) ? "#2B174D" : "#000000"}
              emissiveIntensity={
                object.material === "neon"
                  ? 0.9
                  : selectedWorldIds.includes(object.id)
                    ? 0.75
                    : 0
              }
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
          <TransformGizmo
            position={center}
            tool={tool}
            onTransform={onTransform}
          />
        )}
        <CameraControls />
      </Canvas>
      {showGui && (
        <GuiPreview
          objects={gui}
          selectedId={selectedGuiId}
          onSelect={onSelectGui}
        />
      )}
      <div className="viewport-badge">{showGui ? "UI editor" : "Perspective"}</div>
      <div className="viewport-help">Right drag to orbit | Wheel to zoom</div>
    </div>
  );
}

function TransformGizmo({
  position,
  tool,
  onTransform,
}: {
  position: [number, number, number];
  tool: Exclude<StudioTool, "select">;
  onTransform: (axis: 0 | 1 | 2, direction: 1 | -1) => void;
}) {
  const axes = [
    { axis: 0 as const, color: "#ef5a67", rotation: [0, 0, -Math.PI / 2] },
    { axis: 1 as const, color: "#62c477", rotation: [0, 0, 0] },
    { axis: 2 as const, color: "#5d8fff", rotation: [Math.PI / 2, 0, 0] },
  ];
  return (
    <group position={position}>
      {axes.map(({ axis, color, rotation }) => {
        const positive = [0, 0, 0] as [number, number, number];
        const negative = [0, 0, 0] as [number, number, number];
        positive[axis] = 2;
        negative[axis] = -2;
        return (
          <group key={axis}>
            <mesh rotation={rotation as [number, number, number]}>
              <cylinderGeometry args={[0.035, 0.035, 4, 10]} />
              <meshBasicMaterial color={color} depthTest={false} />
            </mesh>
            {([
              [positive, 1],
              [negative, -1],
            ] as const).map(([handlePosition, direction]) => (
              <mesh
                key={direction}
                position={handlePosition}
                onClick={(event) => {
                  event.stopPropagation();
                  onTransform(axis, direction);
                }}
              >
                {tool === "rotate" ? (
                  <torusGeometry args={[0.22, 0.07, 8, 20]} />
                ) : (
                  <boxGeometry args={[0.28, 0.28, 0.28]} />
                )}
                <meshBasicMaterial color={color} depthTest={false} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function GuiPreview({
  objects,
  selectedId,
  onSelect,
}: {
  objects: StudioGuiObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
}: {
  object: StudioGuiObject;
  objects: StudioGuiObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
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
          />
        ))}
      </>
    );
  }
  return (
    <div
      className={`studio-gui-object studio-gui-${object.type}${selectedId === object.id ? " selected" : ""}`}
      style={{
        left: `${object.position[0] * 100}%`,
        top: `${object.position[1] * 100}%`,
        width: `${object.size[0] * 100}%`,
        height: `${object.size[1] * 100}%`,
        backgroundColor: object.backgroundColor,
        opacity: 1 - object.backgroundTransparency,
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
    >
      {object.type === "textLabel" || object.type === "textButton"
        ? object.text
        : null}
      {children.map((child) => (
        <GuiPreviewNode
          key={child.id}
          object={child}
          objects={objects}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ))}
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
            <VectorField label="Rotation" value={world.rotation} onChange={(rotation) => onWorldChange({ rotation })} />
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
            <NumberField label="Transparency" value={world.transparency} minimum={0} maximum={1} step={0.05} onChange={(transparency) => onWorldChange({ transparency })} />
            <ToggleField label="Anchored" value={world.anchored} onChange={(anchored) => onWorldChange({ anchored })} />
            <ToggleField label="CanCollide" value={world.canCollide} onChange={(canCollide) => onWorldChange({ canCollide })} />
            <ToggleField label="CastShadow" value={world.castShadow} onChange={(castShadow) => onWorldChange({ castShadow })} />
            <ToggleField label="Visible" value={world.visible !== false} onChange={(visible) => onWorldChange({ visible })} />
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
                <NumberField label="Rotation" value={gui.rotation} minimum={-360} maximum={360} step={1} onChange={(rotation) => onGuiChange({ rotation })} />
                <NumberField label="ZIndex" value={gui.zIndex} minimum={0} maximum={1000} step={1} onChange={(zIndex) => onGuiChange({ zIndex })} />
              </PropertySection>
              <PropertySection title="Appearance">
                <ColorField label="Background" value={gui.backgroundColor} onChange={(backgroundColor) => onGuiChange({ backgroundColor })} />
                <NumberField label="Transparency" value={gui.backgroundTransparency} minimum={0} maximum={1} step={0.05} onChange={(backgroundTransparency) => onGuiChange({ backgroundTransparency })} />
                <NumberField label="Corner radius" value={gui.borderRadius} minimum={0} maximum={100} step={1} onChange={(borderRadius) => onGuiChange({ borderRadius })} />
                {(gui.type === "textLabel" || gui.type === "textButton") && (
                  <>
                    <TextField label="Text" value={gui.text} onChange={(text) => onGuiChange({ text })} />
                    <ColorField label="Text color" value={gui.textColor} onChange={(textColor) => onGuiChange({ textColor })} />
                    <NumberField label="Text size" value={gui.textSize} minimum={1} maximum={200} step={1} onChange={(textSize) => onGuiChange({ textSize })} />
                  </>
                )}
              </PropertySection>
            </>
          )}
          <ToggleField label="Visible" value={gui.visible} onChange={(visible) => onGuiChange({ visible })} />
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
              options={scriptParentOptions(script.kind, project.gui)}
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
          </PropertySection>
          <PropertySection title="Camera">
            <NumberField label="Field of view" value={project.playerSettings.cameraFieldOfView} minimum={20} maximum={120} step={1} onChange={(cameraFieldOfView) => onPlayerChange({ cameraFieldOfView })} />
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
  onChange,
}: {
  label: string;
  value: [number, number, number];
  minimum?: number;
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
              step="0.1"
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
