type PolyAdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

type PolyAdminAuth = {
  user: PolyAdminUser;
  session: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
    expiresIn: number;
    tokenType: string;
  };
};

type PolyAdminAccount = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  joinedAt: string;
  lastSignInAt: string | null;
  role: "owner" | "player";
  loginDisabled: boolean;
  passwordStatus: "protected-hash-only";
  equippedShirtId: string | null;
  inventory: Array<{
    itemId: string;
    acquiredAt: string;
  }>;
  online: {
    gameId: string | null;
    connected: boolean;
  };
  stats: {
    friends: number;
    games: number;
    gameVisits: number;
  };
};

type PolyAdminAccountsResponse = {
  accounts: PolyAdminAccount[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    lastPage: number;
  };
  summary: {
    accounts: number;
    games: number;
    gameVisits: number;
    onlinePlayers: number;
  };
  avatarItems: Array<{
    id: string;
    name: string;
    description: string;
    itemType: string;
    unlockType: string;
    unlockThreshold: number | null;
  }>;
};

interface Window {
  polyAdmin: {
    getAuth: () => Promise<PolyAdminAuth | null>;
    login: (username: string, password: string) => Promise<PolyAdminAuth>;
    logout: () => Promise<void>;
    listAccounts: (
      page: number,
      perPage: number,
    ) => Promise<PolyAdminAccountsResponse>;
    updateInventory: (
      userId: string,
      itemId: string,
      owned: boolean,
      equip?: boolean,
    ) => Promise<{
      userId: string;
      itemId: string;
      owned: boolean;
      equipped: boolean;
    }>;
  };
}
