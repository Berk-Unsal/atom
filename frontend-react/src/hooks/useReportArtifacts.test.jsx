import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  deleteProjectArtifacts: vi.fn(),
  getIssues: vi.fn(() => []),
  listArtifacts: vi.fn(async () => []),
}));

vi.mock("../repository/artifactStore.js", () => ({
  default: class LocalArtifactStoreMock {
    constructor() {
      return storage;
    }
  },
}));

import useReportArtifacts from "./useReportArtifacts.js";

afterEach(() => vi.clearAllMocks());

describe("useReportArtifacts project cleanup", () => {
  it("refreshes after cleanup and preserves cleanup failures for the Project transaction", async () => {
    storage.deleteProjectArtifacts.mockResolvedValueOnce(2);
    const { result } = renderHook(() => useReportArtifacts({ projectId: "project-1" }));

    let deletedCount;
    await act(async () => {
      deletedCount = await result.current.deleteProjectArtifacts("project-1");
    });
    expect(deletedCount).toBe(2);
    expect(storage.deleteProjectArtifacts).toHaveBeenCalledWith("project-1");
    expect(storage.listArtifacts).toHaveBeenCalled();

    storage.deleteProjectArtifacts.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    let rejection;
    await act(async () => {
      try {
        await result.current.deleteProjectArtifacts("project-1");
      } catch (error) {
        rejection = error;
      }
    });
    expect(rejection).toMatchObject({ message: "IndexedDB unavailable" });
    expect(result.current.error).toBe("IndexedDB unavailable");
  });
});
