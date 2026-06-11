const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("polymons", {
  getAuth: () => ipcRenderer.invoke("auth:get"),
  login: (username, password) =>
    ipcRenderer.invoke("auth:login", { username, password }),
  signUp: (username, password, displayName) =>
    ipcRenderer.invoke("auth:signup", { username, password, displayName }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  play: (gameId) => ipcRenderer.invoke("game:play", { gameId }),
  getLaunch: () => ipcRenderer.invoke("launch:get"),
  onLaunch: (callback) => {
    const listener = (_event, launch) => callback(launch);
    ipcRenderer.on("launch:open", listener);
    return () => ipcRenderer.removeListener("launch:open", listener);
  },
});
