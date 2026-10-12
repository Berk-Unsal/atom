#!/usr/bin/env python3
"""Requirement coverage and production/prior invariance for a design-only study."""
import datetime,hashlib,json,pathlib,sys
from e2e_guard import REQUIRED,verify_execution
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def complete(draft=False):
 base=load(HERE/'baseline.json');lock=load(HERE/'evaluation-lock.json');data=load(ROOT/'docs/eight-cell-request-budget-policy-design.json');selected=load(HERE/'recommendation.json')
 assert sha(HERE/'evaluation-lock.json')==(HERE/'evaluation-lock.sha256').read_text().split()[0]
 assert lock['frozen_at']<selected['selected_at'];assert selected['recommendation']==data['recommended_policy']
 for group in ['production_sha256','preserved_sha256']:
  for name,digest in base[group].items():assert sha(ROOT/name)==digest,name
 assert data['production_changed'] is False and data['recommended_policy']['implemented'] is False
 assert len(data['source_audit']['routes'])==19 and len(data['simulations']['rows'])==216
 assert [q['phase'] for q in data['phase_coverage']]==list(range(50)) and len(data['required_final_items'])==78
 assert all(set(v)==set(lock['criteria']) for v in data['tradeoff_matrix'].values())
 if not draft:
  assert len(data['checks'])==13 and all(v['exit_code']==0 and v['execution_proven'] for v in data['checks'].values())
  for name in REQUIRED:
   r=data['checks'][name];p=pathlib.Path(r['execution_guard']['report_path']);assert sha(p)==r['execution_guard']['report_sha256'];verify_execution(name,load(p),r['environment'],r['exit_code'])
  m=load(HERE/'evidence-manifest.json')
  for row in m['artifacts']:
   p=pathlib.Path(m['storage_root'])/row['path'];assert p.stat().st_size==row['byte_size'] and sha(p)==row['sha256']
  assert sha(pathlib.Path(m['archive']['path']))==m['archive']['sha256']
  assert data['status']=='COMPLETE'
 value={'audited_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'DRAFT / QUALITY PENDING' if draft else 'COMPLETE','design_verdict':data['final_verdict'],'recommended_policy':data['recommended_policy'],'implementation_present':False,'prior_files_verified':len(base['preserved_sha256']),'production_files_verified':len(base['production_sha256']),'criteria_frozen_before_selection':True,'evaluation_lock_sha256':sha(HERE/'evaluation-lock.json'),'phases':data['phase_coverage'],'required_final_items':data['required_final_items'],'no_release':True,'VERSION':'0.11.0','next_action':data['next_action']}
 (HERE/'completion-audit.json').write_text(json.dumps(value,indent=2)+'\n');print(value['status']);return value
if __name__=='__main__':complete('--draft' in sys.argv)
