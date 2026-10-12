#!/usr/bin/env python3
"""Finalize terminal evidence and host lifecycle; never execute or replace RF observations."""
import datetime,json,subprocess
from protocol import HERE,ROOT,WORK,load,sha,preserved
from completion_audit import audit
from analyze import archive
from report import report

def main():
 assert 'finish.py exit 0' in (WORK/'pipeline.log').read_text(),'qualification/quality pipeline must be terminal'
 audit()
 sleep_path=HERE/'sleep-prevention.json';sleep=load(sleep_path)
 if sleep['ended_at'] is None:
  command=subprocess.check_output(['ps','-p',str(sleep['pid']),'-o','command='],text=True).strip()
  assert command=='caffeinate -i','refuse to signal any different process'
  subprocess.run(['kill',str(sleep['pid'])],check=True)
  sleep['ended_at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
  sleep_path.write_text(json.dumps(sleep,indent=2)+'\n')
 result_path=ROOT/'docs/w1-shipping-runtime-qualification.json';result=load(result_path)
 result['sleep_prevention']=sleep
 result['completion_audit']={'path':'scripts/w1-shipping-runtime-qualification/completion-audit.json','groups_verified':1677,'batches_verified':33,'objective_phases_verified':40,'final_report_items':66}
 result_path.write_text(json.dumps(result,indent=2)+'\n');report()
 attempt=1+len(list(WORK.glob('finalization-*-docs-build.log')));checks={}
 commands=[('protocol-tests',['python3','-m','unittest','discover','-s',str(HERE),'-p','test_*.py']),('docs-build',['sh','docs/build-reference-pages.sh']),('docs-validation',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py']),('version',['python3','scripts/versioning.py','check']),('diff',['git','diff','--check'])]
 evidence=[]
 for name,args in commands:
  log=WORK/f'finalization-{attempt}-{name}.log'
  with log.open('x') as out:code=subprocess.run(args,cwd=ROOT,stdout=out,stderr=subprocess.STDOUT).returncode
  checks[name]={'command':args,'exit_code':code,'log':str(log),'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  assert code==0,'finalization check failed: '+name
  evidence.append(archive(log,log.name));print(name,'PASS',flush=True)
 preserved();audited=audit()
 evidence+=audited['additional_archived_evidence']+load(result_path)['evidence']
 evidence.append(archive(sleep_path,'final-sleep-prevention.json'))
 status={'phase':'complete','all_planned_complete':True,'observed_groups':1677,'planned_groups':1677,'batches':33,'profile_verdicts':{p:x['verdict'] for p,x in result['profiles'].items()},'minimum_certified_profile':result['minimum_certified_profile'],'recommended_profile':result['recommended_profile'],'historical_artifacts_preserved':663,'completion_audit_passed':True,'qualification_lock_frozen':True,'qualification_started':True,'sleep_prevention_ended_at':sleep['ended_at'],'finalization_checks':checks,'updated_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (HERE/'status.json').write_text(json.dumps(status,indent=2)+'\n')
 index={'schema_version':1,'finalized_at':status['updated_at'],'checks':checks,'archived_evidence':list({x['path']:x for x in evidence}.values()),'deliverable_sha256':{str(p.relative_to(ROOT)):sha(p) for p in [result_path,ROOT/'docs/w1-shipping-runtime-qualification.md',ROOT/'docs/w1-shipping-runtime-qualification.html',HERE/'completion-audit.json',HERE/'status.json',sleep_path]}}
 (HERE/'finalization.json').write_text(json.dumps(index,indent=2)+'\n')
 print('TERMINAL AUDIT AND FINALIZATION PASS; goal completion remains the calling assistant responsibility',flush=True)
if __name__=='__main__':main()
