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
  activatePolyInput,
  activatePolyTouched,
  activatePolyTool,
  executePolyCommand,
  type PolyPlayerData,
  type PolyProject,
  type PolyRuntimeResult,
  runPolyProject,
} from "../../src/game/polyProject";

const BaseplateGame = lazy(
  () => import("../../src/game/BaseplateGame"),
);

function runtimePlayerData(
  user: PlayerUser | null | undefined,
): PolyPlayerData | undefined {
  return user
    ? {
        userId: user.polymonsId,
        username: user.username,
        displayName: user.displayName,
      }
    : undefined;
}

function mergeRuntimeResults(
  current: PolyRuntimeResult,
  activated: PolyRuntimeResult,
): PolyRuntimeResult {
  return {
    ...activated,
    diagnostics: [...current.diagnostics, ...activated.diagnostics],
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
    tweenRequests: [...current.tweenRequests, ...activated.tweenRequests],
    tweenVersion:
      current.tweenVersion + (activated.tweenRequests.length > 0 ? 1 : 0),
    soundRequests: [...current.soundRequests, ...activated.soundRequests],
    soundVersion:
      current.soundVersion + (activated.soundRequests.length > 0 ? 1 : 0),
  };
}

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
                    <span>{game.activePlayers.toLocaleString()} playing now</span>
                    <span>{(game.visits ?? 0).toLocaleString()} visits</span>
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
    localPlayer: sessionPlayer,
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
          setRuntime(
            runPolyProject(
              result.game.manifest,
              runtimePlayerData(auth?.user),
            ),
          );
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
  }, [auth?.user, launch.game]);

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
            tweenRequests={runtime?.tweenRequests}
            tweenVersion={runtime?.tweenVersion}
            soundRequests={runtime?.soundRequests}
            soundVersion={runtime?.soundVersion}
            guiObjects={runtime?.project.gui}
            playerSettings={runtime?.project.playerSettings}
            lighting={runtime?.project.lighting}
            leaderstats={runtime?.project.leaderstats}
            projectName={runtime?.project.name}
            localPlayer={sessionPlayer ?? auth?.user}
            chatMessages={chatMessages}
            chatError={chatError}
            onSendChat={sendChat}
            onGuiActivated={(guiObjectId) => {
              setRuntime((current) => {
                if (!current) return current;
                const activated = activatePolyGui(
                  current.project,
                  guiObjectId,
                  current.playerData,
                );
                return mergeRuntimeResults(current, activated);
              });
            }}
            onToolActivated={(toolObjectId) => {
              setRuntime((current) => {
                if (!current) return current;
                const activated = activatePolyTool(
                  current.project,
                  toolObjectId,
                  current.playerData,
                );
                return mergeRuntimeResults(current, activated);
              });
            }}
            onWorldTouched={(worldObjectId) => {
              setRuntime((current) => {
                if (!current) return current;
                const activated = activatePolyTouched(
                  current.project,
                  worldObjectId,
                  "Touched",
                  current.playerData,
                );
                return mergeRuntimeResults(current, activated);
              });
            }}
            onKeyInput={(keyCode, event) => {
              setRuntime((current) =>
                current
                  ? mergeRuntimeResults(
                      current,
                      activatePolyInput(
                        current.project,
                        keyCode,
                        event,
                        current.playerData,
                      ),
                    )
                  : current,
              );
            }}
            onFriendRequest={(username) =>
              window.polymons.sendFriendRequest(username)
            }
            onPlayerRespawn={() => {
              setRuntime((current) =>
                current
                  ? {
                      ...current,
                      project: {
                        ...current.project,
                        playerSettings: {
                          ...current.project.playerSettings,
                          health: current.project.playerSettings.maxHealth,
                        },
                      },
                    }
                  : current,
              );
            }}
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
    () =>
      project
        ? runPolyProject(project, runtimePlayerData(auth?.user))
        : null,
    [auth?.user, project],
  );
  const [runtime, setRuntime] = useState<PolyRuntimeResult | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalTab, setTerminalTab] = useState<"output" | "command" | "data">(
    "output",
  );
  const [command, setCommand] = useState("");

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
              tweenRequests={runtime.tweenRequests}
              tweenVersion={runtime.tweenVersion}
              soundRequests={runtime.soundRequests}
              soundVersion={runtime.soundVersion}
              guiObjects={runtime.project.gui}
              playerSettings={runtime.project.playerSettings}
              lighting={runtime.project.lighting}
              leaderstats={runtime.project.leaderstats}
              projectName={runtime.project.name}
              localPlayer={auth?.user}
              onGuiActivated={(guiObjectId) => {
                setRuntime((current) => {
                  if (!current) return current;
                  const activated = activatePolyGui(
                    current.project,
                    guiObjectId,
                    current.playerData,
                  );
                  return mergeRuntimeResults(current, activated);
                });
              }}
              onToolActivated={(toolObjectId) => {
                setRuntime((current) => {
                  if (!current) return current;
                  const activated = activatePolyTool(
                    current.project,
                    toolObjectId,
                    current.playerData,
                  );
                  return mergeRuntimeResults(current, activated);
                });
              }}
              onWorldTouched={(worldObjectId) => {
                setRuntime((current) => {
                  if (!current) return current;
                  const activated = activatePolyTouched(
                    current.project,
                    worldObjectId,
                    "Touched",
                    current.playerData,
                  );
                  return mergeRuntimeResults(current, activated);
                });
              }}
              onWorldTouchEnded={(worldObjectId) => {
                setRuntime((current) => {
                  if (!current) return current;
                  const activated = activatePolyTouched(
                    current.project,
                    worldObjectId,
                    "TouchEnded",
                    current.playerData,
                  );
                  return mergeRuntimeResults(current, activated);
                });
              }}
              onKeyInput={(keyCode, event) => {
                setRuntime((current) =>
                  current
                    ? mergeRuntimeResults(
                        current,
                        activatePolyInput(
                          current.project,
                          keyCode,
                          event,
                          current.playerData,
                        ),
                      )
                    : current,
                );
              }}
              onPlayerRespawn={() => {
                setRuntime((current) =>
                  current
                    ? {
                        ...current,
                        project: {
                          ...current.project,
                          playerSettings: {
                            ...current.project.playerSettings,
                            health: current.project.playerSettings.maxHealth,
                          },
                        },
                      }
                    : current,
                );
              }}
            />
            <aside className={`playtest-console ${terminalOpen ? "open" : ""}`}>
              <header>
                <button
                  className={terminalTab === "output" ? "active" : ""}
                  onClick={() => setTerminalTab("output")}
                >
                  Output
                </button>
                <button
                  className={terminalTab === "command" ? "active" : ""}
                  onClick={() => setTerminalTab("command")}
                >
                  Command
                </button>
                <button
                  className={terminalTab === "data" ? "active" : ""}
                  onClick={() => setTerminalTab("data")}
                >
                  Data
                </button>
                <button
                  className="console-toggle"
                  onClick={() => setTerminalOpen((open) => !open)}
                >
                  {terminalOpen ? "Collapse" : "Open console"}
                </button>
              </header>
              {terminalOpen && terminalTab === "output" && (
                <div className="console-scroll">
                  {runtime.diagnostics.map((diagnostic, index) => (
                    <span className="output-error" key={`diagnostic-${index}`}>
                      {diagnostic.scriptName}:{diagnostic.line} {diagnostic.message}
                    </span>
                  ))}
                  {runtime.output.map((entry, index) => (
                    <span
                      className={`output-${entry.level}`}
                      key={`output-${index}`}
                    >
                      [{entry.scriptName}] {entry.message}
                    </span>
                  ))}
                  {runtime.output.length === 0 &&
                    runtime.diagnostics.length === 0 && (
                      <span>No output yet.</span>
                    )}
                </div>
              )}
              {terminalOpen && terminalTab === "command" && (
                <form
                  className="console-command"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!command.trim()) return;
                    setRuntime((current) =>
                      current ? executePolyCommand(current, command) : current,
                    );
                    setCommand("");
                  }}
                >
                  <div className="console-scroll command-help">
                    <span>Try `help`, `leaderstats set local Coins 10`, or `data set PlayerData Level 2`.</span>
                  </div>
                  <label>
                    <b>&gt;</b>
                    <input
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                      placeholder="Enter a Studio playtest command"
                      autoFocus
                    />
                  </label>
                </form>
              )}
              {terminalOpen && terminalTab === "data" && (
                <div className="console-data console-scroll">
                  <section>
                    <strong>Leaderstats</strong>
                    {runtime.project.leaderstats.map((stat) => (
                      <span key={stat.id}>
                        {stat.name}: {String(stat.defaultValue)}
                      </span>
                    ))}
                  </section>
                  <section>
                    <strong>DataStores</strong>
                    <pre>
                      {JSON.stringify(runtime.project.dataStores, null, 2)}
                    </pre>
                  </section>
                </div>
              )}
            </aside>
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
