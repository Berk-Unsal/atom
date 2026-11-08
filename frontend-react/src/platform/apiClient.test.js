import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("native shared HTTP client", () => {
  it("marks JSON and Blob requests without changing the RF workflow headers or payload", async () => {
    vi.stubGlobal("atomDesktop", { protocol: 1, getInfo: vi.fn(), openExternal: vi.fn() });
    const fetch = vi.fn(async (_url, options) => ({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => "{}",
      blob: async () => new Blob([options.body]),
    }));
    vi.stubGlobal("fetch", fetch);
    const { getJSON, postJSON, postBlob } = await import("../utils/apiClient.js");
    await getJSON("/api/meta");
    await postJSON("/api/evaluate-network", { cells: [] }, "failed", undefined, { headers: { "RF-Workflow": "network-maps-v1" } });
    await postBlob("/api/export", { format: "geojson" });
    for (const [, options] of fetch.mock.calls) {
      expect(options.headers["X-Atom-Client"]).toBe("1");
      expect(options.headers["X-Atom-Desktop-Token"]).toBeUndefined();
    }
    expect(fetch.mock.calls[1][1].headers["RF-Workflow"]).toBe("network-maps-v1");
    expect(fetch.mock.calls[1][1].body).toBe('{"cells":[]}');
    expect(fetch.mock.calls[2][1].body).toBe('{"format":"geojson"}');
  });
});
