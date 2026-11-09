"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// No ipcRenderer object, generic invoke, arbitrary-path, filesystem or process API crosses
// this bridge. Future file/report capabilities must be explicit typed methods.
// Preload can run again after a main-process navigation. Never expose even a
// rejected facade to a report, asset, foreign document or child frame.
if (process.isMainFrame && location.protocol === "app:" && location.host === "atom" &&
    ["/", "/index.html"].includes(location.pathname) && !location.search) contextBridge.exposeInMainWorld("atomDesktop", Object.freeze({
  protocol: 1,
  getInfo: async () => ({ ...await ipcRenderer.invoke("atom:info"), rendererSandboxed: process.sandboxed === true }),
  getRuntime: () => ipcRenderer.invoke("atom:runtime"),
  onRuntimeChange: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Runtime listener must be a function");
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("atom:runtime-status", listener);
    return () => ipcRenderer.removeListener("atom:runtime-status", listener);
  },
  openExternal: (url) => ipcRenderer.invoke("atom:open-external", url),
  openProjectFile: () => ipcRenderer.invoke("atom:project-open"),
  acceptProjectOpen: (request) => ipcRenderer.invoke("atom:project-accept", request),
  discardProjectOpen: (ticket) => ipcRenderer.invoke("atom:project-discard", ticket),
  saveProjectFile: (request) => ipcRenderer.invoke("atom:project-save", request),
  setProjectFileState: (projects) => ipcRenderer.invoke("atom:project-state", projects),
  onProjectCommand: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Project command listener must be a function");
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("atom:project-command", listener);
    return () => ipcRenderer.removeListener("atom:project-command", listener);
  },
}));
