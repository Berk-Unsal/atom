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
      message: "The planning API returned a server error (502): gateway unavailable. Try again; if it keeps failing, check the backend logs.",
      status: 502,
      code: "server_error",
    });
  });

  it("explains an unreachable API with its origin instead of the raw fetch error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const failure = await getJSON("/api/towers", "Cell inventory could not be loaded").catch((error) => error);
    expect(failure.code).toBe("api_unreachable");
    expect(failure.message).toContain(`could not reach the planning API at ${window.location.origin}`);
    expect(failure.message).toContain("Retry");
    expect(failure.message).not.toContain("Failed to fetch");
    expect(failure.cause).toBeInstanceOf(TypeError);
  });

  it("gives the RF deadline (504) timeout guidance instead of a server-fault message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: false, status: 504, json: { error: "RF analysis exceeded its request deadline" } })));
    await expect(postJSON("/api/optimize-network", {}, "fallback")).rejects.toMatchObject({
      message: "RF analysis exceeded its request deadline. Try again; if it keeps timing out, reduce the plan (fewer Cells or rays).",
      status: 504,
      code: "timeout",
    });
  });

  it("passes non-network fetch errors through unchanged", async () => {
    const failure = new Error("map failed");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
    await expect(getJSON("/api/towers", "failed")).rejects.toBe(failure);
  });

  it("still rejects aborted requests with the abort error", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(getJSON("/api/towers", "failed")).rejects.toBe(abort);
  });

  it("reports unreadable JSON from a successful response and accepts an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: true, rawText: "<html>not the API</html>" })));
    await expect(getJSON("/api/meta", "failed")).rejects.toMatchObject({ code: "invalid_response", message: expect.stringContaining("could not read (invalid JSON)") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({ ok: true, rawText: "" })));
    await expect(getJSON("/api/meta", "failed")).resolves.toBeNull();
  });

  it("passes abort signals to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({ ok: true, json: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await getJSON("/api/towers", "failed", controller.signal);
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal);
    expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
  });

  it("shows Retry-After guidance without retrying or changing the submitted RF request", async () => {
    const response = mockResponse({ ok: false, status: 429, json: { error: "RF analysis request budget exceeded; retry after the current rate-limit window" } });
    const getHeader = response.headers.get;
    response.headers.get = (name) => name.toLowerCase() === "retry-after" ? "18" : getHeader(name);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const payload = { towers: [{ id: "cell-a" }], rays: 120 };
    await expect(postJSON("/api/evaluate-network", payload, "fallback")).rejects.toMatchObject({
      message: "RF request budget reached. Try again in about 18 seconds.",
      status: 429,
      retryAfter: "18",
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(payload);
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

function mockResponse({ ok, status = ok ? 200 : 500, contentType = "application/json", contentLength, json, text = "", rawText }) {
  return {
    ok,
    status,
    headers: { get: (name) => {
      if (name.toLowerCase() === "content-type") return contentType;
      if (name.toLowerCase() === "content-length" && contentLength !== undefined) return String(contentLength);
      return null;
    } },
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(rawText ?? (contentType.includes("json") ? JSON.stringify(json) : text)),
  };
}
