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
  publishProject: (project, metadata) =>
    ipcRenderer.invoke("projects:publish", { project, metadata }),
  exportProject: (project) => ipcRenderer.invoke("projects:export", project),
  importProject: () => ipcRenderer.invoke("projects:import"),
  revealProject: (id) => ipcRenderer.invoke("projects:reveal", { id }),
  playProject: (id) => ipcRenderer.invoke("projects:play", { id }),
  exportModel: (input) => ipcRenderer.invoke("models:export", input),
  importModel: () => ipcRenderer.invoke("models:import"),
  exportAnimation: (input) => ipcRenderer.invoke("animations:export", input),
  importAnimation: () => ipcRenderer.invoke("animations:import"),
  importSound: () => ipcRenderer.invoke("sounds:import"),
  getUpdateState: () => ipcRenderer.invoke("updates:get"),
  checkForUpdates: () => ipcRenderer.invoke("updates:check"),
  installUpdate: () => ipcRenderer.invoke("updates:install"),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", listener);
    return () => ipcRenderer.removeListener("updates:state", listener);
  },
});
