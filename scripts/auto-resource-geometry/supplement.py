#!/usr/bin/env python3
"""Complete held-out RF-setting coverage for maps, Explain and Azimuth.

This is a separate fresh D process. Never fit or tune from its observations.
"""
import argparse,json,pathlib,shutil,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--workdir',default='/tmp/atom-resource-geometry');p.add_argument('--image',default='atom:auto-profile-calibration');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path(a.workdir).resolve();supp=w.with_name(w.name+'-supplement')
if supp.exists():p.error('supplement directory already exists; use a fresh workdir')
(supp/'geometry').mkdir(parents=True);(supp/'backend-go').mkdir();shutil.copy2(w/'geometry.test',supp/'geometry.test');plans=[]
for domain in ['sparse-held-out','dense-held-out']:
 name=f'{domain}-2.6-held-setting';shutil.copy2(w/'geometry'/f'{name}.json',supp/'geometry'/f'{name}.json')
 for repeat in range(3):
  for op in ['evaluate-maps','optimize-maps','explain','azimuth']:plans.append(dict(fixture=name,operation=op,repeat=repeat))
(supp/'geometry'/'plans-D.json').write_text(json.dumps(plans,indent=2)+'\n')
# The dedicated stage loads the same pack but performs no repeated preflight batches.
(supp/'geometry'/'domains.json').write_text(json.dumps({'selected':[]})+'\n')
subprocess.run(['python3',str(ROOT/'scripts/auto-resource-geometry/run.py'),'--run','--workdir',str(supp),'--profiles','D','--image',a.image],check=True)
