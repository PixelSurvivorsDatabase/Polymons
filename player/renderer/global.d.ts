type PlayerUser = {
  id: string;
  polymonsId: number;
  username: string;
  displayName: string;
  description: string;
  avatarUrl: string | null;
  equippedShirtId:
    | "polymon-shirt"
    | "beta-tester-shirt"
    | "creators-shirt"
    | null;
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
    listFriends: () => Promise<{ friendships: PlayerFriendship[] }>;
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
        manifest: import("../../src/game/polyProject").PolyProject | null;
      };
    }>;
    sendFriendRequest: (username: string) => Promise<void>;
    loadStudioProject: (id: string) => Promise<import("../../src/game/polyProject").PolyProject>;
    saveStudioDataStores: (
      id: string,
      dataStores: import("../../src/game/polyProject").PolyProject["dataStores"],
    ) => Promise<void>;
    getLaunch: () => Promise<PlayerLaunch | null>;
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
