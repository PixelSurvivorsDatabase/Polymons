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
  Share,
  Shirt,
  ShoppingCart,
  Tickets,
  UserRound,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  equipHair,
  equipHat,
  getGameLibrary,
  getGame,
  getCreatorAnalytics,
  getGameEntitlements,
  getPlayerProfile,
  getWardrobe,
  listAvatarCatalog,
  listAvatarUploads,
  listFriendServers,
  listGameServers,
  listFriends,
  listGames,
  playerAccountUrl,
  playerLaunchUrl,
  IS_ANDROID_BROWSER,
  IS_IOS_BROWSER,
  IS_LIKELY_APPLE_SILICON_BROWSER,
  IS_MAC_DESKTOP_BROWSER,
  IS_MOBILE_BROWSER,
  POLYMONS_PLAYER_ANDROID_DOWNLOAD_URL,
  POLYMONS_PLAYER_MAC_ARM64_DOWNLOAD_URL,
  POLYMONS_PLAYER_MAC_X64_DOWNLOAD_URL,
  POLYMONS_PLAYER_DOWNLOAD_URL,
  POLYMONS_PLAYER_WINDOWS_DOWNLOAD_URL,
  POLY_STUDIO_ANDROID_DOWNLOAD_URL,
  POLY_STUDIO_MAC_ARM64_DOWNLOAD_URL,
  POLY_STUDIO_MAC_X64_DOWNLOAD_URL,
  POLY_STUDIO_DOWNLOAD_URL,
  POLY_STUDIO_WINDOWS_DOWNLOAD_URL,
  purchaseDeveloperProduct,
  purchaseGamePass,
  sendFriendRequest,
  setCreatorFollow,
  setGameFavorite,
  searchPlayers,
  submitAvatarUpload,
  type AvatarCatalogSubmission,
  type Friendship,
  type MarketplaceCatalogItem,
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
  AvatarItemType,
  AvatarModelFormat,
  HairId,
  HatId,
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
  withRuntimePlayerPosition,
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
const ACCESSORY_MODEL_FORMATS = [
  "glb",
  "gltf",
  "obj",
  "fbx",
  "stl",
  "dae",
  "zip",
  "rbxm",
  "rbxmx",
  "rblx",
  "rbxlx",
] as const satisfies readonly AvatarModelFormat[];
const ACCESSORY_MODEL_ACCEPT = ACCESSORY_MODEL_FORMATS.map((format) => `.${format}`).join(",");

function avatarItemTypeLabel(itemType: AvatarItemType): string {
  if (itemType === "pants") return "Pants";
  if (itemType === "hair") return "Hair";
  if (itemType === "hat") return "Hat";
  return "Shirt";
}

function avatarItemTileLabel(item: { itemType: AvatarItemType; id: string }): string {
  if (item.itemType === "hair") return "HAIR";
  if (item.itemType === "hat") return "HAT";
  if (item.itemType === "pants") return "PANTS";
  return "SHIRT";
}

async function fileToDataUrl(file: File, label: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read this ${label}.`));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error(`Could not read this ${label}.`));
    reader.readAsDataURL(file);
  });
}

function modelFormatFromFile(file: File): AvatarModelFormat | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ACCESSORY_MODEL_FORMATS.find((format) => format === extension) ?? null;
}

async function clothingFileToTemplateDataUrl(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  normalized: boolean;
}> {
  const rawDataUrl = await fileToDataUrl(file, "PNG");
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

function numberFromPlayers(value: string): number {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysSince(value: string): number {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 999;
  return Math.max(0, (Date.now() - time) / 86_400_000);
}

function growthScore(game: Game): number {
  const active = numberFromPlayers(game.players);
  const visits = Math.max(0, game.visits);
  const ageDays = Math.max(1, daysSince(game.createdAt));
  const updateDays = Math.max(0, daysSince(game.updatedAt));
  const activeLift = (active + 1) / Math.sqrt(visits + 10);
  const favoriteLift = (game.favorites + 1) / Math.sqrt(visits + 25);
  const recencyLift = Math.max(0, 28 - ageDays) / 28;
  const updateLift = Math.max(0, 10 - updateDays) / 10;
  return activeLift * 8 + favoriteLift * 2 + recencyLift * 2 + updateLift;
}

function ratingPercent(game: Game): number {
  const visits = Math.max(1, game.visits);
  const favorites = Math.max(0, game.favorites);
  const active = numberFromPlayers(game.players);
  return Math.max(
    62,
    Math.min(99, Math.round(72 + (favorites / visits) * 80 + active * 1.5)),
  );
}

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`;
  return String(value);
}

function useGames() {
  const [games, setGames] = useState<Game[]>(fallbackGames);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    let requestInFlight = false;
    const loadGames = async (initial = false) => {
      if (requestInFlight) return;
      if (!navigator.onLine) {
        if (initial && !disposed) setLoaded(true);
        return;
      }
      requestInFlight = true;
      try {
        const result = await listGames();
        if (!disposed) setGames(result.games.map(displayGame));
      } catch {
        // Keep the last usable game list during brief outages and cold starts.
      } finally {
        requestInFlight = false;
        if (initial && !disposed) setLoaded(true);
      }
    };
    const refreshVisibleGames = () => {
      if (document.visibilityState === "visible") void loadGames();
    };
    void loadGames(true);
    const timer = window.setInterval(() => {
      refreshVisibleGames();
    }, 30_000);
    document.addEventListener("visibilitychange", refreshVisibleGames);
    window.addEventListener("online", refreshVisibleGames);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisibleGames);
      window.removeEventListener("online", refreshVisibleGames);
    };
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
  { to: "/catalog", label: "Catalog", icon: ShoppingCart },
  { to: "/avatar", label: "Avatar", icon: Shirt },
  { to: "/profile", label: "Profile", icon: UserRound },
  { to: "/create", label: "Create", icon: Plus },
];

const mobileNavItems = navItems.filter(({ to }) =>
  ["/", "/discover", "/friends", "/catalog", "/profile"].includes(to),
);

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
      {mobileNavItems.map(({ to, label, icon: Icon }) => (
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
      <ConnectivityNotice />
      <IphoneInstallPrompt />
      <Sidebar />
      <div className="app-main">
        <Header />
        <main key={location.pathname} className="page">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/games/:gameId" element={<GamePage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/catalog" element={<MarketplacePage />} />
            <Route path="/catalog/:itemId" element={<MarketplaceItemPage />} />
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

function DiscoverGameCard({ game }: { game: Game }) {
  const activePlayers = numberFromPlayers(game.players);
  return (
    <Link to={`/games/${game.id}`} className="discover-game-card">
      <GameArt game={game} />
      <h3>{game.title}</h3>
      <div className="discover-card-stats">
        <span title="Rating">👍 {ratingPercent(game)}%</span>
        <span title="Active players">
          <Users size={13} fill="currentColor" />{" "}
          {compactCount(activePlayers || game.visits)}
        </span>
      </div>
    </Link>
  );
}

function DiscoverShelf({
  title,
  games,
  info,
}: {
  title: string;
  games: Game[];
  info?: string;
}) {
  if (games.length === 0) return null;
  return (
    <section className="discover-shelf">
      <header>
        <h2>{title} <span aria-hidden="true">→</span></h2>
        {info && (
          <span className="discover-info" tabIndex={0} aria-label={info}>
            i
            <small>{info}</small>
          </span>
        )}
      </header>
      <div className="discover-row">
        {games.map((game) => (
          <DiscoverGameCard key={`${title}-${game.id}`} game={game} />
        ))}
      </div>
    </section>
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
  const discoverRows = useMemo(() => {
    const sortedByGrowth = [...allGames].sort(
      (a, b) => growthScore(b) - growthScore(a),
    );
    const upAndComing = sortedByGrowth.filter(
      (game) => daysSince(game.createdAt) <= 28,
    );
    const playingNow = [...allGames].sort(
      (a, b) => numberFromPlayers(b.players) - numberFromPlayers(a.players),
    );
    return {
      trending: sortedByGrowth,
      upAndComing: upAndComing.length > 0 ? upAndComing : sortedByGrowth,
      playingNow,
      all: [...allGames].sort(
        (a, b) => b.visits - a.visits || growthScore(b) - growthScore(a),
      ),
    };
  }, [allGames]);
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
        {query.trim() ? (
          <>
            <SectionHeading title="Search results" eyebrow={`${games.length} games`} />
            <div className="game-grid discover-grid">
              {games.map((game) => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
            {searching && <div className="empty-state">Searching games...</div>}
            {!searching && games.length === 0 && (
              <div className="empty-state">No games matched that search.</div>
            )}
          </>
        ) : (
          <div className="discover-shelves">
            <DiscoverShelf
              title="Top Trending"
              games={discoverRows.trending}
              info="Games with the largest relative increase in active players, favorites, and the such"
            />
            <DiscoverShelf
              title="Up-and-Coming"
              games={discoverRows.upAndComing}
              info="Games posted in the last 28 days, sorted by growth."
            />
            <DiscoverShelf
              title="Top Playing Now"
              games={discoverRows.playingNow}
              info="Games with the most active players right now."
            />
            <DiscoverShelf title="All Games" games={discoverRows.all} />
          </div>
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
  const [preferBrowserPlay, setPreferBrowserPlay] = useState(false);
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
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    const narrowScreen = window.matchMedia("(max-width: 760px)");
    const update = () =>
      setPreferBrowserPlay(coarsePointer.matches || narrowScreen.matches);
    update();
    coarsePointer.addEventListener("change", update);
    narrowScreen.addEventListener("change", update);
    return () => {
      coarsePointer.removeEventListener("change", update);
      narrowScreen.removeEventListener("change", update);
    };
  }, []);
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
            IS_MOBILE_BROWSER
              ? "The desktop Player is not available on phones or tablets. Close this window and use Browser play."
              : playerAttempted
              ? "The Player should be opening. If nothing happened, download it, run it once, then press Open Player again."
              : "Open the installed Player or choose the correct Windows or Mac download."
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
                type="button"
                className="game-play-button"
                aria-label={
                  preferBrowserPlay
                    ? "Play in browser"
                    : "Play in Polymons Player"
                }
                onClick={(event) => {
                  event.currentTarget.blur();
                  if (preferBrowserPlay) {
                    void play("browser");
                    return;
                  }
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
                  type="button"
                  className={isFavorite ? "active" : ""}
                  onClick={() => void toggleFavorite()}
                >
                  <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                  {isFavorite ? "Favorited" : "Favorite"}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.blur();
                    void play("browser");
                  }}
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
  const localPlayerProfile = useMemo(
    () =>
      user
        ? {
            polymonsId: user.polymonsId,
            username: user.username,
            displayName: user.displayName,
          }
        : null,
    [user],
  );
  const accessToken = session?.accessToken ?? null;
  useEffect(() => setActiveSession(playSession), [playSession]);
  useEffect(() => {
    let cancelled = false;
    setGameLoading(true);
    setGameError("");
    setRuntime(null);
    void (async () => {
      const result = await getGame(playSession.game.id);
      let entitlements:
        | Awaited<ReturnType<typeof getGameEntitlements>>
        | null = null;
      if (accessToken) {
        try {
          entitlements = await getGameEntitlements(
            playSession.game.id,
            accessToken,
          );
        } catch {
          entitlements = null;
        }
      }
      if (cancelled) return;
      if (result.game.manifest) {
        setRuntime(
          runPolyProject(
            result.game.manifest,
            runtimePlayerData(localPlayerProfile, entitlements ?? undefined),
          ),
        );
      } else if (result.game.slug === "baseplate") {
        setRuntime(null);
      } else {
        throw new Error("This game does not have a published world.");
      }
    })()
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setRuntime(null);
        setGameError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load this game.",
        );
      })
      .finally(() => {
        if (!cancelled) setGameLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    localPlayerProfile,
    playSession.game.id,
    accessToken,
  ]);
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
  const localPlayerState = useRef<{
    position: [number, number, number];
    rotationY: number;
  } | null>(null);
  const sendLocalPlayerState = useCallback(
    (state: { position: [number, number, number]; rotationY: number }) => {
      localPlayerState.current = state;
      sendState(state);
    },
    [sendState],
  );
  const runtimeProjectWithLocalPlayer = useCallback(
    (project: PolyRuntimeResult["project"]) =>
      localPlayerState.current
        ? withRuntimePlayerPosition(project, localPlayerState.current.position)
        : project,
    [],
  );
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
    <div
      className="browser-game-wrap"
      data-mobile-game={IS_MOBILE_BROWSER ? "true" : undefined}
    >
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
          onPlayerState={sendLocalPlayerState}
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
                runtimeProjectWithLocalPlayer(current.project),
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
                runtimeProjectWithLocalPlayer(current.project),
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
                runtimeProjectWithLocalPlayer(current.project),
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
                runtimeProjectWithLocalPlayer(current.project),
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

const PWA_INSTALL_DISMISSED_KEY = "polymons:pwa-install-dismissed-v1";

function isIphoneSafari(): boolean {
  const userAgent = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const otherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent);
  return ios && /Safari/i.test(userAgent) && !otherIosBrowser;
}

function isStandalonePwa(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

function IphoneInstallPrompt() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIphoneSafari() || isStandalonePwa()) return;
    try {
      if (localStorage.getItem(PWA_INSTALL_DISMISSED_KEY) === "true") return;
    } catch {
      // Safari private browsing can deny storage access.
    }
    const timer = window.setTimeout(() => setVisible(true), 1_200);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <aside className="ios-install-prompt" aria-label="Install Polymons">
      <img src="./icons/apple-touch-icon.png" alt="" />
      <div>
        <strong>Put Polymons on your Home Screen</strong>
        <span>
          Tap <Share size={15} aria-label="Share" /> Share, then Add to Home Screen.
        </span>
      </div>
      <button
        type="button"
        aria-label="Dismiss installation instructions"
        onClick={() => {
          try {
            localStorage.setItem(PWA_INSTALL_DISMISSED_KEY, "true");
          } catch {
            // Dismissing still works for this page session.
          }
          setVisible(false);
        }}
      >
        <X size={18} />
      </button>
    </aside>
  );
}

function ConnectivityNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (online) return null;
  return (
    <div className="connectivity-notice" role="status">
      <WifiOff size={16} />
      You are offline. Games and account features will reconnect automatically.
    </div>
  );
}

function catalogItemCreator(item: MarketplaceCatalogItem) {
  return item.creator?.displayName ?? "Polymons";
}

function catalogPriceLabel(item: MarketplaceCatalogItem) {
  if (item.unlockType === "free") return "Free";
  if (item.unlockType === "tix") return `${item.priceTix.toLocaleString()} Tix`;
  return `${item.unlockThreshold ?? 100}+ visits`;
}

function CatalogTextureTile({
  item,
  large = false,
}: {
  item:
    | MarketplaceCatalogItem
    | (Wardrobe["items"][number] & {
        createdAt?: string | null;
        creator?: null;
      });
  large?: boolean;
}) {
  return (
    <span className={`marketplace-texture-tile ${large ? "large" : ""}`}>
      {item.textureUrl || item.modelPreviewUrl ? (
        <img src={item.textureUrl ?? item.modelPreviewUrl ?? ""} alt="" />
      ) : (
        <span className={`shirt-texture shirt-texture-${item.id}`}>
          <b>{avatarItemTileLabel(item)}</b>
        </span>
      )}
    </span>
  );
}

function MarketplacePage() {
  const { user, session, refresh } = useAuth();
  const [items, setItems] = useState<MarketplaceCatalogItem[]>([]);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [query, setQuery] = useState("");
  const [itemType, setItemType] = useState<"all" | AvatarItemType>("all");
  const [priceFilter, setPriceFilter] = useState<"all" | "free" | "tix">("all");
  const [status, setStatus] = useState("");

  const loadCatalog = useCallback(async () => {
    setStatus("");
    try {
      const [catalog, closet] = await Promise.all([
        listAvatarCatalog(),
        session
          ? getWardrobe(session.accessToken).catch(async () => {
              const renewed = await refresh();
              return renewed ? getWardrobe(renewed.accessToken) : null;
            })
          : Promise.resolve(null),
      ]);
      setItems(catalog.items);
      setWardrobe(closet);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not load the catalog.",
      );
    }
  }, [refresh, session]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const wardrobeById = new Map(
    (wardrobe?.items ?? []).map((item) => [item.id, item]),
  );
  const filteredItems = items.filter((item) => {
    const search = query.trim().toLowerCase();
    const matchesQuery =
      !search ||
      item.name.toLowerCase().includes(search) ||
      item.description.toLowerCase().includes(search) ||
      catalogItemCreator(item).toLowerCase().includes(search);
    const matchesType = itemType === "all" || item.itemType === itemType;
    const matchesPrice = priceFilter === "all" || item.unlockType === priceFilter;
    return matchesQuery && matchesType && matchesPrice;
  });
  const chips = ["shirts", "pants", "hair", "hats", "free", "tix", "creator made", "classic", "new"];

  return (
    <>
      <section className="marketplace-hero">
        <div>
          <span className="eyebrow">Catalog</span>
          <h1>Marketplace</h1>
        </div>
        <label className="marketplace-search">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search clothing"
            aria-label="Search catalog"
          />
        </label>
        <select
          value={itemType}
          onChange={(event) =>
            setItemType(event.currentTarget.value as "all" | AvatarItemType)
          }
          aria-label="Catalog type"
        >
          <option value="all">All items</option>
          <option value="shirt">Shirts</option>
          <option value="pants">Pants</option>
          <option value="hair">Hair</option>
          <option value="hat">Hats</option>
        </select>
        <select
          value={priceFilter}
          onChange={(event) =>
            setPriceFilter(event.currentTarget.value as "all" | "free" | "tix")
          }
          aria-label="Catalog price"
        >
          <option value="all">Any price</option>
          <option value="free">Free</option>
          <option value="tix">Tix</option>
        </select>
        <Link className="marketplace-balance" to="/avatar">
          <Tickets size={18} />
          {(wardrobe?.tix ?? user?.tix ?? 0).toLocaleString()} Tix
        </Link>
      </section>
      <div className="marketplace-chip-row">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              if (chip === "shirts") setItemType("shirt");
              else if (chip === "pants") setItemType("pants");
              else if (chip === "hair") setItemType("hair");
              else if (chip === "hats") setItemType("hat");
              else if (chip === "free") setPriceFilter("free");
              else if (chip === "tix") setPriceFilter("tix");
              else setQuery(chip);
            }}
          >
            {chip}
          </button>
        ))}
      </div>
      {status && <p className="wardrobe-status">{status}</p>}
      <section className="marketplace-grid">
        {filteredItems.map((item) => {
          const closetItem = wardrobeById.get(item.id);
          return (
            <Link key={item.id} className="marketplace-card" to={`/catalog/${item.id}`}>
              <CatalogTextureTile item={item} />
              <strong>{item.name}</strong>
              <span>By {catalogItemCreator(item)}</span>
              <small>
                <Tickets size={14} />
                {closetItem?.equipped
                  ? "Equipped"
                  : closetItem?.owned
                    ? "Owned"
                    : catalogPriceLabel(item)}
              </small>
            </Link>
          );
        })}
        {filteredItems.length === 0 && (
          <div className="large-empty-state marketplace-empty">
            <ShoppingCart size={42} />
            <h2>No items found.</h2>
            <p>Try a different search or filter.</p>
          </div>
        )}
      </section>
    </>
  );
}

function MarketplaceItemPage() {
  const { itemId } = useParams();
  const { user, session, showAuth, refresh, updateUser } = useAuth();
  const [item, setItem] = useState<MarketplaceCatalogItem | null>(null);
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);

  const loadItem = useCallback(async () => {
    if (!itemId) return;
    setStatus("");
    try {
      const [catalog, closet] = await Promise.all([
        listAvatarCatalog(),
        session
          ? getWardrobe(session.accessToken).catch(async () => {
              const renewed = await refresh();
              return renewed ? getWardrobe(renewed.accessToken) : null;
            })
          : Promise.resolve(null),
      ]);
      setItem(catalog.items.find((nextItem) => nextItem.id === itemId) ?? null);
      setWardrobe(closet);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Could not load this item.",
      );
    }
  }, [itemId, refresh, session]);

  useEffect(() => {
    void loadItem();
  }, [loadItem]);

  async function withCurrentToken<T>(
    request: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    if (!session) throw new Error("Sign in to use the catalog.");
    try {
      return await request(session.accessToken);
    } catch {
      const renewed = await refresh();
      if (!renewed) throw new Error("Sign in again to use the catalog.");
      return request(renewed.accessToken);
    }
  }

  async function claimItem() {
    if (!item) return;
    setWorking(true);
    setStatus("");
    try {
      const purchase = await withCurrentToken((accessToken) =>
        claimAvatarItem(item.id, accessToken),
      );
      if (user) updateUser({ ...user, tix: purchase.tix });
      await loadItem();
      setStatus(`${item.name} was added to your inventory.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not buy this item.");
    } finally {
      setWorking(false);
    }
  }

  async function equipItem() {
    if (!item) return;
    setWorking(true);
    setStatus("");
    try {
      const result =
        item.itemType === "pants"
          ? await withCurrentToken((accessToken) =>
              equipPants(item.id as PantsId, accessToken),
            )
          : item.itemType === "hair"
            ? await withCurrentToken((accessToken) =>
                equipHair(item.id as HairId, accessToken),
              )
            : item.itemType === "hat"
              ? await withCurrentToken((accessToken) =>
                  equipHat(item.id as HatId, accessToken),
                )
              : await withCurrentToken((accessToken) =>
                  equipShirt(item.id as ShirtId, accessToken),
                );
      updateUser(result.user);
      await loadItem();
      setStatus(`${item.name} equipped.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not equip this item.");
    } finally {
      setWorking(false);
    }
  }

  if (!item) {
    return (
      <section className="large-empty-state">
        <ShoppingCart size={44} />
        <h2>{status || "Catalog item not found."}</h2>
        <Link className="primary-button" to="/catalog">
          Back to catalog
        </Link>
      </section>
    );
  }

  const closetItem = wardrobe?.items.find((nextItem) => nextItem.id === item.id);
  const owned = closetItem?.owned === true;
  const equipped = closetItem?.equipped === true;
  const previewShirtId =
    item.itemType === "shirt"
      ? (item.id as ShirtId)
      : wardrobe?.equippedShirtId ?? user?.equippedShirtId ?? null;
  const previewPantsId =
    item.itemType === "pants"
      ? (item.id as PantsId)
      : wardrobe?.equippedPantsId ?? user?.equippedPantsId ?? null;
  const previewShirtTextureUrl =
    item.itemType === "shirt"
      ? item.textureUrl
      : wardrobe?.items.find((nextItem) => nextItem.id === wardrobe.equippedShirtId)
          ?.textureUrl ??
        user?.equippedShirtTextureUrl ??
        null;
  const previewPantsTextureUrl =
    item.itemType === "pants"
      ? item.textureUrl
      : wardrobe?.items.find((nextItem) => nextItem.id === wardrobe.equippedPantsId)
          ?.textureUrl ??
        user?.equippedPantsTextureUrl ??
        null;
  const equippedHair = wardrobe?.items.find(
    (nextItem) => nextItem.id === wardrobe.equippedHairId,
  );
  const equippedHat = wardrobe?.items.find(
    (nextItem) => nextItem.id === wardrobe.equippedHatId,
  );
  const previewHairId =
    item.itemType === "hair"
      ? (item.id as HairId)
      : wardrobe?.equippedHairId ?? user?.equippedHairId ?? null;
  const previewHatId =
    item.itemType === "hat"
      ? (item.id as HatId)
      : wardrobe?.equippedHatId ?? user?.equippedHatId ?? null;
  const previewHairModelUrl =
    item.itemType === "hair"
      ? item.modelUrl
      : equippedHair?.modelUrl ?? user?.equippedHairModelUrl ?? null;
  const previewHairModelFormat =
    item.itemType === "hair"
      ? item.modelFormat
      : equippedHair?.modelFormat ?? user?.equippedHairModelFormat ?? null;
  const previewHatModelUrl =
    item.itemType === "hat"
      ? item.modelUrl
      : equippedHat?.modelUrl ?? user?.equippedHatModelUrl ?? null;
  const previewHatModelFormat =
    item.itemType === "hat"
      ? item.modelFormat
      : equippedHat?.modelFormat ?? user?.equippedHatModelFormat ?? null;

  return (
    <section className="marketplace-detail">
      <div className="marketplace-detail-preview">
        <div className="marketplace-avatar-preview">
          <Suspense fallback={<span>Loading preview...</span>}>
            <AvatarPreview
              shirtId={previewShirtId}
              pantsId={previewPantsId}
              shirtTextureUrl={previewShirtTextureUrl}
              pantsTextureUrl={previewPantsTextureUrl}
              hairId={previewHairId}
              hairModelUrl={previewHairModelUrl}
              hairModelFormat={previewHairModelFormat}
              hatId={previewHatId}
              hatModelUrl={previewHatModelUrl}
              hatModelFormat={previewHatModelFormat}
              appearance={wardrobe?.avatarAppearance ?? user?.avatarAppearance}
            />
          </Suspense>
        </div>
        <div className="marketplace-preview-footer">
          <CatalogTextureTile item={item} large />
          <span>{avatarItemTypeLabel(item.itemType)}</span>
        </div>
      </div>
      <div className="marketplace-detail-copy">
        <Link className="text-button" to="/catalog">
          <ChevronLeft size={16} /> Back to catalog
        </Link>
        <h1>{item.name}</h1>
        <p className="marketplace-byline">By {catalogItemCreator(item)}</p>
        <div className="marketplace-price-table">
          <span>Original Price</span>
          <strong>
            <Tickets size={18} />
            {catalogPriceLabel(item)}
          </strong>
          <span>Best Price</span>
          <strong>
            <Tickets size={18} />
            {catalogPriceLabel(item)}
          </strong>
        </div>
        {!session ? (
          <button className="primary-button" onClick={() => showAuth()}>
            Sign in to get item
          </button>
        ) : owned ? (
          <button
            className={equipped ? "secondary-button" : "primary-button"}
            disabled={working || equipped}
            onClick={() => void equipItem()}
          >
            {equipped ? "Equipped" : "Equip"}
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={
              working ||
              (item.unlockType === "tix" &&
                (wardrobe?.tix ?? user?.tix ?? 0) < item.priceTix) ||
              item.unlockType === "creator_visits"
            }
            onClick={() => void claimItem()}
          >
            {item.unlockType === "free"
              ? "Get"
              : item.unlockType === "tix"
                ? `Buy for ${item.priceTix.toLocaleString()} Tix`
                : "Visit unlock"}
          </button>
        )}
        <button className="secondary-button" disabled>
          Add to cart
        </button>
        {status && <p className="wardrobe-status">{status}</p>}
        <dl className="marketplace-item-facts">
          <div>
            <dt>Tradable</dt>
            <dd>No</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{avatarItemTypeLabel(item.itemType)}</dd>
          </div>
          <div>
            <dt>Materials</dt>
            <dd>Classic clothing</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              {item.createdAt
                ? new Date(item.createdAt).toLocaleDateString()
                : "Polymons"}
            </dd>
          </div>
          <div>
            <dt>Description</dt>
            <dd>{item.description || "No description yet."}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function WardrobePage() {
  const { user, session, showAuth, refresh, updateUser } = useAuth();
  const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
  const [selectedId, setSelectedId] = useState<AvatarItemId | null>(null);
  const [view, setView] = useState<"inventory" | "shirts" | "pants" | "hair" | "hats">(
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
            result.equippedHairId ??
            result.equippedHatId ??
            result.items.find((item) => item.owned)?.id ??
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
        (view === "shirts" && item.itemType === "shirt" && item.owned) ||
        (view === "pants" && item.itemType === "pants" && item.owned) ||
        (view === "hair" && item.itemType === "hair" && item.owned) ||
        (view === "hats" && item.itemType === "hat" && item.owned),
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
    itemType: AvatarItemType,
  ) {
    setWorking(true);
    setStatus("");
    try {
      const result =
        itemType === "pants"
          ? await withCurrentToken((accessToken) =>
              equipPants(itemId as PantsId | null, accessToken),
            )
          : itemType === "hair"
            ? await withCurrentToken((accessToken) =>
                equipHair(itemId as HairId | null, accessToken),
              )
            : itemType === "hat"
              ? await withCurrentToken((accessToken) =>
                  equipHat(itemId as HatId | null, accessToken),
                )
              : await withCurrentToken((accessToken) =>
                  equipShirt(itemId as ShirtId | null, accessToken),
                );
      updateUser(result.user);
      await loadWardrobe();
      const itemName = avatarItemTypeLabel(itemType);
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
  const previewHair = wardrobe?.items.find(
    (item) => item.id === wardrobe.equippedHairId,
  );
  const previewHat = wardrobe?.items.find(
    (item) => item.id === wardrobe.equippedHatId,
  );
  const previewHairId =
    selected?.itemType === "hair"
      ? (selected.id as HairId)
      : wardrobe?.equippedHairId ?? null;
  const previewHatId =
    selected?.itemType === "hat"
      ? (selected.id as HatId)
      : wardrobe?.equippedHatId ?? null;
  const previewHairModelUrl =
    selected?.itemType === "hair"
      ? selected.modelUrl ?? null
      : previewHair?.modelUrl ?? null;
  const previewHairModelFormat =
    selected?.itemType === "hair"
      ? selected.modelFormat ?? null
      : previewHair?.modelFormat ?? null;
  const previewHatModelUrl =
    selected?.itemType === "hat"
      ? selected.modelUrl ?? null
      : previewHat?.modelUrl ?? null;
  const previewHatModelFormat =
    selected?.itemType === "hat"
      ? selected.modelFormat ?? null
      : previewHat?.modelFormat ?? null;

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
                hairId={previewHairId}
                hairModelUrl={previewHairModelUrl}
                hairModelFormat={previewHairModelFormat}
                hatId={previewHatId}
                hatModelUrl={previewHatModelUrl}
                hatModelFormat={previewHatModelFormat}
                appearance={appearance}
              />
            </Suspense>
          </div>
          <div className="wardrobe-preview-copy">
            <span>Previewing</span>
            <h2>{selected?.name ?? "No avatar item"}</h2>
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
              <Link className="secondary-button shirt-template-download" to="/catalog">
                <ShoppingCart size={17} />
                Catalog
              </Link>
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
            <button
              className={view === "hair" ? "active" : ""}
              onClick={() => setView("hair")}
            >
              Hair
            </button>
            <button
              className={view === "hats" ? "active" : ""}
              onClick={() => setView("hats")}
            >
              Hats
            </button>
          </div>
          <div className="shirt-grid">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                className={`shirt-card ${selectedId === item.id ? "selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
              >
                {item.textureUrl || item.modelPreviewUrl ? (
                  <span className="shirt-texture shirt-texture-uploaded">
                    <img src={item.textureUrl ?? item.modelPreviewUrl ?? ""} alt="" />
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
                    {(item.itemType === "hair" || item.itemType === "hat") && (
                      <b>{avatarItemTileLabel(item)}</b>
                    )}
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
              <p className="muted-copy">No avatar items appear in this section yet.</p>
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
          {!IS_MOBILE_BROWSER && (
            <button
              className="primary-button"
              type="button"
              onClick={onOpen}
              disabled={opening}
            >
              <Gamepad2 size={18} />
              {opening ? "Opening..." : openLabel}
            </button>
          )}
          {!IS_MOBILE_BROWSER && (
            <a
              className="secondary-button"
              href={POLYMONS_PLAYER_DOWNLOAD_URL}
            >
              <Download size={18} />
              {IS_MAC_DESKTOP_BROWSER
                ? `Download Player for Mac ${
                    IS_LIKELY_APPLE_SILICON_BROWSER ? "Apple Silicon" : "Intel"
                  }`
                : "Download Player for Windows"}
            </a>
          )}
        </div>
        {IS_MOBILE_BROWSER ? (
          <>
            <div className="player-download-links mobile-download-links" aria-label="Mobile play options">
              {IS_ANDROID_BROWSER && (
                <a href={POLYMONS_PLAYER_ANDROID_DOWNLOAD_URL}>
                  Android APK
                </a>
              )}
              <button type="button" onClick={onClose}>
                Play in browser
              </button>
            </div>
            <p className="player-options-note">
              {IS_ANDROID_BROWSER
                ? "Install the Android APK for the app experience, or close this and use browser play."
                : IS_IOS_BROWSER
                  ? "iPhone and iPad use browser play for now. A native iOS app will need a Mac/App Store path later."
                  : "Use browser play on this device."}
            </p>
          </>
        ) : (
          <>
            <div className="player-download-links" aria-label="Player downloads">
              <a href={POLYMONS_PLAYER_WINDOWS_DOWNLOAD_URL}>Windows</a>
              <a href={POLYMONS_PLAYER_MAC_ARM64_DOWNLOAD_URL}>Mac Apple Silicon</a>
              <a href={POLYMONS_PLAYER_MAC_X64_DOWNLOAD_URL}>Mac Intel</a>
            </div>
            <p className="player-options-note">
              Windows may show SmartScreen and macOS may show Gatekeeper warnings
              because the apps are not code-signed yet.
            </p>
          </>
        )}
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
  const [uploadType, setUploadType] = useState<AvatarItemType>("shirt");
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadPrice, setUploadPrice] = useState("0");
  const [uploadTexture, setUploadTexture] = useState<string | null>(null);
  const [uploadModel, setUploadModel] = useState<{
    dataUrl: string;
    format: AvatarModelFormat;
    name: string;
  } | null>(null);
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
    const accessoryUpload = uploadType === "hair" || uploadType === "hat";
    if (!accessoryUpload && !uploadTexture) {
      setCatalogStatus("Choose a PNG made with the clothing template first.");
      return;
    }
    if (accessoryUpload && !uploadModel) {
      setCatalogStatus("Choose a supported model file first.");
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
          textureData: uploadTexture ?? undefined,
          modelData: uploadModel?.dataUrl,
          modelFormat: uploadModel?.format,
        },
        activeSession.accessToken,
      );
      setUploadName("");
      setUploadDescription("");
      setUploadPrice("0");
      setUploadTexture(null);
      setUploadModel(null);
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
            {IS_MOBILE_BROWSER ? (
              <div className="mobile-app-download-card">
                <strong>
                  {IS_ANDROID_BROWSER
                    ? "Poly Studio is available on Android."
                    : "Mobile Studio is limited on this device."}
                </strong>
                <span>
                  {IS_ANDROID_BROWSER
                    ? "Install the Android Studio APK to build on your phone, or use the desktop app for heavier projects."
                    : "iPhone and iPad can use the website for account and catalog work. Native Studio needs a future iOS build."}
                </span>
                {IS_ANDROID_BROWSER && (
                  <a href={POLY_STUDIO_ANDROID_DOWNLOAD_URL} className="primary-button">
                    <Download size={19} />
                    Download Studio APK
                  </a>
                )}
              </div>
            ) : (
              <>
                <a href={POLY_STUDIO_DOWNLOAD_URL} className="primary-button">
                  <Download size={19} />
                  {IS_MAC_DESKTOP_BROWSER
                    ? `Download for Mac ${
                        IS_LIKELY_APPLE_SILICON_BROWSER ? "Apple Silicon" : "Intel"
                      }`
                    : "Download for Windows"}
                </a>
                <a href={POLY_STUDIO_WINDOWS_DOWNLOAD_URL} className="secondary-button">
                  Windows
                </a>
                <a href={POLY_STUDIO_MAC_ARM64_DOWNLOAD_URL} className="secondary-button">
                  Mac Apple Silicon
                </a>
                <a href={POLY_STUDIO_MAC_X64_DOWNLOAD_URL} className="secondary-button">
                  Mac Intel
                </a>
              </>
            )}
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
            <h2>Submit avatar items for review</h2>
            <p>
              Upload classic clothing PNGs or head accessories from Blender and
              other modeling apps. GLB, GLTF, and OBJ render now; FBX, STL, DAE,
              ZIP, and Roblox files can be submitted for review/import conversion.
              Limit: 5 uploads a day.
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
                      onChange={(event) => {
                        setUploadType(event.currentTarget.value as AvatarItemType);
                        setUploadTexture(null);
                        setUploadModel(null);
                        setCatalogStatus("");
                      }}
                    >
                      <option value="shirt">Shirt</option>
                      <option value="pants">Pants</option>
                      <option value="hair">Hair</option>
                      <option value="hat">Hat</option>
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
                  {uploadType === "shirt" || uploadType === "pants" ? (
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
                            setUploadModel(null);
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
                  ) : (
                    <label>
                      Model file
                      <input
                        type="file"
                        accept={ACCESSORY_MODEL_ACCEPT}
                        onChange={async (event) => {
                          const file = event.currentTarget.files?.[0];
                          if (!file) return;
                          const format = modelFormatFromFile(file);
                          if (!format) {
                            setCatalogStatus("Use GLB, GLTF, OBJ, FBX, STL, DAE, ZIP, RBXM, RBXMX, RBLX, or RBXLX.");
                            return;
                          }
                          if (file.size > 8_000_000) {
                            setCatalogStatus("Accessory model must be 8 MB or smaller.");
                            return;
                          }
                          try {
                            setUploadModel({
                              dataUrl: await fileToDataUrl(file, "model"),
                              format,
                              name: file.name,
                            });
                            setUploadTexture(null);
                            setCatalogStatus(
                              format === "glb" || format === "gltf" || format === "obj"
                                ? `${file.name} ready. It will render on the avatar after approval.`
                                : `${file.name} accepted for review. This format needs conversion before it can render in-game.`,
                            );
                          } catch (error) {
                            setCatalogStatus(
                              error instanceof Error
                                ? error.message
                                : "Could not read this model.",
                            );
                          }
                        }}
                      />
                    </label>
                  )}
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
                {uploadModel && (
                  <p className="catalog-model-selected">
                    Model selected: {uploadModel.name} ({uploadModel.format.toUpperCase()})
                  </p>
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
                  {item.textureUrl || item.modelPreviewUrl ? (
                    <img src={item.textureUrl ?? item.modelPreviewUrl ?? ""} alt="" />
                  ) : (
                    <span className="catalog-model-badge">
                      {avatarItemTileLabel(item)}
                    </span>
                  )}
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
          {item.textureUrl || item.modelPreviewUrl ? (
            <img src={item.textureUrl ?? item.modelPreviewUrl ?? ""} alt="" />
          ) : (
            <span className="catalog-model-large">
              {avatarItemTileLabel(item)}
              {item.modelFormat && <small>{item.modelFormat.toUpperCase()}</small>}
            </span>
          )}
        </div>
        <div>
          <span className="eyebrow">{avatarItemTypeLabel(item.itemType)}</span>
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
