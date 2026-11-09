import { createRuntimeGuard } from "./runtime.js";

const browserPlatform = Object.freeze({
  kind: "browser",
  capabilities: Object.freeze({ nativeProjectFiles: false, nativeReports: false }),
  getInfo: async () => ({ kind: "browser" }),
  bindOperation: () => {},
  captureOperation: () => () => true,
  openExternal: async (raw) => {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only HTTPS links are supported");
    globalThis.open(url.href, "_blank", "noopener,noreferrer");
  },
});

/** Injectable for browser/native contract tests; no Electron dependency in React. */
export function createPlatform(bridge) {
  if (bridge?.protocol !== 1 || typeof bridge.getInfo !== "function" || typeof bridge.openExternal !== "function") return browserPlatform;
  const runtime = createRuntimeGuard(bridge);
  const nativeFiles = ["openProjectFile", "acceptProjectOpen", "discardProjectOpen", "saveProjectFile", "setProjectFileState", "getProjectFileState", "onProjectCommand", "finishProjectCommand"]
    .every((name) => typeof bridge[name] === "function");
  const fileCall = async (method, ...args) => {
    const response = await bridge[method](...args);
    if (response?.ok === true) return response.value;
    const error = new Error(response?.error?.message || "The native file operation could not complete.");
    error.code = response?.error?.code || "file_failed";
    throw error;
  };
  return Object.freeze({
    kind: "desktop",
    capabilities: Object.freeze({ nativeProjectFiles: nativeFiles, nativeReports: false }),
    projectFiles: nativeFiles ? Object.freeze({
      open: () => fileCall("openProjectFile"),
      accept: (request) => fileCall("acceptProjectOpen", request),
      discard: (ticket) => fileCall("discardProjectOpen", ticket),
      save: (request) => fileCall("saveProjectFile", request),
      sync: (projects) => fileCall("setProjectFileState", projects),
      status: () => fileCall("getProjectFileState"),
      onCommand: (callback) => bridge.onProjectCommand(callback),
      finishCommand: (request) => fileCall("finishProjectCommand", request),
    }) : null,
    getInfo: () => bridge.getInfo(),
    openExternal: (url) => bridge.openExternal(url),
    beginRequest: (signal, operationSignal) => runtime.begin(signal, operationSignal),
    bindOperation: (signal) => runtime.bindOperation(signal),
    captureOperation: () => runtime.captureOperation(),
    dispose: () => runtime.dispose(),
  });
}

export const platform = createPlatform(globalThis.atomDesktop);
if (import.meta.hot) import.meta.hot.dispose(() => platform.dispose?.());
