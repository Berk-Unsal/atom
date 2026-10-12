#!/usr/bin/env python3
"""Execute each preregistered batch once; preserve all failures and interruptions."""
import datetime,json,pathlib
from runtime import launch,observe,close
from protocol import HERE,WORK,load,verify,mixed_guard

def execute():
 lock=verify();plans=load(HERE/'run-plans.json');envpath=HERE/'execution.json';execution=load(envpath) if envpath.exists() else {'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'batches':{}}
 for label in lock['batch_order']:
  verify()
  if label in execution['batches']:
   if execution['batches'][label].get('exit_code')==0:continue
   raise ValueError('existing nonterminal/failed batch; inspect its original handle; never restart: '+label)
  profile=label.split('-')[0]
  if '-mixed-' in label:
   observations={l:[json.loads(line) for line in (WORK/l/'runs.jsonl').read_text().splitlines()] for l in plans if '-single-' in l and (WORK/l/'runs.jsonl').exists()}
   proof=mixed_guard(plans,observations,profile);proof['verified_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();(HERE/('mixed-guard-'+profile+'.json')).write_text(json.dumps(proof,indent=2)+'\n')
  cid,follow,log=launch(label,profile)
  execution['batches'][label]={'container_id':cid,'started_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'auto_valid':True,'external_valid':True}
  envpath.write_text(json.dumps(execution,indent=2)+'\n');print('BEGIN',label,len(plans[label]),flush=True)
  try:code=observe(label,cid)
  finally:close(cid,follow,log)
  execution['batches'][label].update({'exit_code':code,'finished_at':datetime.datetime.now(datetime.timezone.utc).isoformat()});envpath.write_text(json.dumps(execution,indent=2)+'\n')
  if code:raise ValueError('observer batch failed; preserve evidence: '+label)
  verify();print('DONE',label,flush=True)
 execution['finished_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();envpath.write_text(json.dumps(execution,indent=2)+'\n')
if __name__=='__main__':execute()
