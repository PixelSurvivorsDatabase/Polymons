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
import { currentUser, friends, games, type Game } from "./data";

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
          <span className="live-dot" />
          <span>{game.players} playing</span>
          <span className="stat-divider" />
          <span>{game.rating}%</span>
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
          <span className="eyebrow">Wednesday, June 10</span>
          <h1>Hey, {currentUser.name}.</h1>
          <p>What are we playing?</p>
        </div>
        <div className="friends-online">
          <span className="eyebrow">Friends online</span>
          <div className="avatar-stack">
            {friends
              .filter((friend) => friend.online)
              .map((friend) => (
                <Avatar
                  key={friend.handle}
                  name={friend.name}
                  color={friend.color}
                  size="small"
                />
              ))}
            <span className="avatar-count">3</span>
          </div>
        </div>
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
              Play
            </Link>
            <Link to={`/games/${featured.id}`} className="secondary-button">
              Details
            </Link>
          </div>
          <div className="hero-meta">
            <span>
              <span className="live-dot" /> {featured.players} playing
            </span>
            <span>{featured.rating}% liked</span>
          </div>
        </div>
        <div className="hero-art">
          <div className="hero-planet">
            <span>{featured.glyph}</span>
          </div>
          <div className="hero-island island-one" />
          <div className="hero-island island-two" />
          <div className="hero-island island-three" />
        </div>
      </section>

      <section className="content-section">
        <SectionHeading title="Jump back in" link="/discover" />
        <div className="game-grid">
          {games.slice(1, 5).map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

      <section className="content-section">
        <SectionHeading title="Friends are playing" link="/friends" />
        <div className="friend-playing-grid">
          {friends
            .filter((friend) => friend.game)
            .map((friend) => (
              <Link
                to={`/games/${
                  games.find((game) => game.title === friend.game)?.id ??
                  games[0].id
                }`}
                className="friend-playing-card"
                key={friend.handle}
              >
                <Avatar name={friend.name} color={friend.color} />
                <div>
                  <strong>{friend.name}</strong>
                  <span>Playing {friend.game}</span>
                </div>
                <Gamepad2 size={20} />
              </Link>
            ))}
        </div>
      </section>
    </>
  );
}

const genres = ["All games", "Adventure", "Racing", "Building", "RPG", "Party"];

function DiscoverPage() {
  const [genre, setGenre] = useState("All games");
  const visibleGames =
    genre === "All games" ? games : games.filter((game) => game.genre === genre);
  return (
    <>
      <section className="page-heading">
        <div>
          <span className="eyebrow">Find your next favorite</span>
          <h1>Discover</h1>
        </div>
        <p>Games made by people who care about making something fun.</p>
      </section>
      <div className="filter-row" role="group" aria-label="Filter games by genre">
        {genres.map((item) => (
          <button
            key={item}
            className={genre === item ? "active" : ""}
            onClick={() => setGenre(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <section className="content-section discover-section">
        <SectionHeading
          title={genre === "All games" ? "Popular right now" : genre}
          eyebrow={`${visibleGames.length} games`}
        />
        <div className="game-grid discover-grid">
          {visibleGames.map((game) => (
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
              <strong>{game.rating}%</strong>
              <span>Liked</span>
            </div>
            <div>
              <strong>Everyone</strong>
              <span>Age rating</span>
            </div>
          </div>
          <button className="primary-button play-button">
            <Gamepad2 size={21} fill="currentColor" />
            Play {game.title}
          </button>
        </div>
      </section>
      <section className="detail-columns">
        <div className="detail-panel">
          <span className="eyebrow">About this game</span>
          <h2>Grab some friends and jump in.</h2>
          <p>
            This is placeholder copy for the first Polymons milestone. Game
            creators will be able to write their own descriptions, add
            screenshots, and tell players what makes their game worth playing.
          </p>
        </div>
        <div className="detail-panel rules-panel">
          <span className="eyebrow">Good to know</span>
          <ul>
            <li>Works with keyboard and controller</li>
            <li>Made for 1–12 players</li>
            <li>Last updated today</li>
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
          <span className="eyebrow">Your people</span>
          <h1>Friends</h1>
        </div>
        <button className="primary-button">
          <Plus size={18} />
          Add friend
        </button>
      </section>
      <section className="friends-layout">
        <div className="friends-list">
          <SectionHeading title="Online now" eyebrow="3 friends" />
          {friends.map((friend) => (
            <article className="friend-row" key={friend.handle}>
              <div className="friend-avatar-wrap">
                <Avatar name={friend.name} color={friend.color} />
                <span className={friend.online ? "online" : ""} />
              </div>
              <div className="friend-copy">
                <div>
                  <strong>{friend.name}</strong>
                  <span>{friend.handle}</span>
                </div>
                <p>{friend.status}</p>
              </div>
              {friend.game ? (
                <button className="small-button">Join game</button>
              ) : (
                <button className="small-button muted">Message</button>
              )}
            </article>
          ))}
        </div>
        <aside className="friend-side-card">
          <div className="side-card-art">
            <Users size={44} />
          </div>
          <h2>Games are better together.</h2>
          <p>See what friends are playing and jump into the same game.</p>
        </aside>
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
          <strong>42</strong>
          <span>Friends</span>
        </div>
        <div>
          <strong>3</strong>
          <span>Games</span>
        </div>
        <div>
          <strong>1.2K</strong>
          <span>Game visits</span>
        </div>
      </section>
      <section className="content-section">
        <SectionHeading title={`${currentUser.name}'s games`} />
        <div className="game-grid profile-games">
          {games.slice(2, 5).map((game) => (
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
          <h1>Make something people want to play.</h1>
          <p>
            Start a game, give it a name, and decide who can play it. The full
            creator dashboard comes in a later milestone.
          </p>
          <button className="primary-button">
            <Plus size={19} />
            Create a game
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
