const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("polyStudio", {
  getAuth: () => ipcRenderer.invoke("auth:get"),
  login: (username, password) =>
    ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  openWebsite: () => ipcRenderer.invoke("website:open"),
  listProjects: () => ipcRenderer.invoke("projects:list"),
  createProject: (input) => ipcRenderer.invoke("projects:create", input),
  loadProject: (id) => ipcRenderer.invoke("projects:load", { id }),
  saveProject: (project) => ipcRenderer.invoke("projects:save", project),
  revealProject: (id) => ipcRenderer.invoke("projects:reveal", { id }),
  playProject: (id) => ipcRenderer.invoke("projects:play", { id }),
  exportModel: (input) => ipcRenderer.invoke("models:export", input),
  importModel: () => ipcRenderer.invoke("models:import"),
});
