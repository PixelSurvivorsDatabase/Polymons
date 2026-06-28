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

function sessionExpiryMs(session: PolymonsSession): number {
  const raw = Number(session.expiresAt);
  if (Number.isFinite(raw) && raw > 0) {
    return raw > 10_000_000_000 ? raw : raw * 1000;
  }
  const lifetime = Number(session.expiresIn);
  return Date.now() + (Number.isFinite(lifetime) ? lifetime : 3600) * 1000;
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
  const refreshFailures = useRef(0);
  const refreshRetryAt = useRef(0);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  const saveAuth = useCallback((next: AuthResponse | null) => {
    refreshFailures.current = 0;
    refreshRetryAt.current = 0;
    authRef.current = next;
    setAuth(next);
    writeStoredAuth(next);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return refreshInFlight.current;
    if (Date.now() < refreshRetryAt.current) {
      return authRef.current?.session ?? null;
    }
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
        const stored = readStoredAuth();
        if (
          stored &&
          stored.session.refreshToken !== refreshToken
        ) {
          saveAuth(stored);
          return stored.session;
        }
        if (
          error instanceof PolymonsApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          const current = authRef.current;
          if (current && sessionExpiryMs(current.session) > Date.now()) {
            refreshFailures.current += 1;
            refreshRetryAt.current = Date.now() + 60_000;
            return current.session;
          }
          saveAuth(null);
          return null;
        }
        refreshFailures.current += 1;
        const baseDelay =
          error instanceof PolymonsApiError && error.status === 429
            ? 60_000
            : 10_000;
        refreshRetryAt.current =
          Date.now() +
          Math.min(
            5 * 60_000,
            baseDelay * 2 ** Math.min(refreshFailures.current - 1, 4),
          );
        // A different tab or desktop client may have rotated the token.
        // Keep the last session while temporary server failures cool down.
        return authRef.current?.session ?? null;
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

    setReady(true);
    if (
      !Number.isInteger(auth.user.polymonsId) ||
      typeof auth.user.description !== "string" ||
      auth.user.equippedPantsId === undefined
    ) {
      void refresh();
    }
    const delay = Math.max(
      5_000,
      sessionExpiryMs(auth.session) - Date.now() - 2 * 60_000,
    );
    const timer = window.setTimeout(() => {
      void refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [auth, refresh]);

  useEffect(() => {
    const syncStoredSession = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      const stored = readStoredAuth();
      authRef.current = stored;
      setAuth(stored);
    };
    window.addEventListener("storage", syncStoredSession);
    return () => window.removeEventListener("storage", syncStoredSession);
  }, []);

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
