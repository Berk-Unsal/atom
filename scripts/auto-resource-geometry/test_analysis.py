"""Safety-focused tests: split isolation, underprediction, grouped repeats and artifact integrity."""
import copy,json,math,pathlib,unittest
import analyze
class EstimatorTests(unittest.TestCase):
 def row(self,domain='train',split='calibration',level='normal',cpu=1):
  return dict(domain=domain,split=split,level=level,rays=120,radius_m=400,frequency_ghz=2.6,cpu_seconds=cpu,geometry=dict(footprints=100,vertices=500,edges=400,vertices_per_km2=500,area_km2=1))
 def test_held_out_cannot_fit(self):
  for row in [self.row(split='held-out'),self.row(level='held-setting')]:
   with self.assertRaisesRegex(ValueError,'contamination'):analyze.fit([row],'cpu_seconds',['vertices'])
 def test_underestimate_uses_actual_as_denominator(self):
  e=analyze.errors([(2,4),(4,2),(3,3)])
  self.assertEqual(e['max_underestimation_fraction'],.5);self.assertEqual(e['max_underestimation_actual_over_predicted'],2);self.assertEqual(e['max_overestimation_fraction'],1);self.assertAlmostEqual(e['underestimate_percent'],100/3)
 def test_zero_work_is_not_a_relative_error_claim(self):
  e=analyze.errors([(1e-9,0)]);self.assertIsNone(e['median_absolute_relative_error']);self.assertEqual(e['zero_actual_count'],1);self.assertEqual(e['max_underestimation_fraction'],0)
 def test_constant_feature_correlation_is_unidentifiable(self):
  self.assertIsNone(analyze.corr([6,6,6],[1,2,3]))
 def test_margin_is_fit_without_held_out_values(self):
  train=[self.row(domain=str(i),cpu=i+1) for i in range(4)]
  model=analyze.fit(train,'cpu_seconds',['rays','vertices']);before=copy.deepcopy(model)
  hold=self.row(split='held-out',cpu=1e9);analyze.errors([(analyze.predict(model,hold),hold['cpu_seconds'])]);self.assertEqual(model,before)
 def test_repeat_spread_and_cv_are_descriptive(self):
  s=analyze.stats([1,2,3,4,5]);self.assertEqual((s['n'],s['min'],s['median'],s['max'],s['spread']),(5,1,3,5,4));self.assertAlmostEqual(s['coefficient_of_variation'],math.sqrt(2)/3)
 def test_collinear_features_do_not_produce_singular_fit(self):
  rows=[self.row(cpu=2) for _ in range(4)];model=analyze.fit(rows,'cpu_seconds',['rays','radius_m','vertices','footprints']);self.assertAlmostEqual(analyze.predict(model,rows[0]),2)

class EvidenceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  p=pathlib.Path(__file__).resolve().parents[2]/'docs/auto-resource-geometry-calibration.json'
  if not p.exists():raise unittest.SkipTest('report not yet generated')
  cls.report=json.loads(p.read_text())
 def test_domains_are_disjoint_and_have_both_splits(self):
  ds=self.report['domain_selection']['selected'];self.assertEqual(len(ds),8)
  for band in ['sparse','medium','dense','very-dense']:self.assertEqual({d['split'] for d in ds if d['band']==band},{'calibration','held-out'})
  for i,a in enumerate(ds):
   for b in ds[i+1:]:
    x,y=a['selection_bounds'],b['selection_bounds'];self.assertFalse(x['minLon']<=y['maxLon'] and x['maxLon']>=y['minLon'] and x['minLat']<=y['maxLat'] and x['maxLat']>=y['minLat'])
 def test_repeated_matrix_and_true_async_overlap(self):
  r=self.report;self.assertEqual(set(r['profiles']),{'A','B','D'})
  for g in r['isolated_groups']:self.assertGreaterEqual(g['repeat_count'],3)
  mixed=[x for x in r['raw_runs'] if x['operation'].startswith('async-')];self.assertEqual(len(mixed),36)
  for x in mixed:self.assertEqual(x['async']['runs'],16);self.assertFalse(x['async']['cache_hit']);self.assertGreater(x['async']['overlap_seconds'],0)
 def test_resource_policy_invariance_and_cancellation(self):
  for p in self.report['profiles'].values():
   policy=p['rf_policy'];self.assertEqual([policy[k] for k in ['global_concurrency','per_client_concurrency','request_attempt_limit','request_window_seconds','request_deadline_seconds','max_cells']],[2,1,20,60,60,6]);self.assertEqual(p['experiments']['configured_workers'],1);self.assertEqual(p['experiments']['queue_capacity'],16)
  cancel=[r for r in self.report['raw_runs'] if r['operation']=='cancel'];self.assertEqual(len(cancel),6)
  for r in cancel:self.assertEqual(r['responses'][1]['status'],200);self.assertEqual(r['responses'][0]['remaining'],'19');self.assertEqual(r['responses'][1]['remaining'],'18')
 def test_heldout_and_parameter_evidence_is_present(self):
  for op in sorted(analyze.ISOLATED):
   m=self.report['models'][op]['cpu_seconds'];
   if op in analyze.NON_RAY_OPERATIONS:self.assertNotIn('rays',m['model']['features'])
   self.assertIsNotNone(m['held_out_domains']);self.assertIsNotNone(m['held_out_settings']);self.assertGreater(m['held_out_settings']['n'],0);self.assertTrue(all('calibration' in d for d in m['model']['training_domains']))
 def test_frozen_observation_only_and_no_oom(self):
  self.assertFalse(self.report['summary']['production_admission_estimator_ready']);self.assertTrue(self.report['summary']['scientific_response_hashes_stable_for_repeats_and_profiles']);self.assertTrue(self.report['summary']['mixed_and_cancel_followup_scientific_hashes_match_isolated'])
  for r in self.report['raw_runs']:self.assertEqual(r['memory_events'].get('oom',0),0);self.assertEqual(r['memory_events'].get('oom_kill',0),0)
if __name__=='__main__':unittest.main()
