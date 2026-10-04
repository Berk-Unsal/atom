#!/usr/bin/env python3
"""Opt-in actual Compose/default and fractional-quota/cpuset diagnostic checks."""
import argparse,json,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--image',default='atom:auto-profile-calibration');p.add_argument('--workdir',default='/tmp/atom-auto-profile');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path(a.workdir);w.mkdir(parents=True,exist_ok=True)
# Image override only; no existing service/container is recreated or reconfigured.
overlay=w/'compose-profile.json';overlay.write_text(json.dumps({'services':{'atom':{'image':a.image}}}))
raw=subprocess.check_output(['docker','compose','-f',str(ROOT/'docker-compose.yml'),'-f',str(overlay),'run','--no-deps','--rm','--name','atom-auto-profile-compose-check','atom','./server','--resource-profile'],text=True)
normal=json.loads(raw);assert normal['cpu']['cgroup_quota_cores']['state']=='unlimited' and normal['memory']['cgroup_limit_bytes']['state']=='unlimited'
matrix=json.loads((w/'matrix.json').read_text());default=matrix['profiles'][-1]['profile'];assert normal['diagnostic_fingerprint']==default['diagnostic_fingerprint'],'normal Compose and Dockerfile-default profile mismatch'
raw=subprocess.check_output(['docker','run','--rm','--cpus','1.5','--cpuset-cpus','0','--memory','2g',a.image,'./server','--resource-profile'],text=True)
fractional=json.loads(raw);cpu=fractional['cpu'];memory=fractional['memory'];assert cpu['cgroup_quota_cores']['value']==1.5 and cpu['cpuset_cpus']['value']==1 and cpu['effective_observed_capacity_cores']['value']==1 and memory['cgroup_limit_bytes']['value']==2*(1<<30)
assert fractional['rf_policy']==normal['rf_policy'] and fractional['experiments']==normal['experiments'] and fractional['dataset']==normal['dataset'],'profiling changed policy or dataset metadata'
result={'detection_image_id':subprocess.check_output(['docker','image','inspect',a.image,'--format','{{.Id}}'],text=True).strip(),'normal_compose_profile':normal,'compose_matches_default_matrix_profile':True,'fractional_quota_cpuset_profile':fractional,'fractional_quota_cores_requested':1.5,'cpuset_requested':'0','memory_gib_requested':2,'exact_detection':True,'policy_and_dataset_unchanged':True,'purpose':'additional detection-only integration; no reduced RF calibration workload'}
(w/'integration.json').write_text(json.dumps(result,indent=2)+'\n');print('normal Compose/default and fractional quota/cpuset integration passed')
