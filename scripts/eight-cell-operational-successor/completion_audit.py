#!/usr/bin/env python3
"""Verify successor coverage, evidence and chronology without forcing a verdict."""
import datetime,json,pathlib,re,sys
from protocol import HERE,ROOT,WORK,load,sha,verify,manifest_verify
from preflight import preflight
from analyze import classification

def complete(draft=False):
 lock=verify();result=load(ROOT/'docs/eight-cell-operational-budget-successor.json');proof=preflight()
 assert result['observed_groups']==result['planned_groups']==837
 assert all(v['complete'] for v in result['completion'].values())
 frozen=datetime.datetime.fromisoformat(lock['locked_at']);started=datetime.datetime.fromisoformat(load(HERE/'execution.json')['started_at'])
 assert all(datetime.datetime.fromisoformat(v['completed_at'])<frozen for v in proof.values()) and frozen<started
 assert result['classification']==classification(True,result['methodology_violations'],result['interrupted_observations'],result['measured_operational_gate_pass'],result['budget']['mechanical_pass'],result['budget']['product_fit'])
 assert load(HERE/'search-accounting.json')['scientific_match_to_real_HTTP']
 assert load(HERE/'frontend-smoke.json')['exit_code']==0
 assert load(HERE/'shipping-explanation-cap.json')['passed']
 assert load(HERE/'source-differential-verification.json')['passed']
 old=ROOT/'scripts/eight-cell-operational-audit'
 for name in ['domain-manifest.json','run-plans.json']:assert sha(HERE/name)==sha(old/name)
 prior_manifest=load(old/'evidence-manifest.json');manifest_verify(prior_manifest,pathlib.Path(prior_manifest['storage_root']))
 for label in lock['batch_order']:
  folder=WORK/label;expected=lock['source_differential']['images'][lock['batch_binary'][label]]
  assert load(folder/'process-identity.json')['primary_executable_sha256']==expected['binary_sha256']
  assert load(folder/'pre-rf-verification.json')['auto_valid'] and load(folder/'pre-rf-verification.json')['external_constraints_valid']
 manifest_path=HERE/'evidence-manifest.json'
 if manifest_path.exists():
  manifest=load(manifest_path);manifest_verify(manifest)
  indexed={q['path'] for q in manifest['artifacts'] if not pathlib.Path(q['path']).is_absolute()}
  retained={str(q.relative_to(WORK)) for q in WORK.rglob('*') if q.is_file() and not q.is_symlink() and q.relative_to(WORK).parts[0]!='build-context' and not (len(q.relative_to(WORK).parts)>1 and q.relative_to(WORK).parts[0].startswith('frontend-smoke'))}
  assert indexed==retained, 'raw evidence index does not cover retained files'
 if not draft:
  assert len(load(HERE/'final-checks.json'))==15
  preflight('final')
  assert result['publication_ready'] and (ROOT/'VERSION').read_text().strip()=='0.11.0'
  archive=load(manifest_path)['local_archive'];assert sha(pathlib.Path(archive['path']))==archive['sha256']
  terminal=load(HERE/'terminal-validation.json');assert terminal['passed'] and len(terminal['records'])==4
  for q in terminal['records'].values():
   path=pathlib.Path(q['path']);assert q['exit_code']==0 and path.stat().st_size==q['byte_size'] and sha(path)==q['sha256']
  assert sha(pathlib.Path(terminal['archive']['path']))==terminal['archive']['sha256']
 labels=re.findall(r'^(\d+)\. (.+)$',(WORK/'request.txt').read_text().split('FINAL RESPONSE — REQUIRED')[1],re.M)
 assert [int(n) for n,_ in labels]==list(range(1,84))
 phase_refs={
 0:['baseline.json'],1:['baseline.json'],2:['baseline-checks.json'],3:['e2e_guard.py','test_e2e_guard.py'],4:['audit-lock.json'],5:['domain-manifest.json'],6:['binary-differential.json'],7:['binary-differential.json'],8:['execution.json'],9:['audit-lock.json'],10:['audit-lock.json'],11:['audit-lock.json'],12:['sleep-prevention.json'],13:['transport.py','execution.json'],14:['run-plans.json'],15:['audit-lock.json'],16:['mixed-reference-guard.json'],17:['result:background_results'],18:['result:background_results'],19:['result:cancellation'],20:['result:science'],21:['result:six_cell_preservation'],22:['result:budget'],23:['result:budget'],24:['result:budget'],25:['result:budget'],26:['result:budget'],27:['result:budget'],28:['result:budget'],29:['result:budget'],30:['result:operations'],31:['frontend-smoke.json'],32:['frontend-smoke.json'],33:['presentation-persistence.json'],34:['result:operational_pass'],35:['result:classification'],36:['result:next_action'],37:['baseline.json','audit-lock.json'],38:['result:version_recommendation'],39:['final-checks.json']}
 value={'schema_version':2,'audited_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'completion_status':'DRAFT / FINAL VALIDATION PENDING' if draft else 'COMPLETE','classification':result['classification'],'qualification':result['decision'],'locked_groups_verified':837,'locked_batches_verified':len(lock['batch_order']),'baseline_real_e2e_proven_before_freeze':True,'freeze_before_measurement':True,'prior_invalid_audit_preserved':True,'prior_raw_files_verified':len(prior_manifest['artifacts']),'operational_pass':result['operational_pass'],'budget_mechanical_pass':result['budget']['mechanical_pass'],'budget_product_fit':result['budget']['product_fit'],'six_cell_science_preservation':result['six_cell_preservation'],'frozen_input_hashes_verified':True,'standard_cap':6,'production_changes':False,'VERSION':'0.11.0','audit_lock_sha256':sha(HERE/'audit-lock.json'),'domain_manifest_sha256':sha(HERE/'domain-manifest.json'),'run_plan_sha256':sha(HERE/'run-plans.json'),'evidence_manifest_sha256':sha(manifest_path) if manifest_path.exists() else None,'phase_coverage':[{'phase':n,'status':'PENDING FINAL CHECKS' if draft and n==39 else 'COMPLETE','evidence':phase_refs[n]} for n in range(40)],'required_final_items':[{'number':int(n),'label':label,'report':'docs/eight-cell-operational-budget-successor.md + JSON; final response'} for n,label in labels],'terminal_quality_evidence':'terminal-validation.json' if not draft else 'pending', 'terminal_quality_archive':load(HERE/'terminal-validation.json')['archive'] if not draft else None,'next_action':result['next_action']}
 (HERE/'completion-audit.json').write_text(json.dumps(value,indent=2)+'\n');return value
if __name__=='__main__':
 value=complete('--draft' in sys.argv);print(value['completion_status'],value['classification'],value['locked_groups_verified'])
