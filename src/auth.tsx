import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  type AuthResponse,
  login,
  type PolymonsSession,
  type PolymonsUser,
  refreshSession,
  signUp,
} from "./api";

const STORAGE_KEY = "polymons.session";

type StoredAuth = {
  user: PolymonsUser;
  session: PolymonsSession;
};

type AuthContextValue = {
  user: PolymonsUser | null;
  session: PolymonsSession | null;
  ready: boolean;
  showAuth: (mode?: "login" | "signup") => void;
  logout: () => void;
  refresh: () => Promise<PolymonsSession | null>;
  updateUser: (user: PolymonsUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): StoredAuth | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  const saveAuth = useCallback((next: AuthResponse | null) => {
    setAuth(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!auth?.session.refreshToken) return null;
    try {
      const next = await refreshSession(auth.session.refreshToken);
      saveAuth(next);
      return next.session;
    } catch {
      saveAuth(null);
      return null;
    }
  }, [auth?.session.refreshToken, saveAuth]);

  useEffect(() => {
    if (!auth) {
      setReady(true);
      return;
    }

    const expiresSoon =
      !auth.session.expiresAt ||
      auth.session.expiresAt * 1000 < Date.now() + 60_000;
    if (expiresSoon) {
      void refresh().finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [auth, refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: auth?.user ?? null,
      session: auth?.session ?? null,
      ready,
      showAuth: (mode = "login") => setAuthMode(mode),
      logout: () => saveAuth(null),
      refresh,
      updateUser: (user) =>
        setAuth((current) => {
          if (!current) return current;
          const next = { ...current, user };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          return next;
        }),
    }),
    [auth, ready, refresh, saveAuth],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {authMode && (
        <AuthDialog
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onAuthenticated={(next) => {
            saveAuth(next);
            setAuthMode(null);
          }}
        />
      )}
    </AuthContext.Provider>
  );
}

function AuthDialog({
  initialMode,
  onClose,
  onAuthenticated,
}: {
  initialMode: "login" | "signup";
  onClose: () => void;
  onAuthenticated: (auth: AuthResponse) => void;
}) {
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result =
        mode === "signup"
          ? await signUp(username, password, displayName || undefined)
          : await login(username, password);
      onAuthenticated(result);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-overlay" role="presentation">
      <button
        className="auth-backdrop"
        type="button"
        aria-label="Close"
        onClick={onClose}
      />
      <section className="auth-dialog" role="dialog" aria-modal="true">
        <button className="auth-close" type="button" onClick={onClose}>
          Close
        </button>
        <span className="eyebrow">Polymons account</span>
        <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p>
          {mode === "signup"
            ? "Choose a username and password. Email is not required."
            : "Sign in with your username and password."}
        </p>
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
          {mode === "signup" && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={32}
                placeholder={username || "Your name"}
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button className="primary-button auth-submit" disabled={submitting}>
            {submitting
              ? "Please wait..."
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <button
          className="auth-switch"
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "login" : "signup");
            setError("");
          }}
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New to Polymons? Create an account"}
        </button>
      </section>
    </div>
  );
}

// The hook shares this file with its provider to keep the auth boundary together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return value;
}
