import { describe, expect, it } from "vitest";
import { buildResultContext, buildWorkspaceLineage, classifyPlanChange, nextPlanChange, planModeMessage, RESULT_FRESHNESS, resolveRunFreshness, resultStateLabel, versionStateLabel } from "./resultContext.js";

const run = {
  run_id: "run-21",
  run_type: "simulation",
  project_id: "project-1",
  scenario_id: "scenario-1",
  scenario_revision_id: "revision-4",
  scenario_fingerprint: "scenario-a",
  status: "succeeded",
  created_at: "2026-09-22T10:00:00.000Z",
};

const scenarios = [{
  id: "legacy-scenario-1",
  name: "Capacity Plan",
  domain: {
    scenario_id: "scenario-1",
    current_revision_id: "revision-4",
    revisions: [{ scenario_revision_id: "revision-4", revision: 4 }],
  },
}];

describe("result context", () => {
  it("resolves current simulation and optimization Runs for matching inputs", () => {
    expect(resolveRunFreshness({ run, activeProjectId: "project-1", activeScenarioId: "scenario-1", activeRevisionId: "revision-4" })).toBe(RESULT_FRESHNESS.CURRENT);
    expect(resolveRunFreshness({ run: { ...run, run_type: "optimization" }, activeProjectId: "project-1", activeScenarioId: "scenario-1", activeRevisionId: "revision-4" })).toBe(RESULT_FRESHNESS.CURRENT);
  });

  it("marks an edited draft stale while retaining the source Run", () => {
    const context = buildResultContext({
      activeProjectId: "project-1",
      activeScenarioId: "scenario-1",
      activeRevisionId: "revision-4",
      draftChangedSinceRun: true,
      project: { id: "project-1", name: "Ankara" },
      run,
      scenarios,
    });
    expect(context.freshness).toBe(RESULT_FRESHNESS.STALE);
    expect(context.run_id).toBe("run-21");
    expect(context.version_label).toBe("Version 4");
  });

  it("does not assign a draft Run to the saved Version the draft was based on", () => {
    const context = buildResultContext({
      activeProjectId: "project-1",
      activeScenarioId: "scenario-1",
      activeRevisionId: "revision-4",
      project: { id: "project-1", name: "Ankara" },
      run: { ...run, scenario_revision_id: null, canonical_input_snapshot: { source_scenario_revision_id: null } },
      scenarios,
    });
    expect(context.scenario_id).toBe("scenario-1");
    expect(context.scenario_revision_id).toBeNull();
    expect(context.version_label).toBe("No saved Version");
  });

  it("distinguishes historical inspection, unavailable detail, and unsupported features", () => {
    expect(resolveRunFreshness({ run, historical: true })).toBe(RESULT_FRESHNESS.HISTORICAL);
    expect(resolveRunFreshness({ unavailableReason: "bytes are missing", run })).toBe(RESULT_FRESHNESS.UNAVAILABLE);
    expect(resolveRunFreshness({ unsupportedReason: "not defined for this profile", run })).toBe(RESULT_FRESHNESS.UNSUPPORTED);
  });

  it("keeps a retained historical Report without a source Run distinct from unavailable data", () => {
    const context = buildResultContext({ historical: true, resultType: "report", activeScenarioId: "scenario-1" });
    expect(context.freshness).toBe(RESULT_FRESHNESS.HISTORICAL);
    expect(context.run_label).toBe("No Run");
    expect(buildResultContext({ historical: true, resultType: "report", unavailableReason: "Report bytes are missing" }).freshness)
      .toBe(RESULT_FRESHNESS.UNAVAILABLE);
  });

  it("does not infer current state from timestamps when identity differs", () => {
    expect(resolveRunFreshness({
      run,
      activeProjectId: "project-1",
      activeScenarioId: "scenario-1",
      activeRevisionId: "revision-5",
    })).toBe(RESULT_FRESHNESS.STALE);
    expect(resolveRunFreshness({
      run: { ...run, input_fingerprint: "old" },
      currentInputFingerprint: "new",
    })).toBe(RESULT_FRESHNESS.STALE);
  });

  it("builds persistent saved and unsaved workspace lineage independently of result freshness", () => {
    expect(buildWorkspaceLineage({ project: { id: "project-1", name: "Ankara" }, activeScenario: scenarios[0], scenarios }).draft_state).toBe("Saved Version");
    expect(buildWorkspaceLineage({ project: { id: "project-1", name: "Ankara" }, draft: { sourceScenarioId: "scenario-1", sourceRevisionId: "revision-4" }, scenarios })).toMatchObject({
      scenario_name: "Capacity Plan",
      version_label: "Version 4",
      draft_state: "Unsaved changes",
    });
  });

  describe("plan-change reason classification", () => {
    const matching = { run, activeProjectId: "project-1", activeScenarioId: "scenario-1", activeRevisionId: "revision-4", draftChangedSinceRun: true };

    it.each([
      ["a mode-only change", "mode", RESULT_FRESHNESS.OTHER_MODE],
      ["an input change", "input", RESULT_FRESHNESS.STALE],
      ["an unclassified change", null, RESULT_FRESHNESS.STALE],
      ["an unknown reason", "layout", RESULT_FRESHNESS.STALE],
    ])("classifies %s", (_label, planChange, expected) => {
      expect(resolveRunFreshness({ ...matching, planChange })).toBe(expected);
    });

    it("never hides identity or fingerprint staleness behind a mode switch", () => {
      expect(resolveRunFreshness({ ...matching, planChange: "mode", activeRevisionId: "revision-5" })).toBe(RESULT_FRESHNESS.STALE);
      expect(resolveRunFreshness({ ...matching, planChange: "mode", activeProjectId: "project-2" })).toBe(RESULT_FRESHNESS.STALE);
      expect(resolveRunFreshness({
        ...matching,
        planChange: "mode",
        run: { ...run, input_fingerprint: "input-a" },
        currentInputFingerprint: "input-b",
      })).toBe(RESULT_FRESHNESS.STALE);
    });

    it("keeps a clean plan current whatever the last change kind was", () => {
      expect(resolveRunFreshness({ ...matching, draftChangedSinceRun: false, planChange: "mode" })).toBe(RESULT_FRESHNESS.CURRENT);
    });

    it.each([
      [null, "mode", "mode"],
      ["mode", "mode", "mode"],
      [null, "input", "input"],
      ["mode", "input", "input"],
      ["input", "mode", "input"],
      ["input", null, null],
      ["mode", null, null],
    ])("combines pending %s with %s into %s", (previous, change, expected) => {
      expect(nextPlanChange(previous, change)).toBe(expected);
    });

    it("treats anything but an explicit mode change as an input change", () => {
      expect(classifyPlanChange("mode")).toBe("mode");
      expect(classifyPlanChange("input")).toBe("input");
      expect(classifyPlanChange(undefined)).toBe("input");
    });

    it("labels the neutral state and explains which mode the Result belongs to", () => {
      expect(resultStateLabel(RESULT_FRESHNESS.OTHER_MODE)).toBe("OTHER MODE");
      const context = buildResultContext({ ...matching, planChange: "mode", currentPlanningMode: "network", run: { ...run, canonical_input_snapshot: { request: { tower_lon: 32.85, tower_lat: 39.92 } } }, scenarios });
      expect(context.freshness).toBe(RESULT_FRESHNESS.OTHER_MODE);
      expect(context.draft_changed_since_run).toBe(false);
      expect(context.mode_message).toBe("Result belongs to Single-sector mode. Switch back to Single-sector or run the current plan.");
      expect(planModeMessage("single", "single")).toMatch(/Run again to show it on the map/);
    });
  });

  describe("Version-state vocabulary", () => {
    it.each([
      [{ revision: null }, "No saved Version"],
      [{ revision: null, unsavedChanges: true }, "No saved Version"],
      [{ revision: 3 }, "Version 3"],
      [{ revision: 3, unsavedChanges: true }, "Version 3 · Unsaved changes"],
    ])("words %j as %s", (input, expected) => {
      expect(versionStateLabel(input)).toBe(expected);
    });

    it("gives the workspace lineage and a current draft Run the same wording", () => {
      const sourceScenario = scenarios[0];
      const workspace = buildWorkspaceLineage({ project: { id: "project-1" }, sourceScenario, draft: { sourceScenarioId: "scenario-1", sourceRevisionId: "revision-4" }, scenarios });
      expect(workspace.version_state).toBe("Version 4 · Unsaved changes");
      const draftRun = { ...run, scenario_id: null, scenario_revision_id: null };
      const context = buildResultContext({ activeProjectId: "project-1", run: draftRun, scenarios, workspace });
      expect(context.version_state).toBe("Version 4 · Unsaved changes");
      expect(context.scenario_name).toBe("Capacity Plan");
    });

    it("keeps a stale draft Run on its own wording", () => {
      const workspace = { scenario_name: "Capacity Plan", version_state: "Version 4 · Unsaved changes" };
      const context = buildResultContext({ activeProjectId: "project-1", draftChangedSinceRun: true, run: { ...run, scenario_id: null, scenario_revision_id: null }, scenarios, workspace });
      expect(context.version_state).toBe("No saved Version");
    });
  });
});
