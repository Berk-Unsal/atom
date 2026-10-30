import { afterEach, describe, expect, it, vi } from "vitest";
import { reportInputs } from "../test/fixtures/reportFixtures.js";
import { buildPlanningReport, buildHistoricalPlanningReport, renderHtmlReport, renderMarkdownReport } from "./reportExport.js";
import { buildReportMetrics, REPORT_SCORE_MEANING } from "./reportModel.js";
import { buildReportArtifactOutput } from "./reportArtifact.js";
import { createReportDefinition } from "../domain/report.js";
import { reportMarkdownText } from "./reportFormatting.js";
import { formatReportRFValue } from "./reportRFConfiguration.js";

afterEach(() => vi.restoreAllMocks());
const normalized = (text) => text.replace(/\s+/g, " ").trim();

describe("shared report semantics", () => {
  it("preserves source results and makes weight/count/reach/overlap populations explicit", () => {
    const inputs = reportInputs();
    const before = JSON.stringify(inputs);
    const report = buildPlanningReport(inputs);
    const metrics = Object.fromEntries(report.view.metrics.map((metric) => [metric.id, metric]));
    expect(metrics.demand).toMatchObject({ value: 260, denominator: 260, unit: "demand-weight units", ratio: 1 });
    expect(metrics.coverage).toMatchObject({ value: 22683.5, denominator: 96000, unit: "reach-score units" });
    expect(metrics.covered_units).toMatchObject({ value: 523, unit: "building entities" });
    expect(metrics.overlap.denominator).toBe(523);
    expect(report.view.interpretation.join(" ")).toContain("all modeled demand weight is served");
    expect(report.view.interpretation.join(" ")).toContain("does not establish radio-quality performance");
    expect(JSON.stringify(inputs)).toBe(before);
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain("| Relevant demand building entities | 6 |");
    expect(markdown).toContain("| Modeled demand weight served | 260.0 / 260.0 | demand-weight units |");
    expect(markdown).toContain(REPORT_SCORE_MEANING);
    expect(markdown).not.toContain("9876543 / 100");
  });

  it("does not interpret a rounded percentage as complete service", () => {
    const inputs = reportInputs({ segments: 1 });
    inputs.networkOptimization.stats.raw_metrics.served_demand_weight = 259.999;
    inputs.networkOptimization.stats.objectives.demand = 259.999 / 260;
    const model = buildPlanningReport(inputs).view;
    expect(model.headlines.find(({ id }) => id === "demand").display).toBe("100.0%");
    expect(model.interpretation.join(" ")).not.toContain("all modeled demand weight");
  });

  it("never mixes a legacy entity count with a demand-weight denominator or treats null as zero", () => {
    const metrics = buildReportMetrics({ score: null, composite_score: 0.712, unique_demand_buildings: 6,
      raw_metrics: { relevant_demand_weight: 260 }, objectives: {} });
    expect(metrics.find(({ id }) => id === "score").value).toBeCloseTo(71.2);
    expect(metrics.find(({ id }) => id === "demand")).toMatchObject({ value: null, denominator: 260, availability: "not_recorded" });
    expect(metrics.find(({ id }) => id === "demand_entities")).toMatchObject({ value: 6, denominator: null, unit: "building entities" });
    const empty = buildReportMetrics({ raw_metrics: { served_weighted_demand: 0, total_weighted_demand: 0 }, objectives: { demand: 0 } });
    expect(empty.find(({ id }) => id === "demand").availability).toBe("unavailable");
  });

  it.each([2, 8])("uses one conditional section plan for an evaluated %i-Cell network", (cells) => {
    const report = buildPlanningReport(reportInputs({ cells, segments: 50 }));
    const ids = report.view.sections.map(({ id }) => id);
    expect(ids).toContain("network-evaluation");
    expect(ids).not.toEqual(expect.arrayContaining(["baseline-comparison", "optimization-tradeoffs", "interference"]));
    expect(report.view.completeness.find(({ id }) => id === "optimization").state).toBe("not_evaluated");
    const document = new DOMParser().parseFromString(renderHtmlReport(report), "text/html");
    expect([...document.querySelectorAll("section[data-report-section]")].map((section) => section.dataset.reportSection)).toEqual(ids);
    const summary = document.querySelector('[data-report-section="executive-summary"]');
    expect(summary.querySelectorAll('[data-metric="score"]')).toHaveLength(1);
    expect(summary.querySelectorAll("table")).toHaveLength(0);
    expect(report.view.rfConfiguration.kind).toBe("common");
  });

  it("renders all applicable semantic values, states and interpretation in both formats", () => {
    const report = buildPlanningReport(reportInputs({ optimized: true, heterogeneous: true, segments: 25 }));
    const htmlDocument = new DOMParser().parseFromString(renderHtmlReport(report), "text/html");
    const htmlText = normalized(htmlDocument.body.textContent);
    const markdown = normalized(renderMarkdownReport(report));
    const semanticText = (value) => {
      expect(htmlText).toContain(normalized(String(value)));
      expect(markdown).toContain(normalized(reportMarkdownText(value)));
    };
    for (const section of report.view.sections) {
      semanticText(section.title);
      for (const block of section.blocks) {
        if (block.type === "table") block.rows.flat().filter((value) => value !== undefined && value !== null).forEach(semanticText);
        if (block.type === "paragraph") semanticText(block.text);
        if (block.type === "list") block.items.forEach(semanticText);
        if (block.type === "profileGroups") block.groups.forEach((group) => group.rows.flat().filter(Boolean).forEach(semanticText));
        if (block.type === "kpis") block.metrics.forEach((metric) => { semanticText(metric.display); semanticText(metric.label); });
      }
    }
    report.view.completeness.forEach(({ status }) => semanticText(status));
    expect(renderMarkdownReport(report)).not.toMatch(/<svg|<path|<table/);
    expect(htmlDocument.querySelectorAll('[data-cell-number]')).toHaveLength(8);
    expect(htmlDocument.querySelector('[data-report-section="rf-configuration"]').textContent).toContain("7 of 8 Cells match");
    report.view.rfConfiguration.deviations.flatMap((cell) => cell.fields).forEach((field) => semanticText(formatReportRFValue(field, field.value)));
  });

  it("reports an applied source fallback without mistaking a configured policy for a fallback event", () => {
    const inputs = reportInputs({ segments: 1 });
    inputs.appMeta.rf_contract.fallback_model_id = "legacy_fspl_walls";
    expect(buildPlanningReport(inputs).view.sections[0].blocks.some((block) => block.text?.startsWith("Recorded RF model:"))).toBe(false);
    inputs.networkOptimization.rf_contract = { model_id: "requested-source", applied_model_id: "applied-source", fallback_model_id: "applied-source", applicability: "Recorded scope" };
    const report = buildPlanningReport(inputs);
    expect(report.view.sourceContract).toEqual(inputs.networkOptimization.rf_contract);
    expect(report.view.sections[0].blocks).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("requested requested-source; applied applied-source") })]));
    expect(renderMarkdownReport(report)).toContain("| RF model | requested-source |");
  });

  it.each(["4g", "5g", "6g"])("preserves %s model/availability metadata without inventing radio support", (tech) => {
    const inputs = reportInputs({ tech, segments: 1 });
    inputs.networkOptimization.optimization.radio_quality = { enabled: true, available: false, reason: tech === "6g" ? "140 GHz radio-quality optimization unavailable" : "not enabled in retained evaluation" };
    const report = buildPlanningReport(inputs);
    expect(report.view.completeness.find(({ id }) => id === "radio_quality").state).toBe("unavailable");
    expect(renderMarkdownReport(report)).toContain(reportMarkdownText(inputs.networkOptimization.optimization.radio_quality.reason));
    expect(report.rfProfiles.every((profile) => profile.frequencyGHz === inputs.settings.frequencyGHz)).toBe(true);
  });

  it("distinguishes standalone interference from fixed-domain optimizer radio quality", () => {
    const inputs = reportInputs({ segments: 1 });
    Object.assign(inputs.networkOptimization.stats.raw_metrics, { radio_quality_total_samples: 100, radio_quality_serviceable_samples: 25, radio_quality_serviceable_fraction: 0.25 });
    inputs.networkOptimization.stats.objective_status.radio_quality = { available: true };
    inputs.networkOptimization.optimization.objective_status.radio_quality = { available: true };
    const report = buildPlanningReport(inputs);
    expect(report.view.completeness.find(({ id }) => id === "radio_quality").state).toBe("available");
    expect(report.view.completeness.find(({ id }) => id === "interference").state).toBe("not_evaluated");
    expect(report.view.interpretation.join(" ")).not.toContain("does not establish radio-quality performance");
    expect(report.view.interpretation.join(" ")).toContain("optimizer's fixed sampled domain");
    inputs.interferenceAnalysis = { model: { type: "retained", effective_sample_spacing_m: 40 }, stats: { sample_count: 100, signal_samples: 50, serviceable_pct: 25, serviceable_fraction: 0.5 } };
    const text = renderMarkdownReport(buildPlanningReport(inputs));
    expect(text).toContain("Serviceable grid samples (all samples) | 25.0%");
    expect(text).toContain("Serviceable among signal samples | 50.0%");
  });

  it("keeps source computation identity and historical unknowns separate from the new generator", () => {
    const report = buildHistoricalPlanningReport({ appMeta: { application_version: "new-app", model_version: "new-model", dataset: { id: "new-pack" } },
      generatedAt: new Date("2026-10-19T08:36:12Z"), project: { id: "p", name: "Historic" }, scenario: { id: "s", name: "Older scenario" },
      scenarioRevision: { project_id: "p", scenario_id: "s", scenario_revision_id: "r", revision: 1, planning_mode: "single", selected_cell_id: "1", selected_cell_ids: ["1"],
        rf_affecting_settings: { frequencyGHz: 28 }, canonical_input_snapshot: { inventory: [{ id: "1", coordinates: [32.8, 39.9] }] }, metadata: { app_meta: { application_version: "old-app", model_version: "old-model", dataset: { id: "old-pack", name: "Old pack", version: "1" } } } },
      runs: [{ run_id: "old-run", run_type: "simulation", status: "succeeded", project_id: "p", scenario_id: "s", scenario_revision_id: "r", summary: { simulation: { avg_rx_dbm: -100 } } }] });
    expect(report.appMeta.model_version).toBe("old-model");
    expect(report.view.identity.generatorApplicationVersion).toBe("new-app");
    expect(report.rfProfiles[0].antennaHeightM).toBeUndefined();
    expect(report.view.mapSnapshot.svg).toBe("");
    expect(report.view.completeness.find(({ id }) => id === "interference").state).toBe("not_retained");
    const text = renderMarkdownReport(report);
    expect(text).toContain("old-model");
    expect(text).not.toContain("new-model");
    expect(text).not.toContain("new-pack");
  });

  it("passes the same definitive lineage into report bytes and artifact metadata", () => {
    const inputs = reportInputs({ segments: 1 });
    const report = buildPlanningReport(inputs);
    const definition = createReportDefinition({ report_id: "report-1", project_id: "p", scenario_id: "s", scenario_revision_id: "r", run_ids: ["source-run"], source_kind: "historical_run" });
    const result = buildReportArtifactOutput({ report, reportDefinition: definition, naming: { project: "P", scenario: "S", version: 4 } });
    expect(result.artifact).toMatchObject({ scenario_revision_id: "r", run_ids: ["source-run"], generator_version: "atom-report-generator-v2", report_schema_version: "atom-report-v1" });
    expect(result.content).toContain("Source: S · Version 4 · Runs: Run source-run");
    expect(result.content).toContain("| ScenarioRevision | r |");
    expect(result.content).toContain("| Source Run(s) | source-run |");
    expect(report.domainBinding).toEqual(inputs.domainBinding);
  });

  it("escapes long hostile names in Markdown, HTML and CSS page chrome without injecting content", () => {
    const inputs = reportInputs({ longIds: true, segments: 2 });
    inputs.sourceContext.scenario_name = 'Test </style><script>window.injected=true</script> " \\ |\nScenario';
    const report = buildPlanningReport(inputs);
    const document = new DOMParser().parseFromString(renderHtmlReport(report), "text/html");
    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(document.querySelectorAll("style")).toHaveLength(1);
    expect(document.querySelector(".scenario").textContent).toBe(inputs.sourceContext.scenario_name);
    expect(document.querySelectorAll(".cell-record").length).toBeGreaterThanOrEqual(8);
    expect(renderMarkdownReport(report)).not.toContain("<script>");
    expect(renderMarkdownReport(report)).toContain("\\|");
  });

  it("never requests RF while generating either representation", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const report = buildPlanningReport(reportInputs({ optimized: true, segments: 1 }));
    renderMarkdownReport(report);
    renderHtmlReport(report);
    expect(fetch).not.toHaveBeenCalled();
  });
});
