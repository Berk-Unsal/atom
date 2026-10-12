#!/usr/bin/env python3
"""Predeclared fractional matrix, shared settings and deterministic repeat order."""
import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--workdir',default='/tmp/atom-resource-geometry');a=p.parse_args();w=pathlib.Path(a.workdir)/'geometry'
domains=json.loads((w/'domains.json').read_text())['selected']
canonical=['simulate','evaluate','evaluate-maps','optimize','optimize-maps','interference','explain','azimuth','surface','building-entry','recommendation']
expensive={'optimize','optimize-maps','explain','recommendation'}
for profile in ['A','B','D']:
 selected=domains if profile=='D' else [d for d in domains if d['split']=='calibration' and d['band'] in ['sparse','dense']]
 ops=canonical if profile=='D' else ['simulate','evaluate','evaluate-maps','optimize','optimize-maps','interference']
 freqs=[2.6,28] if profile=='D' else [2.6]
 plans=[]
 def add(d,freq,level,op,repeat):plans.append(dict(fixture=f"{d['id']}-{freq}-{level}",operation=op,repeat=repeat))
 for repeat in range(5):
  for d in selected[repeat%len(selected):]+selected[:repeat%len(selected)]:
   for freq in freqs:
    for op in ops:
     if repeat< (3 if op in expensive else 5):add(d,freq,'normal',op,repeat)
 # Workload settings are fit only on normal/rays/radius calibration domains;
 # every held-setting case is reserved, even on calibration locations.
 if profile=='D':
  for repeat in range(3):
   for d in domains:
    if d['band'] in ['sparse','dense']:
     for level in ['rays','radius','held-setting']:
      for op in ['simulate','evaluate','optimize','interference','surface','building-entry','recommendation']:
       add(d,2.6,level,op,repeat)
 # Repeated contention uses the same sparse/dense calibration locations on all profiles.
 for repeat in range(3):
  for d in domains:
   if d['split']=='calibration' and d['band'] in ['sparse','dense']:
    for op in ['async-optimize','async-evaluate','two-optimizers','optimize-evaluate']:add(d,2.6,'normal',op,repeat)
 for d in domains:
  if d['split']=='calibration' and d['band'] in ['sparse','dense']:add(d,2.6,'normal','cancel',0)
 (w/f'plans-{profile}.json').write_text(json.dumps(plans,indent=2)+'\n')
 print(profile,len(plans),'plans')
