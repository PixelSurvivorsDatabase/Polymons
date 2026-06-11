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

type PlayerLaunch = {
  game: string;
  websocketUrl: string;
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
    getLaunch: () => Promise<PlayerLaunch | null>;
    onLaunch: (callback: (launch: PlayerLaunch) => void) => () => void;
  };
}
