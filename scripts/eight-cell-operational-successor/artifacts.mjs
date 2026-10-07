// Post-measurement UI/persistence fixtures derived solely from saved HTTP bodies.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { DEFAULT_SIMULATION } from '../../frontend-react/src/generated/policy.js';
import { createProjectWorkspace, createScenario, exportProjectFile, importProjectFile } from '../../frontend-react/src/utils/projectStore.js';
import { measureProjectRayExpansion, packProjectRays } from '../../frontend-react/src/utils/projectRayColumns.js';
import { normalizeNetworkSelection } from '../../frontend-react/src/utils/networkSelection.js';
import { scenarioRevisionFromLegacySnapshot, scenarioRevisionToLegacyPlan, saveWorkingScenarioDraft, createWorkingScenarioDraft } from '../../frontend-react/src/domain/scenario.js';
import { buildPlanningReport, renderMarkdownReport, renderPrintableReport } from '../../frontend-react/src/utils/reportExport.js';
import { combineNetworkSimulations, buildNetworkComparisonSnapshot } from '../../frontend-react/src/utils/appWorkspace.js';

const work = process.argv[2];
if (!work) throw new Error('Evidence directory required');
const json = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const body = response => json(path.join(work, response.captured_body));
const bytes = value => Buffer.byteLength(value);
function countNodes(value) {
  let count = 0; const stack = [value];
  while (stack.length) { const item = stack.pop(); count++; if (item && typeof item === 'object') stack.push(...Object.values(item)); }
  return count;
}
const manifest = json(new URL('./domain-manifest.json', import.meta.url));
const domain = manifest.selected.find(d => d.id === 'dense-certification-1');
const records = [];
fs.mkdirSync(path.join(work, 'presentation'), { recursive: true });
for (const n of [6, 8]) {
  const rows = fs.readFileSync(path.join(work, `A-${n}C-workflows`, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const evaluate = rows.find(q => q.domain === domain.id && q.frequency_ghz === 2.6 && q.operation === 'evaluate-maps');
  const optimize = rows.find(q => q.domain === domain.id && q.frequency_ghz === 2.6 && q.operation === 'optimize-maps');
  assert(evaluate.responses.every(r => r.status === 200) && optimize.responses.every(r => r.status === 200));
  const single = fs.readFileSync(path.join(work, `A-${n}C-single-0`, 'runs.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  const interferenceRow = single.find(q => q.domain === domain.id && q.frequency_ghz === 2.6 && q.operation === 'interference' && q.capture);
  const explainRow = single.find(q => q.domain === domain.id && q.frequency_ghz === 2.6 && q.operation === 'explain' && q.capture);
  const evaluation = body(evaluate.responses[0]);
  const optimization = body(optimize.responses[0]);
  const interference = body(interferenceRow.responses[0]);
  const explanation = body(explainRow.responses[1]);
  const towers = domain.towers.slice(0, n);
  const settings = { ...DEFAULT_SIMULATION, frequencyGHz: 2.6, rayCount: 120, radiusMeters: 400, txPowerDbm: 30, beamWidthDeg: 120, interferenceBandwidthMHz: 20 };
  const sims = evaluate.responses.slice(1).map(body);
  const optimizedSims = optimize.responses.slice(1).map(body);
  const simulation = combineNetworkSimulations(sims, towers);
  const optimizedSimulation = combineNetworkSimulations(optimizedSims, towers);
  const fixture = json(path.join(work, 'fixtures', `${domain.id}-2.6-${n}C-W1.json`));
  const plan = { settings, planningMode: 'network', inventory: towers, selectedTowerId: towers[0].id, selectedMapCellId: towers.at(-1).cellId, selectedNetworkTowerIds: towers.map(t => t.id), selectionPolygon: [], networkAzimuths: Object.fromEntries(towers.map(t => [t.id, 90])) };
  const snapshot = { plan, request: fixture.network, meta: null, summary: { kind: 'network', resultsView: 'optimization' }, artifacts: { simulation: optimizedSimulation, networkOptimization: optimization, interferenceAnalysis: interference }, requiresRerun: false };
  const workspace = createProjectWorkspace(); const project = workspace.projects[0];
  project.name = `Eight-Cell audit ${n}C`; project.draft = { plan, requiresRerun: true };
  project.scenarios = [createScenario(`Measured ${n}C result`, snapshot)]; project.activeScenarioId = project.scenarios[0].id;
  const revision = scenarioRevisionFromLegacySnapshot(snapshot, { scenarioId: project.scenarios[0].id });
  const version = saveWorkingScenarioDraft(createWorkingScenarioDraft(revision));
  assert.deepEqual(scenarioRevisionToLegacyPlan(version, plan).selectedNetworkTowerIds, plan.selectedNetworkTowerIds);
  let exported, imported, error = null;
  try { exported = exportProjectFile(project); imported = importProjectFile(exported); assert.deepEqual(imported.scenarios[0].plan.selectedNetworkTowerIds, plan.selectedNetworkTowerIds); } catch (e) { error = e.message; }
  const packed = packProjectRays(project);
  let expansion = [], expansionError = null;
  try { expansion = measureProjectRayExpansion(packed, { maxBytes: 32 * 1024 * 1024, maxNodes: 1_000_000 }); } catch (e) { expansionError = e.message; }
  const exportVariants = [];
  for (const composition of ['full-network-maps-interference', 'network-maps', 'network-result-only']) {
    const variant = structuredClone(project);
    if (composition !== 'full-network-maps-interference') variant.scenarios[0].artifacts.interferenceAnalysis = null;
    if (composition === 'network-result-only') variant.scenarios[0].artifacts.simulation = null;
    const candidate = { schemaVersion: 3, project: packProjectRays(variant) };
    let text = null, variantError = null, roundTrip = false;
    try {
      text = exportProjectFile(variant);
      const decoded = importProjectFile(text);
      assert.deepEqual(decoded.scenarios[0].plan.selectedNetworkTowerIds, plan.selectedNetworkTowerIds);
      assert.deepEqual(decoded.scenarios[0].artifacts.networkOptimization, optimization);
      roundTrip = true;
    } catch (e) { variantError = e.message; }
    if (text) fs.writeFileSync(path.join(work, 'presentation', `${n}C-${composition}.atom-project.json`), text);
    exportVariants.push({ composition, estimated_encoded_file_bytes: bytes(JSON.stringify(candidate)), encoded_nodes: countNodes(candidate), expanded_project_nodes: countNodes(variant), expanded_project_bytes: bytes(JSON.stringify(variant)), exported_bytes: text ? bytes(text) : null, export_import_pass: roundTrip, error: variantError, scientific_network_result_preserved: roundTrip });
  }
  const before = buildNetworkComparisonSnapshot({ label: 'Baseline', optimization: evaluation, settings, towers });
  const after = buildNetworkComparisonSnapshot({ label: 'Optimized', optimization, settings, towers });
  const report = buildPlanningReport({ activeNetworkTech: '4g', appMeta: { application_version: '0.11.0' }, buildingSummary: { total_buildings: 161784 }, generatedAt: '2026-10-07T00:00:00Z', interferenceAnalysis: interference, networkOptimization: optimization, networkResultKind: 'optimization', planningMode: 'network', project, selectedTower: towers[0], selectedNetworkTowers: towers, settings, simulation: optimizedSimulation, stats: optimizedSimulation.stats, comparison: { before, after } });
  const html = renderPrintableReport(report), markdown = renderMarkdownReport(report);
  for (const t of towers) assert(html.includes(t.cellId));
  fs.writeFileSync(path.join(work, 'presentation', `${n}C-report.html`), html);
  fs.writeFileSync(path.join(work, 'presentation', `${n}C-report.md`), markdown);
  if (exported) fs.writeFileSync(path.join(work, 'presentation', `${n}C-result.atom-project.json`), exported);
  fs.writeFileSync(path.join(work, 'presentation', `${n}C-workspace.json`), JSON.stringify(workspace));
  fs.writeFileSync(path.join(work, 'presentation', `${n}C-replay.json`), JSON.stringify({ fixture, towers, settings, evaluation, optimization, interference, explanation, sims, optimizedSims, simulation, optimizedSimulation }));
  records.push({ cardinality: n, domain: domain.id, frequency_ghz: 2.6, export_bytes: exported ? bytes(exported) : null, schema_version: exported ? JSON.parse(exported).schemaVersion : null, estimated_encoded_file_bytes: bytes(JSON.stringify({ schemaVersion: 3, project: packed })), encoded_nodes: countNodes({ schemaVersion: 3, project: packed }), expanded_project_nodes: countNodes(project), expanded_project_bytes: bytes(JSON.stringify(project)), packed_feature_collections: expansion.length, expansion_error: expansionError, export_variants: exportVariants, result_import_error: error, measured_full_result_import_pass: Boolean(imported), all_ids_in_report: true, scenario_version_order_preserved: true, report_html_bytes: bytes(html), report_markdown_bytes: bytes(markdown), combined_simulation_bytes: bytes(JSON.stringify(simulation)), optimization_bytes: bytes(JSON.stringify(optimization)), production_restore_normalization_count: normalizeNetworkSelection(plan.selectedNetworkTowerIds, towers).length, interpretation: 'Measured full, maps-only and network-result-only variants; independent v3 guards can reject large W1 ray artifacts even at six. Scientific network-result-only round trips do not certify full eight-Cell ray persistence. Shipping UI selection still clamps to six.' });
}
fs.writeFileSync(new URL('./presentation-persistence.json', import.meta.url), JSON.stringify({ records, production_changes: false }, null, 2) + '\n');
