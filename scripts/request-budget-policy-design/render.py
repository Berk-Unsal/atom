#!/usr/bin/env python3
"""Render the policy study from source inventory and offline arithmetic."""
import datetime,hashlib,json,pathlib,re
from final_items import items
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
ASSESSMENTS={
 'P0':{'usability':'L1/L2 fresh fit;F fails; residual partial queues','abuse':'roots/maps20; retains current boundary','NAT':'one pooled20','state':'current4096+overflow; reset/eviction limitations','complexity':'LOW','replay':'ordinary repeats charged; no capability','API':'unchanged','clarity':'one transport counter','selection':'reject product/atomicity'},
 'P1':{'usability':'28 fits freshF; late roots still partial','abuse':'arbitrary roots/maps28;+40%','NAT':'more pooled arbitrary capacity; no per-user fairness','state':'same map; no new ownership','complexity':'LOW','replay':'ordinary repeats charged at larger ceiling','API':'header limit28; same JSON','clarity':'simple but counts fanout','selection':'reject independent ceilings/atomicity'},
 'P2':{'usability':'60 tokens at3/2 weights fitsF; late queue still needs reservation','abuse':'roots20; standalone maps30;+50%','NAT':'semantic route pools still shared','state':'one weighted counter; no ownership','complexity':'MODERATE','replay':'ordinary weighted repeats; no parent proof','API':'token headers60, variable per-call costs','clarity':'integer semantic ratio, not CPU estimate','selection':'reject standalone-map ceiling'},
 'P3':{'usability':'capped variant fitsL1/L2/L3 with child prebooking','abuse':'ordinary20; verified extra8; all28; naive variant180 rejected','NAT':'shared20+8; held liabilities can temporarily pressure others','state':'bounded tickets/heap/held counters; no persisted data','complexity':'MODERATE','replay':'atomic one-time slot+exact server-derived body; requires implementation tests','API':'optional headers/capability metadata/retire control; scientific JSON unchanged','clarity':'ordinary vs bounded verified units and held amounts explicit','selection':'RECOMMEND capped variant'},
 'P4':{'usability':'root20/map24 fitsF;20/20 fails','abuse':'independent maps24; total44','NAT':'separate pooled pressure; still one IP','state':'two counters; no verified context','complexity':'MODERATE','replay':'same-route repeats can spend map bucket','API':'dual bucket headers','clarity':'cannot distinguish automatic/independent Simulate','selection':'reject map ceiling; verified variant converges onP3'},
 'P5':{'usability':'reserve20 atomic butF fails; reserve28 fitsF','abuse':'flat28 raises arbitrary caps; logical20 reaches180steps','NAT':'held budget/abandonment pressure','state':'reservation ownership/expiry similar toP3','complexity':'MODERATE','replay':'needs exact claims or client can steal reservations','API':'workflow admission metadata','clarity':'prebooking transport obligations is useful; logical units need separate bound','selection':'use prebooking withinP3; reject as independent recommendation'},
 'P6':{'usability':'can aggregate one action; multi-click chain still needs budget','abuse':'cost1 aggregates20 workflows/180steps unless separately bounded','NAT':'still pooled; internal fanout hidden','state':'orchestration/in-flight combined result state','complexity':'HIGH','replay':'root replays can repeat whole aggregate','API':'new streaming/body/progress/error contract','clarity':'fewer HTTP calls; more execution accounting complexity','selection':'reject unnecessary architecture'}
}
def matrix():
 values={}
 for p,a in ASSESSMENTS.items():
  values[p]={
   'legitimate six-Cell usability':a['usability'],'legitimate eight-Cell usability':a['usability'],'heavy-root abuse resistance':a['abuse'],'follow-up abuse resistance':a['abuse'],
   'shared-IP/NAT pressure':a['NAT'],'tab behavior':a['NAT']+'; per-client1 unchanged','cancellation behavior':'spent charges retained; '+('unused holds retired' if p in ['P3','P5'] else 'no authorization credit refund'),
   'replay resistance':a['replay'],'implementation complexity':a['complexity'],'state complexity':a['state'],'process restart semantics':'counters reset; '+('stale IDs rejected' if p in ['P3','P5'] else 'no new IDs'),
   'future multi-instance implications':'process-local limits need shared aggregate gateway; '+('also sticky/shared consumed state' if p in ['P3','P5'] else 'no ticket ownership layer'),
   'API compatibility':a['API'],'frontend compatibility':('metadata helper/queue plumbing; no visual redesign' if p in ['P3','P5'] else 'new parser/progress flow' if p=='P6' else 'no flow rewrite; errors/headers documented'),
   'observability/debuggability':a['clarity'],'backwards compatibility':('ordinary fresh ≤20-call tapes retained; holds explicitly qualified' if p=='P3' else 'current semantics' if p=='P0' else 'changed ceilings/units or orchestration as described'),
   'testability':'deterministic fake-clock/ledger/boundary tests; security lifecycle tests required for stateful variants',
   'failure atomicity':('root denied before RF when children cannot be prebooked' if p in ['P3','P5'] else 'aggregation requires new internal partial-error contract' if p=='P6' else 'not guaranteed at residual balance'),
   'denial semantics':'budget/auth denial outsideRF;'+(' owned child busy/failure spends claimed unit' if p in ['P3','P5'] else 'existing charges with candidate accounting units'),
   'migration risk':a['selection']+'; '+a['complexity']}
 return values

def render():
 lock=load(HERE/'evaluation-lock.json');base=load(HERE/'baseline.json');inv=load(HERE/'source-audit.json');sim=load(HERE/'simulations.json');q=load(ROOT/'docs/eight-cell-operational-budget-successor.json')
 raw=(HERE/'design-sections.md').read_text();parts=re.findall(r'^## Phase (\d+) — ([^\n]+)\n(.*?)(?=^## Phase |\Z)',raw,re.M|re.S);assert [int(n) for n,_,_ in parts]==list(range(50))
 checks=load(HERE/'checks.json') if (HERE/'checks.json').exists() else{}
 recommendation={'policy_category':'D — VERIFIED ROOT + FOLLOW-UP ALLOWANCE','variant':'P3-capped','final_design_verdict':'C — WORKFLOW-AWARE ACCOUNTING IS PREFERRED','ordinary_units':20,'verified_extra_units':8,'anchored_window_seconds':60,'max_total_retained_window_admissions':28,'max_followups_per_root':8,'current_product_cap':6,'identity':'unchanged Gin ClientIP','eligible_parents':{'/api/evaluate-network':'N /api/simulate at selected azimuths','/api/optimize-network':'N /api/simulate at winning returned azimuths','/api/optimize-azimuth':'1 /api/analyze-sector at returned azimuth'},'opaque_id_bits':128,'idle_expiry_seconds':60,'absolute_expiry_formula':'root admission+(N+1)*60s','max_absolute_8C_seconds':540,'max_clients':4096,'max_indexed_held_records':114688,'max_transitional_per_client_receipts':4096,'persistent_state':False,'external_infrastructure':False,'implemented':False,'fallback':'retainP0/cap6 until implementation validates'}
 data={'schema_version':1,'study':'design/policy only','generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'COMPLETE' if len(checks)==13 and all(v['exit_code']==0 and v.get('execution_proven',True) for v in checks.values()) else 'DESIGN COMPLETE / QUALITY PENDING','final_verdict':recommendation['final_design_verdict'],'recommended_policy':recommendation,'evaluation_lock_sha256':sha(HERE/'evaluation-lock.json'),'baseline':{k:v for k,v in base.items() if k not in ['production_sha256','preserved_sha256']},'preserved_file_count':len(base['preserved_sha256']),'production_file_count':len(base['production_sha256']),'source_audit':inv,'criteria':lock['criteria'],'legitimate_envelope':lock['required_legitimate_envelope'],'candidate_assessments':ASSESSMENTS,'tradeoff_matrix':matrix(),'simulations':sim,'phase_coverage':[{'phase':int(n),'title':title,'status':'COMPLETE','content':body.strip()} for n,title,body in parts],'qualification_evidence':{'classification':q['classification'],'planned_groups':q['planned_groups'],'observed_groups':q['observed_groups'],'operational_pass':q['operational_pass'],'worst_required_seconds':q['worst_required_eight_cell_request']['elapsed_seconds'],'memory_peak_bytes':q['memory']['peak_bytes'],'audit_lock_sha256':q['hashes']['audit_lock'],'evidence_manifest_sha256':q['hashes']['evidence_manifest']},'checks':checks,'production_changed':False,'VERSION':'0.11.0','release':False,'next_action':'Bounded Verified Follow-up Policy Implementation and Validation in a separate task; keep cap6 during that patch','limits':['offline accounting is not implemented-policy security proof','guarantees conditional on retained process/IP state and finite leases','NAT users do not have unique quotas','beyondL3 inspections/repeated chains may wait','compute qualification scope remains exact Profile A/W1; full28 workflow needs future real validation']}
 data['required_final_items']=items(data)
 assert all(set(v)==set(lock['criteria']) for v in data['tradeoff_matrix'].values())
 lines=['# Eight-Cell Request-Budget / Workflow Policy Design','', '**C — WORKFLOW-AWARE ACCOUNTING IS PREFERRED.** Recommend P3-capped:20 ordinary units plus8 shared server-verified deterministic-follow-up units per ClientIP/anchored60s, with child prebooking. **Design only: current20/60 and Cell cap6 remain unchanged.**','',f"Criteria lock SHA256: `{data['evaluation_lock_sha256']}`. Frozen before simulations; [lock](../scripts/request-budget-policy-design/evaluation-lock.json).",'',raw]
 lines += ['## Protected route table','', '|POST endpoint|Cost|Source-derived role|Caller / computation|','|---|---:|---|---|']
 for r in inv['routes']:lines.append(f"|`{r['endpoint']}`|1|{r['classification']}|{r['caller']}; {r['computational_character']}|")
 lines += ['', '## Source references', '', '|Source|Line|Function / call|','|---|---:|---|']
 for r in inv['references']:lines.append(f"|`{r['path']}`|{r['line']}|`{r['symbol']}`|")
 lines += ['', '## Frontend graph inventory', '', '|Action|Root|Dependent calls|Count|','|---|---|---|---|']
 for r in inv['graph']:lines.append(f"|{r['action']}|{r['root']}|{r.get('children','none')}|{r['count']}|")
 lines += ['', '## Candidate comparison', '', '|Candidate|6C/8C product fit|Abuse boundary|NAT/state|Replay/API|Complexity / decision|','|---|---|---|---|---|']
 for p,a in ASSESSMENTS.items():lines.append(f"|{p}|{a['usability']}|{a['abuse']}|{a['NAT']}; {a['state']}|{a['replay']}; {a['API']}|{a['complexity']}; {a['selection']}|")
 lines += ['', '## All twenty criteria, without composite scoring', '']
 for criterion in lock['criteria']:
  lines += ['### '+criterion,'','|Candidate|Assessment|','|---|---|']
  for p in ASSESSMENTS:lines.append(f"|{p}|{data['tradeoff_matrix'][p][criterion]}|")
  lines.append('')
 lines += ['## Exact journey simulations', '', 'A Evaluate/maps; B Optimize/maps; C Evaluate/maps→Interference; D full cycle; E Evaluate/maps→Optimize/maps; F cycle→Optimize/maps; G Optimize/maps→one explanation; H1 two Evaluate tabs; H2 two cycles; H3 two extended chains. Same-IP traces are sequential; concurrent tabs retain capacity rejection. Distinct IPs each use an independent copy of these budgets.', '', '|Policy|Cells|Journey|Planned calls|RF calls accepted|Charged units|Verified extra|Remaining|First denied call/stage|','|---|---:|---|---:|---:|---:|---:|---|---|']
 for r in sim['rows']:
  if r['policy'] in ['P3-naive','P6']:continue
  denied=r['first_denial'];denial=f"{denied['attempt']} / {denied['stage']}" if denied else 'none'
  lines.append(f"|{r['policy']}|{r['cells']}|{r['journey']}|{r['planned_calls']}|{r['accepted_RF_calls']}|{r['charged_units']}|{r['verified_extra_units']}|{r['remaining']}|{denial}|")
 lines += ['', '## Threshold derivation', '', '|Journey|Cells|Minimum flat request budget|','|---|---:|---:|']
 for r in sim['threshold_derivation']:lines.append(f"|{r['journey']}|{r['cells']}|{r['minimum_flat_budget']}|")
 lines += ['', '## Abuse arithmetic', '', '|Policy|Cells|Optimize / Evaluate|Independent Simulate|Complete map workflows|Total RF ceiling|Boundary|','|---|---:|---|---:|---:|---|---|']
 for r in sim['abuse_envelopes']:
  if r['policy']=='P6':continue
  total=r.get('total_RF_admissions',r.get('total_RF_steps_fresh_no_hoard'))
  boundary=r.get('tight_retained_anchored_boundary',r.get('tight_map_boundary',r.get('tight_aligned_bucket_boundary','carry-dependent')))
  lines.append(f"|{r['policy']}|{r['cells']}|{r['Optimize']} / {r['Evaluate']}|{r['independent_Simulate']}|{r['complete_map_workflows']}|{total}|{boundary}|")
 lines += ['', '## Current-policy quality checks', '', '|Command|Exit|Real E2E proof|','|---|---:|---|']
 for name,r in checks.items():lines.append(f"|{name}: `{' '.join(r['command'])}`|{r['exit_code']}|{r.get('execution_guard','not an E2E')}|")
 lines += ['', 'Tooling: [source inventory](../scripts/request-budget-policy-design/source-audit.json), [offline simulations](../scripts/request-budget-policy-design/simulations.json), [completion audit](../scripts/request-budget-policy-design/completion-audit.json), [quality logs/hash index](../scripts/request-budget-policy-design/evidence-manifest.json). No authorization or limiter implementation is present.', '']
 lines += ['## Required 78-item assessment','']
 for item in data['required_final_items']:lines.append(f"{item['number']}. **{item['label']}:** {item['result']}")
 lines.append('')
 (ROOT/'docs/eight-cell-request-budget-policy-design.md').write_text('\n'.join(lines));(ROOT/'docs/eight-cell-request-budget-policy-design.json').write_text(json.dumps(data,indent=2)+'\n');print(data['status'],data['final_verdict']);return data
if __name__=='__main__':render()
