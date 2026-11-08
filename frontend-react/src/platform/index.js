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
  return Object.freeze({
    kind: "desktop",
    capabilities: Object.freeze({ nativeProjectFiles: false, nativeReports: false }),
    getInfo: () => bridge.getInfo(),
    openExternal: (url) => bridge.openExternal(url),
    beginRequest: (signal) => runtime.begin(signal),
    bindOperation: (signal) => runtime.bindOperation(signal),
    captureOperation: () => runtime.captureOperation(),
  });
}

export const platform = createPlatform(globalThis.atomDesktop);
