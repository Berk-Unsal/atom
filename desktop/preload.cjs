"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// No ipcRenderer object, generic invoke, path, filesystem or process API crosses
// this bridge. Future file/report capabilities must be explicit typed methods.
contextBridge.exposeInMainWorld("atomDesktop", Object.freeze({
  protocol: 1,
  getInfo: () => ipcRenderer.invoke("atom:info"),
  openExternal: (url) => ipcRenderer.invoke("atom:open-external", url),
}));
