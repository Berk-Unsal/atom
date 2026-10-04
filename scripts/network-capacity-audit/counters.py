#!/usr/bin/env python3
import pathlib,shutil,subprocess,os,json
root=pathlib.Path(__file__).resolve().parents[2];work=pathlib.Path('/tmp/atom-network-capacity');copy=work/'backend-go'
shutil.copy2(root/'backend-go/network_capacity_audit_test.go',copy/'network_capacity_audit_test.go');subprocess.run(['go','test','-c','-o',str(work/'capacity.test')],cwd=copy,check=True)
out=work/'counters';out.mkdir(exist_ok=True)
for n in [6,8,10,12]:
 for freq in [2.6,28]:
  f=json.loads((work/f'fixtures/{n}-{freq}.json').read_text());o=json.loads((work/f'raw/repeat-1/{n}-{freq}-optimizeoptimize-network.response.json').read_text());solution=next(x for x in o['pareto_frontier'] if x['id']==o['optimization']['recommended_solution_id'])
  f['explanation']={'run_id':o.get('optimization_run_id',''),'solution_id':solution['id'],'cell_id':f['network']['towers'][0]['id'],'baseline':o['baseline'],'solution':solution,'optimization':f['network']['optimization'],'optimization_domain':o['optimization_domain']}
  case=f'{n}-{freq}-explanation'; (work/f'fixtures/{case}.json').write_text(json.dumps(f,separators=(',',':')))
  for mode in ['optimize','explain']:
   case_name=case if mode=='explain' else f'{n}-{freq}'
   env={**os.environ,'ATOM_RUN_CAPACITY_AUDIT':'1','ATOM_CAPACITY_FIXTURES':str(work/'fixtures'),'ATOM_CAPACITY_CASE':case_name,'ATOM_CAPACITY_MODE':mode,'ATOM_CAPACITY_OUTPUT':str(out)}
   r=subprocess.run([str(work/'capacity.test'),'-test.run','^TestNetworkCapacityAudit$'],cwd=copy,env=env,capture_output=True,text=True);(out/f'{n}-{freq}-{mode}.log').write_text(r.stdout+r.stderr)
   if r.returncode:raise SystemExit(r.stdout+r.stderr)
   if mode=='explain':
    for path in out.glob(f'{case}-explain*'):path.rename(out/path.name.replace(case,f'{n}-{freq}',1))
   if mode=='optimize':
    measured=json.loads((out/f'{n}-{freq}-optimize.metrics.json').read_text())['rows'][0];baseline=json.loads((work/f'raw/repeat-1/{n}-{freq}-optimize.metrics.json').read_text())['rows'][0];assert measured['response_sha256']==baseline['response_sha256'];print(n,freq,measured['pareto_states_before_limit'],measured['feasible_archive'],flush=True)
