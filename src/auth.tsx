import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AuthResponse,
  login,
  PolymonsApiError,
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

function writeStoredAuth(next: StoredAuth | null) {
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Some private and in-app mobile browsers disable persistent storage.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<StoredAuth | null>(() => readStoredAuth());
  const authRef = useRef(auth);
  const refreshInFlight = useRef<Promise<PolymonsSession | null> | null>(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  const saveAuth = useCallback((next: AuthResponse | null) => {
    authRef.current = next;
    setAuth(next);
    writeStoredAuth(next);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    const refreshToken = authRef.current?.session.refreshToken;
    if (!refreshToken) return null;

    const request = refreshSession(refreshToken)
      .then((next) => {
        if (authRef.current?.session.refreshToken === refreshToken) {
          saveAuth(next);
          return next.session;
        }
        return authRef.current?.session ?? null;
      })
      .catch((error: unknown) => {
        if (
          error instanceof PolymonsApiError &&
          error.status === 401 &&
          authRef.current?.session.refreshToken === refreshToken
        ) {
          saveAuth(null);
        }
        return null;
      })
      .finally(() => {
        if (refreshInFlight.current === request) {
          refreshInFlight.current = null;
        }
      });
    refreshInFlight.current = request;
    return request;
  }, [saveAuth]);

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
          authRef.current = next;
          writeStoredAuth(next);
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
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    overlay.current?.scrollTo({ top: 0 });
  }, [mode]);

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
    <div ref={overlay} className="auth-overlay" role="presentation">
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
              aria-describedby="auth-username-help"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              inputMode="text"
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]+"
              spellCheck={false}
              required
            />
            <small id="auth-username-help">
              3-20 letters, numbers, or underscores.
            </small>
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
              minLength={mode === "signup" ? 8 : 1}
              maxLength={128}
              required
            />
            {mode === "signup" && (
              <small>At least 8 characters with a letter and a number.</small>
            )}
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
