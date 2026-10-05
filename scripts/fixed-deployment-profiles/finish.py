#!/usr/bin/env python3
"""Finish the already authorized local study after serial batches complete."""
import datetime,json,os,pathlib,subprocess,time
from protocol import HERE,ROOT,WORK,load,verify
plans=load(HERE/'run-plans.json');G=WORK/'geometry'
while True:
 env=load(G/'environment.json') if (G/'environment.json').exists() else {'batches':{}}
 completed={k:v for k,v in env['batches'].items() if 'wrapper_exit' in v}
 if any(v['wrapper_exit'] or not v['auto_valid'] for v in completed.values()):raise SystemExit('invalid main batch; preserve evidence, no replacement')
 if len(completed)==len(plans):break
 if subprocess.run(['pgrep','-f','fixed-deployment-profiles/run.py --run'],stdout=subprocess.DEVNULL).returncode:raise SystemExit('main runner ended before completion')
 time.sleep(5)
verify()
subprocess.run(['python3',str(HERE/'supplement_input_audit.py'),'workflow','before'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'workflow-supplement.py'),'--run'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'supplement_input_audit.py'),'workflow','after'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'supplement_input_audit.py'),'surface','before'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'surface-supplement.py'),'--run'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'supplement_input_audit.py'),'surface','after'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'supplement_input_audit.py'),'science','before'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'science-supplement.py'),'--run'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'supplement_input_audit.py'),'science','after'],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'analyze.py')],cwd=ROOT,check=True)
subprocess.run(['python3',str(HERE/'report.py')],cwd=ROOT,check=True)
checks=[('backend_tests',['go','test','./...'],'backend-go'),('backend_race',['go','test','-race','./...'],'backend-go'),('backend_vet',['go','vet','./...'],'backend-go'),('frontend_tests',['npm','test'],'frontend-react'),('frontend_lint',['npm','run','lint'],'frontend-react'),('frontend_build',['npm','run','build'],'frontend-react'),('rf_budget_e2e',['npx','playwright','test','e2e/rf-budget.spec.js','--project=desktop-1440','--workers=1'],'frontend-react'),('rf_deadline_e2e',['npx','playwright','test','e2e/network-deadline.spec.js','--project=desktop-1440','--workers=1'],'frontend-react'),('auto_resource_profile_tests',['go','test','./...','-run','ResourceProfile|AutoResource|RF.*Budget|Cancellation|Cancel|Experiment'],'backend-go'),('scientific_canonicalizer_tests',['go','test','-run','^TestFixedScientificHash$'],'/tmp/atom-resource-fixed-science/backend-go'),('fixed_profile_protocol_and_gate_tests',['python3','-m','unittest','discover','-s','scripts/fixed-deployment-profiles','-p','test_*.py'],''),('geometry_calibration_preservation_tests',['python3','-m','unittest','discover','-s','scripts/auto-resource-geometry','-p','test_*.py'],''),('locked_validation_preservation_tests',['python3','-m','unittest','discover','-s','scripts/auto-resource-estimator-validation','-p','test_*.py'],''),('dataset_validation',['go','run','./cmd/validate-dataset','../data-pipeline'],'backend-go'),('docs_build',['sh','docs/build-reference-pages.sh'],''),('docs_validation',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py'],''),('version_consistency',['python3','scripts/versioning.py','check'],''),('diff_whitespace',['git','diff','--check'],'')]
results={};checkDir=G/'checks';checkDir.mkdir(exist_ok=True)
for name,args,cwd in checks:
 start=time.monotonic();path=checkDir/(name+'.log')
 with path.open('x') as log:code=subprocess.run(args,cwd=ROOT/cwd,stdout=log,stderr=subprocess.STDOUT,env=os.environ|{'ATOM_REAL_E2E':'1'}).returncode
 results[name]={'command':args,'cwd':cwd,'exit_code':code,'seconds':time.monotonic()-start,'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (HERE/'checks.json').write_text(json.dumps(results,indent=2)+'\n')
 print(name,'PASS' if code==0 else 'FAIL',flush=True)
# Include actual final checks in report, then regenerate/validate docs once for changed evidence text.
subprocess.run(['python3',str(HERE/'report.py')],cwd=ROOT,check=True)
for name,args in [('docs_final_build',['sh','docs/build-reference-pages.sh']),('docs_final_validation',['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py']),('final_diff_check',['git','diff','--check'])]:
 path=checkDir/(name+'.log');start=time.monotonic()
 with path.open('x') as log:code=subprocess.run(args,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
 results[name]={'command':args,'cwd':'','exit_code':code,'seconds':time.monotonic()-start}
 (HERE/'checks.json').write_text(json.dumps(results,indent=2)+'\n');print(name,'PASS' if code==0 else 'FAIL',flush=True)
# JSON receives the final check ledger; Markdown already includes every substantive quality command.
p=ROOT/'docs/fixed-deployment-profile-certification.json';r=load(p);r['validation']=results;p.write_text(json.dumps(r,indent=2)+'\n')
print('FINISHED; failed checks:',[k for k,v in results.items() if v['exit_code']],flush=True)
