"""Audit must retain failures and reject unsupported qualification claims."""
import copy,hashlib,json,pathlib,sys,tempfile,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
from completion_audit import budget_observation,reconcile_verdict,verify_container
from analyze import required_requests,resource_events,summary
import protocol
from unittest.mock import patch

class AuditTests(unittest.TestCase):
 def test_contract_plan_and_input_tampering_fail_before_execution(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);here=root/'study';here.mkdir();(here/'fixtures').mkdir()
   data={'run-plans.json':b'{}','domain-manifest.json':b'[]','fixtures/f.json':b'{}'}
   for name,body in data.items():(here/name).write_bytes(body)
   (root/'source').write_bytes(b'production');(here/'baseline.json').write_text('{"preserved_sha256":{}}')
   lock={'run_plan_sha256':protocol.sha(here/'run-plans.json'),'domain_manifest_sha256':protocol.sha(here/'domain-manifest.json'),'input_sha256':{'source':protocol.sha(root/'source')},'fixture_sha256':{'fixtures/f.json':protocol.sha(here/'fixtures/f.json')}}
   (here/'qualification-lock.json').write_text(json.dumps(lock));(here/'qualification-lock.sha256').write_text(protocol.sha(here/'qualification-lock.json'))
   with patch.object(protocol,'HERE',here),patch.object(protocol,'ROOT',root):
    self.assertEqual(protocol.verify(),lock)
    for p in [here/'qualification-lock.json',here/'run-plans.json',here/'domain-manifest.json',here/'fixtures/f.json',root/'source']:
     old=p.read_bytes();p.write_bytes(old+b' ')
     with self.assertRaises((AssertionError,ValueError)):protocol.verify()
     p.write_bytes(old)
 def test_observed_rss_summary_retains_higher_followup_counter(self):
  cpu={'throttled_usec':0,'nr_throttled':0,'nr_periods':0}
  row={'operation':'cancel','responses':[],'rss_sampled_max_bytes':10,'cgroup_lifetime_peak_bytes':20,'after_probes':{'rss_bytes':15},'before':{'process_cpu_seconds':0,'cpu':cpu},'after':{'process_cpu_seconds':0,'cpu':cpu}}
  self.assertEqual(summary([row])['peak_RSS_bytes'],15)
 def test_deadline_summary_includes_declared_probes_and_excludes_control_denial(self):
  response=lambda t,status=200:{'status':status,'stream_complete':True,'elapsed_seconds':t}
  rows=[{'operation':'cancel','responses':[response(.1,0)],'slot_probes':[response(44),response(2)]},{'operation':'surface-control','responses':[response(1,400)],'slot_probes':[response(3),response(4)]}]
  result=required_requests(rows);self.assertEqual(result['responses'],4);self.assertEqual(result['HTTP_failures'],0);self.assertEqual(result['minimum_deadline_headroom_seconds'],16)
 def test_cumulative_memory_events_are_not_summed_per_observation(self):
  rows=[{'after_probes':{'memory_events':{'max':1}}},{'after_probes':{'memory_events':{'max':1}}}]
  self.assertEqual(resource_events(rows),{'max':1,'oom':0,'oom_kill':0})
 def test_negative_measurement_is_valid_evidence_but_never_certification(self):
  p={'complete':True,'failure_cases':[{'reasons':['deadline gate']}],'verdict':'NOT CERTIFIED W1'}
  self.assertEqual(reconcile_verdict(p,False,False,True),'NOT CERTIFIED W1')
  p['verdict']='CERTIFIED W1'
  with self.assertRaises(AssertionError):reconcile_verdict(p,False,False,True)
 def test_interruption_or_missing_evidence_prevents_positive_verdict(self):
  p={'complete':True,'failure_cases':[],'verdict':'INVALID / INSUFFICIENT'}
  for methodology,interruption in [(True,False),(False,True)]:self.assertEqual(reconcile_verdict(p,methodology,interruption,True),'INVALID / INSUFFICIENT')
  p['complete']=False;self.assertEqual(reconcile_verdict(p,False,False,True),'INVALID / INSUFFICIENT')
 def test_budget_audit_uses_actual_headers_and_identity(self):
  row={'operation':'cycle','responses':[{'client_ip':'127.10.1.1','remaining':str(n)} for n in range(19,4,-1)],'slot_probes':[{'client_ip':'127.10.1.1','remaining':'4'}]}
  self.assertTrue(budget_observation(row)['passed'])
  bad=copy.deepcopy(row);bad['responses'][7]['client_ip']='127.10.1.2';self.assertFalse(budget_observation(bad)['passed'])
  bad=copy.deepcopy(row);bad['responses'][7]['remaining']='19';self.assertFalse(budget_observation(bad)['passed'])
  bad=copy.deepcopy(row);bad['slot_probes'][0]['remaining']='5';self.assertFalse(budget_observation(bad)['passed'])
 def test_actual_image_and_cgroup_are_required(self):
  shipping={'image_id':'image','binary_sha256':'binary'};profile={'cpus':2,'memory_gib':4}
  inspection={'Image':'image','HostConfig':{'NanoCpus':2_000_000_000,'Memory':4<<30,'MemorySwap':4<<30},'Config':{'User':'atom','Env':['GODEBUG=gctrace=1']}}
  identity={'primary_executable_sha256':'binary','primary_cgroup':'primary','observer_cgroup':'observer','primary_cmdline':'./server '}
  verify_container(inspection,identity,shipping,profile)
  for key,value in [('NanoCpus',4_000_000_000),('Memory',8<<30)]:
   bad=copy.deepcopy(inspection);bad['HostConfig'][key]=value
   with self.assertRaises(AssertionError):verify_container(bad,identity,shipping,profile)
  bad=copy.deepcopy(inspection);bad['Config']['Env'].append('GOMAXPROCS=2')
  with self.assertRaises(AssertionError):verify_container(bad,identity,shipping,profile)
  bad=identity|{'observer_cgroup':'primary'}
  with self.assertRaises(AssertionError):verify_container(inspection,bad,shipping,profile)

if __name__=='__main__':unittest.main()
