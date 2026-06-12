import {
  Compass,
  Gamepad2,
  Home,
  LogOut,
  Play,
  Search,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import logo from "../../assets/polymons-logo.png";
import { useMultiplayer } from "../../src/game/multiplayer";
import {
  activatePolyGui,
  activatePolyTool,
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
  const [friends, setFriends] = useState<PlayerFriendship[]>([]);
  const [query, setQuery] = useState("");

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
    void Promise.allSettled([
      window.polymons.listGames(),
      window.polymons.listFriends(),
    ])
      .then(([gameResult, friendResult]) => {
        if (gameResult.status === "fulfilled") {
          setGames(gameResult.value.games);
        } else {
          setError(
            gameResult.reason instanceof Error
              ? gameResult.reason.message
              : "Could not load games.",
          );
        }
        if (friendResult.status === "fulfilled") {
          setFriends(
            friendResult.value.friendships.filter(
              (friendship) =>
                friendship.status === "accepted" && friendship.user,
            ),
          );
        }
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
  const visibleGames = games.filter((game) =>
    `${game.title} ${game.creator} ${game.genre}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  return (
    <main className="player-home">
      <aside className="player-sidebar">
        <img src={logo} alt="Polymons" />
        <button
          className="active"
          title="Home"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <Home size={20} />
          <span>Home</span>
        </button>
        <button
          title="Games"
          onClick={() =>
            document
              .querySelector(".player-games-title")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <Compass size={20} />
          <span>Games</span>
        </button>
        <button
          title="Friends"
          onClick={() =>
            document
              .querySelector(".player-friends-strip")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        >
          <Users size={20} />
          <span>Friends</span>
        </button>
      </aside>
      <section className="player-home-content">
        <header className="player-home-topbar">
          <label className="player-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search games"
            />
          </label>
          <div className="player-account">
            <span className="player-account-avatar">
              {auth.user.displayName.slice(0, 1).toUpperCase()}
            </span>
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
            <span>Home</span>
            <h1>Welcome back, {auth.user.displayName}.</h1>
          </div>
          <section className="player-friends-strip">
            <div className="player-section-title">
              <h2>Friends</h2>
              <span>{friends.length}</span>
            </div>
            <div className="player-friend-row">
              {friends.length === 0 ? (
                <div className="player-friends-empty">
                  Friends and their active games will show here.
                </div>
              ) : (
                friends.map((friendship) => (
                  <button
                    key={friendship.id}
                    disabled={!friendship.gameId || startingGameId !== null}
                    onClick={() =>
                      friendship.gameId
                        ? void playGame(friendship.gameId)
                        : undefined
                    }
                  >
                    <span>
                      {friendship.user!.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <strong>{friendship.user!.displayName}</strong>
                    <small>
                      {friendship.gameId ? "Playing now" : "Offline"}
                    </small>
                  </button>
                ))
              )}
            </div>
          </section>
          <div className="player-section-title player-games-title">
            <h2>{query ? "Search results" : "Recommended for you"}</h2>
            <span>{visibleGames.length} games</span>
          </div>
        {error && <div className="player-error">{error}</div>}
        {gamesLoading ? (
          <div className="player-library-state">Loading games...</div>
        ) : visibleGames.length === 0 ? (
          <div className="player-library-state">No games are published yet.</div>
        ) : (
          <div className="player-game-grid">
            {visibleGames.map((game) => (
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
        if (result.game.id !== launch.game) {
          throw new Error("Polymons returned the wrong game.");
        }
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
            animations={runtime?.project.animations}
            animationRequests={runtime?.animationRequests}
            animationVersion={runtime?.animationVersion}
            guiObjects={runtime?.project.gui}
            playerSettings={runtime?.project.playerSettings}
            leaderstats={runtime?.project.leaderstats}
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
                  animationRequests: [
                    ...new Set([
                      ...current.animationRequests,
                      ...activated.animationRequests,
                    ]),
                  ],
                  animationVersion:
                    current.animationVersion +
                    (activated.animationRequests.length > 0 ? 1 : 0),
                };
              });
            }}
            onToolActivated={(toolObjectId) => {
              setRuntime((current) => {
                if (!current) return current;
                const activated = activatePolyTool(current.project, toolObjectId);
                return {
                  ...activated,
                  diagnostics: [
                    ...current.diagnostics,
                    ...activated.diagnostics,
                  ],
                  output: [...current.output, ...activated.output],
                  animationRequests: [
                    ...new Set([
                      ...current.animationRequests,
                      ...activated.animationRequests,
                    ]),
                  ],
                  animationVersion:
                    current.animationVersion +
                    (activated.animationRequests.length > 0 ? 1 : 0),
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
              animations={runtime.project.animations}
              animationRequests={runtime.animationRequests}
              animationVersion={runtime.animationVersion}
              guiObjects={runtime.project.gui}
              playerSettings={runtime.project.playerSettings}
              leaderstats={runtime.project.leaderstats}
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
                    animationRequests: [
                      ...new Set([
                        ...current.animationRequests,
                        ...activated.animationRequests,
                      ]),
                    ],
                    animationVersion:
                      current.animationVersion +
                      (activated.animationRequests.length > 0 ? 1 : 0),
                  };
                });
              }}
              onToolActivated={(toolObjectId) => {
                setRuntime((current) => {
                  if (!current) return current;
                  const activated = activatePolyTool(
                    current.project,
                    toolObjectId,
                  );
                  return {
                    ...activated,
                    diagnostics: [
                      ...current.diagnostics,
                      ...activated.diagnostics,
                    ],
                    output: [...current.output, ...activated.output],
                    animationRequests: [
                      ...new Set([
                        ...current.animationRequests,
                        ...activated.animationRequests,
                      ]),
                    ],
                    animationVersion:
                      current.animationVersion +
                      (activated.animationRequests.length > 0 ? 1 : 0),
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
