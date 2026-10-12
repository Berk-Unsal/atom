#!/usr/bin/env python3
"""Freeze exact prior protocol only after proven real baseline execution."""
import datetime,json,subprocess
from protocol import HERE,ROOT,WORK,load,sha,preserved
from preflight import preflight

def freeze():
 if (HERE/'audit-lock.json').exists():raise ValueError('already frozen')
 if list(WORK.glob('A-*/runs.jsonl')):raise ValueError('measurement exists before freeze')
 preserved();e2es=preflight();prior=ROOT/'scripts/eight-cell-operational-audit';old=load(prior/'audit-lock.json');binary=load(HERE/'binary-differential.json')
 for name in ['domain-manifest','run-plans']:
  assert sha(HERE/(name+'.json'))==old[name+'_sha256']==sha(prior/(name+'.json'))
 assert sum(map(len,load(HERE/'run-plans.json').values()))==837
 for name,digest in old['fixture_sha256'].items():assert sha(WORK/'fixtures'/name)==digest
 for name,digest in old['dataset']['sha256'].items():assert sha(ROOT/'data-pipeline'/name)==digest
 assert len(binary['source_differences'])==1 and binary['source_differences']==old['source_differential']['source_differences']
 for kind in ['standard','audit']:
  assert binary['images'][kind]['binary_sha256']==old['source_differential']['images'][kind]['binary_sha256']
 files=subprocess.check_output(['git','ls-files','backend-go','frontend-react/src','policy','Dockerfile','VERSION','docs/openapi.yaml','scripts/generate_policy.py'],cwd=ROOT,text=True).splitlines()
 frozen=['client.py','transport.py','runtime.py','protocol.py','run.py','build.py','freeze.py','checks.py','e2e_guard.py','preflight.py','analyze.py','test_protocol.py','test_e2e_guard.py','binary-differential.json','cardinality-contracts.json','baseline-checks.json']
 files += [str((HERE/name).relative_to(ROOT)) for name in frozen]+['scripts/w1-shipping-runtime-qualification/client.py','scripts/w1-shipping-runtime-qualification/protocol.py']
 lock=dict(old);lock.update({'schema_version':2,'locked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline':{k:v for k,v in load(HERE/'baseline.json').items() if k!='preserved_sha256'},'source_differential':binary,'baseline_real_e2e_execution':e2es,'input_sha256':{name:sha(ROOT/name) for name in files if (ROOT/name).is_file()},'successor_of':{'audit_lock_sha256':sha(prior/'audit-lock.json'),'classification':'D','reason':'required baseline E2Es skipped without opt-in','protocol_reuse':'same layouts, fixture bytes, plan order, repeats, gates, budget product-fit semantics and runtime'},'storage':'Raw evidence outside Git at '+str(WORK)+'; indexed SHA256/size/group plus archive'})
 with (HERE/'audit-lock.json').open('x') as out:out.write(json.dumps(lock,indent=2,sort_keys=True)+'\n')
 (HERE/'audit-lock.sha256').write_text(sha(HERE/'audit-lock.json')+'  audit-lock.json\n')
 print('LOCK',sha(HERE/'audit-lock.json'),'groups837',flush=True)
if __name__=='__main__':freeze()
