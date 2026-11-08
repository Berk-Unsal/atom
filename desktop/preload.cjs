"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// No ipcRenderer object, generic invoke, path, filesystem or process API crosses
// this bridge. Future file/report capabilities must be explicit typed methods.
contextBridge.exposeInMainWorld("atomDesktop", Object.freeze({
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
}));
