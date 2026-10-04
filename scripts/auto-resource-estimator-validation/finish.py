#!/usr/bin/env python3
"""Finish reports/checks only after the sequential runner terminates."""
import argparse,json,os,pathlib,subprocess,time
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];G=pathlib.Path('/tmp/atom-resource-locked-validation/geometry')
p=argparse.ArgumentParser();p.add_argument('--runner-pid',type=int,required=True);a=p.parse_args()
while True:
 try:os.kill(a.runner_pid,0)
 except ProcessLookupError:break
 time.sleep(30)
for filename in ['analyze.py','report.py','final-checks.py','report.py']:
 result=subprocess.run(['python3',str(HERE/filename)],cwd=ROOT)
 if result.returncode:raise SystemExit(result.returncode)
# Final quality results changed report source: regenerate and verify those pages.
checks={}
for name,cmd in [('docs_final_build',['sh','docs/build-reference-pages.sh']),('docs_final_validation',[os.environ.get('ATOM_DOCS_PYTHON','python3'),'docs/validate_docs.py']),('final_diff_check',['git','diff','--check'])]:
 with (G/(name+'.log')).open('x') as log:code=subprocess.run(cmd,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
 checks[name]={'status':'PASS' if code==0 else 'FAIL','exit_code':code};print(name,checks[name]['status'],flush=True)
(G/'completion-checks.json').write_text(json.dumps(checks,indent=2)+'\n')
(G/'FINISHED').write_text('Measurement runner exited; reports and checks completed. Root must inspect classification, omissions and checks.\n')
