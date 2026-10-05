#!/usr/bin/env python3
"""One-time preregistration. Refuses overwrite and any earlier RF evidence."""
import datetime,hashlib,json,pathlib,random,subprocess
from protocol import HERE,ROOT,WORK,sha,load,required_baselines

def save(name,value):
 p=HERE/(name+'.json')
 with p.open('x') as out:out.write(json.dumps(value,indent=2,sort_keys=True)+'\n')
 with (HERE/(name+'.sha256')).open('x') as out:out.write(sha(p)+'  '+p.name+'\n')
if (HERE/'certification-lock.json').exists() or list((WORK/'geometry').glob('runs-*')):raise SystemExit('already frozen or RF evidence exists')
domains=load(HERE/'domain-manifest.json');selected=domains['selected'];bands=['sparse','medium','dense','very-dense']
byBand={b:[d for d in selected if d['band']==b] for b in bands}
assert all(len(x)==2 for x in byBand.values())
subprocess.run(['node',str(HERE/'fixtures.mjs'),str(WORK/'geometry')],check=True)
plans={};batchOrder=[]
opsW1=['simulate','evaluate-maps','interference','cycle','optimize-maps','explain','azimuth','surface','building-entry','recommendation']
opsW2=['simulate','evaluate-maps','optimize-maps','interference','surface']
profiles={'A':{'cpus':2,'memory_gib':4},'B':{'cpus':4,'memory_gib':8},'C':{'cpus':8,'memory_gib':10},'D':{'cpus':None,'memory_gib':None,'role':'development control, never certified'}}
def add(rows,d,freq,level,op,repeat):rows.append({'fixture':f"{d['id']}-{freq}-{level}",'operation':op,'repeat':repeat})
for segment,profileOrder in enumerate([['A','B','C','D'],['B','C','A','D'],['C','A','B','D']]):
 for profile in profileOrder:
  label=f'{profile}-single-{segment}';rows=[]
  repeats=[[0,1],[2,3],[4]][segment]
  for band in (bands if profile!='D' else ['sparse','dense']):
   for freq in [2.6,28]:
    for r in repeats:
     d=byBand[band][r%2] if profile!='D' else byBand[band][0]
     for op in (opsW1 if profile!='D' else ['simulate','evaluate-maps','optimize-maps','interference','surface']):add(rows,d,freq,'W1',op,r)
     if band in ['sparse','dense'] and profile!='D':
      for op in ['evaluate','optimize']:add(rows,byBand[band][0],freq,'W1',op,r)
    d=byBand[band][segment%2] if profile!='D' else byBand[band][0]
    for op in (opsW2 if profile!='D' else ['simulate','evaluate-maps','optimize-maps']):add(rows,d,freq,'W2',op,segment)
    if profile!='D':add(rows,d,freq,'W2-alt','optimize',segment)
  random.Random(20261005+segment*1000+ord(profile)).shuffle(rows);plans[label]=rows;batchOrder.append(label)
# Every mixed setting has FIVE same-profile/domain/RF/search isolated references already planned.
for profile in ['B','C','A']:
 rows=[]
 for band in ['sparse','dense']:
  for freq in [2.6,28]:
   for r in range(3):
    for op in ['two-optimizers','optimize-evaluate','two-evaluates','async-optimize','async-evaluate','sustained-optimize','sustained-evaluate']:
     add(rows,byBand[band][0],freq,'W1',op,r)
 random.Random(20261005+2000+ord(profile)).shuffle(rows)
 label=profile+'-mixed-0';plans[label]=rows;batchOrder.append(label)
for profile in ['C','A','B','D']:
 rows=[]
 for band in (['sparse','dense'] if profile!='D' else ['dense']):
  for freq in [2.6,28]:
   for r in range(3):
    for op in (['simulate','optimize','surface','building-entry','recommendation'] if profile!='D' else ['simulate','surface']):add(rows,byBand[band][0],freq,'W3',op,r)
 if profile!='D':
  for band in ['sparse','dense']:
   for freq in [2.6,28]:
    for r in range(3):add(rows,byBand[band][0],freq,'W1','cancel',r)
 random.Random(20261005+3000+ord(profile)).shuffle(rows)
 label=profile+'-edge-0';plans[label]=rows;batchOrder.append(label)
# Fresh process first request: Optimize subset, three repeats on sparse/dense at2.6.
for r in range(3):
 for band in ['sparse','dense']:
  for profile in [['A','B','C'],['B','C','A'],['C','A','B']][r]:
   label=f'{profile}-fresh-{band}-{r}';rows=[];add(rows,byBand[band][0],2.6,'W1','optimize',r);plans[label]=rows;batchOrder.append(label)
save('run-plans',plans)
(HERE/'domain-manifest.sha256').write_text(sha(HERE/'domain-manifest.json')+'  domain-manifest.json\n')
# Source hashes include original studies and every production source, guaranteeing invariance.
files=subprocess.check_output(['git','ls-files','backend-go','frontend-react/src','data-pipeline/manifest.json','docs/auto-resource-estimator-locked-validation.json','scripts/auto-resource-estimator-validation','docs/auto-resource-geometry-calibration.json','docs/rf-resource-admission-measurements.json','docs/rf-request-budget-policy-measurements.json'],text=True).splitlines()
files+=[str(p.relative_to(ROOT)) for p in HERE.iterdir() if p.name in ['prepare.py','harness.go.txt','fixtures.mjs','protocol.py','run.py','freeze.py']]
inputs={p:sha(ROOT/p) for p in sorted(files) if (ROOT/p).is_file()}
manifest=load(ROOT/'data-pipeline/manifest.json')
for filename,digest in manifest['sha256'].items():assert sha(ROOT/'data-pipeline'/filename)==digest;inputs['data-pipeline/'+filename]=digest
lock={'schema_version':1,'predecessor':{'lock_sha256':'4ef918e970aa4f898d0884580779a33ccf0b7fee891439ad7b99562e0cef9ed5','classification':'INVALID BOOTSTRAP; three preliminary groups excluded','artifact':'scripts/fixed-deployment-profiles/invalid-bootstrap/certification-lock.json','correction':'Wire pre-RF Auto guard; keep Auto Linux environment unknown and require independently known Docker-inspect provenance. Same numerical gates,workloads,repeats and seed; no valid evidence reused.'},'locked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'certification_date_local':'2026-10-05','baseline':{'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'version':(ROOT/'VERSION').read_text().strip(),'status_short':'','diff_stat':''},'dataset':{'id':manifest['id'],'version':manifest['version'],'sha256':manifest['sha256'],'footprints':domains['global_footprints'],'vertices':domains['global_vertices'],'cells':domains['inventory_cells'],'complexity_boundary':'exact Ankara pack only; no generic dataset threshold'},'profiles':profiles,'profile_semantics':'Resource floors require exact tested dataset/runtime/workload/concurrency assumptions; numbers alone never grant certification. D is not deployable certification. C is the measured8CPU/10GiB only.','workloads':{'W1':{'rays':120,'radius_m':400,'cells':6,'tx_power_dbm':30,'beam_width_deg':120,'search_policy':'legacy_two_pass_coordinate','operations':opsW1,'surface_cell_size_m':25,'recommendation_cells':5,'recommendation_polygon':'six-inventory-Cell enclosing box +20m'},'W2':{'rays':240,'radius_m':600,'operations':opsW2,'search_policy':'legacy_two_pass_coordinate','surface_cell_size_m':25,'alternate_search':{'policy':'deterministic_multistart_coordinate_v1','max_search_passes':2,'max_unique_evaluations':192}},'W3':{'rays':360,'radius_m':1500,'surface_cell_size_m':5,'search_policy':'deterministic_pareto_archive_search_v1','max_search_passes':3,'max_unique_evaluations':768,'operations':['simulate','optimize','surface','building-entry','recommendation'],'role':'valid edge cases, no interactive guarantee required'}},'frequencies_ghz':[2.6,28],'interference_bandwidth_mhz':{'2.6':20,'28':100},'domain_selection':{'manifest_sha256':sha(HERE/'domain-manifest.json'),'domains':[d['id'] for d in selected],'selection_only_no_rf_timing':True,'prior_fitting_domains_excluded':True,'prior_validation_reuse_possible':True,'failed_geometry_only_attempt':'Excluding all prior fitting and validation envelopes could not produce eight disjoint domains; before freeze limited exclusions to fitting domains. No RF timings collected.','envelope_radius_m':802,'meaning':'band labels are target quantile strata, not universal density thresholds;W3 enlarged envelopes may overlap'},'repeats':{'W1_per_operation_profile_band_frequency':5,'domain_assignment':'alternate two disjoint domains by repeat parity (3 and2 measurements); mixed reference standalone evaluate/optimize uses first domain five times','W2_per_operation_profile_band_frequency':3,'W3_per_operation_profile_sparse_dense_frequency':3,'mixed_per_scenario_profile_domain_frequency':3,'fresh_per_profile_domain':3},'gates':{'http':'all planned interactive responses200, full streamed read, no60s deadline failure; cancellation first response exempt','request_wall_max_seconds':45,'deadline_headroom_min_seconds':15,'rationale_deadline':'reserve one quarter of existing60s safety deadline for environmental variability, transfer and contention;45s applies per protected request including client serialization/receive','memory_peak_max_fraction_of_hard_limit':0.75,'rationale_memory':'retain at least25% hard memory headroom including dataset, Go runtime, client, async retained state and cgroup page cache; no reservation inferred from RSS','memory_signals_required':['memory.peak','memory.current','process RSS','Go heap','memory.events'],'memory_scope':'maximum kernel cgroup lifetime peak in W1/W2 and mixed batches, including startup and retained W2 state; W3/fresh separately disclosed','oom_events_allowed':0,'memory_max_events_allowed':0,'throttle':'quota saturation is allowed; record usage/periods/throttle duration; pass requires unchanged wall/headroom gates','concurrency':'two real distinctClientIP requests, both successful; no slot/client leak after every group','async':'worker1/queue16; initial actual worker active, nonzero temporal overlap per interactive request; sustained>=30s and >=95%50ms samples active during first30s, uncached jobs; no failed jobs/submissions','cancellation_release_max_seconds':2,'cancellation':'cancel expensiveOptimize at100ms, await handler completion, verify attempts charged and same/other clientEvaluate succeed, zero slots/active clients','scientific':'all successful deterministic endpoint+request hashes identical across profiles, repetitions and scenarios; response runtime fields absent, diagnosticAuto not compared','incomplete':'missing/breached evidence ->NOT CERTIFIED, do not relax gates or replace cases','W3_failure':'retain failures; outside certified interactive envelope does not invalidate W1/W2 if processes remain healthy'},'mixed_reference_guard':{'required_before_launch':True,'required_five_repeats':[list(k) for k in sorted(required_baselines(plans))],'key':['profile','fixture (domain,frequency,RF,search)','operation'],'fail_closed':True},'async_protocol':{'normal_matrix_runs':16,'normal_initial_jobs':1,'sustained_matrix_runs':64,'sustained_target_seconds':30,'sustained_initial_jobs':4,'sustained_max_submissions':64,'refill':'maintain four active/queued,1worker; unique offsets/azimuths prevent cache hits;cancel/drain at end','sample_ms':50,'drain_watchdog_seconds':90,'interactive_round_cap':12,'gap_seconds':3},'run_order':{'seed':20261005,'algorithm':'three Latin rotation profile segments; independently seeded shuffle geometry/frequency/operation within each batch; mixed then W3/cancel then fresh, all pre-generated','plan_sha256':sha(HERE/'run-plans.json')},'batch_order':batchOrder,'process_reset_protocol':{'single':'fresh process at each of three profile segments; long-running service within segment; noGC override/forcedGC/cache eviction','mixed':'fresh warmed service per profile only after complete isolated references verified','fresh':'new process for every firstOptimize request, separate startup/index timing','warmup':'one unmeasured valid simulate per process exceptfresh; distinctClientIP and drained before timing','retention':'async jobs/cache retained normally until process reset; no manager resets'},'http_method':'real Linux TCP loopback listener + original productionGin routes/body/attempt/concurrency/deadline middleware; io.CopySHA256 streamed client, nohttptest recorder; smallOptimize/job response retention only; aggregateprocess CPU includes client/sampler','container_provenance':'Auto Linux environment remains unknown. Require independent known Docker-inspect image/HostConfig evidence before RF; unknown evidence itself never satisfies a requirement.','cpu_runtime':'Go defaults; do not setGOMAXPROCS/GOMEMLIMIT/GOGC; candidatequota exact,memswap equals hardlimit; Linuxarm64,cgroupv2,image recorded','memory_observation':'50ms sampledRSS/heap/current + kernel lifetime memory.peak; mixedCPU aggregate, never individualprice','response_volume':'uncompressed entity bytes excluding HTTP framing; no inventednetworkSLO','production_invariants':{'attempts':20,'window_seconds':60,'global_concurrency':2,'per_client_concurrency':1,'deadline_seconds':60,'cell_cap':6,'experiment_workers':1,'queue_capacity':16,'auto':'observation-only'},'image_id':subprocess.check_output(['docker','image','inspect','atom:auto-profile-calibration','--format','{{.Id}}'],text=True).strip(),'binary_sha256':sha(WORK/'fixed.test'),'input_sha256':inputs,'fixture_sha256':{p.name:sha(p) for p in sorted((WORK/'geometry').glob('*-W*.json'))},'no_gate_changes_after_measurement':True,'no_early_stopping':True}
save('certification-lock',lock)
(WORK/'geometry'/'certification-lock.json').write_bytes((HERE/'certification-lock.json').read_bytes())
for label,rows in plans.items():(WORK/'geometry'/f'plans-{label}.json').write_text(json.dumps(rows))
print('LOCK',sha(HERE/'certification-lock.json'),'planned',sum(map(len,plans.values())),'groups',len(plans),'batches')
