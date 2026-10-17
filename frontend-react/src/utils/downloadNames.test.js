import { describe, expect, it } from "vitest";
import { downloadFilename, namingForSource } from "./downloadNames.js";

const generatedAt = "2026-10-17T14:54:55.000Z";

describe("downloadFilename", () => {
  it("names a report by project, scenario, Version, date and kind", () => {
    expect(downloadFilename({ project: "Ankara Plan", scenario: "Sector plan 1", version: 1, date: generatedAt, kind: "report", extension: "md" }))
      .toBe("ankara-plan-sector-plan-1-v1-20261017-report.md");
  });

  it("omits missing parts and keeps project exports recognizable", () => {
    expect(downloadFilename({ project: "Ankara Plan", date: generatedAt, extension: "atom-project.json" })).toBe("ankara-plan-20261017.atom-project.json");
    expect(downloadFilename({ scenario: "Network plan 2", version: null, date: generatedAt, kind: "report", extension: "html" })).toBe("network-plan-2-20261017-report.html");
    expect(downloadFilename({ extension: "md" })).toBe("atom.md");
  });

  it("produces filesystem-safe, bounded slugs including non-ASCII names", () => {
    const name = downloadFilename({ project: "Çankaya / Kızılay: 5G?*", scenario: "x".repeat(80), version: 3, date: generatedAt, extension: "md" });
    expect(name).toMatch(/^[a-z0-9-]+\.md$/);
    expect(name).toContain("cankaya-kizilay-5g");
    expect(name).toContain(`-${"x".repeat(40)}-v3-`);
  });

  it("is deterministic for the same artifact", () => {
    const input = { project: "P", scenario: "S", version: 2, date: generatedAt, kind: "report", extension: "md" };
    expect(downloadFilename(input)).toBe(downloadFilename({ ...input }));
  });
});

describe("namingForSource", () => {
  const project = {
    name: "Ankara Plan",
    scenarios: [{ id: "s-1", name: "Sector plan 1", domain: { scenario_id: "scenario-1", revisions: [{ scenario_revision_id: "rev-1", revision: 1 }, { scenario_revision_id: "rev-2", revision: 2 }] } }],
  };

  it("resolves the source scenario and Version number", () => {
    expect(namingForSource(project, "scenario-1", "rev-2")).toEqual({ project: "Ankara Plan", scenario: "Sector plan 1", version: 2 });
  });

  it("leaves the Version out for unsaved sources", () => {
    expect(namingForSource(project, "scenario-1", null)).toEqual({ project: "Ankara Plan", scenario: "Sector plan 1", version: null });
    expect(namingForSource(project, null, null)).toEqual({ project: "Ankara Plan", scenario: null, version: null });
  });
});
