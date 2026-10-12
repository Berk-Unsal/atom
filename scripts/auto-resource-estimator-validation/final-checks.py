#!/usr/bin/env python3
"""Run final quality checks once evidence/report are complete; keep every outcome."""
import json,os,pathlib,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];G=pathlib.Path('/tmp/atom-resource-locked-validation/geometry')
checks=[('backend_tests',['go','test','./...'],'backend-go'),('backend_race',['go','test','-race','./...'],'backend-go'),('backend_vet',['go','vet','./...'],'backend-go'),('frontend_tests',['npm','test','--','--maxWorkers=2'],'frontend-react'),('frontend_lint',['npm','run','lint'],'frontend-react'),('frontend_build',['npm','run','build'],'frontend-react'),('rf_budget_e2e',['npx','playwright','test','e2e/rf-budget.spec.js','--project=desktop-1440','--workers=1'],'frontend-react'),('rf_deadline_e2e',['npx','playwright','test','e2e/network-deadline.spec.js','--project=desktop-1440','--workers=1'],'frontend-react'),('geometry_calibration_tests',['python3','-m','unittest','discover','-s','scripts/auto-resource-geometry','-p','test_*.py'],''),('locked_validation_tests',['python3','-m','unittest','discover','-s','scripts/auto-resource-estimator-validation','-p','test_*.py'],''),('docs_build',['sh','docs/build-reference-pages.sh'],''),('docs_validation',[os.environ.get('ATOM_DOCS_PYTHON','python3'),'docs/validate_docs.py'],''),('version_check',['python3','scripts/versioning.py','check'],''),('diff_check',['git','diff','--check'],'')]
out={}
for name,cmd,cwd in checks:
 env=os.environ|({'ATOM_REAL_E2E':'1'} if name.endswith('e2e') else {})
 with (G/('final-check-'+name+'.log')).open('x') as log:code=subprocess.run(cmd,cwd=ROOT/cwd,env=env,stdout=log,stderr=subprocess.STDOUT).returncode
 out[name]={'status':'PASS' if code==0 else 'FAIL','exit_code':code,'command':cmd,'log':str(G/('final-check-'+name+'.log'))};print(name,out[name]['status'],flush=True)
(G/'final-checks.json').write_text(json.dumps(out,indent=2)+'\n')
report=ROOT/'docs/auto-resource-estimator-locked-validation.json';data=json.loads(report.read_text());data['validation']=out;report.write_text(json.dumps(data,indent=2)+'\n')
