import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("native shared HTTP client", () => {
  it("never sends an old RF capability to a replacement runtime during cleanup", async () => {
    const first = "a".repeat(32); const second = "b".repeat(32);
    let status = { sequence: 1, state: "ready", generation: first };
    vi.stubGlobal("atomDesktop", { protocol: 1, getInfo: vi.fn(), openExternal: vi.fn(), getRuntime: async () => status, onRuntimeChange: vi.fn() });
    const fetch = vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json", "X-Atom-Runtime-Generation": first,
      "RF-Workflow-ID": "c".repeat(32), "RF-Workflow-Remaining": "1", "RF-Workflow-Expires": "60", "RF-Budget-Policy": "bounded-followups-v1" } }));
    vi.stubGlobal("fetch", fetch);
    const { createRFWorkflow } = await import("../utils/rfWorkflow.js");
    const action = new AbortController();
    const workflow = createRFWorkflow({ rf_budget_policy: "bounded-followups-v1" }, action.signal);
    await workflow.root("/api/evaluate-network", {}, "failed", 1);
    status = { sequence: 2, state: "ready", generation: second };
    await workflow.close();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers["X-Atom-Runtime-Generation"]).toBe(first);
  });
  it("marks JSON and Blob requests without changing the RF workflow headers or payload", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://unrelated.invalid");
    const generation = "a".repeat(32);
    vi.stubGlobal("atomDesktop", { protocol: 1, getInfo: vi.fn(), openExternal: vi.fn(), getRuntime: async () => ({ sequence: 1, state: "ready", generation }), onRuntimeChange: vi.fn() });
    const fetch = vi.fn(async (_url, options) => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json", "X-Atom-Runtime-Generation": generation }),
      text: async () => "{}",
      blob: async () => new Blob([options.body]),
    }));
    vi.stubGlobal("fetch", fetch);
    const { getJSON, postJSON, postBlob } = await import("../utils/apiClient.js");
    await getJSON("/api/meta");
    await postJSON("/api/evaluate-network", { cells: [] }, "failed", undefined, { headers: { "RF-Workflow": "network-maps-v1" } });
    await postBlob("/api/export", { format: "geojson" });
    for (const [url, options] of fetch.mock.calls) {
      expect(url.startsWith("/api/")).toBe(true);
      expect(options.headers["X-Atom-Client"]).toBe("1");
      expect(options.headers["X-Atom-Desktop-Token"]).toBeUndefined();
      expect(options.headers["X-Atom-Runtime-Generation"]).toBe(generation);
      expect(options.signal.aborted).toBe(false); // Successful RF roots retain their follow-up capability.
    }
    expect(fetch.mock.calls[1][1].headers["RF-Workflow"]).toBe("network-maps-v1");
    expect(fetch.mock.calls[1][1].body).toBe('{"cells":[]}');
    expect(fetch.mock.calls[2][1].body).toBe('{"format":"geojson"}');
  });

  it.each(["json", "blob"])("rejects a late %s body after a newer generation completes", async (format) => {
    const first = "a".repeat(32); const second = "b".repeat(32);
    let status = { sequence: 1, state: "ready", generation: first }; let notify; let release; let started;
    const received = new Promise((resolve) => { started = resolve; });
    vi.stubGlobal("atomDesktop", { protocol: 1, getInfo: vi.fn(), openExternal: vi.fn(), getRuntime: async () => status, onRuntimeChange: (callback) => { notify = callback; } });
    const oldBody = new Promise((resolve) => { release = resolve; });
    let count = 0;
    const fetch = vi.fn(async (_url, options) => {
      const old = count++ === 0;
      const body = async () => { if (old) { started(); await oldBody; } return old ? '{"value":"old"}' : '{"value":"new"}'; };
      return { ok: true, headers: new Headers({ "content-type": "application/json", "X-Atom-Runtime-Generation": options.headers["X-Atom-Runtime-Generation"] }), text: body, blob: async () => new Blob([await body()]) };
    });
    vi.stubGlobal("fetch", fetch);
    const { getJSON, postBlob } = await import("../utils/apiClient.js");
    let displayed;
    const old = (format === "json" ? getJSON("/api/result") : postBlob("/api/export", {})).then((value) => { displayed = value; }).catch((error) => error);
    await received;
    status = { sequence: 2, state: "ready", generation: second }; notify(status);
    displayed = await getJSON("/api/new-result");
    release();
    expect(await old).toMatchObject({ code: "runtime_changed" });
    expect(displayed).toEqual({ value: "new" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
