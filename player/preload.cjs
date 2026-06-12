const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("polymons", {
  getAuth: () => ipcRenderer.invoke("auth:get"),
  login: (username, password) =>
    ipcRenderer.invoke("auth:login", { username, password }),
  signUp: (username, password, displayName) =>
    ipcRenderer.invoke("auth:signup", { username, password, displayName }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  play: (gameId) => ipcRenderer.invoke("game:play", { gameId }),
  loadStudioProject: (id) => ipcRenderer.invoke("studio:project", { id }),
  saveStudioDataStores: (id, dataStores) =>
    ipcRenderer.invoke("studio:save-data", { id, dataStores }),
  getLaunch: () => ipcRenderer.invoke("launch:get"),
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
});
