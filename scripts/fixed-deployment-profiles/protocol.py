"""Read-only certification guards and descriptive resource-floor eligibility."""
import hashlib,json,pathlib
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
WORK=pathlib.Path('/tmp/atom-resource-fixed-certification')
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def load(path): return json.loads(path.read_text())
def lines(path): return [json.loads(x) for x in path.read_text().splitlines()] if path.exists() else []
def verify():
 lock=load(HERE/'certification-lock.json')
 for name in ['certification-lock','domain-manifest','run-plans']:
  if sha(HERE/(name+'.json'))!=(HERE/(name+'.sha256')).read_text().split()[0]: raise ValueError(name+' mutated')
 for relative,digest in lock['input_sha256'].items():
  if sha(ROOT/relative)!=digest: raise ValueError('frozen input changed: '+relative)
 if sha(WORK/'geometry'/'certification-lock.json')!=sha(HERE/'certification-lock.json'): raise ValueError('runtime lock copy changed')
 if sha(WORK/'fixed.test')!=lock['binary_sha256']: raise ValueError('measurement binary changed')
 for relative,digest in lock['fixture_sha256'].items():
  if sha(WORK/'geometry'/relative)!=digest: raise ValueError('fixture changed: '+relative)
 return lock

def eligible(auto,profile,dataset,runtime_evidence=None):
 """Design/test-only matcher: unknown evidence never satisfies a resource floor."""
 if profile['cpus'] is None: return False
 runtime_known=auto.get('environment')=='container' or (auto.get('environment')=='unknown' and runtime_evidence is not None and runtime_evidence.get('environment')=='container' and runtime_evidence.get('source')=='docker inspect')
 def known(signal,floor):
  return signal.get('state')=='known' and not signal.get('unknown_sources') and signal.get('value') is not None and signal['value']>=floor
 expected={'global_concurrency':2,'per_client_concurrency':1,'request_attempt_limit':20,'request_window_seconds':60,'request_deadline_seconds':60,'max_cells':6}
 return (auto.get('mode')=='auto' and runtime_known and auto.get('cgroup_version')=='v2'
  and known(auto['cpu']['effective_observed_capacity_cores'],profile['cpus'])
  and known(auto['memory']['cgroup_limit_bytes'],profile['memory_gib']*(1<<30))
  and known(auto['memory']['effective_observed_limit_bytes'],profile['memory_gib']*(1<<30))
  and auto['runtime']['os']=='linux' and auto['runtime']['arch']=='arm64'
  and all(auto['rf_policy'].get(k)==v for k,v in expected.items())
  and auto['experiments']['configured_workers']==1 and auto['experiments']['queue_capacity']==16
  and auto['dataset'].get('state')=='known'
  and all(auto['dataset'].get(k)==dataset[k] for k in ['id','version','sha256'])
  and auto['dataset'].get('indexed_footprint_count')==dataset['footprints']
  and auto['dataset'].get('total_polygon_vertices')==dataset['vertices']
  and auto['dataset'].get('inventory_cell_count')==dataset['cells'])

def required_baselines(plans):
 needed=set()
 for label,cases in plans.items():
  profile=label.split('-')[0]
  if '-mixed-' not in label:continue
  for case in cases:
   op=case['operation']
   operations=['optimize'] if op in ['two-optimizers','async-optimize','sustained-optimize'] else ['evaluate'] if op in ['two-evaluates','async-evaluate','sustained-evaluate'] else ['optimize','evaluate']
   needed.update((profile,case['fixture'],v) for v in operations)
 return needed

def assert_mixed_references(plans,rows,profile=None):
 needed={k for k in required_baselines(plans) if profile is None or k[0]==profile}
 available={}
 for label,cases in plans.items():
  if '-single-' not in label:continue
  for row in rows.get(label,[]):
   index=row['plan_index']
   if index>=len(cases): raise ValueError('unexpected plan index')
   case=cases[index]
   key=(label.split('-')[0],case['fixture'],case['operation'])
   available.setdefault(key,set()).add(case['repeat'])
 missing={key for key in needed if len(available.get(key,set()))<5}
 if missing:raise ValueError('missing five matching isolated repeats: '+repr(sorted(missing)))
 return sorted(needed)
