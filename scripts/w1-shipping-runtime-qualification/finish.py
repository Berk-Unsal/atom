#!/usr/bin/env python3
"""Complete the authorized W1-only local successor, then validate and freeze evidence."""
import datetime,json,os,pathlib,subprocess,time
from protocol import HERE,ROOT,WORK,load,preserved

def command(args,logname,cwd=ROOT,env=None):
 path=WORK/(logname+'.log');start=time.monotonic()
 with path.open('x') as log:code=subprocess.run(args,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,env=env).returncode
 return {'command':args,'cwd':str(cwd),'exit_code':code,'seconds':time.monotonic()-start,'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'log':str(path)}
def main():
 # A specific live precheck handle must have finished before this script is launched.
 preserved();pre=load(HERE/'producer-precheck.json');assert pre['all_complete']
 # Reaudit terminal proof records with the final source without rerunning any RF work.
 result=command(['python3',str(HERE/'precheck.py')],'terminal-producer-reaudit');assert result['exit_code']==0
 result=command(['python3','-m','unittest','discover','-s',str(HERE),'-p','test_*.py'],'pre-freeze-tests');assert result['exit_code']==0
 result=command(['python3',str(HERE/'freeze.py')],'qualification-freeze');assert result['exit_code']==0
 result=command(['python3',str(HERE/'run.py')],'qualification-run');assert result['exit_code']==0
 result=command(['python3',str(HERE/'analyze.py')],'qualification-analysis');assert result['exit_code']==0
 result=command(['python3',str(HERE/'report.py')],'qualification-report');assert result['exit_code']==0
 checks=[('backend_tests',['go','test','./...'],'backend-go'),('backend_race',['go','test','-race','./...'],'backend-go'),('backend_vet',['go','vet','./...'],'backend-go'),('frontend_tests',['npm','test'],'frontend-react'),('frontend_lint',['npm','run','lint'],'frontend-react'),('frontend_build',['npm','run','build'],'frontend-react'),('rf_budget_e2e',['npx','playwright','test','e2e/rf-budget.spec.js','--project=desktop-1440','--workers=1'],'frontend-react'),('rf_deadline_e2e',['npx','playwright','test','e2e/network-deadline.spec.js','--project=desktop-1440','--workers=1'],'frontend-react'),('auto_resource_profile_tests',['go','test','./...','-run','ResourceProfile|AutoResource|Cancellation|Cancel|Experiment'],'backend-go'),('qualification_protocol_tests',['python3','-m','unittest','discover','-s','scripts/w1-shipping-runtime-qualification','-p','test_*.py'],''),('prior_study_preservation_tests',['python3','-m','unittest','discover','-s','scripts/fixed-deployment-profiles','-p','test_*.py'],''),('docs_build',['sh','docs/build-reference-pages.sh'],''),('docs_validation',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py'],''),('version',['python3','scripts/versioning.py','check'],''),('diff',['git','diff','--check'],'')]
 results={}
 for name,args,cwd in checks:
  record=command(args,'final-'+name,ROOT/cwd,os.environ|{'ATOM_REAL_E2E':'1'});results[name]=record;(HERE/'checks.json').write_text(json.dumps(results,indent=2)+'\n');print(name,'PASS' if record['exit_code']==0 else 'FAIL',flush=True)
  if record['exit_code']:raise SystemExit('required quality check failed: '+name)
 result=command(['python3',str(HERE/'report.py')],'validated-report');assert result['exit_code']==0
 for name,args in [('final_docs_build',['sh','docs/build-reference-pages.sh']),('final_docs_validation',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py']),('final_diff',['git','diff','--check'])]:
  results[name]=command(args,name);(HERE/'checks.json').write_text(json.dumps(results,indent=2)+'\n');assert results[name]['exit_code']==0,name
 p=ROOT/'docs/w1-shipping-runtime-qualification.json';r=load(p);r['quality_checks']=results;p.write_text(json.dumps(r,indent=2)+'\n');preserved()
 print('ALL QUALIFICATION GROUPS AND REQUIRED QUALITY CHECKS FINISHED',flush=True)
if __name__=='__main__':main()
