#!/usr/bin/env python3
import pathlib,json,subprocess,os,shutil
root=pathlib.Path(__file__).resolve().parents[2];work=pathlib.Path('/tmp/atom-network-capacity');copy=work/'backend-go'
shutil.copy2(root/'backend-go/network_capacity_audit_test.go',copy/'network_capacity_audit_test.go')
subprocess.run(['go','test','-c','-o',str(work/'capacity.test')],cwd=copy,check=True)
for n in [6,8,10,12]:
 for freq in [2.6,28]:
  for mode in ['evaluate','interference']:
   out=work/'followup';out.mkdir(exist_ok=True)
   env={**os.environ,'ATOM_RUN_CAPACITY_AUDIT':'1','ATOM_CAPACITY_FIXTURES':str(work/'fixtures'),'ATOM_CAPACITY_CASE':f'{n}-{freq}','ATOM_CAPACITY_MODE':mode,'ATOM_CAPACITY_OUTPUT':str(out)}
   subprocess.run([str(work/'capacity.test'),'-test.run','^TestNetworkCapacityAudit$'],cwd=copy,env=env,check=True,stdout=subprocess.DEVNULL)
 f=json.loads((work/f'fixtures/{n}-28.json').read_text());o=json.loads((work/f'raw/repeat-1/{n}-28-optimizeoptimize-network.response.json').read_text())
 for sim,tower in zip(f['simulations'],o['optimized_towers']):sim['azimuth']=tower['optimal_azimuth']
 (work/f'fixtures/{n}-28-opt.json').write_text(json.dumps(f))
 out=work/'optimized-rays';out.mkdir(exist_ok=True)
 env={**os.environ,'ATOM_RUN_CAPACITY_AUDIT':'1','ATOM_CAPACITY_FIXTURES':str(work/'fixtures'),'ATOM_CAPACITY_CASE':f'{n}-28-opt','ATOM_CAPACITY_MODE':'evaluate','ATOM_CAPACITY_OUTPUT':str(out)}
 subprocess.run([str(work/'capacity.test'),'-test.run','^TestNetworkCapacityAudit$'],cwd=copy,env=env,check=True,stdout=subprocess.DEVNULL)
 print(f'follow-up outputs collected: {n}',flush=True)
for n in [6,8,10,12]:
 out=work/'workflow';out.mkdir(exist_ok=True)
 env={**os.environ,'ATOM_RUN_CAPACITY_AUDIT':'1','ATOM_CAPACITY_FIXTURES':str(work/'fixtures'),'ATOM_CAPACITY_CASE':f'{n}-28','ATOM_CAPACITY_MODE':'workflow','ATOM_CAPACITY_OUTPUT':str(out)}
 subprocess.run([str(work/'capacity.test'),'-test.run','^TestNetworkCapacityAudit$'],cwd=copy,env=env,check=True,stdout=subprocess.DEVNULL)
subprocess.run(['node',str(root/'scripts/network-capacity-audit/artifacts.mjs'),str(work)],cwd=root,check=True)
