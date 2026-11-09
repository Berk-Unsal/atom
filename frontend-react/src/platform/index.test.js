import { describe, expect, it, vi } from "vitest";
import { createPlatform } from "./index.js";

describe("shared platform boundary", () => {
  it("enables native files only with the complete typed contract and preserves actionable errors", async () => {
    const methods = ["openProjectFile", "acceptProjectOpen", "discardProjectOpen", "saveProjectFile", "setProjectFileState", "getProjectFileState", "finishProjectCommand"];
    const bridge = { protocol: 1, getInfo: async () => ({}), openExternal: vi.fn(), onProjectCommand: vi.fn(() => () => {}) };
    for (const method of methods) bridge[method] = vi.fn(async () => ({ ok: true, value: [] }));
    const native = createPlatform(bridge);
    expect(native.capabilities.nativeProjectFiles).toBe(true);
    const payload = { projectId: "p", mode: "save" };
    await native.projectFiles.save(payload);
    expect(bridge.saveProjectFile).toHaveBeenCalledWith(payload);
    bridge.saveProjectFile.mockResolvedValue({ ok: false, error: { code: "file_conflict", message: "Changed externally" } });
    await expect(native.projectFiles.save(payload)).rejects.toMatchObject({ code: "file_conflict", message: "Changed externally" });
    expect(createPlatform({ ...bridge, getProjectFileState: undefined }).capabilities.nativeProjectFiles).toBe(false);
    native.dispose();
  });
  it("keeps browser execution independent of a native runtime", async () => {
    const browser = createPlatform();
    expect(browser.kind).toBe("browser");
    expect(await browser.getInfo()).toEqual({ kind: "browser" });
    expect(browser.capabilities.nativeProjectFiles).toBe(false);
    await expect(browser.openExternal("file:///etc/passwd")).rejects.toThrow("HTTPS");
  });

  it("uses only the supported typed host contract", async () => {
    const bridge = { protocol: 1, getInfo: vi.fn(async () => ({ version: "0.13.1" })), openExternal: vi.fn() };
    const native = createPlatform(bridge);
    expect(native.kind).toBe("desktop");
    expect(await native.getInfo()).toEqual({ version: "0.13.1" });
    await native.openExternal("https://example.com/");
    expect(bridge.openExternal).toHaveBeenCalledWith("https://example.com/");
    expect(createPlatform({ ...bridge, protocol: 2 }).kind).toBe("browser");
  });
});
