import { describe, expect, it } from "vitest";
import { buildResultContext, buildWorkspaceLineage, RESULT_FRESHNESS, resolveRunFreshness } from "./resultContext.js";

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
});
