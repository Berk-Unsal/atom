import { describe, expect, it } from "vitest";
import { reportLineageLine, reportRunLabels } from "./reportLineage.js";

const runs = [
  { run_id: "1cfa19e7-0000-0000-0000-00000e5e048d", run_type: "simulation" },
  { run_id: "f1a1e6d2-0000-0000-0000-000000073ba08", run_type: "optimization" },
];

describe("report lineage", () => {
  it("names the scenario, Version and bound Runs", () => {
    expect(reportLineageLine({ scenarioName: "Sector plan 1", versionLabel: "Version 1", runIds: [runs[0].run_id], runs }))
      .toBe("Sector plan 1 · Version 1 · Runs: Simulation Run 1cfa19e7…5e048d");
  });

  it("states an unsaved source and no bound Runs plainly", () => {
    expect(reportLineageLine({ scenarioName: "Ankara Plan" })).toBe("Ankara Plan · No saved Version · Runs: None");
    expect(reportLineageLine({})).toBe("Scenario · No saved Version · Runs: None");
  });

  it("labels unknown Runs generically", () => {
    expect(reportRunLabels(["missing-run"], runs)).toBe("Run missing-run");
    expect(reportRunLabels([runs[1].run_id], runs)).toBe("Optimization Run f1a1e6d2…73ba08");
  });
});
