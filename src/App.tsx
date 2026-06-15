import {
  Award,
  Bell,
  ChevronLeft,
  Compass,
  Download,
  Gamepad2,
  Heart,
  Home,
  Menu,
  Play,
  Plus,
  Search,
  Shirt,
  Tickets,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  awardGameBadge,
  claimAvatarItem,
  createPlayerAccountLink,
  createPlaySession,
  equipShirt,
  equipPants,
  getGameLibrary,
  getGame,
  getCreatorAnalytics,
  getGameEntitlements,
  getPlayerProfile,
  getWardrobe,
  listAvatarUploads,
  listFriendServers,
  listGameServers,
  listFriends,
  listGames,
  playerAccountUrl,
  playerLaunchUrl,
  POLYMONS_PLAYER_DOWNLOAD_URL,
  POLY_STUDIO_DOWNLOAD_URL,
  purchaseDeveloperProduct,
  purchaseGamePass,
  sendFriendRequest,
  setCreatorFollow,
  setGameFavorite,
  searchPlayers,
  submitAvatarUpload,
  type AvatarCatalogSubmission,
  type Friendship,
  type PlatformGame,
  type PlaySession,
  type PolymonsUser,
  type PublicPlayer,
  type PublicPlayerProfile,
  type Wardrobe,
  updateAvatarAppearance,
  updateProfile,
} from "./api";
import type {
  AvatarItemId,
  PantsId,
  ShirtId,
} from "./game/avatarCatalog";
import {
  DEFAULT_AVATAR_APPEARANCE,
  normalizeAvatarAppearance,
  type AvatarAppearance,
  type AvatarBodyColors,
} from "./game/avatarAppearance";
import { useAuth } from "./auth";
import { games as fallbackGames, type Game } from "./data";
import { useMultiplayer } from "./game/multiplayer";
import {
  activatePolyGui,
  activatePolyInput,
  activatePolyTouched,
  activatePolyTool,
  runPolyProject,
  type PolyPlayerData,
  type PolyRuntimeResult,
} from "./game/polyProject";
import { usePolyRuntimeScheduler } from "./game/usePolyRuntimeScheduler";
import shirtTemplateUrl from "../assets/templates/polymons-shirt-template.png";
import pantsTemplateUrl from "../assets/templates/polymons-pants-template.png";
import {
  SHIRT_TEMPLATE_HEIGHT,
  SHIRT_TEMPLATE_WIDTH,
} from "./game/shirtTemplate";
import {
  avatarThumbnailDataUrl,
  type AvatarThumbnailPlayer,
} from "./game/avatarThumbnail";

const BaseplateGame = lazy(() => import("./game/BaseplateGame"));
const AvatarPreview = lazy(() => import("./game/AvatarPreview"));

async function clothingFileToTemplateDataUrl(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  normalized: boolean;
}> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read this PNG."));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read this PNG."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error("Could not load this PNG."));
    nextImage.src = rawDataUrl;
  });
  if (
    image.naturalWidth === SHIRT_TEMPLATE_WIDTH &&
    image.naturalHeight === SHIRT_TEMPLATE_HEIGHT
  ) {
    return {
      dataUrl: rawDataUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      normalized: false,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = SHIRT_TEMPLATE_WIDTH;
  canvas.height = SHIRT_TEMPLATE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not prepare this PNG.");
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: image.naturalWidth,
    height: image.naturalHeight,
    normalized: true,
  };
}

function runtimePlayerData(
  user: Pick<PolymonsUser, "polymonsId" | "username" | "displayName"> | null | undefined,
  entitlements?: Awaited<ReturnType<typeof getGameEntitlements>>,
): PolyPlayerData | undefined {
  return user
    ? {
        userId: user.polymonsId,
        username: user.username,
        displayName: user.displayName,
        gamePasses: entitlements?.gamePassNames ?? [],
        badges: entitlements?.badges ?? [],
        playerData: entitlements?.playerData ?? {},
      }
    : undefined;
}

function displayGame(game: PlatformGame): Game {
  return {
    id: game.slug,
    platformId: game.id,
    title: game.title,
    creator: game.creator,
    creatorUsername: game.creatorUsername,
    players: String(game.activePlayers),
    visits: game.visits ?? 0,
    favorites: game.favorites ?? 0,
    rating: 0,
    genre: game.genre,
    description: game.description,
    colors: ["#7247d8", "#36a777"],
    glyph: game.title.slice(0, 1).toUpperCase(),
    thumbnailUrl: game.thumbnailUrl,
    createdAt: game.createdAt ?? game.updatedAt,
    updatedAt: game.updatedAt,
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

function useGameLibrary(games: Game[]) {
  const { session, refresh } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!session) {
      setFavoriteIds([]);
      setRecentIds([]);
      return;
    }
    try {
      const library = await getGameLibrary(session.accessToken);
      setFavoriteIds(library.favoriteGameIds);
      setRecentIds(library.recentGames.map((item) => item.game_id));
    } catch {
      const renewed = await refresh();
      if (!renewed) return;
      const library = await getGameLibrary(renewed.accessToken);
      setFavoriteIds(library.favoriteGameIds);
      setRecentIds(library.recentGames.map((item) => item.game_id));
    }
  }, [refresh, session]);

  useEffect(() => {
    void load();
  }, [load]);

  const byPlatformId = new Map(
    games.flatMap((game) => (game.platformId ? [[game.platformId, game]] : [])),
  );
  return {
    favoriteIds,
    setFavoriteIds,
    favoriteGames: favoriteIds.flatMap((id) => {
      const game = byPlatformId.get(id);
      return game ? [game] : [];
    }),
    recentGames: recentIds.flatMap((id) => {
      const game = byPlatformId.get(id);
      return game ? [game] : [];
    }),
  };
}

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/friends", label: "Friends", icon: Users },
  { to: "/avatar", label: "Avatar", icon: Shirt },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/create", label: "Create", icon: Plus },
];

function Avatar({
  name,
  player,
  color = "#7557ff",
  size = "medium",
}: {
  name: string;
  player?: AvatarThumbnailPlayer;
  color?: string;
  size?: "small" | "medium" | "large";
}) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ "--avatar-color": color } as React.CSSProperties}
      aria-hidden="true"
    >
      {player ? (
        <img
          src={avatarThumbnailDataUrl(player)}
          alt=""
          draggable={false}
        />
      ) : (
        name.slice(0, 1)
      )}
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
          <Avatar name={user.displayName} player={user} size="small" />
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
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [searching, setSearching] = useState(false);
  const { user, showAuth } = useAuth();
  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setPlayers([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchPlayers(value)
        .then((result) => setPlayers(result.players))
        .catch(() => setPlayers([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);
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
        <div className="search-shell">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="Search Polymons players"
              placeholder="Search players"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <kbd>/</kbd>
          </label>
          {query.trim() && (
            <div className="player-search-results">
              {players.map((player) => (
                <Link
                  key={player.id}
                  to={`/players/${player.username}`}
                  onClick={() => setQuery("")}
                >
                  <Avatar name={player.displayName} player={player} size="small" />
                  <span>
                    <strong>{player.displayName}</strong>
                    <small>@{player.username} · ID {player.polymonsId}</small>
                  </span>
                </Link>
              ))}
              {!searching && players.length === 0 && <p>No players found.</p>}
              {searching && <p>Searching...</p>}
            </div>
          )}
        </div>
        {user ? (
          <>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
            >
              <Bell size={20} />
            </button>
            <Link className="topbar-avatar" to="/profile" aria-label="Your profile">
              <Avatar name={user.displayName} player={user} size="small" />
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
            <Route path="/avatar" element={<WardrobePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/players/:username" element={<ProfilePage />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/create/catalog/:itemId" element={<CatalogItemPage />} />
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
          ...(game.thumbnailUrl
            ? { backgroundImage: `url("${game.thumbnailUrl}")` }
            : {}),
        } as React.CSSProperties
      }
      data-thumbnail={game.thumbnailUrl ? "true" : undefined}
    >
      {!game.thumbnailUrl && game.id === "baseplate" && (
        <span className="baseplate-grid" aria-hidden="true" />
      )}
      {!game.thumbnailUrl && (
        <>
          <span className="art-orbit art-orbit-one" />
          <span className="art-orbit art-orbit-two" />
          <strong>{game.glyph}</strong>
          <span className="art-shine" />
        </>
      )}
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
  const { user, session, showAuth } = useAuth();
  const library = useGameLibrary(games);
  const [friendServers, setFriendServers] = useState<
    Awaited<ReturnType<typeof listFriendServers>>["servers"]
  >([]);
  useEffect(() => {
    if (!session) {
      setFriendServers([]);
      return;
    }
    void listFriendServers(session.accessToken)
      .then((result) => setFriendServers(result.servers))
      .catch(() => setFriendServers([]));
  }, [session]);
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

      {user && library.recentGames.length > 0 && (
        <section className="content-section">
          <SectionHeading title="Recently played" />
          <div className="game-grid">
            {library.recentGames.slice(0, 4).map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}

      {user && library.favoriteGames.length > 0 && (
        <section className="content-section">
          <SectionHeading title="Favorites" />
          <div className="game-grid">
            {library.favoriteGames.slice(0, 4).map((game) => (
              <GameCard key={game.id} game={game} />
            ))}
          </div>
        </section>
      )}

      {user && friendServers.length > 0 && (
        <section className="content-section">
          <SectionHeading title="Servers your friends are in" />
          <div className="friend-server-grid">
            {friendServers.map((server) => (
              <Link
                key={server.id}
                className="friend-server-card"
                to={`/games/${server.game.slug}`}
              >
                <div
                  className="friend-server-art"
                  style={
                    server.game.thumbnailUrl
                      ? { backgroundImage: `url("${server.game.thumbnailUrl}")` }
                      : undefined
                  }
                />
                <div>
                  <strong>{server.game.title}</strong>
                  <span>
                    {server.friends.map((friend) => friend.displayName).join(", ")}
                  </span>
                  <small>{server.playerCount} players in this server</small>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
  const { games: allGames } = useGames();
  const [query, setQuery] = useState("");
  const [games, setGames] = useState(allGames);
  const [searching, setSearching] = useState(false);
  useEffect(() => setGames(allGames), [allGames]);
  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setGames(allGames);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void listGames(value)
        .then((result) => setGames(result.games.map(displayGame)))
        .catch(() => setGames([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [allGames, query]);
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
        <label className="discover-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games by name, description, or genre"
          />
        </label>
        <SectionHeading title="All games" eyebrow={`${games.length} games`} />
        <div className="game-grid discover-grid">
          {games.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
        {searching && <div className="empty-state">Searching games...</div>}
        {!searching && games.length === 0 && (
          <div className="empty-state">No games matched that search.</div>
        )}
      </section>
    </>
  );
}

function GamePage() {
  const { games, loaded } = useGames();
  const { gameId } = useParams<{ gameId: string }>();
  const game = games.find((item) => item.id === gameId);
  const { user, session, showAuth, refresh, updateUser } = useAuth();
  const library = useGameLibrary(games);
  const [launching, setLaunching] = useState<"player" | "browser" | null>(null);
  const [launchError, setLaunchError] = useState("");
  const [browserSession, setBrowserSession] = useState<PlaySession | null>(null);
  const [playerOptions, setPlayerOptions] = useState(false);
  const [playerAttempted, setPlayerAttempted] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<"about" | "store" | "servers">("about");
  const [servers, setServers] = useState<
    Awaited<ReturnType<typeof listGameServers>>["servers"]
  >([]);
  const [gameBadges, setGameBadges] = useState<
    NonNullable<PlatformGame["badges"]>
  >([]);
  const [gamePasses, setGamePasses] = useState<
    NonNullable<PlatformGame["gamePasses"]>
  >([]);
  const [ownedGamePassIds, setOwnedGamePassIds] = useState<string[]>([]);
  const [storeStatus, setStoreStatus] = useState("");
  const [buyingPassId, setBuyingPassId] = useState<string | null>(null);

  useEffect(() => {
    setBrowserSession(null);
    setPlayerOptions(false);
    setLaunchError("");
    setStoreStatus("");
    setActiveInfoTab("about");
  }, [gameId]);
  useEffect(() => {
    if (!game) return;
    const reference = game.platformId ?? game.id;
    void Promise.all([listGameServers(reference), getGame(reference)])
      .then(([serverResult, gameResult]) => {
        setServers(serverResult.servers);
        setGameBadges(gameResult.game.badges ?? []);
        setGamePasses(gameResult.game.gamePasses ?? []);
      })
      .catch(() => {
        setServers([]);
        setGameBadges([]);
        setGamePasses([]);
      });
  }, [game]);
  useEffect(() => {
    if (!game || !session) {
      setOwnedGamePassIds([]);
      return;
    }
    const reference = game.platformId ?? game.id;
    void getGameEntitlements(reference, session.accessToken)
      .then((result) => setOwnedGamePassIds(result.gamePasses))
      .catch(() => setOwnedGamePassIds([]));
  }, [game, session]);

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
  const isFavorite = Boolean(
    selectedGame.platformId &&
      library.favoriteIds.includes(selectedGame.platformId),
  );

  async function toggleFavorite() {
    if (!session) {
      showAuth();
      return;
    }
    const favorite = !isFavorite;
    const gameReference = selectedGame.platformId ?? selectedGame.id;
    try {
      await setGameFavorite(gameReference, favorite, session.accessToken);
    } catch {
      const renewed = await refresh();
      if (!renewed) throw new Error("Sign in again to update favorites.");
      await setGameFavorite(gameReference, favorite, renewed.accessToken);
    }
    if (!selectedGame.platformId) return;
    library.setFavoriteIds((current) =>
      favorite
        ? [...new Set([...current, selectedGame.platformId!])]
        : current.filter((id) => id !== selectedGame.platformId),
    );
  }

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

  async function buyGamePass(passId: string) {
    if (!session) {
      showAuth();
      return;
    }
    const gameReference = selectedGame.platformId ?? selectedGame.id;
    setBuyingPassId(passId);
    setStoreStatus("");
    try {
      let result;
      try {
        result = await purchaseGamePass(
          gameReference,
          passId,
          session.accessToken,
        );
      } catch {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to buy this gamepass.");
        result = await purchaseGamePass(gameReference, passId, renewed.accessToken);
      }
      setOwnedGamePassIds((current) => [...new Set([...current, passId])]);
      if (user) updateUser({ ...user, tix: result.tix });
      setStoreStatus("Gamepass added to your account.");
    } catch (error) {
      setStoreStatus(
        error instanceof Error ? error.message : "Could not buy this gamepass.",
      );
    } finally {
      setBuyingPassId(null);
    }
  }

  return (
    <>
      <Link to="/discover" className="back-link">
        <ChevronLeft size={18} />
        Back to games
      </Link>
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
        <BrowserGame
          playSession={browserSession}
          onLeave={() => setBrowserSession(null)}
        />
      ) : (
        <>
          <section className="game-detail-hero">
            <GameArt game={game} wide />
            <div className="game-detail-summary">
              <span className="eyebrow">{game.genre}</span>
              <h1>{game.title}</h1>
              <p className="creator-line">
                By{" "}
                <Link to={`/players/${game.creatorUsername}`}>
                  <strong>{game.creator}</strong>
                </Link>
              </p>
              <p className="game-maturity">Maturity: All ages</p>
              <button
                className="game-play-button"
                aria-label="Play in Polymons Player"
                onClick={() => {
                  setPlayerOptions(true);
                  setPlayerAttempted(false);
                  setLaunchError("");
                }}
                disabled={launching !== null}
              >
                <Play size={30} fill="currentColor" />
                <span>
                  {launching === "player" ? "Opening..." : "Play"}
                </span>
              </button>
              <div className="game-detail-actions">
                <button
                  className={isFavorite ? "active" : ""}
                  onClick={() => void toggleFavorite()}
                >
                  <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                  {isFavorite ? "Favorited" : "Favorite"}
                </button>
                <button
                  onClick={() => void play("browser")}
                  disabled={launching !== null}
                >
                  <Gamepad2 size={20} />
                  {launching === "browser" ? "Connecting" : "Browser"}
                </button>
              </div>
            </div>
          </section>
          <nav className="game-detail-tabs" aria-label="Game information">
            <button
              className={activeInfoTab === "about" ? "active" : ""}
              onClick={() => setActiveInfoTab("about")}
            >
              About
            </button>
            <button
              className={activeInfoTab === "store" ? "active" : ""}
              onClick={() => setActiveInfoTab("store")}
            >
              Store
            </button>
            <button
              className={activeInfoTab === "servers" ? "active" : ""}
              onClick={() => setActiveInfoTab("servers")}
            >
              Servers
            </button>
          </nav>
          {activeInfoTab === "about" && (
            <>
              <section className="game-about-panel">
                <h2>Description</h2>
                <p>{game.description || "No description provided."}</p>
              </section>
              {gameBadges.length > 0 && (
                <section className="game-about-panel">
                  <h2>Badges</h2>
                  <div className="game-badge-row">
                    {gameBadges.map((badge) => (
                      <article key={badge.id}>
                        {badge.iconUrl ? (
                          <img src={badge.iconUrl} alt="" />
                        ) : (
                          <span><Award size={22} /></span>
                        )}
                        <div>
                          <strong>{badge.name}</strong>
                          <p>{badge.description}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {activeInfoTab === "store" && (
            <section className="game-about-panel">
              <h2>Store</h2>
              <p className="muted-copy">
                Buy gamepasses with Tix. The creator gets the Tix from each sale.
              </p>
              {storeStatus && <p className="wardrobe-status">{storeStatus}</p>}
              <div className="gamepass-grid">
                {gamePasses.map((pass) => {
                  const owned = ownedGamePassIds.includes(pass.id);
                  return (
                    <article key={pass.id} className="gamepass-card">
                      <span className="gamepass-icon">
                        <Tickets size={24} />
                      </span>
                      <div>
                        <strong>{pass.name}</strong>
                        <p>{pass.description || "Gamepass perk."}</p>
                        <small>{pass.priceTix.toLocaleString()} Tix</small>
                      </div>
                      <button
                        className={owned ? "secondary-button" : "primary-button"}
                        disabled={owned || buyingPassId === pass.id}
                        onClick={() => void buyGamePass(pass.id)}
                      >
                        {owned
                          ? "Owned"
                          : buyingPassId === pass.id
                            ? "Buying..."
                            : "Buy"}
                      </button>
                    </article>
                  );
                })}
                {gamePasses.length === 0 && (
                  <p className="muted-copy">
                    This game does not have any gamepasses yet.
                  </p>
                )}
              </div>
            </section>
          )}
          {activeInfoTab === "servers" && (
            <section className="game-about-panel">
              <h2>Servers</h2>
              <div className="game-server-list">
                {servers.map((server) => (
                  <article key={server.id}>
                    <div>
                      <strong>{server.playerCount} players</strong>
                      <span>
                        {server.players.map((player) => player.displayName).join(", ")}
                      </span>
                    </div>
                    <button
                      className="primary-button"
                      onClick={() => void play("browser")}
                    >
                      Join
                    </button>
                  </article>
                ))}
                {servers.length === 0 && (
                  <p className="muted-copy">
                    No live server yet. Starting the game will create one.
                  </p>
                )}
              </div>
            </section>
          )}
          <section className="game-detail-stats" aria-label="Game statistics">
            {[
              ["Active", Number(game.players).toLocaleString()],
              ["Favorites", game.favorites.toLocaleString()],
              ["Visits", game.visits.toLocaleString()],
              ["Camera", "Supported"],
              [
                "Created",
                new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(game.createdAt)),
              ],
              [
                "Updated",
                new Intl.DateTimeFormat(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(game.updatedAt)),
              ],
              ["Server size", "20"],
              ["Genre", game.genre],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}

function BrowserGame({
  playSession,
  onLeave,
}: {
  playSession: PlaySession;
  onLeave: () => void;
}) {
  const { user, session, refresh, updateUser } = useAuth();
  const [activeSession, setActiveSession] = useState(playSession);
  const [runtime, setRuntime] = useState<PolyRuntimeResult | null>(null);
  usePolyRuntimeScheduler(runtime, setRuntime);
  const [gameLoading, setGameLoading] = useState(true);
  const [gameError, setGameError] = useState("");
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState("");
  const submittedBadges = useRef(new Set<string>());
  const submittedPurchases = useRef(new Set<string>());
  useEffect(() => setActiveSession(playSession), [playSession]);
  useEffect(() => {
    setGameLoading(true);
    setGameError("");
    void (async () => {
      const result = await getGame(playSession.game.id);
      let entitlements:
        | Awaited<ReturnType<typeof getGameEntitlements>>
        | null = null;
      if (session) {
        try {
          entitlements = await getGameEntitlements(
            playSession.game.id,
            session.accessToken,
          );
        } catch {
          entitlements = null;
        }
      }
        if (result.game.manifest) {
          setRuntime(
            runPolyProject(
              result.game.manifest,
              runtimePlayerData(user, entitlements ?? undefined),
            ),
          );
        } else if (result.game.slug === "baseplate") {
          setRuntime(null);
        } else {
          throw new Error("This game does not have a published world.");
        }
    })()
      .catch((loadError: unknown) => {
        setRuntime(null);
        setGameError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this game.",
        );
      })
      .finally(() => setGameLoading(false));
  }, [playSession.game.id, session, user]);
  const {
    connection,
    remotePlayers,
    localPlayer: sessionPlayer,
    chatMessages,
    chatError,
    sendState,
    sendChat,
    sendLeaderstats,
  } = useMultiplayer(activeSession.websocketUrl, activeSession.game.id);
  useEffect(() => {
    sendLeaderstats(
      Object.fromEntries(
        (runtime?.project.leaderstats ?? []).map((stat) => [
          stat.name,
          stat.defaultValue,
        ]),
      ),
    );
  }, [activeSession.game.id, runtime?.project.leaderstats, sendLeaderstats]);
  const disconnected = [
    "Disconnected",
    "Connection failed",
    "Wrong game session",
  ].includes(connection);

  useEffect(() => {
    if (!session || connection !== "Connected") return;
    for (const badgeName of runtime?.badgeAwards ?? []) {
      if (submittedBadges.current.has(badgeName)) continue;
      submittedBadges.current.add(badgeName);
      void awardGameBadge(
        activeSession.game.id,
        badgeName,
        session.accessToken,
      ).catch(() => {
        submittedBadges.current.delete(badgeName);
      });
    }
  }, [
    activeSession.game.id,
    connection,
    runtime?.badgeAwards,
    session,
  ]);

  useEffect(() => {
    if (!session || !runtime) return;
    const passes = new Map(
      (runtime.project.gamePasses ?? []).map((pass) => [
        pass.name.toLowerCase(),
        pass,
      ]),
    );
    const products = new Map(
      (runtime.project.developerProducts ?? []).map((product) => [
        product.name.toLowerCase(),
        product,
      ]),
    );
    for (const request of runtime.purchaseRequests ?? []) {
      const key = `${request.kind}:${request.name}`;
      if (submittedPurchases.current.has(key)) continue;
      submittedPurchases.current.add(key);
      const action =
        request.kind === "gamePass"
          ? (() => {
              const pass = passes.get(request.name.toLowerCase());
              return pass
                ? purchaseGamePass(activeSession.game.id, pass.id, session.accessToken)
                : Promise.reject(new Error("Gamepass not found."));
            })()
          : (() => {
              const product = products.get(request.name.toLowerCase());
              return product
                ? purchaseDeveloperProduct(
                    activeSession.game.id,
                    product.id,
                    session.accessToken,
                  )
                : Promise.reject(new Error("Developer product not found."));
            })();
      void action
        .then((result) => {
          if (user && typeof result.tix === "number") {
            updateUser({ ...user, tix: result.tix });
          }
        })
        .catch(() => {
          submittedPurchases.current.delete(key);
        });
    }
  }, [activeSession.game.id, runtime, session, updateUser, user]);

  const reconnect = useCallback(async () => {
    if (!session || reconnecting) return;
    setReconnecting(true);
    setReconnectError("");
    try {
      let accessToken = session.accessToken;
      if (
        !session.expiresAt ||
        session.expiresAt * 1000 < Date.now() + 60_000
      ) {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to reconnect.");
        accessToken = renewed.accessToken;
      }
      const result = await createPlaySession(
        activeSession.game.id,
        accessToken,
      );
      setActiveSession(result.playSession);
    } catch (error) {
      setReconnectError(
        error instanceof Error ? error.message : "Could not reconnect.",
      );
    } finally {
      setReconnecting(false);
    }
  }, [activeSession.game.id, reconnecting, refresh, session]);

  useEffect(() => {
    const onOnline = () => {
      if (disconnected) void reconnect();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [disconnected, reconnect]);

  return (
    <div className="browser-game-wrap">
      <span className={`connection-pill ${disconnected ? "offline" : ""}`}>
        {reconnecting ? "Reconnecting" : connection}
      </span>
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
          localPlayer={sessionPlayer ?? user ?? undefined}
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
            });
          }}
          onKeyInput={(keyCode, event) => {
            setRuntime((current) => {
              if (!current) return current;
              const activated = activatePolyInput(
                current.project,
                keyCode,
                event,
                current.playerData,
              );
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
            });
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
          onLeave={onLeave}
        />
        </Suspense>
      )}
      {disconnected && !gameLoading && !gameError && (
        <div className="game-connection-overlay">
          <strong>Connection lost</strong>
          <span>
            Your game is still loaded. Reconnect with a fresh server session.
          </span>
          {reconnectError && <small>{reconnectError}</small>}
          <button
            className="primary-button"
            disabled={reconnecting}
            onClick={() => void reconnect()}
          >
            {reconnecting ? "Reconnecting..." : "Reconnect"}
          </button>
        </div>
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
              <Avatar
                name={friendship.user?.displayName ?? "?"}
                player={friendship.user ?? undefined}
              />
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

function WardrobePage() {
  const { user, session, showAuth, refresh, updateUser } = useAuth();
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [selectedId, setSelectedId] = useState<AvatarItemId | null>(null);
  const [view, setView] = useState<"inventory" | "shirts" | "pants">(
    "inventory",
  );
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [appearance, setAppearance] = useState<AvatarAppearance>(
    DEFAULT_AVATAR_APPEARANCE,
  );

  const loadWardrobe = useCallback(async () => {
    if (!session) return;
    setStatus("");
    try {
      let result;
      try {
        result = await getWardrobe(session.accessToken);
      } catch {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to open your wardrobe.");
        result = await getWardrobe(renewed.accessToken);
      }
      setWardrobe(result);
      setAppearance(normalizeAvatarAppearance(result.avatarAppearance));
      setSelectedId((current) =>
        current && result.items.some((item) => item.id === current)
          ? current
          : result.equippedShirtId ??
            result.equippedPantsId ??
            result.items[0]?.id ??
            null,
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not load your wardrobe.",
      );
    }
  }, [refresh, session]);

  useEffect(() => {
    if (session) void loadWardrobe();
  }, [loadWardrobe, session]);

  if (!user || !session) {
    return (
      <section className="large-empty-state">
        <Shirt size={48} />
        <h2>Sign in to open your wardrobe.</h2>
        <p>Collect shirts, preview your avatar, and choose what you wear.</p>
        <button className="primary-button" onClick={() => showAuth()}>
          Sign in
        </button>
      </section>
    );
  }

  const selected =
    wardrobe?.items.find((item) => item.id === selectedId) ?? null;
  const visibleItems =
    wardrobe?.items.filter(
      (item) =>
        (view === "inventory" && item.owned) ||
        (view === "shirts" && item.itemType === "shirt") ||
        (view === "pants" && item.itemType === "pants"),
    ) ?? [];
  const activeSession = session;

  async function withCurrentToken<T>(
    request: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    try {
      return await request(activeSession.accessToken);
    } catch {
      const renewed = await refresh();
      if (!renewed) throw new Error("Sign in again to change your avatar.");
      return request(renewed.accessToken);
    }
  }

  async function claimSelected() {
    if (!selected) return;
    setWorking(true);
    setStatus("");
    try {
      const purchase = await withCurrentToken((accessToken) =>
        claimAvatarItem(selected.id, accessToken),
      );
      if (user) updateUser({ ...user, tix: purchase.tix });
      await loadWardrobe();
      setStatus(
        selected.bundleKey
          ? `${selected.name} set was added to your inventory.`
          : `${selected.name} was added to your inventory.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not get this item.");
    } finally {
      setWorking(false);
    }
  }

  async function equipSelected(
    itemId: AvatarItemId | null,
    itemType: "shirt" | "pants",
  ) {
    setWorking(true);
    setStatus("");
    try {
      const result =
        itemType === "pants"
          ? await withCurrentToken((accessToken) =>
              equipPants(itemId as PantsId | null, accessToken),
            )
          : await withCurrentToken((accessToken) =>
              equipShirt(itemId as ShirtId | null, accessToken),
            );
      updateUser(result.user);
      await loadWardrobe();
      const itemName = itemType === "pants" ? "Pants" : "Shirt";
      setStatus(itemId ? `${itemName} equipped.` : `${itemName} removed.`);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not change this item.",
      );
    } finally {
      setWorking(false);
    }
  }

  const previewShirtId =
    selected?.itemType === "shirt"
      ? (selected.id as ShirtId)
      : wardrobe?.equippedShirtId ?? null;
  const previewPantsId =
    selected?.itemType === "pants"
      ? (selected.id as PantsId)
      : wardrobe?.equippedPantsId ?? null;
  const previewShirtTextureUrl =
    selected?.itemType === "shirt"
      ? selected.textureUrl ?? null
      : wardrobe?.items.find((item) => item.id === wardrobe.equippedShirtId)
          ?.textureUrl ?? null;
  const previewPantsTextureUrl =
    selected?.itemType === "pants"
      ? selected.textureUrl ?? null
      : wardrobe?.items.find((item) => item.id === wardrobe.equippedPantsId)
          ?.textureUrl ?? null;

  function setBodyColor(part: keyof AvatarBodyColors, color: string) {
    setAppearance((current) => ({
      ...current,
      bodyColors: { ...current.bodyColors, [part]: color },
    }));
  }

  async function saveAppearance() {
    setWorking(true);
    setStatus("");
    try {
      const result = await withCurrentToken((accessToken) =>
        updateAvatarAppearance(appearance, accessToken),
      );
      setAppearance(normalizeAvatarAppearance(result.avatarAppearance));
      updateUser(result.user);
      setWardrobe((current) =>
        current
          ? { ...current, avatarAppearance: result.avatarAppearance }
          : current,
      );
      setStatus("Body colors saved.");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not save body colors.",
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <section className="page-heading wardrobe-heading">
        <div>
          <span className="eyebrow">Avatar</span>
          <h1>Wardrobe</h1>
        </div>
        <div className="wardrobe-heading-balance">
          <p>Preview your block avatar and choose what you wear in every game.</p>
          <strong><Tickets size={18} /> {(wardrobe?.tix ?? user.tix ?? 0).toLocaleString()} Tix</strong>
        </div>
      </section>
      <section className="wardrobe-layout">
        <div className="wardrobe-preview-panel">
          <div className="wardrobe-preview">
            <Suspense fallback={<span>Loading avatar...</span>}>
              <AvatarPreview
                shirtId={previewShirtId}
                pantsId={previewPantsId}
                shirtTextureUrl={previewShirtTextureUrl}
                pantsTextureUrl={previewPantsTextureUrl}
                appearance={appearance}
              />
            </Suspense>
          </div>
          <div className="wardrobe-preview-copy">
            <span>Previewing</span>
            <h2>{selected?.name ?? "No shirt"}</h2>
            <p>{selected?.description ?? "Your default block avatar."}</p>
            {selected?.owned ? (
              selected.equipped ? (
                <button
                  className="secondary-button"
                  disabled={working}
                  onClick={() => void equipSelected(null, selected.itemType)}
                >
                  Unequip
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={working}
                  onClick={() =>
                    void equipSelected(selected.id, selected.itemType)
                  }
                >
                  Equip {selected.itemType}
                </button>
              )
            ) : selected?.unlockType === "free" ? (
              <button
                className="primary-button"
                disabled={working}
                onClick={() => void claimSelected()}
              >
                Get for free
              </button>
            ) : selected?.unlockType === "tix" ? (
              <button
                className="primary-button"
                disabled={
                  working || (wardrobe?.tix ?? user.tix ?? 0) < selected.priceTix
                }
                onClick={() => void claimSelected()}
              >
                <Tickets size={16} />
                {selected.bundleKey ? "Buy set" : "Buy"} for{" "}
                {selected.priceTix.toLocaleString()} Tix
              </button>
            ) : (
              <div className="creator-unlock-progress">
                <strong>
                  {Math.min(
                    wardrobe?.totalCreatorVisits ?? 0,
                    selected?.unlockThreshold ?? 100,
                  )}
                  /{selected?.unlockThreshold ?? 100} visits
                </strong>
                <span>Earned from visits across your games.</span>
              </div>
            )}
            {status && <p className="wardrobe-status">{status}</p>}
            <div className="avatar-color-editor">
              <div className="avatar-color-editor-heading">
                <div>
                  <span>Body colors</span>
                  <strong>Classic six-part colors</strong>
                </div>
                <button
                  type="button"
                  className="text-button"
                  disabled={working}
                  onClick={() =>
                    setAppearance(
                      normalizeAvatarAppearance(DEFAULT_AVATAR_APPEARANCE),
                    )
                  }
                >
                  Reset
                </button>
              </div>
              <div className="avatar-color-grid">
                {(
                  [
                    ["head", "Head"],
                    ["torso", "Torso"],
                    ["leftArm", "Left arm"],
                    ["rightArm", "Right arm"],
                    ["leftLeg", "Left leg"],
                    ["rightLeg", "Right leg"],
                  ] as const
                ).map(([part, label]) => (
                  <label key={part}>
                    <input
                      type="color"
                      value={appearance.bodyColors[part]}
                      disabled={working}
                      onChange={(event) =>
                        setBodyColor(part, event.currentTarget.value)
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                disabled={working}
                onClick={() => void saveAppearance()}
              >
                Save body colors
              </button>
            </div>
          </div>
        </div>
        <div className="wardrobe-browser">
          <div className="shirt-template-callout">
            <div>
              <span>For artists</span>
              <strong>Classic clothing templates</strong>
              <p>
                Design shirts or pants on a 585 x 559 canvas. Keep the
                dimensions unchanged when you export it.
              </p>
            </div>
            <div className="template-download-actions">
              <a
                className="secondary-button shirt-template-download"
                href={shirtTemplateUrl}
                download="Polymons-Shirt-Template.png"
              >
                <Download size={17} />
                Shirt
              </a>
              <a
                className="secondary-button shirt-template-download"
                href={pantsTemplateUrl}
                download="Polymons-Pants-Template.png"
              >
                <Download size={17} />
                Pants
              </a>
            </div>
          </div>
          <div className="wardrobe-tabs">
            <button
              className={view === "inventory" ? "active" : ""}
              onClick={() => setView("inventory")}
            >
              Inventory
            </button>
            <button
              className={view === "shirts" ? "active" : ""}
              onClick={() => setView("shirts")}
            >
              Shirts
            </button>
            <button
              className={view === "pants" ? "active" : ""}
              onClick={() => setView("pants")}
            >
              Pants
            </button>
          </div>
          <div className="shirt-grid">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                className={`shirt-card ${selectedId === item.id ? "selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                {item.textureUrl ? (
                  <span className="shirt-texture shirt-texture-uploaded">
                    <img src={item.textureUrl} alt="" />
                  </span>
                ) : (
                  <span className={`shirt-texture shirt-texture-${item.id}`}>
                    {item.id === "polymon-shirt" && <b>P</b>}
                    {item.id === "beta-tester-shirt" && <b>BETA</b>}
                    {item.id === "creators-shirt" && <b>APPROVED</b>}
                    {item.id === "classic-denim-pants" && <b>DENIM</b>}
                    {item.id === "polymon-pants" && <b>POLY</b>}
                    {item.id === "beta-tester-pants" && <b>BETA</b>}
                    {item.id === "creators-pants" && <b>APPROVED</b>}
                    {item.id === "orange-polymons-shirt" && <b>ORANGE</b>}
                    {item.id === "orange-polymons-pants" && <b>ORANGE</b>}
                    {item.id === "polymons-varsity-jacket" && <b>JACKET</b>}
                    {item.id === "polymons-varsity-pants" && <b>VARSITY</b>}
                  </span>
                )}
                <span className="shirt-card-copy">
                  <strong>{item.name}</strong>
                  <small>
                    {item.equipped
                      ? "Equipped"
                      : item.owned
                        ? "Owned"
                        : item.unlockType === "free"
                          ? "Free"
                          : item.unlockType === "tix"
                            ? `${item.priceTix.toLocaleString()} Tix`
                            : "100 visits"}
                  </small>
                </span>
              </button>
            ))}
            {visibleItems.length === 0 && (
              <p className="muted-copy">No clothing appears in this section yet.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function ProfilePage() {
  const { username: routeUsername } = useParams();
  const { user, session, logout, showAuth, refresh, updateUser } = useAuth();
  const requestedUsername = routeUsername ?? user?.username;
  const ownProfile = Boolean(user && requestedUsername === user.username);
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [profileError, setProfileError] = useState("");
  const [playerOptions, setPlayerOptions] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAttempted, setSyncAttempted] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [friendStatus, setFriendStatus] = useState("");
  const [sendingFriendRequest, setSendingFriendRequest] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionStatus, setDescriptionStatus] = useState("");
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [analytics, setAnalytics] = useState<
    Awaited<ReturnType<typeof getCreatorAnalytics>> | null
  >(null);
  useEffect(() => {
    if (!requestedUsername) return;
    setProfile(null);
    setProfileError("");
    void getPlayerProfile(requestedUsername)
      .then(setProfile)
      .catch((error) =>
        setProfileError(
          error instanceof Error ? error.message : "Could not load this player.",
        ),
      );
  }, [requestedUsername]);
  useEffect(() => {
    if (!ownProfile || !session) {
      setAnalytics(null);
      return;
    }
    void getCreatorAnalytics(session.accessToken)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [ownProfile, session]);

  if (!requestedUsername) {
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
  if (profileError) {
    return <section className="large-empty-state"><h2>{profileError}</h2></section>;
  }
  if (!profile) {
    return <section className="large-empty-state"><h2>Loading profile...</h2></section>;
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

  async function saveDescription() {
    if (!session || !profile) return;
    setSavingDescription(true);
    setDescriptionStatus("");
    try {
      let result;
      try {
        result = await updateProfile(descriptionDraft, session.accessToken);
      } catch {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to update your profile.");
        result = await updateProfile(descriptionDraft, renewed.accessToken);
      }
      updateUser(result.user);
      setProfile((current) =>
        current
          ? {
              ...current,
              player: {
                ...current.player,
                description: result.user.description,
              },
            }
          : current,
      );
      setEditingDescription(false);
      setDescriptionStatus("Description saved.");
    } catch (error) {
      setDescriptionStatus(
        error instanceof Error
          ? error.message
          : "Could not update your description.",
      );
    } finally {
      setSavingDescription(false);
    }
  }

  return (
    <>
      <section className="profile-hero">
        <div className="profile-glow" />
        <Avatar
          name={profile.player.displayName}
          player={profile.player}
          size="large"
        />
        <div className="profile-copy">
          <h1>{profile.player.displayName}</h1>
          <span>
            @{profile.player.username} · ID {profile.player.polymonsId}
          </span>
          {editingDescription ? (
            <div className="profile-description-editor">
              <textarea
                aria-label="Profile description"
                maxLength={500}
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="Tell people a little about yourself."
              />
              <small>{descriptionDraft.length}/500</small>
              <div>
                <button
                  className="primary-button"
                  disabled={savingDescription}
                  onClick={() => void saveDescription()}
                >
                  {savingDescription ? "Saving..." : "Save"}
                </button>
                <button
                  className="secondary-button"
                  disabled={savingDescription}
                  onClick={() => {
                    setEditingDescription(false);
                    setDescriptionStatus("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="profile-description">
                {profile.player.description || "No description yet."}
              </p>
              {ownProfile && (
                <button
                  className="profile-description-button"
                  onClick={() => {
                    setDescriptionDraft(profile.player.description);
                    setDescriptionStatus("");
                    setEditingDescription(true);
                  }}
                >
                  Edit description
                </button>
              )}
            </>
          )}
          {descriptionStatus && (
            <small className="profile-description-status">
              {descriptionStatus}
            </small>
          )}
          <p className="profile-joined">
            Joined {new Date(profile.player.joinedAt).toLocaleDateString()}.
          </p>
        </div>
        {ownProfile && <div className="profile-actions">
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
        </div>}
        {!ownProfile && (
          <div className="profile-actions">
            <button
              className="primary-button"
              disabled={sendingFriendRequest || friendStatus === "Request sent"}
              onClick={async () => {
                if (!session) {
                  showAuth();
                  return;
                }
                setSendingFriendRequest(true);
                setFriendStatus("");
                try {
                  await sendFriendRequest(profile.player.username, session.accessToken);
                  setFriendStatus("Request sent");
                } catch (error) {
                  setFriendStatus(
                    error instanceof Error
                      ? error.message
                      : "Could not send friend request.",
                  );
                } finally {
                  setSendingFriendRequest(false);
                }
              }}
            >
              {sendingFriendRequest
                ? "Sending..."
                : friendStatus === "Request sent"
                  ? "Request sent"
                  : "Add Friend"}
            </button>
            <button
              className="secondary-button"
              disabled={followBusy}
              onClick={async () => {
                if (!session) {
                  showAuth();
                  return;
                }
                setFollowBusy(true);
                try {
                  const next = !following;
                  await setCreatorFollow(
                    profile.player.username,
                    next,
                    session.accessToken,
                  );
                  setFollowing(next);
                  setProfile((current) =>
                    current
                      ? {
                          ...current,
                          stats: {
                            ...current.stats,
                            followers: Math.max(
                              0,
                              current.stats.followers + (next ? 1 : -1),
                            ),
                          },
                        }
                      : current,
                  );
                } finally {
                  setFollowBusy(false);
                }
              }}
            >
              {following ? "Following" : "Follow creator"}
            </button>
            {friendStatus && friendStatus !== "Request sent" && (
              <span className="friend-status">{friendStatus}</span>
            )}
          </div>
        )}
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
          <strong>{profile.stats.friends.toLocaleString()}</strong>
          <span>Friends</span>
        </div>
        <div>
          <strong>{profile.stats.games.toLocaleString()}</strong>
          <span>Games</span>
        </div>
        <div>
          <strong>{profile.stats.gameVisits.toLocaleString()}</strong>
          <span>Game visits</span>
        </div>
        <div>
          <strong>{profile.stats.followers.toLocaleString()}</strong>
          <span>Followers</span>
        </div>
        {ownProfile && (
          <div>
            <strong>{(user?.tix ?? 0).toLocaleString()}</strong>
            <span>Tix</span>
          </div>
        )}
      </section>
      {ownProfile && analytics && (
        <section className="content-section">
          <SectionHeading title="Creator analytics" />
          <div className="creator-analytics-grid">
            <div><strong>{analytics.totals.activePlayers}</strong><span>Playing now</span></div>
            <div><strong>{analytics.totals.visits.toLocaleString()}</strong><span>Total visits</span></div>
            <div><strong>{analytics.totals.playsLast7Days.toLocaleString()}</strong><span>Plays this week</span></div>
            <div><strong>{analytics.totals.games}</strong><span>Published games</span></div>
          </div>
        </section>
      )}
      {profile.badges.length > 0 && (
        <section className="content-section">
          <SectionHeading title="Badges" />
          <div className="profile-badge-grid">
            {profile.badges.map((badge) => (
              <article key={badge.id}>
                {badge.iconUrl ? (
                  <img src={badge.iconUrl} alt="" />
                ) : (
                  <span><Award size={25} /></span>
                )}
                <div>
                  <strong>{badge.name}</strong>
                  <p>{badge.description || "Achievement earned."}</p>
                  <small>{new Date(badge.awardedAt).toLocaleDateString()}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <section className="content-section">
        <SectionHeading title={`${profile.player.displayName}'s games`} />
        <div className="game-grid profile-games">
          {profile.games.map((game) => (
            <GameCard key={game.id} game={displayGame(game)} />
          ))}
          {profile.games.length === 0 && <p className="muted-copy">No public games yet.</p>}
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
  const { session, showAuth, refresh } = useAuth();
  const [modelInfo, setModelInfo] = useState("");
  const [submissions, setSubmissions] = useState<AvatarCatalogSubmission[]>([]);
  const [catalogStatus, setCatalogStatus] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadType, setUploadType] = useState<"shirt" | "pants">("shirt");
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadPrice, setUploadPrice] = useState("0");
  const [uploadTexture, setUploadTexture] = useState<string | null>(null);
  const loadSubmissions = useCallback(async () => {
    if (!session) return;
    try {
      let result;
      try {
        result = await listAvatarUploads(session.accessToken);
      } catch {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to load catalog uploads.");
        result = await listAvatarUploads(renewed.accessToken);
      }
      setSubmissions(result.submissions);
    } catch (error) {
      setCatalogStatus(
        error instanceof Error ? error.message : "Could not load your uploads.",
      );
    }
  }, [refresh, session]);

  useEffect(() => {
    void loadSubmissions();
  }, [loadSubmissions]);

  async function submitCatalogUpload() {
    if (!session) {
      showAuth();
      return;
    }
    if (!uploadTexture) {
      setCatalogStatus("Choose a PNG made with the clothing template first.");
      return;
    }
    const priceTix = Math.max(0, Math.floor(Number(uploadPrice) || 0));
    setUploadBusy(true);
    setCatalogStatus("");
    try {
      let activeSession = session;
      if (
        !activeSession.expiresAt ||
        activeSession.expiresAt * 1000 < Date.now() + 60_000
      ) {
        const renewed = await refresh();
        if (!renewed) throw new Error("Sign in again to upload clothing.");
        activeSession = renewed;
      }
      await submitAvatarUpload(
        {
          itemType: uploadType,
          name: uploadName,
          description: uploadDescription,
          priceTix,
          textureData: uploadTexture,
        },
        activeSession.accessToken,
      );
      setUploadName("");
      setUploadDescription("");
      setUploadPrice("0");
      setUploadTexture(null);
      setCatalogStatus("Uploaded for review. It will appear in the catalog after approval.");
      await loadSubmissions();
    } catch (error) {
      setCatalogStatus(
        error instanceof Error ? error.message : "Could not upload this clothing.",
      );
    } finally {
      setUploadBusy(false);
    }
  }

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
      <section className="creator-catalog-panel">
        <SectionHeading title="Avatar catalog uploads" />
        <div className="catalog-upload-layout">
          <div className="catalog-upload-card">
            <h2>Submit clothing for review</h2>
            <p>
              Upload a PNG from your PC. Polymons uses the classic 585 x 559
              shirt/pants layout, so old Roblox classic clothing templates work
              here too. Limit: 5 uploads a day.
            </p>
            <div className="template-download-actions catalog-template-actions">
              <a
                className="secondary-button shirt-template-download"
                href={shirtTemplateUrl}
                download="Polymons-Roblox-Compatible-Shirt-Template.png"
              >
                <Download size={17} />
                Shirt template
              </a>
              <a
                className="secondary-button shirt-template-download"
                href={pantsTemplateUrl}
                download="Polymons-Roblox-Compatible-Pants-Template.png"
              >
                <Download size={17} />
                Pants template
              </a>
            </div>
            {!session && (
              <button className="primary-button" onClick={() => showAuth()}>
                Sign in to upload
              </button>
            )}
            {session && (
              <>
                <div className="catalog-upload-grid">
                  <label>
                    Type
                    <select
                      value={uploadType}
                      onChange={(event) =>
                        setUploadType(event.currentTarget.value as "shirt" | "pants")
                      }
                    >
                      <option value="shirt">Shirt</option>
                      <option value="pants">Pants</option>
                    </select>
                  </label>
                  <label>
                    Price in Tix
                    <input
                      type="number"
                      min="0"
                      max="1000000"
                      value={uploadPrice}
                      onChange={(event) => setUploadPrice(event.currentTarget.value)}
                    />
                  </label>
                  <label>
                    Name
                    <input
                      value={uploadName}
                      maxLength={64}
                      placeholder="Orange Polymons Shirt"
                      onChange={(event) => setUploadName(event.currentTarget.value)}
                    />
                  </label>
                  <label>
                    PNG file
                    <input
                      type="file"
                      accept="image/png"
                      onChange={async (event) => {
                        const file = event.currentTarget.files?.[0];
                        if (!file) return;
                        if (file.size > 2_000_000) {
                          setCatalogStatus("PNG must be 2 MB or smaller.");
                          return;
                        }
                        try {
                          const normalized = await clothingFileToTemplateDataUrl(file);
                          setUploadTexture(normalized.dataUrl);
                          setCatalogStatus(
                            normalized.normalized
                              ? `Normalized ${normalized.width} x ${normalized.height} PNG to the classic 585 x 559 template.`
                              : "Classic 585 x 559 template detected.",
                          );
                        } catch (error) {
                          setCatalogStatus(
                            error instanceof Error
                              ? error.message
                              : "Could not load this PNG.",
                          );
                        }
                      }}
                    />
                  </label>
                </div>
                <label className="catalog-description-field">
                  Description
                  <textarea
                    value={uploadDescription}
                    maxLength={500}
                    placeholder="Short description for the item page."
                    onChange={(event) =>
                      setUploadDescription(event.currentTarget.value)
                    }
                  />
                </label>
                {uploadTexture && (
                  <img className="catalog-upload-preview" src={uploadTexture} alt="" />
                )}
                <button
                  className="primary-button"
                  disabled={uploadBusy}
                  onClick={() => void submitCatalogUpload()}
                >
                  {uploadBusy ? "Uploading..." : "Submit for review"}
                </button>
              </>
            )}
            {catalogStatus && <p className="model-import-status">{catalogStatus}</p>}
          </div>
          <div className="catalog-submission-list">
            <h2>Your uploads</h2>
            {submissions.length === 0 ? (
              <p className="muted-copy">No catalog uploads yet.</p>
            ) : (
              submissions.map((item) => (
                <Link
                  key={item.id}
                  className="catalog-submission-row"
                  to={`/create/catalog/${item.id}`}
                >
                  {item.textureUrl ? <img src={item.textureUrl} alt="" /> : <span />}
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.itemType} - {item.priceTix.toLocaleString()} Tix -{" "}
                      {item.reviewStatus}
                    </small>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function CatalogItemPage() {
  const { itemId } = useParams();
  const { session, showAuth, refresh } = useAuth();
  const [submissions, setSubmissions] = useState<AvatarCatalogSubmission[]>([]);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let cancelled = false;
    async function load() {
      try {
        let result;
        try {
          result = await listAvatarUploads(activeSession.accessToken);
        } catch {
          const renewed = await refresh();
          if (!renewed) throw new Error("Sign in again to view this catalog item.");
          result = await listAvatarUploads(renewed.accessToken);
        }
        if (!cancelled) setSubmissions(result.submissions);
      } catch (error) {
        if (!cancelled) {
          setStatus(
            error instanceof Error ? error.message : "Could not load this item.",
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [refresh, session]);
  if (!session) {
    return (
      <section className="large-empty-state">
        <Shirt size={48} />
        <h2>Sign in to view your catalog upload.</h2>
        <button className="primary-button" onClick={() => showAuth()}>Sign in</button>
      </section>
    );
  }
  const item = submissions.find((submission) => submission.id === itemId);
  if (status) return <section className="large-empty-state"><h2>{status}</h2></section>;
  if (!item) return <section className="large-empty-state"><h2>Loading item...</h2></section>;
  return (
    <section className="catalog-item-page">
      <Link to="/create" className="text-button">Back to Create</Link>
      <div className="catalog-item-hero">
        <div className="catalog-item-texture">
          {item.textureUrl ? <img src={item.textureUrl} alt="" /> : <span />}
        </div>
        <div>
          <span className="eyebrow">{item.itemType}</span>
          <h1>{item.name}</h1>
          <p>{item.description || "No description yet."}</p>
          <strong>{item.priceTix.toLocaleString()} Tix</strong>
          <p className={`catalog-review-status catalog-review-${item.reviewStatus}`}>
            Review: {item.reviewStatus}
            {item.reviewStatus === "rejected" && item.rejectionReason
              ? ` · ${item.rejectionReason}`
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  return <Layout />;
}
