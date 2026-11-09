import { describe, expect, it, vi } from "vitest";
import { createPlatform } from "./index.js";

describe("shared platform boundary", () => {
  it("enables native datasets only with all six typed capabilities", async () => {
    const methods = ["getDatasetRegistry", "chooseDatasetPack", "installDatasetPack", "activateDatasetPack", "cancelDatasetOperation"];
    const bridge = { protocol: 1, getInfo: async () => ({}), openExternal: vi.fn(), onDatasetCommand: vi.fn(() => () => {}) };
    for (const name of methods) bridge[name] = vi.fn(async () => ({ ok: true, value: { registered: true } }));
    const native = createPlatform(bridge);
    expect(native.capabilities.nativeDatasets).toBe(true);
    await native.datasets.install({ ticket: "opaque", mode: "reference" });
    expect(bridge.installDatasetPack).toHaveBeenCalledWith({ ticket: "opaque", mode: "reference" });
    bridge.activateDatasetPack.mockResolvedValue({ ok: false, error: { code: "dataset_unavailable", message: "Locate the pack" } });
    await expect(native.datasets.activate("pack")).rejects.toMatchObject({ code: "dataset_unavailable", message: "Locate the pack" });
    for (const name of [...methods, "onDatasetCommand"]) expect(createPlatform({ ...bridge, [name]: undefined }).capabilities.nativeDatasets).toBe(false);
    expect(createPlatform().capabilities.nativeDatasets).toBe(false); native.dispose();
  });
  it("enables report authority only through both typed operations and propagates their bounded errors", async () => {
    const bridge = { protocol: 1, getInfo: async () => ({}), openExternal: vi.fn(), saveReportFile: vi.fn(async () => ({ ok: true, value: { canceled: true } })), outputReport: vi.fn(async () => ({ ok: false, error: { code: "report_integrity", message: "Hash mismatch" } })) };
    const native = createPlatform(bridge);
    expect(native.capabilities.nativeReports).toBe(true);
    await expect(native.reports.save({ format: "zip" })).resolves.toEqual({ canceled: true });
    await expect(native.reports.output({ mode: "pdf" })).rejects.toMatchObject({ code: "report_integrity", message: "Hash mismatch" });
    expect(createPlatform({ ...bridge, outputReport: undefined }).capabilities.nativeReports).toBe(false);
    expect(createPlatform().capabilities.nativeReports).toBe(false); native.dispose();
  });
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
