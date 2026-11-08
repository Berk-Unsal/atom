import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createRuntimeGuard } from "../platform/runtime.js";
import useRequestCoordinator from "./useRequestCoordinator.js";

describe("useRequestCoordinator", () => {
  it("aborts a superseded request and keeps only the latest current", () => {
    const { result } = renderHook(() => useRequestCoordinator());
    let first;
    let second;
    act(() => {
      first = result.current.begin("rf");
      second = result.current.begin("rf");
    });
    expect(first.signal.aborted).toBe(true);
    expect(first.isCurrent()).toBe(false);
    expect(second.signal.aborted).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("aborts active requests on unmount", () => {
    const { result, unmount } = renderHook(() => useRequestCoordinator());
    let request;
    act(() => {
      request = result.current.begin("core-lab");
    });
    unmount();
    expect(request.signal.aborted).toBe(true);
  });

  it("binds the action before asynchronous persistence while preserving caller cleanup", async () => {
    let status = { sequence: 1, state: "ready", generation: "a".repeat(32) }; let notify;
    const guard = createRuntimeGuard({ getRuntime: async () => status, onRuntimeChange: (callback) => { notify = callback; } });
    const bootstrap = await guard.begin(); bootstrap.close();
    const { result } = renderHook(() => useRequestCoordinator(guard));
    let request;
    act(() => { request = result.current.begin("rf"); });
    status = { sequence: 2, state: "ready", generation: "b".repeat(32) }; notify(status);
    await expect(guard.begin(request.signal)).rejects.toMatchObject({ code: "runtime_changed" });
    expect(request.isCurrent()).toBe(true); // The usual catch/finally can clear the action's busy state.
    request.finish();
    expect(request.isCurrent()).toBe(false);
  });
});
