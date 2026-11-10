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
  it("does not autosave or dirty a restored inventory for implicit domain defaults", () => {
    const plan = { settings: { technology: "5g" }, inventory: [{ id: "LTE-26380", coordinates: [32.8, 39.9], provenance: "dataset" }] };
    const project = { id: "p", draft: { plan } };
    const live = { ...plan, inventory: plan.inventory.map((cell) => ({ ...cell, rfProfile: {}, sourceKey: cell.id })) };
    const before = JSON.stringify(project);
    expect(pendingProjectFileRevision(project, live)).toBeNull();
    expect(pendingProjectFileRevision({ ...project, draft: { plan: live } }, plan)).toBeNull();
    expect(JSON.stringify(project)).toBe(before);
    for (const patch of [{ rfProfile: { txPowerDbm: 31 } }, { sourceKey: "another-source" }, { coordinates: [32.81, 39.9] }, { provenance: "user" }]) {
      const edit = { ...live, inventory: [{ ...live.inventory[0], ...patch }] };
      expect(pendingProjectFileRevision(project, edit)).toMatch(/^pending:[a-f0-9]{64}$/);
    }
    expect(pendingProjectFileRevision(project, { ...live, inventory: [...live.inventory, { id: "new" }] })).not.toBeNull();
  });
});
