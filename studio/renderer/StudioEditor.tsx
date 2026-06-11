import { Canvas, useThree } from "@react-three/fiber";
import {
  Box,
  ChevronDown,
  Code2,
  FileCode2,
  Folder,
  FolderOpen,
  Grid3X3,
  LayoutPanelTop,
  Monitor,
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
  UserRound,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
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
  | { type: "gui"; id: string }
  | { type: "script"; id: string }
  | { type: "player"; id: "LocalPlayer" }
  | null;

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
  };
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
  const [workspace, setWorkspace] = useState<"scene" | "script" | "ui">("scene");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState("Ready");
  const [diagnostics, setDiagnostics] = useState<
    Record<string, PolyDiagnostic[]>
  >({});

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  function updateProject(updater: (current: StudioProject) => StudioProject) {
    setProject(updater);
    setDirty(true);
    setMessage("Unsaved changes");
  }

  function addPart() {
    const next: StudioObject = {
      id: crypto.randomUUID(),
      name: nextName(
        project.objects.map((item) => item.name),
        "Part",
      ),
      type: "part",
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scale: [4, 4, 4],
      color: "#30254D",
      anchored: true,
      visible: true,
    };
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, next],
    }));
    setSelection({ type: "world", id: next.id });
    setWorkspace("scene");
  }

  function addScript(kind: StudioScript["kind"]) {
    const parent =
      kind === "script"
        ? "ServerScriptService"
        : selection?.type === "gui"
          ? selection.id
          : "StarterPlayerScripts";
    const next: StudioScript = {
      id: crypto.randomUUID(),
      name: nextName(
        project.scripts.map((item) => item.name),
        kind === "script" ? "Script" : "LocalScript",
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
    if (selectedWorld) {
      if (selectedWorld.type !== "part") return;
      updateProject((current) => ({
        ...current,
        objects: current.objects.filter((item) => item.id !== selectedWorld.id),
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

  return (
    <main className="studio-editor">
      <header className="editor-titlebar">
        <button className="editor-brand" onClick={() => void onExit()}>
          <img src={logo} alt="" />
          <span>Poly Studio</span>
        </button>
        <div className="project-title">
          <strong>{project.name}</strong>
          <span>{dirty ? "Unsaved" : "Saved locally"}</span>
        </div>
        <div className="editor-account">
          <UserRound size={15} />
          {auth.user.displayName}
        </div>
      </header>

      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button title="Select" className="active">
            <MousePointer2 size={17} />
          </button>
          <button title="Move"><Move3D size={17} /></button>
          <button title="Rotate"><RotateCw size={17} /></button>
          <button title="Scale"><Settings2 size={17} /></button>
        </div>
        <div className="toolbar-group">
          <button title="Undo" disabled><Undo2 size={17} /></button>
          <button title="Redo" disabled><Redo2 size={17} /></button>
        </div>
        <div className="insert-group">
          <button onClick={addPart}><Plus size={14} /> Part</button>
          <button onClick={() => addScript("script")}><FileCode2 size={14} /> Script</button>
          <button onClick={() => addScript("localScript")}><Code2 size={14} /> LocalScript</button>
          <button onClick={() => addGui("screenGui")}><Monitor size={14} /> ScreenGui</button>
          <button onClick={() => addGui("frame")}><Square size={14} /> Frame</button>
          <button onClick={() => addGui("textLabel")}><Type size={14} /> Text</button>
          <button onClick={() => addGui("textButton")}><LayoutPanelTop size={14} /> Button</button>
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
        <button className="play-button" onClick={() => void play()} disabled={playing}>
          <Play size={16} fill="currentColor" />
          {playing ? "Opening" : "Play"}
        </button>
      </div>

      <div className="editor-workspace">
        <Explorer
          project={project}
          selection={selection}
          onSelect={(next) => {
            setSelection(next);
            if (next.type === "script") setWorkspace("script");
            else if (next.type === "gui") setWorkspace("ui");
            else setWorkspace("scene");
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
              selectedWorldId={selectedWorld?.id ?? null}
              selectedGuiId={selectedGui?.id ?? null}
              showGui={workspace === "ui"}
              onSelectWorld={(id) =>
                setSelection(id ? { type: "world", id } : null)
              }
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
            updateProject((current) => ({
              ...current,
              objects: current.objects.map((item) =>
                item.id === selectedWorld.id ? { ...item, ...patch } : item,
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
  onSelect,
}: {
  project: StudioProject;
  selection: Selection;
  onSelect: (selection: Exclude<Selection, null>) => void;
}) {
  const serverScripts = project.scripts.filter(
    (script) => script.parent === "ServerScriptService",
  );
  const playerScripts = project.scripts.filter(
    (script) => script.parent === "StarterPlayerScripts",
  );
  const guiRoots = project.gui.filter((gui) => gui.parentId === null);

  return (
    <aside className="explorer-panel">
      <PanelHeading icon={<Folder size={15} />} title="Explorer" />
      <div className="tree">
        <TreeRoot icon={<Grid3X3 size={14} />} label="Workspace">
          {project.objects.map((object) => (
            <TreeItem
              key={object.id}
              active={selection?.type === "world" && selection.id === object.id}
              icon={object.type === "part" ? <Box size={14} /> : <Grid3X3 size={14} />}
              label={object.name}
              onClick={() => onSelect({ type: "world", id: object.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot icon={<Server size={14} />} label="ServerScriptService">
          {serverScripts.map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot icon={<UserRound size={14} />} label="Players">
          <TreeItem
            active={selection?.type === "player"}
            icon={<UserRound size={14} />}
            label="LocalPlayer"
            onClick={() => onSelect({ type: "player", id: "LocalPlayer" })}
          />
        </TreeRoot>
        <TreeRoot icon={<UserRound size={14} />} label="StarterPlayer">
          <div className="tree-nested-root">
            <ChevronDown size={12} />
            <Folder size={13} />
            <strong>StarterPlayerScripts</strong>
          </div>
          {playerScripts.map((script) => (
            <ScriptTreeItem
              key={script.id}
              script={script}
              nested
              active={selection?.type === "script" && selection.id === script.id}
              onClick={() => onSelect({ type: "script", id: script.id })}
            />
          ))}
        </TreeRoot>
        <TreeRoot icon={<Monitor size={14} />} label="StarterGui">
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
      </div>
    </aside>
  );
}

function TreeRoot({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="tree-service">
      <div className="tree-root">
        <ChevronDown size={13} />
        {icon}
        <strong>{label}</strong>
      </div>
      {children}
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
  onClick: () => void;
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
  selectedWorldId,
  selectedGuiId,
  showGui,
  onSelectWorld,
  onSelectGui,
}: {
  objects: StudioObject[];
  gui: StudioGuiObject[];
  selectedWorldId: string | null;
  selectedGuiId: string | null;
  showGui: boolean;
  onSelectWorld: (id: string | null) => void;
  onSelectGui: (id: string | null) => void;
}) {
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
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onSelectWorld(object.id);
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color={object.color}
              roughness={0.7}
              emissive={selectedWorldId === object.id ? "#2B174D" : "#000000"}
              emissiveIntensity={selectedWorldId === object.id ? 0.75 : 0}
            />
            {selectedWorldId === object.id && (
              <mesh scale={1.012}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#B78CFF" wireframe />
              </mesh>
            )}
          </mesh>
        ))}
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
  onGuiChange,
  onScriptChange,
  onPlayerChange,
  onDelete,
}: {
  project: StudioProject;
  selection: Selection;
  onWorldChange: (patch: Partial<StudioObject>) => void;
  onGuiChange: (patch: Partial<StudioGuiObject>) => void;
  onScriptChange: (patch: Partial<StudioScript>) => void;
  onPlayerChange: (patch: Partial<StudioProject["playerSettings"]>) => void;
  onDelete: () => void;
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
            <ToggleField label="Anchored" value={world.anchored} onChange={(anchored) => onWorldChange({ anchored })} />
            <ToggleField label="Visible" value={world.visible !== false} onChange={(visible) => onWorldChange({ visible })} />
          </PropertySection>
          {world.type === "part" && <DeleteButton onClick={onDelete} />}
        </div>
      ) : gui ? (
        <div className="properties-content">
          <NameField value={gui.name} onChange={(name) => onGuiChange({ name })} />
          {gui.type !== "screenGui" && (
            <>
              <PropertySection title="Layout">
                <Vector2Field label="Position (scale)" value={gui.position} onChange={(position) => onGuiChange({ position })} />
                <Vector2Field label="Size (scale)" value={gui.size} minimum={0.01} onChange={(size) => onGuiChange({ size })} />
              </PropertySection>
              <PropertySection title="Appearance">
                <ColorField label="Background" value={gui.backgroundColor} onChange={(backgroundColor) => onGuiChange({ backgroundColor })} />
                <NumberField label="Transparency" value={gui.backgroundTransparency} minimum={0} maximum={1} step={0.05} onChange={(backgroundTransparency) => onGuiChange({ backgroundTransparency })} />
                {(gui.type === "textLabel" || gui.type === "textButton") && (
                  <>
                    <TextField label="Text" value={gui.text} onChange={(text) => onGuiChange({ text })} />
                    <ColorField label="Text color" value={gui.textColor} onChange={(textColor) => onGuiChange({ textColor })} />
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
            <ReadOnlyField label="Type" value={script.kind === "script" ? "Server Script" : "LocalScript"} />
            <ReadOnlyField label="Parent" value={script.parent} />
            <ReadOnlyField label="Language" value={languageName[project.language]} />
          </PropertySection>
          <DeleteButton onClick={onDelete} />
        </div>
      ) : selection.type === "player" ? (
        <div className="properties-content">
          <ReadOnlyField label="Name" value="LocalPlayer" />
          <PropertySection title="Character">
            <NumberField label="WalkSpeed" value={project.playerSettings.walkSpeed} minimum={1} maximum={500} step={1} onChange={(walkSpeed) => onPlayerChange({ walkSpeed })} />
            <NumberField label="JumpPower" value={project.playerSettings.jumpPower} minimum={1} maximum={500} step={0.5} onChange={(jumpPower) => onPlayerChange({ jumpPower })} />
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
  return (
    <div className="script-workspace">
      <header className="script-tabbar">
        <div className="script-tab active">
          <FileCode2 size={15} />
          {script.name}{languageExtension[project.language]}
          <small>{script.kind === "script" ? "Server" : "Client"}</small>
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
        <span>{script.kind === "script" ? "Server" : "Client"}</span>
        <span>UTF-8</span>
        <span>{script.source.split("\n").length} lines</span>
      </footer>
    </div>
  );
}
