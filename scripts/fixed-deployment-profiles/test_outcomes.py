import pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from analyze import numerical_pass,cancellation_pass,async_pass,concurrent_overlap

class OutcomeGateTests(unittest.TestCase):
 def row(self):
  return {'operation':'evaluate','responses':[{'status':200,'server_done':True,'wall_seconds':45,'start':'2026-10-05T10:00:00Z','end':'2026-10-05T10:00:01Z'}],'cgroup_lifetime_peak_bytes':3<<30,'memory_events':{'oom':0,'oom_kill':0,'max':0},'slots_after':0,'active_clients_after':0}
 def test_frozen_deadline_and_memory_boundaries(self):
  gates={'request_wall_max_seconds':45,'memory_peak_max_fraction_of_hard_limit':.75}
  r=self.row();self.assertTrue(numerical_pass(r,4<<30,gates))
  r['responses'][0]['wall_seconds']=45.001;self.assertFalse(numerical_pass(r,4<<30,gates))
  r=self.row();r['cgroup_lifetime_peak_bytes']+=1;self.assertFalse(numerical_pass(r,4<<30,gates))
  for status in [429,504,0]:
   r=self.row();r['responses'][0]['status']=status;self.assertFalse(numerical_pass(r,4<<30,gates))
 def test_clock_interruption_cannot_pass_using_shorter_monotonic_timer(self):
  r=self.row();r['responses'][0].update(wall_seconds=3,end='2026-10-05T10:10:00Z')
  self.assertFalse(numerical_pass(r,4<<30,{'request_wall_max_seconds':45,'memory_peak_max_fraction_of_hard_limit':.75}))
 def test_oom_and_leak_cannot_be_averaged_away(self):
  gates={'request_wall_max_seconds':45,'memory_peak_max_fraction_of_hard_limit':.75}
  for field in ['oom','oom_kill','max']:
   r=self.row();r['memory_events'][field]=1;self.assertFalse(numerical_pass(r,4<<30,gates))
  r=self.row();r['slots_after']=1;self.assertFalse(numerical_pass(r,4<<30,gates))
 def test_cancel_requires_charging_completion_and_same_other_client_followups(self):
  r=self.row();r.update(operation='cancel',cancel_client_attempts=2)
  r['responses']=[{'status':0,'server_done':True,'wall_seconds':.1,'release_seconds':.01},{'status':200},{'status':200}]
  gates={'cancellation_release_max_seconds':2};self.assertTrue(cancellation_pass(r,gates))
  r['cancel_client_attempts']=1;self.assertFalse(cancellation_pass(r,gates))
  r['cancel_client_attempts']=2;r['responses'][0]['release_seconds']=2.01;self.assertFalse(cancellation_pass(r,gates))
 def test_background_submission_is_not_sustained_compute_evidence(self):
  r=self.row();data={'initial_active':True,'submission_failures':0,'jobs':[],'samples':[{'at':'2026-10-05T10:00:00.500Z','elapsed_seconds':.5,'active':1},{'at':'2026-10-05T10:00:02Z','elapsed_seconds':2,'active':0}],'sustained':True,'duration_seconds':30}
  self.assertFalse(async_pass(r,data,{}))
  data['samples'][1]['active']=1;self.assertTrue(async_pass(r,data,{}))
  data['submission_failures']=1;self.assertFalse(async_pass(r,data,{}))
 def test_tail_request_outside_background_work_cannot_be_excluded(self):
  r=self.row();r['responses']=[{'start':'2026-10-05T10:00:31Z','end':'2026-10-05T10:00:32Z'}]
  data={'initial_active':True,'submission_failures':0,'jobs':[{'cache_hit':False,'status':'succeeded','started_at':'2026-10-05T10:00:00Z','finished_at':'2026-10-05T10:00:30.5Z','completed_runs':64}],'samples':[{'at':'2026-10-05T10:00:01Z','elapsed_seconds':1,'active':1}],'finished_at':'2026-10-05T10:00:32Z','sustained':True,'duration_seconds':32}
  self.assertFalse(async_pass(r,data,{}))
 def test_concurrent_must_overlap(self):
  r=self.row();r['responses'].append({'start':'2026-10-05T10:00:00.5Z','end':'2026-10-05T10:00:02Z'})
  self.assertTrue(concurrent_overlap(r));r['responses'][1]['start']='2026-10-05T10:00:01Z';self.assertFalse(concurrent_overlap(r))

if __name__=='__main__':unittest.main()
