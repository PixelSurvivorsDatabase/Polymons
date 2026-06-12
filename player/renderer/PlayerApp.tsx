import { Gamepad2, LogOut, Play, UserRound } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import logo from "../../assets/polymons-logo.png";
import { useMultiplayer } from "../../src/game/multiplayer";
import {
  activatePolyGui,
  type PolyProject,
  type PolyRuntimeResult,
  runPolyProject,
} from "../../src/game/polyProject";

const BaseplateGame = lazy(
  () => import("../../src/game/BaseplateGame"),
);

export default function PlayerApp() {
  const [auth, setAuth] = useState<PlayerAuth | null>(null);
  const [ready, setReady] = useState(false);
  const [launch, setLaunch] = useState<PlayerLaunch | null>(null);
  const [error, setError] = useState("");
  const [games, setGames] = useState<PlayerGameSummary[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [startingGameId, setStartingGameId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      window.polymons.getAuth(),
      window.polymons.getLaunch(),
    ]).then(([storedAuth, storedLaunch]) => {
      setAuth(storedAuth);
      setLaunch(storedLaunch);
      setReady(true);
    });
    const removeLaunch = window.polymons.onLaunch(setLaunch);
    const removeAuth = window.polymons.onAuthChanged((next) => {
      setAuth(next);
      setError("");
    });
    const removeError = window.polymons.onProtocolError(setError);
    return () => {
      removeLaunch();
      removeAuth();
      removeError();
    };
  }, []);

  useEffect(() => {
    if (!auth || launch) return;
    setGamesLoading(true);
    void window.polymons
      .listGames()
      .then((result) => setGames(result.games))
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load games.",
        );
      })
      .finally(() => setGamesLoading(false));
  }, [auth, launch]);

  async function playGame(gameId: string) {
    setStartingGameId(gameId);
    setError("");
    try {
      const result = await window.polymons.play(gameId);
      setLaunch({
        mode: "online",
        game: result.playSession.game.id,
        websocketUrl: result.playSession.websocketUrl,
      });
    } catch (playError) {
      setError(
        playError instanceof Error ? playError.message : "Could not start.",
      );
    } finally {
      setStartingGameId(null);
    }
  }

  if (!ready) {
    return <div className="player-loading">Opening Polymons Player...</div>;
  }

  if (launch) {
    return (
      <PlayerGame
        launch={launch}
        auth={auth}
        onLeave={() => setLaunch(null)}
      />
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
        {error && <div className="player-error">{error}</div>}
        {gamesLoading ? (
          <div className="player-library-state">Loading games...</div>
        ) : games.length === 0 ? (
          <div className="player-library-state">No games are published yet.</div>
        ) : (
          <div className="player-game-grid">
            {games.map((game) => (
              <article className="player-game-card" key={game.id}>
                <div
                  className="player-game-art"
                  style={
                    game.thumbnailUrl
                      ? {
                          backgroundImage: `url("${game.thumbnailUrl}")`,
                          backgroundSize: "cover",
                        }
                      : undefined
                  }
                >
                  <strong>{game.title.slice(0, 1).toUpperCase()}</strong>
                </div>
                <div>
                  <span>{game.genre}</span>
                  <h2>{game.title}</h2>
                  <p>{game.description || `Created by ${game.creator}.`}</p>
                  <div className="player-game-meta">
                    {game.activePlayers} playing
                  </div>
                  <button
                    className="player-play"
                    onClick={() => void playGame(game.id)}
                    disabled={startingGameId !== null}
                  >
                    <Play size={18} fill="currentColor" />
                    {startingGameId === game.id ? "Connecting..." : "Play"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PlayerGame({
  launch,
  auth,
  onLeave,
}: {
  launch: PlayerLaunch;
  auth: PlayerAuth | null;
  onLeave: () => void;
}) {
  if (launch.mode === "studio") {
    return <StudioPlayerGame launch={launch} auth={auth} onLeave={onLeave} />;
  }
  return <OnlinePlayerGame launch={launch} auth={auth} onLeave={onLeave} />;
}

function OnlinePlayerGame({
  launch,
  auth,
  onLeave,
}: {
  launch: Extract<PlayerLaunch, { mode: "online" }>;
  auth: PlayerAuth | null;
  onLeave: () => void;
}) {
  const {
    connection,
    remotePlayers,
    chatMessages,
    chatError,
    sendState,
    sendChat,
  } = useMultiplayer(launch.websocketUrl, launch.game);
  const [runtime, setRuntime] = useState<PolyRuntimeResult | null>(null);
  const [gameLoading, setGameLoading] = useState(true);
  const [gameError, setGameError] = useState("");
  useEffect(() => {
    setGameLoading(true);
    setGameError("");
    void window.polymons
      .getGame(launch.game)
      .then((result) => {
        if (result.game.manifest) {
          setRuntime(runPolyProject(result.game.manifest));
        } else if (result.game.slug === "baseplate") {
          setRuntime(null);
        } else {
          throw new Error("This game does not have a published world.");
        }
      })
      .catch((loadError: unknown) => {
        setRuntime(null);
        setGameError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this game.",
        );
      })
      .finally(() => setGameLoading(false));
  }, [launch.game]);

  return (
    <main className="game-screen">
      <header className="player-bar">
        <div className="player-brand">
          <img src={logo} alt="" />
          <strong>Polymons Player</strong>
        </div>
        <span className="player-connection">{connection}</span>
        <button onClick={onLeave}>Leave game</button>
      </header>
      <section className="player-game">
        {gameLoading ? (
          <div className="player-loading">Loading game...</div>
        ) : gameError ? (
          <div className="player-loading">{gameError}</div>
        ) : (
          <Suspense
            fallback={<div className="player-loading">Loading game...</div>}
          >
          <BaseplateGame
            remotePlayers={remotePlayers}
            onPlayerState={sendState}
            worldObjects={runtime?.project.objects}
            guiObjects={runtime?.project.gui}
            playerSettings={runtime?.project.playerSettings}
            projectName={runtime?.project.name}
            localPlayer={auth?.user}
            chatMessages={chatMessages}
            chatError={chatError}
            onSendChat={sendChat}
            onGuiActivated={(guiObjectId) => {
              setRuntime((current) => {
                if (!current) return current;
                const activated = activatePolyGui(current.project, guiObjectId);
                return {
                  ...activated,
                  diagnostics: [
                    ...current.diagnostics,
                    ...activated.diagnostics,
                  ],
                  output: [...current.output, ...activated.output],
                };
              });
            }}
            onFriendRequest={(username) =>
              window.polymons.sendFriendRequest(username)
            }
          />
          </Suspense>
        )}
      </section>
    </main>
  );
}

function StudioPlayerGame({
  launch,
  auth,
  onLeave,
}: {
  launch: Extract<PlayerLaunch, { mode: "studio" }>;
  auth: PlayerAuth | null;
  onLeave: () => void;
}) {
  const [project, setProject] = useState<PolyProject | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void window.polymons
      .loadStudioProject(launch.projectId)
      .then(setProject)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load the Studio project.",
        );
      });
  }, [launch.projectId]);

  const initialRuntime = useMemo(
    () => (project ? runPolyProject(project) : null),
    [project],
  );
  const [runtime, setRuntime] = useState<PolyRuntimeResult | null>(null);

  useEffect(() => {
    setRuntime(initialRuntime);
  }, [initialRuntime]);

  useEffect(() => {
    if (!runtime) return;
    void window.polymons
      .saveStudioDataStores(launch.projectId, runtime.project.dataStores)
      .catch((saveError) => {
        console.error("Could not save local project data.", saveError);
      });
  }, [launch.projectId, runtime]);

  return (
    <main className="game-screen">
      <header className="player-bar">
        <div className="player-brand">
          <img src={logo} alt="" />
          <strong>{project?.name ?? "Studio playtest"}</strong>
        </div>
        <span className="player-connection">Local playtest</span>
        <button onClick={onLeave}>Stop</button>
      </header>
      <section className="player-game">
        {error ? (
          <div className="player-loading">{error}</div>
        ) : runtime ? (
          <Suspense
            fallback={<div className="player-loading">Loading playtest...</div>}
          >
            <BaseplateGame
              worldObjects={runtime.project.objects}
              guiObjects={runtime.project.gui}
              playerSettings={runtime.project.playerSettings}
              projectName={runtime.project.name}
              localPlayer={auth?.user}
              onGuiActivated={(guiObjectId) => {
                setRuntime((current) => {
                  if (!current) return current;
                  const activated = activatePolyGui(
                    current.project,
                    guiObjectId,
                  );
                  return {
                    ...activated,
                    diagnostics: [
                      ...current.diagnostics,
                      ...activated.diagnostics,
                    ],
                    output: [...current.output, ...activated.output],
                  };
                });
              }}
            />
            {(runtime.output.length > 0 || runtime.diagnostics.length > 0) && (
              <aside className="player-output">
                <strong>Output</strong>
                {runtime.diagnostics.map((diagnostic, index) => (
                  <span className="output-error" key={`diagnostic-${index}`}>
                    {diagnostic.scriptName}:{diagnostic.line} {diagnostic.message}
                  </span>
                ))}
                {runtime.output.map((entry, index) => (
                  <span className={`output-${entry.level}`} key={`output-${index}`}>
                    [{entry.scriptName}] {entry.message}
                  </span>
                ))}
              </aside>
            )}
          </Suspense>
        ) : (
          <div className="player-loading">Loading Studio project...</div>
        )}
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
