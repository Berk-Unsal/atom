#!/usr/bin/env python3
"""Reproducible fast closure gates, retaining exact exit status and logs."""
import json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path(__file__).resolve().parent
PY='/tmp/atom-v0121-audit-py312/bin/python'
checks=[('docs-build',['sh','docs/build-reference-pages.sh']),('docs-validation',[PY,'docs/validate_docs.py']),('classification',[sys.executable,'docs/classify_docs.py']),('claims',[PY,'docs/validate_claims.py','--inventory',str(OUT/'current-language-inventory.json')]),('docs-tests',[PY,'-m','unittest','discover','-s','docs','-p','*_test.py']),('openapi-validation',[PY,'docs/validate_openapi.py']),('version',[sys.executable,'scripts/versioning.py','check']),('policy',[sys.executable,'scripts/generate_policy.py','--check']),('policy-tests',[sys.executable,'-m','unittest','discover','-s','scripts','-p','generate_policy_test.py']),('invariance',[sys.executable,str(OUT/'verify_invariance.py')]),('diff-check',['git','diff','--check'])]
results=[]
for name,cmd in checks:
 with (OUT/'logs'/f'{name}.log').open('w') as f:r=subprocess.run(cmd,cwd=ROOT,stdout=f,stderr=subprocess.STDOUT)
 results.append({'gate':name,'command':cmd,'exit_code':r.returncode,'status':'PASS' if r.returncode==0 else 'FAIL','log':str((OUT/'logs'/f'{name}.log').relative_to(ROOT))})
 print(name,r.returncode,flush=True)
 if r.returncode:break
(OUT/'final-checks.json').write_text(json.dumps(results,indent=2)+'\n')
assert len(results)==len(checks) and all(x['exit_code']==0 for x in results)
