#!/usr/bin/env python3
"""Current production quality only; no proposed limiter is installed."""
import datetime,hashlib,json,os,pathlib,subprocess,sys
from e2e_guard import REQUIRED,verify_execution
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-eight-cell-request-budget-policy-design')
COMMANDS={
 'backend_tests':('backend-go',['go','test','./...']),
 'backend_race':('backend-go',['go','test','-race','./...']),
 'backend_vet':('backend-go',['go','vet','./...']),
 'frontend_tests':('frontend-react',['npm','test']),
 'frontend_lint':('frontend-react',['npm','run','lint']),
 'frontend_build':('frontend-react',['npm','run','build']),
 'rf_budget_e2e':('frontend-react',['npx','playwright','test','e2e/rf-budget.spec.js','--project=desktop-1440','--workers=1','--reporter=json']),
 'rf_deadline_e2e':('frontend-react',['npx','playwright','test','e2e/network-deadline.spec.js','--project=desktop-1440','--workers=1','--reporter=json']),
 'study_tests':('.',['python3','-B','-m','unittest','discover','-s',str(HERE),'-p','test_*.py']),
 'docs_build':('.',['sh','docs/build-reference-pages.sh']),
 'docs_validation':('.',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py']),
 'version_consistency':('.',['python3','scripts/versioning.py','check']),
 'diff_check':('.',['git','diff','--check'])}
def checks():
 result={}
 for name,(cwd,command) in COMMANDS.items():
  environment={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'};start=datetime.datetime.now(datetime.timezone.utc).isoformat();proof=None
  if name in REQUIRED:
   environment['ATOM_REAL_E2E']='1';path=WORK/(name+'.playwright.json')
   with path.open('x') as out,(WORK/(name+'.stderr.log')).open('x') as err:code=subprocess.run(command,cwd=ROOT/cwd,env=environment,stdout=out,stderr=err).returncode
   proof=verify_execution(name,json.loads(path.read_text()),{'ATOM_REAL_E2E':'1'},code);proof.update(report_path=str(path),report_sha256=hashlib.sha256(path.read_bytes()).hexdigest())
  else:
   with (WORK/(name+'.log')).open('x') as out:code=subprocess.run(command,cwd=ROOT/cwd,env=environment,stdout=out,stderr=subprocess.STDOUT).returncode
  result[name]={'command':command,'cwd':cwd,'started_at':start,'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':code,'execution_proven':proof is None or bool(proof['passed']),'execution_guard':proof,'environment':{'ATOM_REAL_E2E':'1'} if proof else{}}
  (HERE/'checks.json').write_text(json.dumps(result,indent=2)+'\n');print(name,code,proof,flush=True)
 return all(v['exit_code']==0 and v['execution_proven'] for v in result.values())
if __name__=='__main__':sys.exit(0 if checks() else 1)
