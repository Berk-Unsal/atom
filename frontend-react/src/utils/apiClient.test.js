import { afterEach, describe, expect, it, vi } from "vitest";
import { getJSON, postJSON } from "./apiClient.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("API client", () => {
  it("returns JSON payloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: true, json: { status: "ok" } })));
    await expect(getJSON("/healthz", "failed")).resolves.toEqual({ status: "ok" });
  });

  it("preserves bounded non-JSON error messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      ok: false,
      status: 502,
      contentType: "text/plain",
      text: "gateway unavailable",
    })));
    await expect(postJSON("/api/interference", {}, "fallback")).rejects.toMatchObject({
      message: "gateway unavailable",
      status: 502,
    });
  });

  it("passes abort signals to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, json: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await getJSON("/api/towers", "failed", controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });
});

function mockResponse({ ok, status = ok ? 200 : 500, contentType = "application/json", json, text = "" }) {
  return {
    ok,
    status,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(text),
  };
}
