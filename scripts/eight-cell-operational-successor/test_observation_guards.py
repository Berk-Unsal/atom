"""Counterexamples for unchanged cancellation, memory and completion gates."""
import copy,json,unittest
import protocol
from analyze import group_failures
from e2e_guard import verify_execution
class ObservationGuardTests(unittest.TestCase):
 def response(self, start='2026-10-07T00:00:00Z', end='2026-10-07T00:00:01Z'):
  return {'status':200,'stream_complete':True,'server_completion_observed':True,'elapsed_seconds':1,'clock_discontinuity':False,'start':start,'end':end,'remaining':'18'}
 def cancel(self):
  response=self.response();response.update(status=0,elapsed_seconds=.1,release_observation_seconds=.02)
  return {'operation':'cancel','responses':[response],'slot_probes':[self.response(),self.response()],'after_probes':{'cgroup_peak_bytes':1<<30,'memory_events':{'oom':0,'oom_kill':0,'max':0}}}
 def test_cancel_release_and_attempt_charging(self):
  row=self.cancel();self.assertEqual(group_failures(row),[])
  for value in [2.001,5]:
   failed=copy.deepcopy(row);failed['responses'][0]['release_observation_seconds']=value
   self.assertTrue(group_failures(failed))
  failed=copy.deepcopy(row);failed['slot_probes'][0]['remaining']='19';self.assertTrue(group_failures(failed))
 def test_cancel_does_not_hide_missing_completion_or_slot(self):
  for target in ['responses','slot_probes']:
   row=self.cancel();row[target][0]['server_completion_observed']=False;self.assertTrue(group_failures(row))
  row=self.cancel();row['slot_probes'][1]['start']='2026-10-07T00:00:02Z';row['slot_probes'][1]['end']='2026-10-07T00:00:03Z';self.assertTrue(group_failures(row))
 def test_lifetime_memory_and_events(self):
  row=self.cancel();row['after_probes']['cgroup_peak_bytes']=3<<30;self.assertEqual(group_failures(row),[])
  row['after_probes']['cgroup_peak_bytes']+=1;self.assertTrue(group_failures(row))
  for key in ['oom','oom_kill','max']:
   row=self.cancel();row['after_probes']['memory_events'][key]=1;self.assertTrue(group_failures(row))
 def test_request_gate_is_complete_stream_and_longer_elapsed(self):
  row=self.response();row['elapsed_seconds']=45;self.assertTrue(protocol.complete_request(row))
  for key,value in [('elapsed_seconds',45.001),('stream_complete',False),('server_completion_observed',False),('clock_discontinuity',True),('status',500)]:
   failed={**row,key:value};self.assertFalse(protocol.complete_request(failed))
 def test_real_playwright_artifacts_prove_named_execution(self):
  records=protocol.load(protocol.HERE/'baseline-checks.json')
  for name in ['rf_budget_e2e','rf_deadline_e2e']:
   record=records[name];report=protocol.load(protocol.WORK/('baseline-'+name+'.playwright.json'))
   proof=verify_execution(name,report,record['test_environment'],record['exit_code'])
   self.assertEqual({k:proof[k] for k in ['discovered','executed','passed','failed','skipped']},{'discovered':1,'executed':1,'passed':1,'failed':0,'skipped':0})
if __name__=='__main__':unittest.main()
