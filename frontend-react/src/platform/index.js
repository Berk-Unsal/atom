const browserPlatform = Object.freeze({
  kind: "browser",
  capabilities: Object.freeze({ nativeProjectFiles: false, nativeReports: false }),
  getInfo: async () => ({ kind: "browser" }),
  openExternal: async (raw) => {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Only HTTPS links are supported");
    globalThis.open(url.href, "_blank", "noopener,noreferrer");
  },
});

/** Injectable for browser/native contract tests; no Electron dependency in React. */
export function createPlatform(bridge) {
  if (bridge?.protocol !== 1 || typeof bridge.getInfo !== "function" || typeof bridge.openExternal !== "function") return browserPlatform;
  return Object.freeze({
    kind: "desktop",
    capabilities: Object.freeze({ nativeProjectFiles: false, nativeReports: false }),
    getInfo: () => bridge.getInfo(),
    openExternal: (url) => bridge.openExternal(url),
  });
}

export const platform = createPlatform(globalThis.atomDesktop);
