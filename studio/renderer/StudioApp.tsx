import { Canvas, useThree } from "@react-three/fiber";
import {
  Box,
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  Cuboid,
  ExternalLink,
  FileCode2,
  Folder,
  FolderOpen,
  Grid3X3,
  LogOut,
  MousePointer2,
  Move3D,
  Play,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Search,
  Settings2,
  Trash2,
  Undo2,
  UserRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Color } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import logo from "../../assets/studio/poly-studio-logo-dark.png";

const languageInfo: Record<
  StudioLanguage,
  { name: string; label: string; extension: string; description: string }
> = {
  luau: {
    name: "Luau",
    label: "Recommended",
    extension: ".luau",
    description: "Fast to learn and designed for gameplay scripting.",
  },
  cpp: {
    name: "C++",
    label: "Native",
    extension: ".cpp",
    description: "Low-level control for advanced systems and performance.",
  },
  csharp: {
    name: "C#",
    label: ".NET",
    extension: ".cs",
    description: "Modern typed scripting with a familiar class model.",
  },
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export default function StudioApp() {
  const [ready, setReady] = useState(false);
  const [auth, setAuth] = useState<StudioAuth | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reloadProjects = useCallback(async () => {
    setProjects(await window.polyStudio.listProjects());
  }, []);

  useEffect(() => {
    void window.polyStudio.getAuth().then(async (next) => {
      setAuth(next);
      if (next) await reloadProjects();
      setReady(true);
    });
  }, [reloadProjects]);

  if (!ready) return <div className="studio-loading">Opening Poly Studio...</div>;
  if (!auth) {
    return (
      <LoginScreen
        error={error}
        onAuthenticated={async (next) => {
          setAuth(next);
          setError("");
          await reloadProjects();
        }}
        onError={setError}
      />
    );
  }

  if (project) {
    return (
      <Editor
        auth={auth}
        initialProject={project}
        onExit={async () => {
          setProject(null);
          await reloadProjects();
        }}
      />
    );
  }

  return (
    <Launcher
      auth={auth}
      projects={projects}
      creating={creating}
      error={error}
      onCreate={() => {
        setCreating(true);
        setError("");
      }}
      onCloseCreate={() => setCreating(false)}
      onOpen={async (id) => {
        setError("");
        try {
          setProject(await window.polyStudio.loadProject(id));
        } catch (openError) {
          setError(
            openError instanceof Error ? openError.message : "Could not open project.",
          );
        }
      }}
      onCreated={(next) => {
        setCreating(false);
        setProject(next);
      }}
      onError={setError}
      onLogout={async () => {
        await window.polyStudio.logout();
        setAuth(null);
        setProjects([]);
      }}
    />
  );
}

function LoginScreen({
  error,
  onAuthenticated,
  onError,
}: {
  error: string;
  onAuthenticated: (auth: StudioAuth) => void;
  onError: (message: string) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    onError("");
    try {
      onAuthenticated(await window.polyStudio.login(username, password));
    } catch (loginError) {
      onError(
        loginError instanceof Error ? loginError.message : "Could not sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="studio-login">
      <section className="studio-login-card">
        <img src={logo} alt="Poly Studio" />
        <div className="login-copy">
          <span>Game creation starts here</span>
          <h1>Build your world.</h1>
          <p>Sign in with your Polymons account to create and edit games.</p>
        </div>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={20}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {error && <div className="studio-error">{error}</div>}
          <button className="studio-primary" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in to Poly Studio"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => void window.polyStudio.openWebsite()}
        >
          Create a Polymons account
          <ExternalLink size={13} />
        </button>
      </section>
    </main>
  );
}

function Launcher({
  auth,
  projects,
  creating,
  error,
  onCreate,
  onCloseCreate,
  onOpen,
  onCreated,
  onError,
  onLogout,
}: {
  auth: StudioAuth;
  projects: ProjectSummary[];
  creating: boolean;
  error: string;
  onCreate: () => void;
  onCloseCreate: () => void;
  onOpen: (id: string) => void;
  onCreated: (project: StudioProject) => void;
  onError: (message: string) => void;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const visibleProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <main className="studio-launcher">
      <header className="launcher-header">
        <div className="studio-brand">
          <img src={logo} alt="" />
          <div>
            <strong>Poly Studio</strong>
            <span>Make something people want to play.</span>
          </div>
        </div>
        <div className="launcher-account">
          <UserRound size={17} />
          <div>
            <strong>{auth.user.displayName}</strong>
            <span>@{auth.user.username}</span>
          </div>
          <button onClick={onLogout} aria-label="Sign out">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <section className="launcher-content">
        <div className="launcher-heading">
          <div>
            <span className="studio-eyebrow">Your games</span>
            <h1>Projects</h1>
            <p>Create a new game or keep working on one you started.</p>
          </div>
          <button className="studio-primary" onClick={onCreate}>
            <Plus size={18} />
            New project
          </button>
        </div>

        <label className="project-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
          />
        </label>

        {error && <div className="studio-error launcher-error">{error}</div>}

        {visibleProjects.length > 0 ? (
          <div className="project-grid">
            {visibleProjects.map((item) => (
              <button
                className="project-card"
                key={item.id}
                onClick={() => onOpen(item.id)}
              >
                <div className="project-preview">
                  <span className="preview-grid" />
                  <span className="preview-part" />
                  <Play size={20} fill="currentColor" />
                </div>
                <div className="project-card-copy">
                  <span>{languageInfo[item.language].name}</span>
                  <h2>{item.name}</h2>
                  <p>Edited {formatDate(item.updatedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="projects-empty">
            <Cuboid size={38} />
            <h2>{query ? "No matching projects." : "Your first world is waiting."}</h2>
            <p>
              {query
                ? "Try a different search."
                : "Start with Baseplate, choose a scripting language, and build."}
            </p>
            {!query && (
              <button className="studio-primary" onClick={onCreate}>
                Create project
              </button>
            )}
          </div>
        )}
      </section>

      {creating && (
        <CreateProjectDialog
          onClose={onCloseCreate}
          onCreated={onCreated}
          onError={onError}
        />
      )}
    </main>
  );
}

function CreateProjectDialog({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: (project: StudioProject) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("My Game");
  const [language, setLanguage] = useState<StudioLanguage>("luau");
  const [creating, setCreating] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    onError("");
    try {
      onCreated(await window.polyStudio.createProject({ name, language }));
    } catch (createError) {
      onError(
        createError instanceof Error
          ? createError.message
          : "Could not create project.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="studio-modal-layer">
      <button className="studio-modal-backdrop" onClick={onClose} />
      <form className="create-project-dialog" onSubmit={submit}>
        <button type="button" className="dialog-close" onClick={onClose}>
          <X size={18} />
        </button>
        <span className="studio-eyebrow">New game</span>
        <h2>Create a project</h2>
        <p>Choose your scripting language now. You can add other languages later.</p>
        <label className="project-name-field">
          Project name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            autoFocus
            required
          />
        </label>
        <fieldset className="language-picker">
          <legend>What language are you scripting in?</legend>
          {(Object.keys(languageInfo) as StudioLanguage[]).map((id) => {
            const item = languageInfo[id];
            return (
              <label
                className={language === id ? "language-option active" : "language-option"}
                key={id}
              >
                <input
                  type="radio"
                  name="language"
                  value={id}
                  checked={language === id}
                  onChange={() => setLanguage(id)}
                />
                <Braces size={22} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.label}</small>
                </span>
                <p>{item.description}</p>
              </label>
            );
          })}
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="studio-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="studio-primary" disabled={creating}>
            {creating ? "Creating..." : "Create Baseplate"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Editor({
  auth,
  initialProject,
  onExit,
}: {
  auth: StudioAuth;
  initialProject: StudioProject;
  onExit: () => void;
}) {
  const [project, setProject] = useState(initialProject);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialProject.objects[2]?.id ?? null,
  );
  const [workspace, setWorkspace] = useState<"scene" | "script">("scene");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("Ready");

  const selected = project.objects.find((object) => object.id === selectedId) ?? null;

  const save = useCallback(async () => {
    setSaving(true);
    setMessage("Saving...");
    try {
      const next = await window.polyStudio.saveProject(project);
      setProject(next);
      setDirty(false);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
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

  function updateSelected(patch: Partial<StudioObject>) {
    if (!selectedId) return;
    updateProject((current) => ({
      ...current,
      objects: current.objects.map((object) =>
        object.id === selectedId ? { ...object, ...patch } : object,
      ),
    }));
  }

  function addPart() {
    const next: StudioObject = {
      id: crypto.randomUUID(),
      name: `Part ${project.objects.filter((item) => item.type === "part").length + 1}`,
      type: "part",
      position: [0, 2, 0],
      rotation: [0, 0, 0],
      scale: [4, 4, 4],
      color: "#30254d",
      anchored: true,
    };
    updateProject((current) => ({
      ...current,
      objects: [...current.objects, next],
    }));
    setSelectedId(next.id);
    setWorkspace("scene");
  }

  function removeSelected() {
    if (!selected || selected.type === "baseplate" || selected.type === "spawn") return;
    updateProject((current) => ({
      ...current,
      objects: current.objects.filter((object) => object.id !== selected.id),
    }));
    setSelectedId(null);
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
          <button title="Select" className="active"><MousePointer2 size={17} /></button>
          <button title="Move"><Move3D size={17} /></button>
          <button title="Rotate"><RotateCw size={17} /></button>
          <button title="Scale"><Settings2 size={17} /></button>
        </div>
        <div className="toolbar-group">
          <button title="Undo" disabled><Undo2 size={17} /></button>
          <button title="Redo" disabled><Redo2 size={17} /></button>
        </div>
        <button className="toolbar-add" onClick={addPart}>
          <Plus size={16} />
          Part
        </button>
        <div className="workspace-tabs">
          <button
            className={workspace === "scene" ? "active" : ""}
            onClick={() => setWorkspace("scene")}
          >
            <Grid3X3 size={16} />
            Scene
          </button>
          <button
            className={workspace === "script" ? "active" : ""}
            onClick={() => setWorkspace("script")}
          >
            <Code2 size={16} />
            Script
          </button>
        </div>
        <button
          className="save-button"
          onClick={() => void save()}
          disabled={saving}
        >
          <Save size={16} />
          {saving ? "Saving" : "Save"}
        </button>
        <button className="play-button" onClick={() => setMessage("Play mode will use Polymons Player.")}>
          <Play size={16} fill="currentColor" />
          Play
        </button>
      </div>

      <div className="editor-workspace">
        <Explorer
          project={project}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setWorkspace("scene");
          }}
          onScript={() => setWorkspace("script")}
        />

        <section className="editor-center">
          {workspace === "scene" ? (
            <SceneViewport
              objects={project.objects}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <ScriptEditor
              project={project}
              onChange={(script) =>
                updateProject((current) => ({ ...current, script }))
              }
            />
          )}
        </section>

        <Properties
          selected={selected}
          onChange={updateSelected}
          onDelete={removeSelected}
        />
      </div>

      <footer className="editor-statusbar">
        <span>{message}</span>
        <span>{languageInfo[project.language].name}</span>
        <button onClick={() => void window.polyStudio.revealProject(project.id)}>
          <FolderOpen size={13} />
          Open project folder
        </button>
      </footer>
    </main>
  );
}

function Explorer({
  project,
  selectedId,
  onSelect,
  onScript,
}: {
  project: StudioProject;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onScript: () => void;
}) {
  return (
    <aside className="explorer-panel">
      <PanelHeading icon={<Folder size={15} />} title="Explorer" />
      <div className="tree">
        <div className="tree-root">
          <ChevronDown size={13} />
          <Grid3X3 size={14} />
          <strong>Workspace</strong>
        </div>
        {project.objects.map((object) => (
          <button
            key={object.id}
            className={selectedId === object.id ? "tree-item active" : "tree-item"}
            onClick={() => onSelect(object.id)}
          >
            <ChevronRight size={12} />
            {object.type === "part" ? <Box size={14} /> : <Grid3X3 size={14} />}
            <span>{object.name}</span>
          </button>
        ))}
        <div className="tree-root tree-scripts">
          <ChevronDown size={13} />
          <Folder size={14} />
          <strong>Scripts</strong>
        </div>
        <button className="tree-item" onClick={onScript}>
          <span className="tree-spacer" />
          <FileCode2 size={14} />
          <span>Main{languageInfo[project.language].extension}</span>
        </button>
      </div>
    </aside>
  );
}

function PanelHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
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
    let frameId = 0;
    const frame = () => {
      controls.update();
      frameId = requestAnimationFrame(frame);
    };
    frameId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(frameId);
      controls.dispose();
    };
  }, [camera, gl]);
  return null;
}

function SceneViewport({
  objects,
  selectedId,
  onSelect,
}: {
  objects: StudioObject[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="scene-viewport">
      <Canvas
        shadows
        camera={{ position: [16, 13, 18], fov: 48, near: 0.1, far: 300 }}
        onPointerMissed={() => onSelect(null)}
      >
        <color attach="background" args={["#0b0b10"]} />
        <fog attach="fog" args={["#0b0b10", 45, 120]} />
        <ambientLight intensity={1.2} color="#b9b3d1" />
        <directionalLight
          position={[-12, 20, 8]}
          intensity={2.5}
          color="#f1ecff"
          castShadow
        />
        <gridHelper
          args={[120, 120, new Color("#3b3150"), new Color("#201d29")]}
          position={[0, 0.015, 0]}
        />
        {objects.map((object) => (
          <mesh
            key={object.id}
            position={object.position}
            rotation={object.rotation}
            scale={object.scale}
            castShadow
            receiveShadow
            onClick={(event) => {
              event.stopPropagation();
              onSelect(object.id);
            }}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial
              color={object.color}
              roughness={0.7}
              emissive={selectedId === object.id ? "#2b174d" : "#000000"}
              emissiveIntensity={selectedId === object.id ? 0.75 : 0}
            />
            {selectedId === object.id && (
              <mesh scale={1.012}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#b78cff" wireframe />
              </mesh>
            )}
          </mesh>
        ))}
        <CameraControls />
      </Canvas>
      <div className="viewport-badge">Perspective</div>
      <div className="viewport-help">Right drag to orbit | Wheel to zoom</div>
    </div>
  );
}

function Properties({
  selected,
  onChange,
  onDelete,
}: {
  selected: StudioObject | null;
  onChange: (patch: Partial<StudioObject>) => void;
  onDelete: () => void;
}) {
  return (
    <aside className="properties-panel">
      <PanelHeading icon={<Settings2 size={15} />} title="Properties" />
      {!selected ? (
        <div className="nothing-selected">
          <MousePointer2 size={26} />
          <p>Select an object to edit it.</p>
        </div>
      ) : (
        <div className="properties-content">
          <label className="property-name">
            Name
            <input
              value={selected.name}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </label>
          <PropertySection title="Transform">
            <VectorField
              label="Position"
              value={selected.position}
              onChange={(position) => onChange({ position })}
            />
            <VectorField
              label="Rotation"
              value={selected.rotation}
              onChange={(rotation) => onChange({ rotation })}
            />
            <VectorField
              label="Scale"
              value={selected.scale}
              minimum={0.1}
              onChange={(scale) => onChange({ scale })}
            />
          </PropertySection>
          <PropertySection title="Appearance">
            <label className="color-field">
              Color
              <span>
                <input
                  type="color"
                  value={selected.color}
                  onChange={(event) => onChange({ color: event.target.value })}
                />
                <code>{selected.color.toUpperCase()}</code>
              </span>
            </label>
            <label className="toggle-field">
              Anchored
              <input
                type="checkbox"
                checked={selected.anchored}
                onChange={(event) => onChange({ anchored: event.target.checked })}
              />
            </label>
          </PropertySection>
          {selected.type === "part" && (
            <button className="delete-object" onClick={onDelete}>
              <Trash2 size={15} />
              Delete object
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function PropertySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="property-section">
      <h3>{title}</h3>
      {children}
    </section>
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

function ScriptEditor({
  project,
  onChange,
}: {
  project: StudioProject;
  onChange: (value: string) => void;
}) {
  const lines = useMemo(
    () => Array.from({ length: Math.max(1, project.script.split("\n").length) }),
    [project.script],
  );
  return (
    <div className="script-workspace">
      <header className="script-tabbar">
        <div className="script-tab active">
          <FileCode2 size={15} />
          Main{languageInfo[project.language].extension}
          <span>x</span>
        </div>
      </header>
      <div className="code-editor">
        <div className="line-numbers" aria-hidden="true">
          {lines.map((_, index) => (
            <span key={index}>{index + 1}</span>
          ))}
        </div>
        <textarea
          value={project.script}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          aria-label={`${languageInfo[project.language].name} script editor`}
        />
      </div>
      <footer className="script-status">
        <span>{languageInfo[project.language].name}</span>
        <span>UTF-8</span>
        <span>{project.script.split("\n").length} lines</span>
      </footer>
    </div>
  );
}
