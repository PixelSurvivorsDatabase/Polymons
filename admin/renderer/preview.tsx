import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AdminApp from "./AdminApp";
import "./admin.css";

const previewData: PolyAdminAccountsResponse = {
  accounts: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      username: "lava",
      displayName: "lava",
      avatarUrl: null,
      joinedAt: "2026-06-11T18:07:42.353Z",
      lastSignInAt: "2026-06-12T15:41:00.000Z",
      role: "owner",
      loginDisabled: false,
      passwordStatus: "protected-hash-only",
      online: { gameId: "my-game-009cbafb", connected: true },
      stats: { friends: 4, games: 3, gameVisits: 1284 },
    },
    {
      id: "12c487de-baf4-4126-929c-f53b05ce3048",
      username: "builder",
      displayName: "Block Builder",
      avatarUrl: null,
      joinedAt: "2026-06-12T01:42:12.000Z",
      lastSignInAt: "2026-06-12T14:18:00.000Z",
      role: "player",
      loginDisabled: false,
      passwordStatus: "protected-hash-only",
      online: { gameId: null, connected: false },
      stats: { friends: 2, games: 1, gameVisits: 76 },
    },
    {
      id: "5a82a19c-1d03-4e6b-bbcc-b5dc811182bf",
      username: "playtester",
      displayName: "Playtester",
      avatarUrl: null,
      joinedAt: "2026-06-12T04:20:00.000Z",
      lastSignInAt: null,
      role: "player",
      loginDisabled: false,
      passwordStatus: "protected-hash-only",
      online: { gameId: null, connected: false },
      stats: { friends: 1, games: 0, gameVisits: 0 },
    },
  ],
  pagination: { page: 1, perPage: 100, total: 3, lastPage: 1 },
  summary: { accounts: 3, games: 5, gameVisits: 1360, onlinePlayers: 1 },
};

window.polyAdmin = {
  getAuth: async () => ({
    user: {
      id: previewData.accounts[0].id,
      username: "lava",
      displayName: "lava",
      avatarUrl: null,
    },
    session: {
      accessToken: "preview",
      refreshToken: "preview",
      expiresIn: 3600,
      tokenType: "bearer",
    },
  }),
  login: async () => {
    throw new Error("Preview login is disabled.");
  },
  logout: async () => undefined,
  listAccounts: async () => previewData,
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
