#!/usr/bin/env python3
"""Non-scoring bounded producer proof before qualification freeze."""
import ast,datetime,hashlib,json,pathlib,shutil,sys
from runtime import HERE,WORK,launch,observe,close
from protocol import load,sha,stamp,preserved
CASES=[('C','sparse-certification-1-2.6-W1.json'),('C','sparse-certification-1-28-W1.json'),('C','dense-certification-1-2.6-W1.json'),('C','dense-certification-1-28-W1.json'),('A','sparse-certification-1-2.6-W1.json')]
def behavior(path):
 tree=ast.parse(path.read_text());nodes=[]
 for node in tree.body:
  if isinstance(node,ast.ClassDef) and node.name=='Background':nodes.append(node)
  if isinstance(node,ast.ClassDef) and node.name=='Transport':
   for method in node.body:
    if isinstance(method,ast.FunctionDef) and method.name in ['ip','api']:nodes.append(method)
    if isinstance(method,ast.FunctionDef) and method.name=='request':
     # Producer API requests have completion=False. Linux log witnessing is
     # independently smoke-tested and is not producer sizing/availability behavior.
     prefix=[]
     for statement in method.body:
      if isinstance(statement,ast.If) and isinstance(statement.test,ast.Name) and statement.test.id=='completion':break
      prefix.append(statement)
     method.body=prefix;nodes.append(method)
 return hashlib.sha256(ast.dump(ast.Module(body=nodes,type_ignores=[]),include_attributes=False).encode()).hexdigest()
def verify_case(folder):
 result=load(folder/'precheck-result.json');data=load(folder/'producer-precheck.json')
 samples=data['samples'];fraction=sum(s['active'] for s in samples)/len(samples)
 j=result['tail_witness']['job'];r=result['tail']
 covers=any(not final.get('cache_hit') and final.get('started_at') and final.get('finished_at') and stamp(final['started_at'])<=stamp(r['start'])<stamp(final['finished_at']) and min(stamp(r['end']),stamp(final['finished_at']))>max(stamp(r['start']),stamp(final['started_at'])) for final in data['final_jobs'])
 assert 1<=j['completed_runs']<=j['total_runs']//2

 assert result['pass'] and data['drain_barrier_pass'] and not data['errors'] and data['submitted']<1024 and fraction>=.95 and covers
 assert r['status']==200 and r['stream_complete'] and r['server_completion_observed']
 assert len([s for s in samples if s['elapsed_seconds']>=180])>0
 return {'pass':True,'label':folder.name,'duration_seconds':data['duration_seconds'],'submitted':data['submitted'],'active_sample_fraction':fraction,'final_tail_began_inside_actual_job':covers,'source_sha256':load(folder/'observer-source.json'),'producer_behavior_sha256':behavior(folder/'client.py'),'raw_sha256':sha(folder/'producer-precheck.json')}
def main():
 if (HERE/'qualification-lock.json').exists():raise ValueError('no protocol prechecks after freeze')
 preserved();results=[]
 for profile,fixture in CASES:
  label='producer-v3-'+profile+'-'+fixture.removesuffix('-W1.json');folder=WORK/label
  if folder.exists():
   # Resume only a terminal complete precheck; missing results are not permission to restart it.
   if not (folder/'precheck-result.json').exists():raise ValueError('precheck result missing; inspect original live handle before any restart: '+label)
  else:
   cid,follow,log=launch(label,profile)
   try:
    (folder/'observer-source.json').write_text(json.dumps({p.name:sha(p) for p in [HERE/'client.py',HERE/'runtime.py',HERE/'protocol.py']},indent=2)+'\n')
    for source in [HERE/'client.py',HERE/'runtime.py',HERE/'protocol.py']:shutil.copyfile(source,folder/source.name)
    code=observe(label,cid,True,fixture)
    if code:raise ValueError('precheck observer failed: '+str(code))
   finally:close(cid,follow,log)
  result=verify_case(folder);results.append(result);print(label,'PASS',result['submitted'],'submissions',flush=True)
  (HERE/'producer-precheck.json').write_text(json.dumps({'non_scoring':True,'qualification_started':False,'all_complete':len(results)==len(CASES),'planned':len(CASES),'cases':results,'verified_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},indent=2)+'\n')
 preserved()
if __name__=='__main__':main()
