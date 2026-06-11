import { Gamepad2, LogOut, Play, UserRound } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import logo from "../../assets/polymons-logo.png";

const BaseplateGame = lazy(
  () => import("../../src/game/BaseplateGame"),
);

export default function PlayerApp() {
  const [auth, setAuth] = useState<PlayerAuth | null>(null);
  const [ready, setReady] = useState(false);
  const [launch, setLaunch] = useState<PlayerLaunch | null>(null);
  const [connection, setConnection] = useState("Not connected");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void Promise.all([
      window.polymons.getAuth(),
      window.polymons.getLaunch(),
    ]).then(([storedAuth, storedLaunch]) => {
      setAuth(storedAuth);
      setLaunch(storedLaunch);
      setReady(true);
    });
    return window.polymons.onLaunch(setLaunch);
  }, []);

  useEffect(() => {
    if (!launch) return;
    const socket = new WebSocket(launch.websocketUrl);
    setConnection("Connecting");
    socket.addEventListener("open", () => {
      setConnection("Connected");
      socket.send(JSON.stringify({ type: "ping" }));
    });
    socket.addEventListener("close", () => setConnection("Disconnected"));
    socket.addEventListener("error", () => setConnection("Connection failed"));
    return () => socket.close();
  }, [launch]);

  async function playBaseplate() {
    setStarting(true);
    setError("");
    try {
      const result = await window.polymons.play("baseplate");
      setLaunch({
        game: "baseplate",
        websocketUrl: result.playSession.websocketUrl,
      });
    } catch (playError) {
      setError(
        playError instanceof Error ? playError.message : "Could not start.",
      );
    } finally {
      setStarting(false);
    }
  }

  if (!ready) {
    return <div className="player-loading">Opening Polymons Player...</div>;
  }

  if (launch) {
    return (
      <main className="game-screen">
        <header className="player-bar">
          <div className="player-brand">
            <img src={logo} alt="" />
            <strong>Polymons Player</strong>
          </div>
          <span className="player-connection">{connection}</span>
          <button onClick={() => setLaunch(null)}>Leave game</button>
        </header>
        <section className="player-game">
          <Suspense fallback={<div className="player-loading">Loading Baseplate...</div>}>
            <BaseplateGame />
          </Suspense>
        </section>
      </main>
    );
  }

  if (!auth) {
    return <PlayerAuthScreen onAuthenticated={setAuth} />;
  }

  return (
    <main className="player-home">
      <header className="player-bar">
        <div className="player-brand">
          <img src={logo} alt="" />
          <strong>Polymons Player</strong>
        </div>
        <div className="player-account">
          <UserRound size={17} />
          <span>{auth.user.displayName}</span>
          <button
            onClick={() => {
              void window.polymons.logout();
              setAuth(null);
            }}
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <section className="player-library">
        <div className="player-heading">
          <span>Games</span>
          <h1>Pick something to play.</h1>
        </div>
        <article className="player-game-card">
          <div className="player-game-art">
            <strong>B</strong>
          </div>
          <div>
            <span>Sandbox</span>
            <h2>Baseplate</h2>
            <p>A clean open world for movement, physics, and building.</p>
            {error && <div className="player-error">{error}</div>}
            <button
              className="player-play"
              onClick={() => void playBaseplate()}
              disabled={starting}
            >
              <Play size={18} fill="currentColor" />
              {starting ? "Connecting..." : "Play"}
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}

function PlayerAuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (auth: PlayerAuth) => void;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result =
        mode === "signup"
          ? await window.polymons.signUp(
              username,
              password,
              displayName || undefined,
            )
          : await window.polymons.login(username, password);
      onAuthenticated(result);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Could not sign in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="player-auth">
      <section className="player-auth-card">
        <img src={logo} alt="" />
        <span>Polymons Player</span>
        <h1>{mode === "signup" ? "Create an account" : "Sign in"}</h1>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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
                maxLength={32}
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          {error && <div className="player-error">{error}</div>}
          <button className="player-play" disabled={submitting}>
            <Gamepad2 size={18} />
            {submitting
              ? "Please wait..."
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>
        </form>
        <button
          className="player-auth-switch"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login"
            ? "Create a Polymons account"
            : "Already have an account? Sign in"}
        </button>
      </section>
    </main>
  );
}
