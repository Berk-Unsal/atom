"""Verify machine-readable executions and artifact hashes before freezing."""
from protocol import HERE, WORK, load, sha
from e2e_guard import REQUIRED, verify_execution

def preflight(stage='baseline'):
 records=load(HERE/(stage+'-checks.json'))
 if len(records)<10 or not all(v['exit_code']==0 and v['required_test_executed'] for v in records.values()):raise ValueError('quality checks did not all succeed')
 for name in REQUIRED:
  record=records[name];proof=record['execution_guard'];path=WORK/(stage+'-'+name+'.playwright.json')
  if sha(path)!=proof['report_sha256']:raise ValueError('Playwright artifact changed')
  actual=verify_execution(name,load(path),record['test_environment'],record['exit_code'])
  if any(proof[k]!=v for k,v in actual.items()):raise ValueError('execution guard proof differs')
 return {name:records[name] for name in REQUIRED}
if __name__=='__main__':preflight()
