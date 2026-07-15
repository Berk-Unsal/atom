import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
