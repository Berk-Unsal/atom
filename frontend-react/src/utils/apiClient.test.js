import { afterEach, describe, expect, it, vi } from "vitest";
import { getJSON, MAX_JSON_RESPONSE_BYTES, postJSON } from "./apiClient.js";

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

  it("rejects JSON responses whose declared size exceeds the client limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({
      ok: true,
      json: {},
      contentLength: MAX_JSON_RESPONSE_BYTES + 1,
    })));
    await expect(getJSON("/api/towers", "failed")).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("stops streaming JSON when the actual body exceeds the client limit", async () => {
    const cancel = vi.fn();
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json" : null },
      body: {
        getReader: () => ({
          cancel,
          read: async () => {
            reads += 1;
            return reads === 1
              ? { done: false, value: new Uint8Array(MAX_JSON_RESPONSE_BYTES + 1) }
              : { done: true };
          },
        }),
      },
    }));
    await expect(getJSON("/api/towers", "failed")).rejects.toMatchObject({ code: "response_too_large" });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

function mockResponse({ ok, status = ok ? 200 : 500, contentType = "application/json", contentLength, json, text = "" }) {
  return {
    ok,
    status,
    headers: { get: (name) => {
      if (name.toLowerCase() === "content-type") return contentType;
      if (name.toLowerCase() === "content-length" && contentLength !== undefined) return String(contentLength);
      return null;
    } },
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(contentType.includes("json") ? JSON.stringify(json) : text),
  };
}
