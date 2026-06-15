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
      tix: 840,
      passwordStatus: "protected-hash-only",
      equippedShirtId: "polymon-shirt",
      equippedPantsId: "classic-denim-pants",
      inventory: [
        { itemId: "polymon-shirt", acquiredAt: "2026-06-11T18:07:42.353Z" },
      ],
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
      tix: 120,
      passwordStatus: "protected-hash-only",
      equippedShirtId: "beta-tester-shirt",
      equippedPantsId: "polymon-pants",
      inventory: [
        { itemId: "polymon-shirt", acquiredAt: "2026-06-12T01:42:12.000Z" },
        { itemId: "beta-tester-shirt", acquiredAt: "2026-06-12T01:42:12.000Z" },
      ],
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
      tix: 0,
      passwordStatus: "protected-hash-only",
      equippedShirtId: null,
      equippedPantsId: null,
      inventory: [],
      online: { gameId: null, connected: false },
      stats: { friends: 1, games: 0, gameVisits: 0 },
    },
  ],
  pagination: { page: 1, perPage: 100, total: 3, lastPage: 1 },
  summary: { accounts: 3, games: 5, gameVisits: 1360, onlinePlayers: 1 },
  avatarItems: [
    {
      id: "polymon-shirt",
      name: "Polymon Shirt",
      description: "The original black and purple Polymons shirt.",
      itemType: "shirt",
      unlockType: "free",
      unlockThreshold: null,
      priceTix: 0,
      bundleKey: null,
    },
    {
      id: "beta-tester-shirt",
      name: "Beta Tester Shirt",
      description: "A flowing green, red, and purple shirt.",
      itemType: "shirt",
      unlockType: "free",
      unlockThreshold: null,
      priceTix: 0,
      bundleKey: null,
    },
    {
      id: "classic-denim-pants",
      name: "Classic Denim Pants",
      description: "Simple blue block pants with dark shoes.",
      itemType: "pants",
      unlockType: "free",
      unlockThreshold: null,
      priceTix: 0,
      bundleKey: null,
    },
    {
      id: "polymon-pants",
      name: "Polymon Pants",
      description: "Black and purple pants made to match the Polymon Shirt.",
      itemType: "pants",
      unlockType: "free",
      unlockThreshold: null,
      priceTix: 0,
      bundleKey: null,
    },
  ],
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
  updateInventory: async (userId, itemId, owned, equip) => ({
    userId,
    itemId,
    owned,
    equipped: owned && Boolean(equip),
  }),
  updateTix: async (userId, mode, amount) => ({
    userId,
    mode,
    amount,
    tix: mode === "set" ? Math.max(0, amount) : Math.max(0, 840 + amount),
  }),
  listCatalogSubmissions: async () => ({ submissions: [] }),
  reviewCatalogSubmission: async (itemId, status, reason = "") => ({
    itemId,
    reviewStatus: status,
    rejectionReason: reason,
  }),
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
