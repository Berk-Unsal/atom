import { describe, expect, it } from "vitest";
import { createProjectWorkspace, createScenario } from "../utils/projectStore.js";
import { domainToWorkspace, workspaceToDomain } from "./projectCompatibility.js";

describe("ProjectV2 compatibility adapter", () => {
  it("maps a current workspace into domain entities and back without changing effective inputs", () => {
    const workspace = createProjectWorkspace({ id: "ankara", version: "2026.07", hashes: { towers: "abc" } });
    const project = workspace.projects[0];
    project.draft = {
      plan: {
        settings: { frequencyGHz: 28, rayCount: 120 },
        inventory: [{ id: "cell-1", cellId: "cell-1", coordinates: [32.85, 39.92], rfProfile: { antennaGainDbi: 25 } }],
        planningMode: "single",
        selectedTowerId: "cell-1",
        selectedMapCellId: "ui-only",
        layerVisibility: { rays: true },
      },
    };
    project.scenarios.push(createScenario("Baseline", {
      datasetRef: project.datasetRef,
      plan: project.draft.plan,
      request: { frequency_ghz: 28, scenario_fingerprint: "atom-scenario-v1-fixture" },
      summary: { kind: "rf" },
      artifacts: null,
    }));
    const domain = workspaceToDomain(workspace);
    const revision = domain.scenario_revisions[0];
    expect(domain.projects).toHaveLength(1);
    expect(domain.inventories[0]).toBeTruthy();
    expect(domain.inventory_revisions[0].cells).toHaveLength(1);
    expect(revision.rf_affecting_settings.frequencyGHz).toBe(28);
    expect(revision.canonical_input_snapshot.selectedMapCellId).toBeUndefined();
    expect(revision.resolved_fingerprints.scenario_fingerprint).toBe("atom-scenario-v1-fixture");

    const roundTrip = domainToWorkspace(domain, workspace);
    expect(roundTrip.projects[0].scenarios[0].plan.settings).toEqual(project.scenarios[0].plan.settings);
    expect(roundTrip.projects[0].scenarios[0].plan.inventory[0].id).toBe("cell-1");
    expect(roundTrip.projects[0].scenarios[0].plan.selectedMapCellId).toBe("ui-only");
  });
});
