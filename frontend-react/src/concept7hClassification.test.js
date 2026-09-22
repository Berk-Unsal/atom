import { describe, expect, it } from "vitest";
import inventory from "../../docs/concept-7h-control-inventory.json";
import classification from "../../docs/concept-7h-classification.json";

const tiers = new Set(["planning", "advanced", "research_reference"]);

describe("Concept 7H control classification", () => {
  it("classifies every inventoried visible control exactly once", () => {
    const inventoryControls = inventory.controls.flatMap((group) => group.uiControls);
    const inventoryIDs = inventoryControls.map((control) => control.id).sort();
    const classifiedIDs = classification.controls.map((control) => control.id).sort();

    expect(inventory.controlsCount).toBe(inventoryControls.length);
    expect(new Set(inventoryIDs).size).toBe(inventoryIDs.length);
    expect(new Set(classifiedIDs).size).toBe(classifiedIDs.length);
    expect(classifiedIDs).toEqual(inventoryIDs);
    expect(classification.controlCount).toBe(inventoryControls.length);
    expect(classification.controls.every((control) => tiers.has(control.tier))).toBe(true);
  });

  it("keeps the tier contract out of runtime, RF, persistence, and evidence contracts", () => {
    expect(classification.classificationIsUXOnly).toBe(true);
    expect(classification.runtimeIntegration).toBe(false);
    expect(classification.domainPersistence).toBe(false);
    expect(classification.rfContractField).toBe(false);
    expect(classification.fingerprintInput).toBe(false);
    expect(classification.scenarioRevisionField).toBe(false);
    expect(classification.runSnapshotField).toBe(false);
    expect(classification.requestPayloadField).toBe(false);
  });

  it("retains specialist paths for path, interference, facade, and research controls", () => {
    const byID = new Map(classification.controls.map((control) => [control.id, control.tier]));
    expect(byID.get("path_profile.run")).toBe("advanced");
    expect(byID.get("interference.run")).toBe("advanced");
    expect(byID.get("building_entry.run")).toBe("advanced");
    expect(byID.get("sub_thz.frequency")).toBe("research_reference");
    expect(byID.get("p1411.candidate_row")).toBe("research_reference");
    expect(byID.get("material.frequency")).toBe("research_reference");
    expect(byID.get("reflection.frequency")).toBe("research_reference");
    expect(byID.get("diagnostics.load_campaign")).toBe("research_reference");
  });
});
