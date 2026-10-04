import hashlib,json,pathlib,unittest
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
class Protocol(unittest.TestCase):
 def test_frozen_models_and_margins(self):
  lock=json.loads((HERE/'validation-lock.json').read_text());prior=json.loads((ROOT/lock['source_artifact']).read_text())
  self.assertEqual(hashlib.sha256((ROOT/lock['source_artifact']).read_bytes()).hexdigest(),lock['source_sha256'])
  for e in lock['estimators']:
   original=prior['models'][e['operation']][e['target']]
   self.assertEqual(e['model'],original['model']);self.assertEqual(e['calibration_only_margin'],original['calibration_only_margin'])
 def test_lock_and_plan_hashes(self):
  for name in ['validation-lock','domain-manifest','run-plans']:
   self.assertEqual(hashlib.sha256((HERE/(name+'.json')).read_bytes()).hexdigest(),(HERE/(name+'.sha256')).read_text().split()[0])
 def test_domain_isolation(self):
  m=json.loads((HERE/'domain-manifest.json').read_text());ds=m['selected'];self.assertGreaterEqual(len(ds),8)
  prior=json.loads((ROOT/'docs/auto-resource-geometry-calibration.json').read_text())['domain_selection']['selected']
  def bounds(d,r):
   import math
   xs=[];ys=[]
   for t in d['towers']:
    x,y=t['coordinates'];dy=r/111320;dx=dy/math.cos(y*math.pi/180);xs.extend([x-dx,x+dx]);ys.extend([y-dy,y+dy])
   return dict(min_lon=min(xs),max_lon=max(xs),min_lat=min(ys),max_lat=max(ys))
  def overlaps(a,b):return a['min_lon']<=b['max_lon'] and a['max_lon']>=b['min_lon'] and a['min_lat']<=b['max_lat'] and a['max_lat']>=b['min_lat']
  priorids={t['cellId'] for d in prior for t in d['towers']}
  for i,d in enumerate(ds):
   self.assertFalse(priorids&{t['cellId'] for t in d['towers']})
   for old in prior:self.assertFalse(overlaps(bounds(d,902),bounds(old,802)))
   for other in ds[:i]:self.assertFalse(overlaps(bounds(d,902),bounds(other,902)))
 def test_repeat_counts(self):
  import collections
  plans=json.loads((HERE/'run-plans.json').read_text())
  for label,ps in plans.items():
   counts=collections.Counter((p['fixture'],p['operation']) for p in ps)
   for (_,op),n in counts.items():self.assertEqual(n,1 if op=='cancel' else 3 if op in ['optimize','explain','recommendation'] or op.startswith('async') else 5)
 def test_no_fitting_import(self):
  for file in ['prepare.py','plan.py','run.py','harness.go.txt']:
   self.assertNotIn('analyze.py',(HERE/file).read_text())

class Evidence(unittest.TestCase):
 def test_production_dismissed_job_run_accounting(self):
  import importlib.util
  spec=importlib.util.spec_from_file_location('locked_analysis',HERE/'analyze.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  jobs=[dict(status='succeeded',completed_runs=64,total_runs=64),dict(status='dismissed',completed_runs=9,total_runs=64),dict(status='dismissed',completed_runs=0,total_runs=64)]
  self.assertEqual(module.job_run_counts(jobs),(73,119))
 def test_prediction_before_results_and_streaming(self):
  import datetime
  w=pathlib.Path('/tmp/atom-resource-locked-validation/geometry')
  if not (w/'environment.json').exists():self.skipTest('measurement logs not present')
  def load(p):return [json.loads(x) for x in p.read_text().splitlines()]
  tested=0
  for path in w.glob('requests-*.jsonl'):
   predictions={r['id']:r for r in load(w/path.name.replace('requests-','predictions-'))}
   for result in load(path):
    pred=predictions[result['id']];a=datetime.datetime.fromisoformat(pred['recorded_at'].replace('Z','+00:00'));b=datetime.datetime.fromisoformat(result['start'].replace('Z','+00:00'))
    self.assertLess(a,b);self.assertGreaterEqual(result['response_bytes'],0)
    if result['status']==200:self.assertIsNotNone(result['server'])
    tested+=1
  self.assertGreater(tested,0)
 def test_error_arithmetic(self):
  import importlib.util
  spec=importlib.util.spec_from_file_location('locked_analysis',HERE/'analyze.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
  m=module.metrics([dict(raw=2,adjusted=4,actual=8,status=200,case={}),dict(raw=4,adjusted=8,actual=2,status=200,case={})])
  self.assertEqual(m['worst_raw_ratio'],4);self.assertEqual(m['worst_post_margin_ratio'],2);self.assertEqual(m['post_margin_underprediction_rate'],.5);self.assertEqual(m['worst_post_margin_shortfall'],.5)
 def test_sustained_evidence_schema(self):
  w=pathlib.Path('/tmp/atom-resource-locked-validation/geometry');files=list(w.glob('async-*.jsonl'))
  if not files:self.skipTest('sustained measurement not started')
  for path in files:
   rows=[json.loads(x) for x in path.read_text().splitlines()];timed=[r for r in rows if 'elapsed_seconds' in r]
   for r in timed:self.assertLessEqual(r['active'],1);self.assertLessEqual(r['queue_depth'],16);self.assertLessEqual(r['submitted'],64)

 def test_preflight_reproducibility_without_rf(self):
  w=pathlib.Path('/tmp/atom-resource-locked-validation/geometry');files=list(w.glob('preflight-*.json'))
  if not files:self.skipTest('preflight measurements absent')
  import collections
  for path in files:
   groups=collections.defaultdict(list)
   for row in json.loads(path.read_text()):groups[(row['domain'],row['radius'],row['cells'],row['kind'])].append(row)
   for rows in groups.values():
    self.assertEqual(len(rows),5)
    self.assertEqual(len({json.dumps([row['footprints'],row['stats']],sort_keys=True) for row in rows}),1)
    self.assertTrue(all(row['wall_seconds']>=0 for row in rows))
 def test_cancellation_charge_and_recovery(self):
  w=pathlib.Path('/tmp/atom-resource-locked-validation/geometry');rows=[]
  for p in w.glob('runs-*.jsonl'):rows.extend(json.loads(x) for x in p.read_text().splitlines())
  canceled=[r for r in rows if r['operation']=='cancel']
  if not canceled:self.skipTest('cancellation cases not yet executed')
  for r in canceled:self.assertEqual(r['responses'][1]['status'],200);self.assertEqual(r['responses'][1]['remaining'],'18')
 def test_actual_geometry_stays_in_locked_domain(self):
  w=pathlib.Path('/tmp/atom-resource-locked-validation/geometry');ds={d['id']:d for d in json.loads((HERE/'domain-manifest.json').read_text())['selected']}
  for path in w.glob('runs-*.jsonl'):
   for line in path.read_text().splitlines():
    r=json.loads(line);a=r['geometry']['bounds'];b=ds[r['domain']]['selection_bounds']
    for key in ['minLon','minLat']:self.assertGreaterEqual(a[key],b[key]-1e-10)
    for key in ['maxLon','maxLat']:self.assertLessEqual(a[key],b[key]+1e-10)
if __name__=='__main__':unittest.main()
