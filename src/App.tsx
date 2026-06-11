import {
  Bell,
  ChevronLeft,
  Compass,
  Gamepad2,
  Home,
  Menu,
  Plus,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
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
  createPlaySession,
  playerLaunchUrl,
  type PlaySession,
} from "./api";
import { useAuth } from "./auth";
import { games, type Game } from "./data";
import { useMultiplayer } from "./game/multiplayer";

const BaseplateGame = lazy(() => import("./game/BaseplateGame"));

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
          <span>Playable</span>
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
        <SectionHeading title="All games" eyebrow="1 game" />
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
  const { gameId } = useParams<{ gameId: string }>();
  const game = games.find((item) => item.id === gameId) ?? games[0];
  const { session, showAuth, refresh } = useAuth();
  const [launching, setLaunching] = useState<"player" | "browser" | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [browserSession, setBrowserSession] = useState<PlaySession | null>(null);

  async function getPlaySession() {
    if (!session) {
      showAuth();
      return null;
    }

    try {
      return (await createPlaySession(game.id, session.accessToken)).playSession;
    } catch (error) {
      const renewed = await refresh();
      if (renewed) {
        return (await createPlaySession(game.id, renewed.accessToken)).playSession;
      }
      throw error;
    }
  }

  async function play(target: "player" | "browser") {
    setLaunching(target);
    setLaunchError("");
    try {
      const next = await getPlaySession();
      if (!next) return;
      if (target === "player") {
        window.location.assign(playerLaunchUrl(next));
      } else {
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
            onClick={() => void play("player")}
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
      {browserSession ? (
        <BrowserGame playSession={browserSession} />
      ) : (
        <div className="game-launch-panel">
          <GameArt game={game} wide />
          <div>
            <h2>Choose where to play</h2>
            <p>
              Open the Polymons Player or start Baseplate directly in this
              browser.
            </p>
          </div>
        </div>
      )}
      <section className="detail-columns">
        <div className="detail-panel">
          <span className="eyebrow">About</span>
          <h2>A simple world with room to move.</h2>
          <p>
            The current avatar has a head, torso, two arms, and two legs. Its
            controller uses a capsule collider, acceleration, gravity,
            grounded jumping, camera-relative movement, and physical crates
            that can be pushed around.
          </p>
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
  const { connection, remotePlayers, sendState } = useMultiplayer(
    playSession.websocketUrl,
  );

  return (
    <div className="browser-game-wrap">
      <span className="connection-pill">{connection}</span>
      <Suspense
        fallback={
          <div className="baseplate-player baseplate-player-loading">
            Loading Baseplate...
          </div>
        }
      >
        <BaseplateGame
          remotePlayers={remotePlayers}
          onPlayerState={sendState}
        />
      </Suspense>
    </div>
  );
}

function FriendsPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Your people</span>
          <h1>Friends</h1>
        </div>
      </section>
      <section className="large-empty-state">
        <div className="side-card-art">
          <Users size={44} />
        </div>
        <span className="eyebrow">Friends</span>
        <h2>No friends here yet.</h2>
        <p>Find people you know and play games together.</p>
      </section>
    </>
  );
}

function ProfilePage() {
  const { user, logout, showAuth } = useAuth();
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
        <button className="secondary-button" onClick={logout}>Sign out</button>
      </section>
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

function CreatePage() {
  return (
    <>
      <section className="create-hero">
        <div>
          <span className="eyebrow">Creator tools</span>
          <h1>Build something worth playing.</h1>
          <p>
            Start with Baseplate and shape it into your own game.
          </p>
          <Link to="/games/baseplate" className="primary-button">
            <Plus size={19} />
            Open Baseplate project
          </Link>
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
