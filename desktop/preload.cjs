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
  saveReportFile: (request) => ipcRenderer.invoke("atom:report-save", request),
  outputReport: (request) => ipcRenderer.invoke("atom:report-output", request),
  getDatasetRegistry: () => ipcRenderer.invoke("atom:dataset-status"),
  chooseDatasetPack: (kind) => ipcRenderer.invoke("atom:dataset-choose", kind),
  installDatasetPack: (request) => ipcRenderer.invoke("atom:dataset-install", request),
  activateDatasetPack: (id) => ipcRenderer.invoke("atom:dataset-activate", id),
  cancelDatasetOperation: () => ipcRenderer.invoke("atom:dataset-cancel"),
  onDatasetCommand: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Dataset listener must be a function");
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("atom:dataset-command", listener);
    return () => ipcRenderer.removeListener("atom:dataset-command", listener);
  },
  setProjectFileState: (projects) => ipcRenderer.invoke("atom:project-state", projects),
  getProjectFileState: () => ipcRenderer.invoke("atom:project-status"),
  finishProjectCommand: (request) => ipcRenderer.invoke("atom:project-command-result", request),
  onProjectCommand: (callback) => {
    if (typeof callback !== "function") throw new TypeError("Project command listener must be a function");
    const listener = (_event, command) => callback(command);
    ipcRenderer.on("atom:project-command", listener);
    return () => ipcRenderer.removeListener("atom:project-command", listener);
  },
}));
