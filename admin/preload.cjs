const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("polyAdmin", {
  getAuth: () => ipcRenderer.invoke("auth:get"),
  login: (username, password) =>
    ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  listAccounts: (page, perPage) =>
    ipcRenderer.invoke("accounts:list", { page, perPage }),
  updateInventory: (userId, itemId, owned, equip) =>
    ipcRenderer.invoke("accounts:inventory", {
      userId,
      itemId,
      owned,
      equip,
    }),
});
