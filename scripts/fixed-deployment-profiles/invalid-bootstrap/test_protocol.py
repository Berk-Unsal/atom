import copy,json,pathlib,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from protocol import eligible,assert_mixed_references,required_baselines,sha,load,HERE

class CertificationContractTests(unittest.TestCase):
 def test_lock_digest_and_gates(self):
  if not (HERE/'certification-lock.json').exists():self.skipTest('pre-freeze')
  self.assertEqual(sha(HERE/'certification-lock.json'),(HERE/'certification-lock.sha256').read_text().split()[0])
  lock=load(HERE/'certification-lock.json');g=lock['gates']
  self.assertEqual(g['request_wall_max_seconds']+g['deadline_headroom_min_seconds'],60)
  self.assertEqual(g['memory_peak_max_fraction_of_hard_limit'],.75)
  self.assertTrue(g['no_early_stopping'] if 'no_early_stopping' in g else lock['no_early_stopping'])
 def test_every_mixed_reference_is_planned_before_mixed(self):
  if not (HERE/'run-plans.json').exists():self.skipTest('pre-freeze')
  plans=load(HERE/'run-plans.json');fake={label:[{'plan_index':i} for i in range(len(rows))] for label,rows in plans.items()}
  self.assertEqual(set(map(tuple,assert_mixed_references(plans,fake))),required_baselines(plans))
  fake={label:[] for label in plans}
  with self.assertRaises(ValueError):assert_mixed_references(plans,fake)
 def test_wrong_domain_frequency_rf_search_or_profile_cannot_supply_reference(self):
  plans={'A-single-0':[{'fixture':'dense-28-W1','operation':'optimize','repeat':r} for r in range(5)],'B-mixed-0':[{'fixture':'dense-28-W1','operation':'two-optimizers','repeat':0}]}
  fake={'A-single-0':[{'plan_index':i} for i in range(5)]}
  with self.assertRaises(ValueError):assert_mixed_references(plans,fake)
  plans['A-mixed-0']=plans.pop('B-mixed-0')
  self.assertTrue(assert_mixed_references(plans,fake))
  for fixture in ['sparse-28-W1','dense-2.6-W1','dense-28-W2','dense-28-W2-alt']:
   p=copy.deepcopy(plans);p['A-mixed-0'][0]['fixture']=fixture
   with self.assertRaises(ValueError):assert_mixed_references(p,fake)
 def test_missing_repeat_cannot_be_averaged_away(self):
  plans={'A-single-0':[{'fixture':'dense-28-W1','operation':'evaluate','repeat':r} for r in range(5)],'A-mixed-0':[{'fixture':'dense-28-W1','operation':'async-evaluate','repeat':0}]}
  with self.assertRaises(ValueError):assert_mixed_references(plans,{'A-single-0':[{'plan_index':i} for i in range(4)]})
 def test_detected_floor_requires_all_known_evidence(self):
  known=lambda v:{'state':'known','value':v}
  dataset={'id':'ankara','version':'2026.07','sha256':{'buildings':'abc'},'footprints':123,'vertices':456,'cells':6}
  auto={'mode':'auto','environment':'container','cgroup_version':'v2','cpu':{'effective_observed_capacity_cores':known(4)},'memory':{'cgroup_limit_bytes':known(8<<30),'effective_observed_limit_bytes':known(8<<30)},'runtime':{'os':'linux','arch':'arm64'},'rf_policy':{'global_concurrency':2,'per_client_concurrency':1,'request_attempt_limit':20,'request_window_seconds':60,'request_deadline_seconds':60,'max_cells':6},'experiments':{'configured_workers':1,'queue_capacity':16},'dataset':{'state':'known','id':'ankara','version':'2026.07','sha256':{'buildings':'abc'},'indexed_footprint_count':123,'total_polygon_vertices':456,'inventory_cell_count':6}}
  profile={'cpus':4,'memory_gib':8}
  self.assertTrue(eligible(auto,profile,dataset))
  for section,key in [('cpu','effective_observed_capacity_cores'),('memory','cgroup_limit_bytes'),('memory','effective_observed_limit_bytes')]:
   for replacement in [{'state':'unknown','value':None},{'state':'unlimited','value':None},{'state':'known','value':100<<30,'unknown_sources':['ancestor']}]:
    bad=copy.deepcopy(auto);bad[section][key]=replacement;self.assertFalse(eligible(bad,profile,dataset))
  bad=copy.deepcopy(auto);bad['memory']['cgroup_limit_bytes']=known(4<<30);self.assertFalse(eligible(bad,profile,dataset))
  bad=copy.deepcopy(auto);bad['dataset']['indexed_footprint_count']=None;self.assertFalse(eligible(bad,profile,dataset))
  bad=copy.deepcopy(auto);bad['rf_policy']['global_concurrency']=1;self.assertFalse(eligible(bad,profile,dataset))
  self.assertFalse(eligible(auto,{'cpus':None,'memory_gib':None},dataset))

if __name__=='__main__':unittest.main()
