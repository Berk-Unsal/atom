#!/usr/bin/env python3
"""Source inventory, without changing or calling production handlers."""
import json,pathlib,re
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def reference(path,needle):
 lines=(ROOT/path).read_text().splitlines();matches=[i for i,s in enumerate(lines,1) if needle in s]
 if not matches:raise ValueError((path,needle))
 return {'path':path,'line':matches[0],'symbol':needle}
def inventory():
 text=(ROOT/'backend-go/rf_protection.go').read_text();names=re.findall(r'"(/api/[^\"]+)"',text.split('var expensiveRFRoutes =')[1].split('type rfClientState')[0]);assert len(names)==19
 metadata={
 '/api/path-profile':('INDEPENDENT TOOL ACTION','App.analyzePathProfile','sampled path RF/terrain profile'),
 '/api/sub-thz-reference':('INDEPENDENT TOOL ACTION','App.analyzeSubTHZReference','reference scenario calculations'),
 '/api/sub-thz-p1411-reference':('INDEPENDENT TOOL ACTION','App reference callback','reference path-loss calculations'),
 '/api/sub-thz-validation':('INDEPENDENT TOOL ACTION','App reference callback','reference-case validation'),
 '/api/sub-thz-material-reference':('INDEPENDENT TOOL ACTION','App reference callback','material/interface calculations'),
 '/api/sub-thz-reflection-reference':('INDEPENDENT TOOL ACTION','App reference callback','reflection geometry and RF'),
 '/api/coverage-surface':('INDEPENDENT TOOL ACTION','App.analyzeCoverageSurface/exportCoverageSurface','RF grid computation; export POST recomputes'),
 '/api/processes/batch-experiment/execution':('BACKGROUND / EXPERIMENT','ExperimentPanel.start','one submission can expand to64 queued background runs'),
 '/api/analyze-sector':('USER-INITIATED ROOT + DETERMINISTIC FOLLOW-UP','App.runSimulation; optimizeAzimuth refresh; history','single-Cell rays plus gaps'),
 '/api/simulate':('DETERMINISTIC FOLLOW-UP + INDEPENDENT TOOL ACTION','network map queue; standalone API caller','single-Cell rays; same route may be independently expensive'),
 '/api/coverage-gaps':('INDEPENDENT TOOL ACTION','standalone API/legacy callers; normal UI sector route includes gaps','coverage/demand calculation'),
 '/api/optimize-azimuth':('USER-INITIATED ROOT','App.optimizeAzimuth/history','single-Cell azimuth search'),
 '/api/evaluate-network':('USER-INITIATED ROOT','App.evaluateNetwork','selected-network RF evaluation'),
 '/api/optimize-network':('USER-INITIATED ROOT','App.optimizeNetwork/history','network search and Pareto output'),
 '/api/building-entry-analysis':('INDEPENDENT TOOL ACTION','App.analyzeBuildingEntry','network/single building-entry analysis; current-result cache can avoid request'),
 '/api/explain-network-cell':('INDEPENDENT TOOL ACTION','App.explainNetworkCell','on-demand retained-solution RF explanation; cached repeat costs0'),
 '/api/interference':('INDEPENDENT TOOL ACTION','App.analyzeInterference','network RF/interference sampling'),
 '/api/recommend-sites':('INDEPENDENT TOOL ACTION','App.recommendSites','candidate network evaluation/search; independent max5 existing Cells'),
 '/api/measurements/evaluate':('INDEPENDENT TOOL ACTION','App.evaluateMeasurements','measurement predictions and residuals')}
 rows=[]
 for endpoint in names:
  registrations=[]
  for p in (ROOT/'backend-go').glob('*.go'):
   if p.name.endswith('_test.go'):continue
   for line,s in enumerate(p.read_text().splitlines(),1):
    if 'POST(' in s and '"'+endpoint+'"' in s:registrations.append({'path':str(p.relative_to(ROOT)),'line':line})
  assert registrations,endpoint
  role,caller,character=metadata[endpoint]
  rows.append({'endpoint':endpoint,'method':'POST','current_attempt_cost':1,'classification':role,'caller':caller,'computational_character':character,'registrations':registrations,'protection':reference('backend-go/rf_protection.go','"'+endpoint+'"')})
 refs=[reference('backend-go/rf_protection.go',name) for name in ['func (limiter *rfRequestLimiter) middlewareFor','func (limiter *rfRequestLimiter) acquire','func (limiter *rfRequestLimiter) clientState','func protectExpensiveRFRoutes','func validAPIKey']]
 refs += [reference('backend-go/main.go',name) for name in ['router.SetTrustedProxies','router.Use(gin.Logger','router.Use(limitRequestBody','router.Use(protectExpensiveRFRoutes','func bindJSON','func writeRFResponse']]
 refs += [reference('frontend-react/src/App.jsx',name) for name in ['const optimizeNetwork','const evaluateNetwork','const explainNetworkCell','const optimizeAzimuth','const analyzeInterference','const analyzeBuildingEntry','const analyzeCoverageSurface','const exportCoverageSurface','const recommendSites','const evaluateMeasurements']]
 refs += [reference('frontend-react/src/utils/requestPayloads.js',name) for name in ['export function buildSimulationPayload','export function buildNetworkOptimizationPayload']]
 refs += [reference('frontend-react/src/utils/networkSimulationQueue.js','export async function'),reference('frontend-react/src/utils/apiClient.js','export async function requestJSON'),reference('frontend-react/src/hooks/useRequestCoordinator.js','const begin'),reference('frontend-react/src/components/ExperimentPanel.jsx','const start'),reference('backend-go/experiment_jobs.go','func registerExperimentRoutes')]
 graph=[
 {'action':'Evaluate Network','root':'/api/evaluate-network','children':'N POST /api/simulate','count':'N+1','execution':'sequential after root','inputs':'root request snapshot; each selected tower azimuth and per-Cell RF profile','independent_children':'Simulate is also standalone; map selection/Inspect does not dispatch extra RF'},
 {'action':'Optimize Network','root':'/api/optimize-network','children':'N POST /api/simulate','count':'N+1','execution':'sequential after root','inputs':'same snapshot; winning optimized_towers optimal_azimuth per Cell from root response','commit':'complete result committed only after queue succeeds'},
 {'action':'Re-evaluate','root':'same Evaluate callback','children':'same N maps','count':'N+1','execution':'explicit second user click; never auto-issued by Interference'},
 {'action':'Interference','root':'/api/interference','children':'none','count':'1','inputs':'selected network; retained optimizer azimuths when available'},
 {'action':'Explain solution/cell','root':'/api/explain-network-cell','children':'none','count':'1 uncached;0 cached/no eligible changed Cell','inputs':'retained baseline/solution/runID/domain; no new Optimize prerequisite'},
 {'action':'Building Entry','root':'/api/building-entry-analysis','children':'none','count':'1;0 if source-key result current','inputs':'current single/network request snapshot'},
 {'action':'Surface generation/export','root':'/api/coverage-surface','children':'none','count':'1 generate; each export separately1','inputs':'stored generation payload plus query f; POST export invokes grid again'},
 {'action':'Single-Cell Propagation','root':'/api/analyze-sector','children':'none','count':'1','inputs':'sector response includes rays and gaps'},
 {'action':'Single-Cell Azimuth','root':'/api/optimize-azimuth','children':'1 POST /api/analyze-sector','count':'2','execution':'sequential; refresh input optimal_azimuth from response'},
 {'action':'Recommendation','root':'/api/recommend-sites','children':'none automatically','count':'1','inputs':'current network+area; applying candidate is local plan change'},
 {'action':'Measurements','root':'/api/measurements/evaluate','children':'none','count':'1'},
 {'action':'Experiments','root':'/api/processes/batch-experiment/execution','children':'GET /api/jobs/id polling; optional DELETE cancel','count':'1 protected POST; GET/DELETE0 RF-budget units','execution':'background worker1/queue16; max64 runs; polling initially300ms then600ms; accepted jobs detached from POST context'},
 {'action':'History rerun','root':'/api/analyze-sector or /api/optimize-network or /api/optimize-azimuth','children':'none in this callback','count':'1','note':'distinct from main network/azimuth buttons; do not infer maps from endpoint alone'},
 {'action':'Path/reference tools','root':'corresponding protected POST','children':'none','count':'1'},
 {'action':'Inspect/tab/report/local persistence','root':'none protected','children':'none protected','count':'0','note':'optional spatial evidence GET is outside RF limiter; exports of coverage surface are the exception above'}]
 value={'routes':rows,'references':refs,'graph':graph,'gin_version':'v1.10.0','gin_client_ip_source':'module context.go:802 ClientIP /840 RemoteIP; no trusted platform override configured','ordering':['Gin Logger/Recovery','securityHeaders/requireHTTPS','MaxBytesReader wrapper1MiB (decode later)','CORS','protected POST/path selector','optional RF key auth','request context deadline60','ClientIP state/anchored window','charge attempt1 unless exhausted','per-client active1','global channel2','c.Next → strict JSON binding/validation → RF → serialization','deferred global/client release; defer cancel'], 'state':'mutex-protected process-local map≤4096 plus overflow; no periodic TTL cleanup; lazy60s reset; capacity-triggered eviction of oldest inactive even unexpired; overflow shares counter if none evictable','deployment':'Compose atom: one container/process; process-local jobs/limiter; no shared store'}
 (HERE/'source-audit.json').write_text(json.dumps(value,indent=2)+'\n');print(len(rows),'protected routes;',len(graph),'workflow graph entries')
if __name__=='__main__':inventory()
