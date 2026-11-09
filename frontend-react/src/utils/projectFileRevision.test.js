import { describe, expect, it } from "vitest";
import { pendingProjectFileRevision } from "./projectFileRevision.js";

describe("portable file working revision", () => {
  it("tracks edits before autosave, returns clean after flush, and ignores object-key order", () => {
    const project = { id: "p", draft: { plan: { settings: { power: 20, band: "5G" }, cells: [1, 2] } } };
    expect(pendingProjectFileRevision(project, { cells: [1, 2], settings: { band: "5G", power: 20 } })).toBeNull();
    const changed = { cells: [1, 2], settings: { band: "5G", power: 21 } };
    expect(pendingProjectFileRevision(project, changed)).toMatch(/^pending:[a-f0-9]{64}$/);
    expect(pendingProjectFileRevision({ ...project, draft: { plan: changed } }, changed)).toBeNull();
    expect(project.draft.plan.settings.power).toBe(20);
  });
  it("uses the active retained Scenario when no working draft exists", () => {
    const project = { activeScenarioId: "s", scenarios: [{ id: "s", plan: { cells: [2, 1] } }] };
    expect(pendingProjectFileRevision(project, { cells: [2, 1] })).toBeNull();
    expect(pendingProjectFileRevision(project, { cells: [1, 2] })).not.toBeNull();
  });
});
