import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createProjectWorkspace,createScenario,exportProjectFile,importProjectFile} from '../../frontend-react/src/utils/projectStore.js';
import {scenarioRevisionFromLegacySnapshot,scenarioRevisionToLegacyPlan,saveWorkingScenarioDraft,createWorkingScenarioDraft} from '../../frontend-react/src/domain/scenario.js';
import {normalizeNetworkSelection} from '../../frontend-react/src/utils/networkSelection.js';
import {buildPlanningReport,renderMarkdownReport,renderPrintableReport} from '../../frontend-react/src/utils/reportExport.js';
import {combineNetworkSimulations,buildNetworkComparisonSnapshot} from '../../frontend-react/src/utils/appWorkspace.js';
const work=process.argv[2]; if(!work)throw new Error('audit work directory required');
const rows=[]; const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));const bytes=s=>Buffer.byteLength(s);
for(const n of [6,8,10,12]) {
 const f=json(path.join(work,'fixtures',`${n}-28.json`));
 const raw=path.join(work,'raw','repeat-1');
 const optimization=json(path.join(raw,`${n}-28-optimizeoptimize-network.response.json`));
 const evaluation=json(path.join(raw,`${n}-28-evaluateevaluate-network.response.json`));
 const interference=json(path.join(raw,`${n}-28-interferenceinterference.response.json`));
 const sims=f.towers.map((_,i)=>json(path.join(work,'followup',`${n}-28-evaluatesimulate-${i+1}.response.json`)));
 const simulation=combineNetworkSimulations(sims,f.towers);
 const plan={settings:f.settings,planningMode:'network',inventory:f.towers,selectedTowerId:f.towers[2].id,selectedMapCellId:f.towers.at(-1).cellId,selectedNetworkTowerIds:f.towers.map(t=>t.id),selectionPolygon:[[32.826,39.924],[32.830,39.924],[32.830,39.928],[32.826,39.928]],networkAzimuths:Object.fromEntries(f.towers.map(t=>[t.id,90]))};
 assert.deepEqual(normalizeNetworkSelection(plan.selectedNetworkTowerIds,f.towers,n),plan.selectedNetworkTowerIds);
 const snapshot={plan,request:f.network,meta:null,summary:{kind:'network',resultsView:'optimization'},artifacts:{simulation,networkOptimization:optimization,interferenceAnalysis:interference},requiresRerun:false};
 const workspace=createProjectWorkspace();const project=workspace.projects[0];project.name=`Capacity audit ${n}`;project.draft={plan,requiresRerun:true};project.scenarios=[createScenario(`Capacity ${n}`,snapshot)];project.activeScenarioId=project.scenarios[0].id;
 const revision=scenarioRevisionFromLegacySnapshot(snapshot,{scenarioId:project.scenarios[0].id});const version=saveWorkingScenarioDraft(createWorkingScenarioDraft(revision));
 const restored=scenarioRevisionToLegacyPlan(version,plan);assert.deepEqual(restored.selectedNetworkTowerIds,plan.selectedNetworkTowerIds);assert.equal(restored.selectedTowerId,plan.selectedTowerId);
 const inputProject={...project,draft:{...snapshot,artifacts:null},scenarios:[{...project.scenarios[0],artifacts:null}]};const input=exportProjectFile(inputProject);const exported=exportProjectFile(project);let importError=null;let imported;try { imported=importProjectFile(exported); } catch(e) { importError=e.message; imported=importProjectFile(input); }
 assert.deepEqual(imported.draft.plan.selectedNetworkTowerIds,plan.selectedNetworkTowerIds);assert.equal(imported.draft.plan.selectedMapCellId,plan.selectedMapCellId);assert.equal(imported.draft.plan.selectedTowerId,plan.selectedTowerId);assert.deepEqual(imported.scenarios[0].plan.selectedNetworkTowerIds,plan.selectedNetworkTowerIds);
 fs.writeFileSync(path.join(work,'fixtures',`workspace-${n}.json`),JSON.stringify(workspace));
 const before=buildNetworkComparisonSnapshot({label:'Baseline',optimization:evaluation,settings:f.settings,towers:f.towers});const after=buildNetworkComparisonSnapshot({label:'Optimized',optimization,settings:f.settings,towers:f.towers});
 const start=performance.now();const report=buildPlanningReport({activeNetworkTech:'5g',appMeta:{application_version:'0.10.2'},buildingSummary:{total_buildings:161784},generatedAt:'2026-10-03T00:00:00Z',interferenceAnalysis:interference,networkOptimization:optimization,networkResultKind:'optimization',planningMode:'network',project,selectedTower:f.towers[2],selectedNetworkTowers:f.towers,settings:f.settings,simulation,stats:simulation.stats,comparison:{before,after}});
 const md=renderMarkdownReport(report);const html=renderPrintableReport(report);const ms=performance.now()-start;
 for(const t of f.towers)assert(html.includes(t.cellId),`report lacks ${t.cellId}`);
 const dir=path.join(work,'reports');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,`${n}.html`),html);fs.writeFileSync(path.join(dir,`${n}.md`),md);
 rows.push({n,serialized_input_bytes:bytes(input),serialized_project_with_results_bytes:bytes(exported),combined_simulation_bytes:bytes(JSON.stringify(simulation)),optimization_result_bytes:bytes(JSON.stringify(optimization)),scenario_revision_bytes:bytes(JSON.stringify(revision)),version_bytes:bytes(JSON.stringify(version)),report_generation_ms:ms,report_html_bytes:bytes(html),report_markdown_bytes:bytes(md),full_result_import_error:importError,import_order_active_focus_preserved:true,scenario_version_order_preserved:true,production_normalization_keeps:normalizeNetworkSelection(plan.selectedNetworkTowerIds,f.towers).length});
}
fs.writeFileSync(path.join(work,'artifacts.metrics.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows,null,2));
