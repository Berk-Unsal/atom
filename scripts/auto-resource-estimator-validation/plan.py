#!/usr/bin/env python3
"""Persist manifest, all plans and hashes before any RF execution."""
import hashlib,json,pathlib,random,subprocess
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];W=pathlib.Path('/tmp/atom-resource-locked-validation/geometry')
lock=json.loads((HERE/'validation-lock.json').read_text());source=W/'domains.json';manifest=json.loads(source.read_text());ds=manifest['selected'];assert len(ds)>=8
with (HERE/'domain-manifest.json').open('x') as f:json.dump(manifest,f,indent=2);f.write('\n')
sha=hashlib.sha256((HERE/'domain-manifest.json').read_bytes()).hexdigest();(HERE/'domain-manifest.sha256').write_text(sha+'  domain-manifest.json\n');source.write_bytes((HERE/'domain-manifest.json').read_bytes())
subprocess.run(['node',str(HERE/'fixtures.mjs'),str(W)],check=True)
ops=sorted({m['operation'] for m in lock['estimators'] if m['role']=='candidate'})
plans={}
def fixture(d,f,rf,search='legacy'):return f"{d['id']}-{f}-{rf}--{search}"
def add(ps,d,f,rf,op,search='legacy',n=None):
 for r in range(n or (3 if op in ['optimize','explain','recommendation'] else 5)):ps.append(dict(fixture=fixture(d,f,rf,search),operation=op,repeat=r))
first={band:next(d for d in ds if d['band']==band) for band in ['sparse','medium','dense','very-dense']}
for profile in ['D','A','B']:
 ps=[]
 for i,d in enumerate(ds):
  for f in [2.6,28]:
   for rf in ([x['id'] for x in lock['rf_settings']] if profile=='D' else [lock['rf_settings'][i%2]['id']]):
    for op in (ops if profile=='D' else ['simulate','evaluate','optimize','interference','surface']):
     add(ps,d,f,rf,op)
     if op=='optimize':add(ps,d,f,rf,op,'unseen-multistart')
 for d in [first['sparse'],first['dense']]:
  for op in lock['mixed_load']['scenarios']:add(ps,d,2.6,'r300-r500',op,n=3)
  add(ps,d,2.6,'r300-r500','cancel',n=1)
 random.Random(lock['run_order']['seed']+sum(map(ord,profile))).shuffle(ps);plans[profile]=ps
 for band,d in first.items():
  ps=[];add(ps,d,2.6,'r300-r500','optimize',n=3);plans[f'{profile}-fresh-{band}']=ps
 for band in ['sparse','dense']:
  ps=[]
  for op in ['simulate','interference']:add(ps,first[band],2.6,'r300-r500',op)
  random.Random(lock['run_order']['seed']+2000+sum(map(ord,profile+band))).shuffle(ps);plans[f'{profile}-recorder-{band}']=ps
with (HERE/'run-plans.json').open('x') as f:json.dump(plans,f,indent=2);f.write('\n')
(HERE/'run-plans.sha256').write_text(hashlib.sha256((HERE/'run-plans.json').read_bytes()).hexdigest()+'  run-plans.json\n')
for name,ps in plans.items():(W/f'plans-{name}.json').write_text(json.dumps(ps))
print('domains',len(ds),'domain SHA256',sha,'plans', {k:len(v) for k,v in plans.items()})
