type PlayerUser = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  tix: number;
  avatarUrl: string | null;
  equippedShirtId: string | null;
  equippedPantsId: string | null;
  equippedHairId?: string | null;
  equippedHatId?: string | null;
  equippedShirtTextureUrl: string | null;
  equippedPantsTextureUrl: string | null;
  equippedHairModelUrl?: string | null;
  equippedHairModelFormat?: string | null;
  equippedHatModelUrl?: string | null;
  equippedHatModelFormat?: string | null;
  avatarAppearance: {
    face: "classic-smile";
    bodyColors: {
      head: string;
      torso: string;
      leftArm: string;
      rightArm: string;
      leftLeg: string;
      rightLeg: string;
    };
    accessories: string[];
  };
};

type PlayerAuth = {
  user: PlayerUser;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
    expiresIn: number;
    tokenType: string;
  };
};

type PlayerLaunch =
  | {
      mode: "online";
      game: string;
      websocketUrl: string;
    }
  | {
      mode: "studio";
      projectId: string;
      spawn?: [number, number, number];
      rotationY?: number;
    };

type PlayerGameSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  genre: string;
  thumbnailUrl: string | null;
  creator: string;
  creatorUsername: string;
  activePlayers: number;
  visits: number;
  favorites: number;
  createdAt: string;
  updatedAt: string;
};

type PlayerFriendship = {
  id: string;
  status: "pending" | "accepted" | "blocked";
  incoming: boolean;
  user: PlayerUser | null;
  gameId: string | null;
};

type DesktopUpdateState = {
  status:
    | "unsupported"
    | "checking"
    | "current"
    | "available"
    | "downloading"
    | "ready"
    | "installing"
    | "error";
  version: string | null;
  publishedAt: string | null;
  progress: number | null;
  message: string;
};

interface Window {
  polymons: {
    getAuth: () => Promise<PlayerAuth | null>;
    login: (username: string, password: string) => Promise<PlayerAuth>;
    signUp: (
      username: string,
      password: string,
      displayName?: string,
    ) => Promise<PlayerAuth>;
    logout: () => Promise<void>;
    listGames: () => Promise<{ games: PlayerGameSummary[] }>;
    getGameLibrary: () => Promise<{
      favoriteGameIds: string[];
      recentGames: Array<{
        game_id: string;
        last_played_at: string;
        play_count: number;
      }>;
    }>;
    listFriends: () => Promise<{ friendships: PlayerFriendship[] }>;
    listFriendServers: () => Promise<{
      servers: Array<{
        id: string;
        playerCount: number;
        friends: Array<{
          userId: string;
          username: string;
          displayName: string;
        }>;
        game: {
          id: string;
          slug: string;
          title: string;
          thumbnailUrl: string | null;
        };
      }>;
    }>;
    listGameServers: (gameId: string) => Promise<{
      servers: Array<{
        id: string;
        playerCount: number;
        players: Array<{
          userId: string;
          username: string;
          displayName: string;
        }>;
      }>;
    }>;
    play: (
      gameId: string,
    ) => Promise<{
      playSession: {
        game: { id: string; slug: string; title: string };
        websocketUrl: string;
      };
    }>;
    getGame: (gameId: string) => Promise<{
      game: {
        id: string;
        slug: string;
        title: string;
        thumbnailUrl: string | null;
        manifest: import("../../src/game/polyProject").PolyProject | null;
      };
    }>;
    awardBadge: (
      gameId: string,
      badgeName: string,
    ) => Promise<{ badgeId: string; awarded: true }>;
    getGameEntitlements: (gameId: string) => Promise<{
      gamePasses: string[];
      gamePassNames: string[];
      badges: string[];
      playerData: Record<
        string,
        import("../../src/game/polyProject").PolyStoredValue
      >;
    }>;
    purchaseGamePass: (
      gameId: string,
      passId: string,
    ) => Promise<{ passId: string; owned: true; tix: number }>;
    purchaseDeveloperProduct: (
      gameId: string,
      productId: string,
    ) => Promise<{
      productId: string;
      purchaseId: string;
      tix: number;
      playerData: Record<
        string,
        import("../../src/game/polyProject").PolyStoredValue
      >;
    }>;
    sendFriendRequest: (username: string) => Promise<void>;
    loadStudioProject: (id: string) => Promise<import("../../src/game/polyProject").PolyProject>;
    saveStudioDataStores: (
      id: string,
      dataStores: import("../../src/game/polyProject").PolyProject["dataStores"],
    ) => Promise<void>;
    getLaunch: () => Promise<PlayerLaunch | null>;
    setPresence: (
      presence:
        | {
            kind: "idle";
            details?: string;
            state?: string;
          }
        | {
            kind: "playing";
            gameTitle: string;
            playerCount?: number;
            gameUrl?: string;
          }
        | {
            kind: "studio-test";
            projectName: string;
          },
    ) => Promise<void>;
    onLaunch: (callback: (launch: PlayerLaunch) => void) => () => void;
    onAuthChanged: (callback: (auth: PlayerAuth) => void) => () => void;
    onProtocolError: (callback: (message: string) => void) => () => void;
    getUpdateState: () => Promise<DesktopUpdateState>;
    checkForUpdates: () => Promise<DesktopUpdateState>;
    installUpdate: () => Promise<DesktopUpdateState>;
    onUpdateState: (
      callback: (state: DesktopUpdateState) => void,
    ) => () => void;
  };
}
