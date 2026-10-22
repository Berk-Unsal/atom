import { describe, expect, it } from "vitest";
import { buildPlanningReport, reportLimitations } from "./reportExport.js";
import { buildReviewPackage, reviewPackageRefusal, verifyReviewPackage } from "./reviewPackage.js";
import { createZip, readZip } from "./zipWriter.js";

const report = () => buildPlanningReport({
  activeNetworkTech: "5G mmWave",
  appMeta: { dataset: { id: "ankara-default", name: "Ankara", version: "2026.07", sha256: { "nodes.geojson": "abc" } }, model_version: "model-v2" },
  buildingSummary: null,
  comparison: null,
  coreLab: null,
  coreLabApplicable: false,
  coreLabEnabled: false,
  coverageGaps: { geojson: { type: "FeatureCollection", features: [] }, stats: { gap_buildings: 0 } },
  diagnostics: null,
  interferenceAnalysis: null,
  measurementAnalysis: null,
  networkOptimization: null,
  planningMode: "single",
  project: { name: "Ankara Plan", activeScenarioId: "s-1", scenarios: [{ id: "s-1", name: "Sector plan 1" }] },
  recommendations: null,
  selectedNetworkTowers: [],
  selectedTower: { cellId: "101", azimuth: 90, coordinates: [32.85, 39.92] },
  settings: { frequencyGHz: 28, txPowerDbm: 30, radiusMeters: 400, beamWidthDeg: 120, rayCount: 120 },
  simulation: { geojson: { type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[32.85, 39.92], [32.851, 39.921]] }, properties: { signal_dbm: -84 } }] }, stats: { avg_rx_dbm: -84 } },
});

const source = {
  scenario_id: "scenario-1",
  scenario_name: "Sector plan 1",
  scenario_revision_id: "rev-1",
  version_label: "Version 1",
  runs: [{ run_id: "run-1", run_type: "simulation", created_at: "2026-10-18T10:00:00Z" }],
};

const build = (planningReport = report()) => buildReviewPackage({
  report: planningReport,
  projectFileText: '{"schemaVersion":3}',
  naming: { project: "Ankara Plan", scenario: "Sector plan 1", version: 1 },
  source,
  appMeta: { dataset: { id: "ankara-default", version: "2026.07", sha256: { "nodes.geojson": "abc" } }, model_version: "model-v2", application_version: "0.12.3" },
  generatedAt: new Date("2026-10-18T12:00:00Z"),
});

describe("review package", () => {
  it("derives omitted names from the same report identity used by the body and manifest", async () => {
    const packageOutput = await buildReviewPackage({ report: report(), source, projectFileText: "{}", generatedAt: new Date("2026-10-18T12:00:00Z") });
    expect(packageOutput.filename).toBe("ankara-plan-sector-plan-1-v1-20261018-120000z-single-cell-review-package.zip");
    expect(packageOutput.manifest.lineage).toMatchObject({ project: "Ankara Plan", scenario: "Sector plan 1", version: "Version 1", scenario_revision_id: "rev-1" });
    const markdown = new TextDecoder().decode(readZip(packageOutput.bytes).find((file) => file.name.endsWith(".md")).bytes);
    expect(markdown).toContain("Source: Sector plan 1 · Version 1");
  });
  it("contains both reports, the project file, the map and a manifest named by the download rule", async () => {
    const reviewPackage = await build();
    expect(reviewPackage.filename).toBe("ankara-plan-sector-plan-1-v1-20261018-120000z-single-cell-review-package.zip");
    expect(readZip(reviewPackage.bytes).map((entry) => entry.name)).toEqual([
      "ankara-plan-sector-plan-1-v1-20261018-120000z-single-cell-report.html",
      "ankara-plan-sector-plan-1-v1-20261018-120000z-single-cell-report.md",
      "ankara-plan-sector-plan-1-v1-20261018.atom-project.json",
      "ankara-plan-sector-plan-1-v1-20261018-120000z-single-cell-map.svg",
      "manifest.json",
    ]);
  });

  it("records hashes that match the contained files, plus identity, lineage and the report's limitations", async () => {
    const reviewPackage = await build();
    const check = await verifyReviewPackage(reviewPackage.bytes);
    expect(check).toMatchObject({ valid: true, problems: [] });
    expect(check.manifest.lineage).toEqual({
      project: "Ankara Plan",
      scenario: "Sector plan 1",
      version: "Version 1",
      scenario_revision_id: "rev-1",
      runs: [{ run_id: "run-1", run_type: "simulation", created_at: "2026-10-18T10:00:00Z" }],
    });
    expect(check.manifest.identity).toMatchObject({ dataset: { id: "ankara-default", version: "2026.07" }, model_version: "model-v2" });
    expect(check.manifest.rf_requests).toBe(0);
    expect(check.manifest.limitations).toEqual(reportLimitations(report()));
    expect(check.manifest.files.every((file) => /^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
  });

  it("is reproducible for the same inputs and time", async () => {
    // The same report: a freshly built report stamps its own generation time and ID.
    const planningReport = report();
    expect(Array.from((await build(planningReport)).bytes)).toEqual(Array.from((await build(planningReport)).bytes));
  });

  it("uses one captured instant and links Markdown only to actual companion files", async () => {
    const reviewPackage = await build();
    const entries = readZip(reviewPackage.bytes);
    const markdown = new TextDecoder().decode(entries.find(({ name }) => name.endsWith(".md")).bytes);
    const html = new TextDecoder().decode(entries.find(({ name }) => name.endsWith(".html")).bytes);
    expect(markdown).toContain("Generated: 2026-10-18 12:00 UTC");
    expect(html).toContain("2026-10-18 12:00 UTC");
    for (const [, target] of markdown.matchAll(/\]\(([^)]+)\)/g)) expect(entries.some(({ name }) => name === decodeURIComponent(target))).toBe(true);
    expect(markdown).toContain("Source: Sector plan 1 · Version 1 · Runs:");
    expect(markdown).not.toMatch(/<svg|<path/);
  });

  it("detects a tampered file or an unlisted extra", async () => {
    const entries = readZip((await build()).bytes);
    const tampered = entries.map((entry) => (entry.name.endsWith(".md") ? { name: entry.name, bytes: new TextEncoder().encode("edited") } : entry));
    expect((await verifyReviewPackage(createZip(tampered))).problems).toEqual(["ankara-plan-sector-plan-1-v1-20261018-120000z-single-cell-report.md does not match its SHA-256"]);
    const extra = await verifyReviewPackage(createZip([...entries, { name: "notes.txt", bytes: new TextEncoder().encode("x") }]));
    expect(extra.problems).toEqual(["notes.txt is not listed in the manifest"]);
  });

  it.each([
    [{ source: { scenario_revision_id: null } }, true],
    [{ source, planDirty: true }, true],
    [{ source, hasDraft: true }, true],
    [{ source }, false],
  ])("refuses anything but an unchanged saved Version: %j", (input, refused) => {
    expect(Boolean(reviewPackageRefusal(input))).toBe(refused);
    if (refused) expect(reviewPackageRefusal(input)).toMatch(/Save a Version first/);
  });
});
