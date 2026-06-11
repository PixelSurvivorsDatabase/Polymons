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
import { useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { currentUser, games, type Game } from "./data";

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
      <div className="sidebar-user">
        <Avatar name={currentUser.name} size="small" />
        <div>
          <strong>{currentUser.name}</strong>
          <span>{currentUser.handle}</span>
        </div>
      </div>
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
        <button className="icon-button notification-button" aria-label="Notifications">
          <Bell size={20} />
          <span className="notification-dot" />
        </button>
        <Link className="topbar-avatar" to="/profile" aria-label="Your profile">
          <Avatar name={currentUser.name} size="small" />
        </Link>
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
          <span>Private test</span>
          <span className="stat-divider" />
          <span>Offline</span>
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
  return (
    <>
      <section className="welcome-row">
        <div>
          <span className="eyebrow">Pre-alpha development</span>
          <h1>Hey, {currentUser.name}.</h1>
          <p>What are we playing?</p>
        </div>
        <span className="build-badge">Pre-alpha build</span>
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
          <span className="hero-label">Current test game</span>
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
            <span>Private test</span>
            <span>No live servers yet</span>
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
        <SectionHeading title="Testing now" link="/discover" />
        <div className="game-grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      <section className="content-section">
        <SectionHeading title="Online play comes later" />
        <div className="empty-state">
          <Users size={25} />
          <div>
            <strong>First, make the game feel good.</strong>
            <span>
              Friends, accounts, and live servers will be connected after the
              Baseplate client works.
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
          <span className="eyebrow">Private test library</span>
          <h1>Discover</h1>
        </div>
        <p>Public games will appear here when the game client is ready.</p>
      </section>
      <section className="content-section discover-section">
        <SectionHeading
          title="Development games"
          eyebrow="1 private game"
        />
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
  return (
    <>
      <Link to="/discover" className="back-link">
        <ChevronLeft size={18} />
        Back to games
      </Link>
      <section className="game-detail-hero">
        <GameArt game={game} wide />
        <div className="game-detail-copy">
          <span className="eyebrow">{game.genre}</span>
          <h1>{game.title}</h1>
          <p className="creator-line">
            by <strong>{game.creator}</strong>
          </p>
          <p className="game-description">{game.description}</p>
          <div className="detail-stats">
            <div>
              <strong>{game.players}</strong>
              <span>Playing now</span>
            </div>
            <div>
              <strong>Offline</strong>
              <span>Server status</span>
            </div>
            <div>
              <strong>Private</strong>
              <span>Access</span>
            </div>
          </div>
          <button className="primary-button play-button">
            <Gamepad2 size={21} fill="currentColor" />
            Launch integration comes next
          </button>
        </div>
      </section>
      <section className="detail-columns">
        <div className="detail-panel">
          <span className="eyebrow">About this test</span>
          <h2>The starting point for the game itself.</h2>
          <p>
            Baseplate is where movement, camera controls, physics, building,
            character spawning, and the launcher connection will be tested
            before Polymons adds public games.
          </p>
        </div>
        <div className="detail-panel rules-panel">
          <span className="eyebrow">Good to know</span>
          <ul>
            <li>No account required yet</li>
            <li>No remote game server yet</li>
            <li>Not publicly playable</li>
          </ul>
        </div>
      </section>
    </>
  );
}

function FriendsPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Not connected yet</span>
          <h1>Friends</h1>
        </div>
      </section>
      <section className="large-empty-state">
        <div className="side-card-art">
          <Users size={44} />
        </div>
        <span className="eyebrow">Later milestone</span>
        <h2>Friends will live here.</h2>
        <p>
          We will connect accounts, friend requests, presence, and joining
          games after the Baseplate client and launcher are working.
        </p>
      </section>
    </>
  );
}

function ProfilePage() {
  return (
    <>
      <section className="profile-hero">
        <div className="profile-glow" />
        <Avatar name={currentUser.name} size="large" />
        <div className="profile-copy">
          <h1>{currentUser.name}</h1>
          <span>{currentUser.handle}</span>
          <p>{currentUser.bio}</p>
          <small>Joined {currentUser.joined}</small>
        </div>
        <button className="secondary-button">Edit profile</button>
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
        <SectionHeading title={`${currentUser.name}'s games`} />
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
          <h1>Build the first working game.</h1>
          <p>
            Baseplate is the only project for now. Creator publishing and
            public game listings come after the client can actually play.
          </p>
          <button className="primary-button">
            <Plus size={19} />
            Open Baseplate project
          </button>
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
