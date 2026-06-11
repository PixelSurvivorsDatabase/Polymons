type PlayerUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
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
    play: (
      gameId: string,
    ) => Promise<{ playSession: { websocketUrl: string } }>;
    loadStudioProject: (id: string) => Promise<import("../../src/game/polyProject").PolyProject>;
    getLaunch: () => Promise<PlayerLaunch | null>;
    onLaunch: (callback: (launch: PlayerLaunch) => void) => () => void;
    onAuthChanged: (callback: (auth: PlayerAuth) => void) => () => void;
    onProtocolError: (callback: (message: string) => void) => () => void;
  };
}
