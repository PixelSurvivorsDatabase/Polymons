import {
  Braces,
  Cuboid,
  ExternalLink,
  LogOut,
  Play,
  Plus,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import logo from "../../assets/studio/poly-studio-logo-dark.png";
import StudioEditor from "./StudioEditor";

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
      <StudioEditor
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
      onImport={async () => {
        setError("");
        try {
          const imported = await window.polyStudio.importProject();
          if (imported) {
            setProject(imported);
          }
        } catch (importError) {
          setError(
            importError instanceof Error
              ? importError.message
              : "Could not import game.",
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
  onImport,
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
  onImport: () => void;
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
          <div className="launcher-actions">
            <button className="studio-secondary" onClick={onImport}>
              <Upload size={17} />
              Import game
            </button>
            <button className="studio-primary" onClick={onCreate}>
              <Plus size={18} />
              New project
            </button>
          </div>
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
  const [template, setTemplate] = useState<"baseplate" | "tutorial">(
    "baseplate",
  );
  const [creating, setCreating] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    onError("");
    try {
      onCreated(
        await window.polyStudio.createProject({ name, language, template }),
      );
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
        <fieldset className="template-picker">
          <legend>Starting place</legend>
          <label className={template === "baseplate" ? "active" : ""}>
            <input
              type="radio"
              name="template"
              checked={template === "baseplate"}
              onChange={() => setTemplate("baseplate")}
            />
            <strong>Baseplate</strong>
            <span>A clean place to build from scratch.</span>
          </label>
          <label className={template === "tutorial" ? "active" : ""}>
            <input
              type="radio"
              name="template"
              checked={template === "tutorial"}
              onChange={() => setTemplate("tutorial")}
            />
            <strong>Studio Tutorial</strong>
            <span>Three guided objects, starter UI, and commented code.</span>
          </label>
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="studio-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="studio-primary" disabled={creating}>
            {creating
              ? "Creating..."
              : template === "tutorial"
                ? "Create Tutorial"
                : "Create Baseplate"}
          </button>
        </div>
      </form>
    </div>
  );
}
