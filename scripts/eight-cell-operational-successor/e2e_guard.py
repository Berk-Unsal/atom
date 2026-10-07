"""Fail closed on missing opt-in, absent named tests, skips or failures."""
import pathlib
REQUIRED = {
 'rf_budget_e2e': ('rf-budget.spec.js', 'real RF budget: six-cell Evaluate, Interference, inspect, re-evaluate, then abuse'),
 'rf_deadline_e2e': ('network-deadline.spec.js', 'real network optimization deadline: affected six-cell defaults preserve output and one-request cost'),
}
def verify_execution(name, report, environment, exit_code=0):
 if environment.get('ATOM_REAL_E2E') != '1': raise ValueError('real E2E opt-in absent')
 if exit_code != 0 or report.get('errors'): raise ValueError('Playwright execution failed')
 required_file, required_title = REQUIRED[name]
 records=[]
 def walk(suite):
  for spec in suite.get('specs', []):
   for test in spec.get('tests', []): records.append((spec,test))
  for child in suite.get('suites', []): walk(child)
 for suite in report.get('suites', []): walk(suite)
 if not records: raise ValueError('zero discovered tests')
 counts={'discovered':len(records),'executed':0,'passed':0,'failed':0,'skipped':0}
 identities=[]
 for spec,test in records:
  results=test.get('results', [])
  if any(r.get('status')=='skipped' for r in results) or test.get('expectedStatus')=='skipped': counts['skipped']+=1
  if any(r.get('status') not in ['skipped',None] for r in results): counts['executed']+=1
  passed=(test.get('expectedStatus')=='passed' and test.get('status')=='expected' and len(results)==1 and results[0].get('status')=='passed' and bool(results[0].get('startTime')) and isinstance(results[0].get('duration'),(float,int)))
  if passed: counts['passed']+=1
  else: counts['failed']+=1
  identities.append({'id':spec.get('id'),'file':spec.get('file'),'title':spec.get('title'),'project':test.get('projectName'),'result_statuses':[r.get('status') for r in results],'passed':passed})
 matches=[i for i in identities if pathlib.Path(i['file'] or '').name==required_file and i['title']==required_title and i['project']=='desktop-1440' and i['id'] and i['passed']]
 if len(matches)!=1 or counts != {'discovered':1,'executed':1,'passed':1,'failed':0,'skipped':0}: raise ValueError('required named test not exclusively executed/pass: '+str(counts))
 stats=report.get('stats', {})
 if any(stats.get(k)!=v for k,v in [('expected',1),('unexpected',0),('skipped',0),('flaky',0)]): raise ValueError('report totals disagree')
 return {'passed':True,**counts,'required_tests':matches,'opt_in_active':True}
