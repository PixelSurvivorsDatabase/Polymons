const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("polymons", {
  getAuth: () => ipcRenderer.invoke("auth:get"),
  login: (username, password) =>
    ipcRenderer.invoke("auth:login", { username, password }),
  signUp: (username, password, displayName) =>
    ipcRenderer.invoke("auth:signup", { username, password, displayName }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  listGames: () => ipcRenderer.invoke("games:list"),
  getGameLibrary: () => ipcRenderer.invoke("games:library"),
  listFriends: () => ipcRenderer.invoke("friends:list"),
  listFriendServers: () => ipcRenderer.invoke("servers:friends"),
  listGameServers: (gameId) =>
    ipcRenderer.invoke("servers:game", { gameId }),
  play: (gameId) => ipcRenderer.invoke("game:play", { gameId }),
  getGame: (gameId) => ipcRenderer.invoke("game:get", { gameId }),
  awardBadge: (gameId, badgeName) =>
    ipcRenderer.invoke("badges:award", { gameId, badgeName }),
  getGameEntitlements: (gameId) =>
    ipcRenderer.invoke("game:entitlements", { gameId }),
  purchaseGamePass: (gameId, passId) =>
    ipcRenderer.invoke("gamepasses:purchase", { gameId, passId }),
  purchaseDeveloperProduct: (gameId, productId) =>
    ipcRenderer.invoke("products:purchase", { gameId, productId }),
  sendFriendRequest: (username) =>
    ipcRenderer.invoke("friends:request", { username }),
  loadStudioProject: (id) => ipcRenderer.invoke("studio:project", { id }),
  saveStudioDataStores: (id, dataStores) =>
    ipcRenderer.invoke("studio:save-data", { id, dataStores }),
  getLaunch: () => ipcRenderer.invoke("launch:get"),
  setPresence: (presence) => ipcRenderer.invoke("presence:set", presence),
  onLaunch: (callback) => {
    const listener = (_event, launch) => callback(launch);
    ipcRenderer.on("launch:open", listener);
    return () => ipcRenderer.removeListener("launch:open", listener);
  },
  onAuthChanged: (callback) => {
    const listener = (_event, auth) => callback(auth);
    ipcRenderer.on("auth:changed", listener);
    return () => ipcRenderer.removeListener("auth:changed", listener);
  },
  onProtocolError: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("protocol:error", listener);
    return () => ipcRenderer.removeListener("protocol:error", listener);
  },
  getUpdateState: () => ipcRenderer.invoke("updates:get"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
});
