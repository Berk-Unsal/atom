"""Qualification gates and completeness guards; fail closed on missing evidence."""
import datetime,hashlib,json,pathlib
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-w1-shipping-qualification')
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stamp(v):return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
def preserved():
 for name,digest in load(HERE/'baseline.json')['preserved_sha256'].items():
  if sha(ROOT/name)!=digest:raise ValueError('historical evidence changed: '+name)

def verify():
 lock=load(HERE/'qualification-lock.json')
 assert sha(HERE/'qualification-lock.json')==(HERE/'qualification-lock.sha256').read_text().split()[0]
 assert sha(HERE/'run-plans.json')==lock['run_plan_sha256']
 assert sha(HERE/'domain-manifest.json')==lock['domain_manifest_sha256']
 for relative,digest in lock['input_sha256'].items():
  if sha(ROOT/relative)!=digest:raise ValueError('frozen input changed: '+relative)
 for relative,digest in lock['fixture_sha256'].items():assert sha(HERE/relative)==digest
 preserved();return lock

def complete_request(r,max_elapsed=45):
 return r['status']==200 and r['stream_complete'] and r.get('server_completion_observed') and r['elapsed_seconds']<=max_elapsed and not r['clock_discontinuity']
def overlap(requests):return len(requests)==2 and min(stamp(r['end']) for r in requests)>max(stamp(r['start']) for r in requests)
def slots(row):return all(complete_request(r) for r in row['slot_probes']) and overlap(row['slot_probes'])
def memory(row,limit):
 p=row['after_probes'];return p['cgroup_peak_bytes']<=limit*.75 and all(p['memory_events'].get(k,0)==0 for k in ['oom','oom_kill','max'])
def baseline_requirements(plans):
 needed=set()
 for label,cases in plans.items():
  if '-mixed-' not in label:continue
  for c in cases:
   operations=['optimize'] if c['operation'] in ['two-optimizers','async-optimize','sustained-optimize'] else ['evaluate'] if c['operation'] in ['two-evaluates','async-evaluate','sustained-evaluate'] else ['optimize','evaluate']
   needed.update((label.split('-')[0],c['fixture'],op) for op in operations)
 return needed

def mixed_guard(plans,observations,profile):
 available={}
 for label,rows in observations.items():
  if '-single-' not in label or label.split('-')[0]!=profile:continue
  for row in rows:
   case=plans[label][row['plan_index']]
   assert row['fixture']==case['fixture'] and row['operation']==case['operation'] and row['repeat']==case['repeat']
   if case['operation'] in ['evaluate','optimize']:
    key=(profile,case['fixture'],case['operation']);available.setdefault(key,set()).add(case['repeat'])
 missing=[key for key in baseline_requirements(plans) if key[0]==profile and len(available.get(key,set()))!=5]
 if missing:raise ValueError('missing five exact isolated reference repeats: '+repr(sorted(missing)))
 return {'profile':profile,'required_keys':[list(k) for k in sorted(baseline_requirements(plans)) if k[0]==profile],'passed':True}

def background_failures(row,evidence):
 failures=[];responses=row['responses'];launches=row['extra']['launches']
 if evidence['errors']:failures.extend(evidence['errors'])
 if not evidence['drain_barrier_pass']:failures.append('actual worker drain barrier failed')
 jobs={j['job_id']:j for j in evidence['final_jobs']}
 if any(j.get('cache_hit') or j['status']=='failed' for j in jobs.values()):failures.append('cached or failed background work')
 if len(launches)!=len(responses):failures.append('missing launch witness')
 for i,(r,witness) in enumerate(zip(responses,launches)):
  j=witness['job']
  if j['status']!='running' or j['cache_hit'] or not 1<=j['completed_runs']<=j['total_runs']//2:failures.append(f'no ready computing worker with reserved work at request {i} launch')
  start,end=stamp(r['start']),stamp(r['end'])
  actual=[candidate for candidate in jobs.values() if not candidate.get('cache_hit') and candidate.get('started_at') and candidate.get('finished_at') and stamp(candidate['started_at'])<=start<stamp(candidate['finished_at'])]
  if not actual:failures.append(f'request {i} began outside ALL actual background execution intervals');continue
  if not any(min(end,stamp(job['finished_at']))>max(start,stamp(job['started_at'])) for job in actual):failures.append(f'no actual background interval overlap for request {i}')
 if evidence['sustained']:
  samples=[s for s in evidence['samples'] if s['elapsed_seconds']<=30]
  if evidence['duration_seconds']<30:failures.append('duration below30seconds')
  if not samples or sum(s['active'] for s in samples)/len(samples)<.95:failures.append('first30second active samples below95percent')
  if len(responses)<2 or stamp(responses[-1]['start'])-stamp(responses[0]['start'])<30:failures.append('missing final interactive call at/after30seconds')
 return failures

def numerical(row,limit):
 rs=row['responses']
 if row['operation']=='surface-control':http=len(rs)==1 and rs[0]['status']==400 and rs[0]['stream_complete'] and rs[0]['server_completion_observed'] and rs[0]['sha256']=='d07a3fb2f912c180fdb5f8b5f5a081e1b0368585e9e14dd6e01ba3b6f3d80d25'
 elif row['operation']=='budget':http=len(rs)==21 and all(complete_request(r) for r in rs[:20]) and rs[20]['status']==429 and rs[20]['stream_complete'] and rs[20]['server_completion_observed'] and rs[20]['remaining']=='0' and [r['remaining'] for r in rs[:20]]==[str(i) for i in range(19,-1,-1)]
 elif row['operation']=='cancel':
  r=rs[0];http=r['status']==0 and r['server_completion_observed'] and r['elapsed_seconds']<1 and r['release_observation_seconds']<=2 and row['slot_probes'][0]['remaining']=='18'
 else:http=bool(rs) and all(complete_request(r) for r in rs)
 return http and memory(row,limit) and slots(row)
