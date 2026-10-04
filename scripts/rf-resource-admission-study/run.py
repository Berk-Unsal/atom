#!/usr/bin/env python3
"""Run a finite ledger in an already prepared disposable backend."""
import argparse,json,os,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--suite',required=True);p.add_argument('--frequencies',default='2.6,28');p.add_argument('--cells',type=int,default=6);p.add_argument('--workdir',default='/tmp/atom-resource-study');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path(a.workdir);out=w/'raw';out.mkdir(exist_ok=True)
for freq in a.frequencies.split(','):
 env={**os.environ,'ATOM_RUN_RESOURCE_STUDY':'1','ATOM_POLICY_WORKDIR':str(w),'ATOM_POLICY_CASE':f'{a.cells}-{freq}','ATOM_POLICY_MODE':a.suite if a.suite in ['endpoints','workflows','semantics','explanations'] else 'resource','ATOM_RESOURCE_PLAN':f'{a.suite}-{freq}'}
 logfile=out/f'{a.cells}-{freq}-{a.suite}.log'
 started=time.time()
 with logfile.open('w') as f:r=subprocess.run([str(w/'resource.test'),'-test.run','^TestRFResourceStudy$','-test.v','-test.timeout=30m'],cwd=w/'backend-go',env=env,stdout=f,stderr=subprocess.STDOUT,timeout=1900)
 print(a.cells,freq,a.suite,r.returncode,round(time.time()-started,2),flush=True)
 if r.returncode:print(logfile.read_text()[-6000:]);raise SystemExit(r.returncode)
