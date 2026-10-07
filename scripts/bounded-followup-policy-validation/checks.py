"""Final checked commands; real E2Es must execute named tests without skips."""
import datetime,hashlib,json,os,pathlib,subprocess
from e2e_guard import verify_execution
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-bounded-followup-policy')
COMMANDS={
 'backend_tests':('backend-go',['go','test','./...']),
 'backend_race':('backend-go',['go','test','-race','./...']),
 'backend_vet':('backend-go',['go','vet','./...']),
 'frontend_tests':('frontend-react',['npm','test']),
 'frontend_lint':('frontend-react',['npm','run','lint']),
 'frontend_build':('frontend-react',['npm','run','build']),
 'rf_budget_e2e':('frontend-react',['npx','playwright','test','e2e/rf-budget.spec.js','--project=desktop-1440','--workers=1','--reporter=json']),
 'rf_deadline_e2e':('frontend-react',['npx','playwright','test','e2e/network-deadline.spec.js','--project=desktop-1440','--workers=1','--reporter=json']),
 'bounded_six_e2e':('frontend-react',['npx','playwright','test','e2e/bounded-followup.spec.js','--project=desktop-1440','--workers=1','--reporter=json']),
 'docs_build':('.',['sh','docs/build-reference-pages.sh']),
 'docs_validation':('.',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py']),
 'version_consistency':('.',['python3','scripts/versioning.py','check']),
 'diff_check':('.',['git','diff','--check']),
}
def verify_e2e(data):
 tests=[]
 def walk(s):
  for spec in s.get('specs',[]):
   for t in spec.get('tests',[]):tests.append({'id':spec['id'],'title':spec['title'],'file':spec['file'],'project':t['projectName'],'statuses':[r['status'] for r in t['results']]})
  for child in s.get('suites',[]):walk(child)
 for suite in data.get('suites',[]):walk(suite)
 assert tests and not data.get('errors') and data['stats']['skipped']==0 and data['stats']['unexpected']==0
 assert all(t['statuses']==['passed'] for t in tests)
 return {'discovered':len(tests),'executed':len(tests),'passed':len(tests),'skipped':0,'tests':tests,'opt_in_active':True}
def run(names):
 records=json.loads((HERE/'checks.json').read_text()) if (HERE/'checks.json').exists() else {}
 for name in names:
  cwd,command=COMMANDS[name];env=os.environ.copy();override={'ATOM_REAL_E2E':'1'} if name.endswith('e2e') else {};env.update(override)
  path=WORK/(name+('.playwright.json' if override else '.log'));start=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with path.open('w') as out,(WORK/(name+'.stderr.log')).open('w') as err:p=subprocess.run(command,cwd=ROOT/cwd,env=env,stdout=out,stderr=err)
  row={'command':command,'cwd':cwd,'environment':override,'started_at':start,'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':p.returncode,'stdout_path':str(path),'stdout_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
  if override and p.returncode==0:row['execution_guard']=verify_execution(name,json.loads(path.read_text()),override,p.returncode)
  records[name]=row;(HERE/'checks.json').write_text(json.dumps(records,indent=2)+'\n');print(name,p.returncode,flush=True);assert p.returncode==0,name
if __name__=='__main__':
 import sys
 run(sys.argv[1:] or list(COMMANDS))
