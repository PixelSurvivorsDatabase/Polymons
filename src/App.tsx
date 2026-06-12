import {
  Bell,
  ChevronLeft,
  Compass,
  Download,
  Gamepad2,
  Home,
  Menu,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import {
  acceptFriendRequest,
  createPlayerAccountLink,
  createPlaySession,
  getGame,
  listFriends,
  listGames,
  playerAccountUrl,
  playerLaunchUrl,
  POLYMONS_PLAYER_DOWNLOAD_URL,
  POLY_STUDIO_DOWNLOAD_URL,
  sendFriendRequest,
  type Friendship,
  type PlatformGame,
  type PlaySession,
} from "./api";
import { useAuth } from "./auth";
import { games as fallbackGames, type Game } from "./data";
import { useMultiplayer } from "./game/multiplayer";
import {
  activatePolyGui,
  runPolyProject,
  type PolyRuntimeResult,
} from "./game/polyProject";

const BaseplateGame = lazy(() => import("./game/BaseplateGame"));

function displayGame(game: PlatformGame): Game {
  return {
    id: game.slug,
    title: game.title,
    creator: game.creator,
    players: String(game.activePlayers),
    rating: 0,
    genre: game.genre,
    description: game.description,
    colors: ["#7247d8", "#36a777"],
    glyph: game.title.slice(0, 1).toUpperCase(),
  };
}

function useGames() {
  const [games, setGames] = useState<Game[]>(fallbackGames);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void listGames()
      .then((result) => setGames(result.games.map(displayGame)))
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    const timer = window.setInterval(() => {
      void listGames()
        .then((result) => setGames(result.games.map(displayGame)))
        .catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return { games, loaded };
}

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/create", label: "Create", icon: Plus },
];

function Avatar({
  name,
  color = "#7557ff",
  size = "medium",
}: {
  name: string;
  color?: string;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ "--avatar-color": color } as React.CSSProperties}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}

function Logo() {
  return (
    <Link to="/" className="brand" aria-label="Polymons home">
      <img src={`${import.meta.env.BASE_URL}assets/polymons-logo.png`} alt="" />
      <span>Polymons</span>
    </Link>
  );
}

function Sidebar() {
  const { user, showAuth } = useAuth();
  return (
    <aside className="sidebar">
      <Logo />
      <nav className="side-nav" aria-label="Main navigation">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <Icon size={20} strokeWidth={2.2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      {user ? (
        <Link to="/profile" className="sidebar-user">
          <Avatar name={user.displayName} size="small" />
          <div>
            <strong>{user.displayName}</strong>
            <span>@{user.username}</span>
          </div>
        </Link>
      ) : (
        <button className="sidebar-user sidebar-sign-in" onClick={() => showAuth()}>
          <Avatar name="P" size="small" />
          <div>
            <strong>Sign in</strong>
            <span>Create or use an account</span>
          </div>
        </button>
      )}
    </aside>
  );
}

function MobileNav() {
  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {navItems.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => (isActive ? "active" : "")}
        >
          <Icon size={21} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, showAuth } = useAuth();
  return (
    <>
      <header className="topbar">
        <button
          className="icon-button mobile-menu-button"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu />
        </button>
        <div className="mobile-brand">
          <Logo />
        </div>
        <label className="search">
          <Search size={18} />
          <input aria-label="Search Polymons" placeholder="Search games and people" />
          <kbd>/</kbd>
        </label>
        {user ? (
          <>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
            >
              <Bell size={20} />
            </button>
            <Link className="topbar-avatar" to="/profile" aria-label="Your profile">
              <Avatar name={user.displayName} size="small" />
            </Link>
          </>
        ) : (
          <button className="secondary-button header-sign-in" onClick={() => showAuth()}>
            Sign in
          </button>
        )}
      </header>
      {mobileOpen && (
        <div className="mobile-drawer">
          <button
            className="drawer-backdrop"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
          <div className="drawer-panel">
            <div className="drawer-heading">
              <Logo />
              <button
                className="icon-button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X />
              </button>
            </div>
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileOpen(false)}
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function Layout() {
  const location = useLocation();
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-main">
        <Header />
        <main key={location.pathname} className="page">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/games/:gameId" element={<GamePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}

function GameArt({ game, wide = false }: { game: Game; wide?: boolean }) {
  return (
    <div
      className={`game-art ${wide ? "game-art-wide" : ""}`}
      style={
        {
          "--game-a": game.colors[0],
          "--game-b": game.colors[1],
        } as React.CSSProperties
      }
    >
      {game.id === "baseplate" && (
        <span className="baseplate-grid" aria-hidden="true" />
      )}
      <span className="art-orbit art-orbit-one" />
      <span className="art-orbit art-orbit-two" />
      <strong>{game.glyph}</strong>
      <span className="art-shine" />
    </div>
  );
}

function GameCard({ game }: { game: Game }) {
  return (
    <Link to={`/games/${game.id}`} className="game-card">
      <GameArt game={game} />
      <div className="game-card-copy">
        <h3>{game.title}</h3>
        <p>by {game.creator}</p>
        <div className="game-stats">
          <span className="test-dot" />
          <span>{game.players} playing</span>
          <span className="stat-divider" />
          <span>Baseplate</span>
        </div>
      </div>
    </Link>
  );
}

function SectionHeading({
  title,
  link,
  eyebrow,
}: {
  title: string;
  link?: string;
  eyebrow?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {link && <Link to={link}>See all</Link>}
    </div>
  );
}

function HomePage() {
  const { games } = useGames();
  const featured = games[0];
  const { user, showAuth } = useAuth();
  return (
    <>
      <section className="welcome-row">
        <div>
          <span className="eyebrow">Home</span>
          <h1>{user ? `Hey, ${user.displayName}.` : "Welcome to Polymons."}</h1>
          <p>What are we playing?</p>
        </div>
        {!user && (
          <button className="secondary-button" onClick={() => showAuth("signup")}>
            Create account
          </button>
        )}
      </section>

      <section
        className="hero-card"
        style={
          {
            "--game-a": featured.colors[0],
            "--game-b": featured.colors[1],
          } as React.CSSProperties
        }
      >
        <div className="hero-copy">
          <span className="hero-label">Featured game</span>
          <h2>{featured.title}</h2>
          <p>{featured.description}</p>
          <div className="hero-actions">
            <Link to={`/games/${featured.id}`} className="primary-button">
              <Gamepad2 size={19} fill="currentColor" />
              Open Baseplate
            </Link>
            <Link to={`/games/${featured.id}`} className="secondary-button">
              Details
            </Link>
          </div>
          <div className="hero-meta">
            <span>Playable now</span>
            <span>Polymons Player or browser</span>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-baseplate">
            <span className="baseplate-spawn" />
            <span className="baseplate-block block-one" />
            <span className="baseplate-block block-two" />
          </div>
        </div>
      </section>

      <section className="content-section">
        <SectionHeading title="Games" link="/discover" />
        <div className="game-grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      <section className="content-section">
        <SectionHeading title="Play your way" />
        <div className="empty-state">
          <Gamepad2 size={25} />
          <div>
            <strong>Use the Polymons Player or play in your browser.</strong>
            <span>
              Both connect to the same Polymons game server and use the same
              account.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}

function DiscoverPage() {
  const { games } = useGames();
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Games</span>
          <h1>Discover</h1>
        </div>
        <p>Find something to play.</p>
      </section>
      <section className="content-section discover-section">
        <SectionHeading title="All games" eyebrow={`${games.length} games`} />
        <div className="game-grid discover-grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>
    </>
  );
}

function GamePage() {
  const { games, loaded } = useGames();
  const { gameId } = useParams<{ gameId: string }>();
  const game = games.find((item) => item.id === gameId);
  const { session, showAuth, refresh } = useAuth();
  const [launching, setLaunching] = useState<"player" | "browser" | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [browserSession, setBrowserSession] = useState<PlaySession | null>(null);
  const [playerOptions, setPlayerOptions] = useState(false);
  const [playerAttempted, setPlayerAttempted] = useState(false);

  useEffect(() => {
    setBrowserSession(null);
    setPlayerOptions(false);
    setLaunchError("");
  }, [gameId]);

  if (!game) {
    return loaded ? (
      <Navigate to="/discover" replace />
    ) : (
      <div className="baseplate-player baseplate-player-loading">
        Loading game...
      </div>
    );
  }
  const selectedGame = game;

  async function getPlaySession() {
    if (!session) {
      showAuth();
      return null;
    }

    try {
      return (await createPlaySession(selectedGame.id, session.accessToken))
        .playSession;
    } catch (error) {
      const renewed = await refresh();
      if (renewed) {
        return (await createPlaySession(selectedGame.id, renewed.accessToken))
          .playSession;
      }
      throw error;
    }
  }

  async function play(target: "player" | "browser") {
    setLaunching(target);
    setLaunchError("");
    try {
      if (target === "player") {
        if (!session) {
          showAuth();
          setPlayerOptions(false);
          return;
        }
        const getPlayerResources = async (accessToken: string) =>
          Promise.all([
            createPlaySession(selectedGame.id, accessToken),
            createPlayerAccountLink(accessToken),
          ]);
        let resources;
        try {
          resources = await getPlayerResources(session.accessToken);
        } catch {
          const renewed = await refresh();
          if (!renewed) throw new Error("Sign in again to open the Player.");
          resources = await getPlayerResources(renewed.accessToken);
        }
        const [playResult, accountResult] = resources;
        window.location.assign(
          playerLaunchUrl(
            playResult.playSession,
            accountResult.playerAccountLink.ticket,
          ),
        );
        setPlayerAttempted(true);
      } else {
        const next = await getPlaySession();
        if (!next) return;
        setBrowserSession(next);
      }
    } catch (error) {
      setLaunchError(
        error instanceof Error ? error.message : "Could not start the game.",
      );
    } finally {
      setLaunching(null);
    }
  }

  return (
    <>
      <Link to="/discover" className="back-link">
        <ChevronLeft size={18} />
        Back to games
      </Link>
      <section className="game-test-heading">
        <div>
          <span className="eyebrow">{game.genre}</span>
          <h1>{game.title}</h1>
          <p className="creator-line">
            by <strong>{game.creator}</strong>
          </p>
        </div>
        <div className="game-launch-actions">
          <button
            className="primary-button"
            onClick={() => {
              setPlayerOptions(true);
              setPlayerAttempted(false);
              setLaunchError("");
            }}
            disabled={launching !== null}
          >
            <Gamepad2 size={19} fill="currentColor" />
            {launching === "player" ? "Opening..." : "Play in Player"}
          </button>
          <button
            className="secondary-button"
            onClick={() => void play("browser")}
            disabled={launching !== null}
          >
            {launching === "browser" ? "Connecting..." : "Play in browser"}
          </button>
        </div>
      </section>
      {launchError && <div className="launch-error">{launchError}</div>}
      {playerOptions && (
        <PlayerOptionsDialog
          title="Play with Polymons Player"
          description={
            playerAttempted
              ? "The Player should be opening. If nothing happened, download it, run it once, then press Open Player again."
              : "Open the installed Player or download the portable Windows app."
          }
          opening={launching === "player"}
          onOpen={() => void play("player")}
          onClose={() => setPlayerOptions(false)}
        />
      )}
      {browserSession ? (
        <BrowserGame playSession={browserSession} />
      ) : (
        <div className="game-launch-panel">
          <GameArt game={game} wide />
          <div>
            <h2>Choose where to play</h2>
            <p>
              Open the Polymons Player or start {game.title} directly in this
              browser.
            </p>
          </div>
        </div>
      )}
      <section className="detail-columns">
        <div className="detail-panel">
          <span className="eyebrow">About</span>
          <h2>About {game.title}</h2>
          <p>{game.description || "No description provided."}</p>
        </div>
        <div className="detail-panel rules-panel">
          <span className="eyebrow">Controls</span>
          <ul>
            <li>Walk, sprint, jump, and fall</li>
            <li>Try the stairs and angled ramp</li>
            <li>Push the colored physics blocks</li>
          </ul>
        </div>
      </section>
    </>
  );
}

function BrowserGame({ playSession }: { playSession: PlaySession }) {
  const { user, session, refresh } = useAuth();
  const [runtime, setRuntime] = useState<PolyRuntimeResult | null>(null);
  const [gameLoading, setGameLoading] = useState(true);
  const [gameError, setGameError] = useState("");
  useEffect(() => {
    setGameLoading(true);
    setGameError("");
    void getGame(playSession.game.id)
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
  }, [playSession.game.id]);
  const {
    connection,
    remotePlayers,
    chatMessages,
    chatError,
    sendState,
    sendChat,
  } = useMultiplayer(playSession.websocketUrl, playSession.game.id);

  return (
    <div className="browser-game-wrap">
      <span className="connection-pill">{connection}</span>
      {gameLoading ? (
        <div className="baseplate-player baseplate-player-loading">
          Loading game...
        </div>
      ) : gameError ? (
        <div className="baseplate-player baseplate-player-loading">
          {gameError}
        </div>
      ) : (
        <Suspense
          fallback={
            <div className="baseplate-player baseplate-player-loading">
              Loading game...
            </div>
          }
        >
        <BaseplateGame
          remotePlayers={remotePlayers}
          onPlayerState={sendState}
          worldObjects={runtime?.project.objects}
          guiObjects={runtime?.project.gui}
          playerSettings={runtime?.project.playerSettings}
          leaderstats={runtime?.project.leaderstats}
          projectName={runtime?.project.name}
          localPlayer={user ?? undefined}
          chatMessages={chatMessages}
          chatError={chatError}
          onSendChat={sendChat}
          onGuiActivated={(guiObjectId) => {
            setRuntime((current) => {
              if (!current) return current;
              const activated = activatePolyGui(current.project, guiObjectId);
              return {
                ...activated,
                diagnostics: [...current.diagnostics, ...activated.diagnostics],
                output: [...current.output, ...activated.output],
              };
            });
          }}
          onFriendRequest={
            session
              ? async (username) => {
                  let activeSession = session;
                  if (
                    !activeSession.expiresAt ||
                    activeSession.expiresAt * 1000 < Date.now() + 60_000
                  ) {
                    const renewed = await refresh();
                    if (!renewed) throw new Error("Please sign in again.");
                    activeSession = renewed;
                  }
                  await sendFriendRequest(username, activeSession.accessToken);
                }
              : undefined
          }
        />
        </Suspense>
      )}
    </div>
  );
}

function FriendsPage() {
  const { session, showAuth, refresh } = useAuth();
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [message, setMessage] = useState("");
  const accessToken = useCallback(async () => {
    if (!session) return null;
    if (
      session.expiresAt &&
      session.expiresAt * 1000 >= Date.now() + 60_000
    ) {
      return session.accessToken;
    }
    return (await refresh())?.accessToken ?? null;
  }, [refresh, session]);
  const load = useCallback(async () => {
    const token = await accessToken();
    if (!token) return;
    try {
      setFriendships((await listFriends(token)).friendships);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load friends.");
    }
  }, [accessToken]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!session) {
    return (
      <section className="large-empty-state">
        <Users size={44} />
        <h2>Sign in to see your friends.</h2>
        <button className="primary-button" onClick={() => showAuth()}>Sign in</button>
      </section>
    );
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Your people</span>
          <h1>Friends</h1>
        </div>
      </section>
      {message && <div className="launch-error">{message}</div>}
      <section className="friend-list">
        {friendships.length === 0 ? (
          <div className="large-empty-state">
            <Users size={44} />
            <h2>No friends here yet.</h2>
            <p>Open the player list in a game with Tab and send someone a request.</p>
          </div>
        ) : (
          friendships.map((friendship) => (
            <article className="friend-row" key={friendship.id}>
              <Avatar name={friendship.user?.displayName ?? "?"} />
              <div>
                <strong>{friendship.user?.displayName ?? "Unknown player"}</strong>
                <span>@{friendship.user?.username ?? "unknown"}</span>
              </div>
              {friendship.status === "pending" && friendship.incoming ? (
                <button
                  className="primary-button"
                  onClick={async () => {
                    const token = await accessToken();
                    if (!token) {
                      setMessage("Please sign in again.");
                      return;
                    }
                    await acceptFriendRequest(friendship.id, token);
                    await load();
                  }}
                >
                  Accept
                </button>
              ) : friendship.status === "accepted" && friendship.gameId ? (
                <Link className="primary-button" to={`/games/${friendship.gameId}`}>
                  Join game
                </Link>
              ) : (
                <span className="friend-status">
                  {friendship.status === "accepted" ? "Offline" : "Pending"}
                </span>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}

function ProfilePage() {
  const { games } = useGames();
  const { user, session, logout, showAuth, refresh } = useAuth();
  const [playerOptions, setPlayerOptions] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const [syncError, setSyncError] = useState("");
  if (!user) {
    return (
      <section className="large-empty-state">
        <Avatar name="P" size="large" />
        <h2>Sign in to see your profile.</h2>
        <button className="primary-button" onClick={() => showAuth()}>
          Sign in
        </button>
      </section>
    );
  }

  async function syncPlayer() {
    if (!session) {
      showAuth();
      return;
    }
    setSyncing(true);
    setSyncError("");
    try {
      let result;
      try {
        result = await createPlayerAccountLink(session.accessToken);
      } catch {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to sync the Player.");
        result = await createPlayerAccountLink(renewed.accessToken);
      }
      window.location.assign(playerAccountUrl(result.playerAccountLink.ticket));
      setSyncAttempted(true);
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Could not sync the Player.",
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <section className="profile-hero">
        <div className="profile-glow" />
        <Avatar name={user.displayName} size="large" />
        <div className="profile-copy">
          <h1>{user.displayName}</h1>
          <span>@{user.username}</span>
          <p>Playing and building on Polymons.</p>
        </div>
        <div className="profile-actions">
          <button
            className="primary-button"
            onClick={() => {
              setPlayerOptions(true);
              setSyncAttempted(false);
              setSyncError("");
            }}
          >
            Sync to Player
          </button>
          <button className="secondary-button" onClick={logout}>Sign out</button>
        </div>
      </section>
      {playerOptions && (
        <PlayerOptionsDialog
          title="Sync your Player"
          description={
            syncAttempted
              ? "Your Player should now be signed in as this account. If it did not open, download it, run it once, then try again."
              : "Open Polymons Player to securely use this website account there."
          }
          error={syncError}
          opening={syncing}
          openLabel="Open and sync Player"
          onOpen={() => void syncPlayer()}
          onClose={() => setPlayerOptions(false)}
        />
      )}
      <section className="profile-stats">
        <div>
          <strong>0</strong>
          <span>Friends</span>
        </div>
        <div>
          <strong>1</strong>
          <span>Games</span>
        </div>
        <div>
          <strong>0</strong>
          <span>Game visits</span>
        </div>
      </section>
      <section className="content-section">
        <SectionHeading title={`${user.displayName}'s games`} />
        <div className="game-grid profile-games">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>
    </>
  );
}

function PlayerOptionsDialog({
  title,
  description,
  error,
  opening,
  openLabel = "Open Player",
  onOpen,
  onClose,
}: {
  title: string;
  description: string;
  error?: string;
  opening: boolean;
  openLabel?: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="auth-overlay" role="presentation">
      <button
        className="auth-backdrop"
        type="button"
        aria-label="Close"
        onClick={onClose}
      />
      <section
        className="auth-dialog player-options-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button className="auth-close" type="button" onClick={onClose}>
          Close
        </button>
        <span className="eyebrow">Polymons Player</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {error && <div className="auth-error">{error}</div>}
        <div className="player-options-actions">
          <button
            className="primary-button"
            type="button"
            onClick={onOpen}
            disabled={opening}
          >
            <Gamepad2 size={18} />
            {opening ? "Opening..." : openLabel}
          </button>
          <a
            className="secondary-button"
            href={POLYMONS_PLAYER_DOWNLOAD_URL}
          >
            <Download size={18} />
            Download Player
          </a>
        </div>
        <p className="player-options-note">
          Windows may show a SmartScreen warning because the Player is not
          code-signed yet.
        </p>
      </section>
    </div>
  );
}

function CreatePage() {
  const [modelInfo, setModelInfo] = useState("");
  return (
    <>
      <section className="create-hero">
        <div>
          <span className="eyebrow">Creator tools</span>
          <h1>Build something worth playing.</h1>
          <p>
            Start with Baseplate and shape it into your own game.
          </p>
          <div className="create-actions">
            <a href={POLY_STUDIO_DOWNLOAD_URL} className="primary-button">
              <Download size={19} />
              Download Poly Studio
            </a>
            <label className="secondary-button model-import-button">
              Import .pmxl model
              <input
                type="file"
                accept=".pmxl,application/json"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const parsed = JSON.parse(await file.text()) as {
                      format?: string;
                      version?: number;
                      model?: { name?: string; parts?: unknown[] };
                    };
                    if (
                      parsed.format !== "pmxl" ||
                      parsed.version !== 1 ||
                      !parsed.model?.name ||
                      !Array.isArray(parsed.model.parts)
                    ) {
                      throw new Error("That is not a valid PMXL model.");
                    }
                    setModelInfo(
                      `${parsed.model.name}: ${parsed.model.parts.length} parts. Open it from Poly Studio's PMXL button.`,
                    );
                  } catch (error) {
                    setModelInfo(error instanceof Error ? error.message : "Could not read PMXL.");
                  }
                }}
              />
            </label>
          </div>
          {modelInfo && <p className="model-import-status">{modelInfo}</p>}
        </div>
        <div className="create-blocks" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
      <section className="creator-grid">
        <article>
          <span>01</span>
          <h2>Build</h2>
          <p>Make the game you wish already existed.</p>
        </article>
        <article>
          <span>02</span>
          <h2>Publish</h2>
          <p>Put it online when you are ready, not before.</p>
        </article>
        <article>
          <span>03</span>
          <h2>Play</h2>
          <p>Invite friends, listen to players, and keep making it better.</p>
        </article>
      </section>
    </>
  );
}

export default function App() {
  return <Layout />;
}
