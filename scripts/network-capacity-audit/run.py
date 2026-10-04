#!/usr/bin/env python3
"""Gated, disposable backend copy; never patches the production checkout."""
import argparse, json, os, pathlib, shutil, subprocess, time
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--workdir',default='/tmp/atom-network-capacity');args=p.parse_args()
if not args.run: p.error('Explicit --run required for full Ankara measurements')
root=pathlib.Path(__file__).resolve().parents[2];work=pathlib.Path(args.workdir).resolve()
work.mkdir(parents=True,exist_ok=True)
subprocess.run(['node',str(root/'scripts/network-capacity-audit/fixtures.mjs'),str(work/'fixtures')],check=True,stdout=subprocess.DEVNULL)
copy=work/'backend-go';shutil.copytree(root/'backend-go',copy,dirs_exist_ok=True,ignore=shutil.ignore_patterns('*.test','atom','dataset-cache'))
link=work/'data-pipeline'
if not link.exists():link.symlink_to(root/'data-pipeline',target_is_directory=True)
policy=copy/'raytracer/policy_generated.go';text=policy.read_text();old='MaxNetworkTowers                   = 6';assert text.count(old)==1;policy.write_text(text.replace(old,'MaxNetworkTowers                   = 12'))
subprocess.run(['go','test','-c','-o',str(work/'capacity.test')],cwd=copy,check=True)
for n in [6,8,10,12]:
 for freq in [2.6,28]:
  repeats=3 if n in [6,10,12] else 1
  for mode in ['optimize','evaluate','interference']:
   for repeat in range(repeats if mode=='optimize' else 1):
    out=work/'raw'/f'repeat-{repeat+1}';out.mkdir(parents=True,exist_ok=True)
    env={**os.environ,'ATOM_RUN_CAPACITY_AUDIT':'1','ATOM_CAPACITY_FIXTURES':str(work/'fixtures'),'ATOM_CAPACITY_CASE':f'{n}-{freq}','ATOM_CAPACITY_MODE':mode,'ATOM_CAPACITY_OUTPUT':str(out)}
    started=time.monotonic();r=subprocess.run([str(work/'capacity.test'),'-test.run','^TestNetworkCapacityAudit$','-test.v'],cwd=copy,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    (out/f'{n}-{freq}-{mode}.log').write_text(r.stdout)
    print(f'{n} cells / {freq} GHz / {mode} / repeat {repeat+1}: exit={r.returncode}, process={time.monotonic()-started:.3f}s',flush=True)
    if r.returncode:raise SystemExit(r.stdout)
env={**os.environ,'ATOM_RUN_CAPACITY_AUDIT':'1','ATOM_CAPACITY_FIXTURES':str(work/'fixtures'),'ATOM_CAPACITY_CASE':'12-28','ATOM_CAPACITY_MODE':'cancel','ATOM_CAPACITY_OUTPUT':str(work/'raw/repeat-1')}
subprocess.run([str(work/'capacity.test'),'-test.run','^TestNetworkCapacityAudit$','-test.v'],cwd=copy,env=env,check=True)
