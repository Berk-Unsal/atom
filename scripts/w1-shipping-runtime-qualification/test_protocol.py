import copy,hashlib,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
import client,protocol
class Gates(unittest.TestCase):
 def test_scientific_precision_and_exact_exclusion(self):
  a=b'{"results":[9007199254740993,1e-99],"diagnostics":{"elapsed_ms":1,"selection_rule":"a"}}'
  b=a.replace(b'"elapsed_ms":1',b'"elapsed_ms":999')
  self.assertEqual(client.canonical(a),client.canonical(b))
  for old,new in [(b'9007199254740993',b'9007199254740992'),(b'1e-99',b'2e-99'),(b'"a"',b'"b"')]:self.assertNotEqual(client.canonical(a),client.canonical(a.replace(old,new)))
  with self.assertRaises(ValueError):client.canonical(b'{"diagnostics":{}}')
 def test_http_headroom_stream_clock_and_completion(self):
  r={'status':200,'stream_complete':True,'server_completion_observed':True,'elapsed_seconds':45,'clock_discontinuity':False}
  self.assertTrue(protocol.complete_request(r))
  for key,value in [('elapsed_seconds',45.0001),('status',504),('stream_complete',False),('server_completion_observed',False),('clock_discontinuity',True)]:
   bad=r|{key:value};self.assertFalse(protocol.complete_request(bad))
 def test_memory_boundaries(self):
  row={'after_probes':{'cgroup_peak_bytes':75,'memory_events':{}}};self.assertTrue(protocol.memory(row,100));row['after_probes']['cgroup_peak_bytes']=76;self.assertFalse(protocol.memory(row,100))
  for key in ['oom','oom_kill','max']:
   row={'after_probes':{'cgroup_peak_bytes':75,'memory_events':{key:1}}};self.assertFalse(protocol.memory(row,100))
 def test_exact_mixed_baselines(self):
  plans={'A-single-0':[{'fixture':'dense-28-W1','operation':'optimize','repeat':i} for i in range(5)],'A-mixed-0':[{'fixture':'dense-28-W1','operation':'two-optimizers','repeat':0}]}
  rows={'A-single-0':[dict(c,plan_index=i) for i,c in enumerate(plans['A-single-0'])]};self.assertTrue(protocol.mixed_guard(plans,rows,'A'))
  for field,value in [('fixture','other-W1'),('operation','evaluate'),('repeat',9)]:
   bad=copy.deepcopy(rows);bad['A-single-0'][0][field]=value
   with self.assertRaises((ValueError,AssertionError)):protocol.mixed_guard(plans,bad,'A')
  with self.assertRaises(ValueError):protocol.mixed_guard(plans,{'A-single-0':rows['A-single-0'][:4]},'A')
 def test_final_tail_cannot_pass_queue_only(self):
  response={'start':'2026-10-05T00:00:30Z','end':'2026-10-05T00:00:31Z'}
  job={'job_id':'j','status':'running','cache_hit':False,'completed_runs':1,'total_runs':64}
  row={'responses':[response],'extra':{'launches':[{'job':job}]}}
  evidence={'errors':[],'drain_barrier_pass':True,'sustained':False,'final_jobs':[job|{'status':'succeeded','started_at':'2026-10-05T00:00:00Z','finished_at':'2026-10-05T00:00:29Z'}]}
  self.assertTrue(protocol.background_failures(row,evidence))
  evidence['final_jobs'][0]['finished_at']='2026-10-05T00:00:32Z';self.assertEqual(protocol.background_failures(row,evidence),[])
  row['extra']['launches'][0]['job']['status']='accepted';self.assertTrue(protocol.background_failures(row,evidence))
if __name__=='__main__':unittest.main()

class ShippingAndControlTests(unittest.TestCase):
 def test_exact_prior_fixture_and_domain_identity(self):
  h=protocol.HERE;prior=protocol.ROOT/'scripts/fixed-deployment-profiles'
  self.assertEqual(protocol.sha(h/'domain-manifest.json'),protocol.sha(prior/'domain-manifest.json'))
  manifest=protocol.load(prior/'certification-lock.json')
  fixtures=list((h/'fixtures').glob('*.json'));self.assertEqual(len(fixtures),16)
  for p in fixtures:
   self.assertEqual(protocol.sha(p),manifest['fixture_sha256'][p.name])
   f=protocol.load(p);self.assertEqual((f['level'],f['rays'],f['radius'],f['n']),('W1',120,400,6))
 def test_shipping_identity_and_go_defaults_are_required(self):
  import runtime
  p=protocol.WORK/'precheck-C-sparse-26'/'auto.json'
  if not p.exists():self.skipTest('no live shipping Auto evidence')
  good=protocol.load(p);runtime.auto_validate(good,{'cpus':8,'memory_gib':10})
  for section,key,value in [('runtime','go_version','go1.27.1'),('dataset','version','other'),('experiments','configured_workers',2),('rf_policy','global_concurrency',3)]:
   bad=copy.deepcopy(good);bad[section][key]=value
   with self.assertRaises(AssertionError):runtime.auto_validate(bad,{'cpus':8,'memory_gib':10})
  for section,key in [('cpu','effective_observed_capacity_cores'),('memory','effective_observed_limit_bytes')]:
   bad=copy.deepcopy(good);bad[section][key]['unknown_sources']=['unverified ancestor']
   with self.assertRaises(AssertionError):runtime.auto_validate(bad,{'cpus':8,'memory_gib':10})
  metadata=(protocol.WORK/'shipping-build-metadata.txt').read_text()
  for token in ['go1.26.6','CGO_ENABLED=0','GOARCH=arm64','GOOS=linux']:self.assertIn(token,metadata)
 def fixture_row(self,operation):
  r={'status':200,'stream_complete':True,'server_completion_observed':True,'elapsed_seconds':.1,'clock_discontinuity':False,'start':'2026-10-05T00:00:00Z','end':'2026-10-05T00:00:01Z','remaining':'19'}
  return {'operation':operation,'responses':[r.copy()],'slot_probes':[r|{'remaining':'18'},r.copy()],'after_probes':{'cgroup_peak_bytes':75,'memory_events':{}}}
 def test_surface_control_requires400_and_exact_body(self):
  row=self.fixture_row('surface-control');row['responses'][0].update(status=400,sha256='d07a3fb2f912c180fdb5f8b5f5a081e1b0368585e9e14dd6e01ba3b6f3d80d25')
  self.assertTrue(protocol.numerical(row,100))
  for field,value in [('status',422),('sha256','wrong'),('stream_complete',False)]:
   bad=copy.deepcopy(row);bad['responses'][0][field]=value;self.assertFalse(protocol.numerical(bad,100))
 def test_cancellation_charge_and_release_are_not_optional(self):
  row=self.fixture_row('cancel');row['responses'][0].update(status=0,release_observation_seconds=.01)
  self.assertTrue(protocol.numerical(row,100))
  for field,value in [('release_observation_seconds',2.001),('elapsed_seconds',1),('server_completion_observed',False)]:
   bad=copy.deepcopy(row);bad['responses'][0][field]=value;self.assertFalse(protocol.numerical(bad,100))
  row['slot_probes'][0]['remaining']='19';self.assertFalse(protocol.numerical(row,100))
 def test_twenty_attempts_then_twentyfirst_denial(self):
  row=self.fixture_row('budget');base=row['responses'][0];row['responses']=[base|{'remaining':str(n)} for n in range(19,-1,-1)]+[base|{'status':429,'remaining':'0'}]
  self.assertTrue(protocol.numerical(row,100));row['responses'][-1]['status']=200;self.assertFalse(protocol.numerical(row,100))
 def test_completed_precheck_has_actual_tail_and_drain(self):
  import precheck
  p=protocol.HERE/'producer-precheck.json'
  if not p.exists():self.skipTest('precheck not completed yet')
  record=protocol.load(p)
  if (protocol.HERE/'qualification-lock.json').exists():self.assertTrue(record['all_complete'])
  for case in record['cases']:
   folder=protocol.WORK/case['label']
   if not (folder/'client.py').exists():continue
   proof=precheck.verify_case(folder);self.assertTrue(proof['pass']);self.assertTrue(proof['final_tail_began_inside_actual_job']);self.assertLess(proof['submitted'],1024)

class HarnessRegressionTests(unittest.TestCase):
 def test_job_handoff_uses_actual_execution_not_stale_readiness_id(self):
  ready={'job_id':'old','status':'running','cache_hit':False,'completed_runs':1,'total_runs':64}
  response={'start':'2026-10-05T00:00:30Z','end':'2026-10-05T00:00:31Z'}
  row={'responses':[response],'extra':{'launches':[{'job':ready}]}}
  jobs=[ready|{'status':'succeeded','started_at':'2026-10-05T00:00:00Z','finished_at':'2026-10-05T00:00:29Z'},ready|{'job_id':'new','status':'succeeded','started_at':'2026-10-05T00:00:29.001Z','finished_at':'2026-10-05T00:00:32Z'}]
  evidence={'errors':[],'drain_barrier_pass':True,'sustained':False,'final_jobs':jobs}
  self.assertEqual(protocol.background_failures(row,evidence),[])
  row['responses'][0]['start']='2026-10-05T00:00:29.000500Z'
  self.assertTrue(protocol.background_failures(row,evidence),'a genuine no-worker gap must still fail')
 def test_linux_log_rotation_is_not_missing_handler_completion(self):
  import datetime,json,os,tempfile
  from unittest.mock import patch
  class Response:
   status=200
   def getheader(self,name):return '19'
   def read(self,n):
    if getattr(self,'done',False):return b''
    self.done=True;return b'{}'
  with tempfile.TemporaryDirectory() as tmp:
   log=pathlib.Path(tmp)/'server-json.log';log.write_text('{"log":"older line","time":"2026-01-01T00:00:00Z"}\n')
   class Connection:
    sock=None
    def __init__(self,*args,**kw):pass
    def connect(self):pass
    def request(self,*args):
     log.rename(log.with_name(log.name+'.1'))
     log.write_text(json.dumps({'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'log':'[GIN] 2026/10/05 | 200 | 1ms | 127.10.0.1 | POST "/api/simulate"'})+'\n')
    def getresponse(self):return Response()
    def close(self):pass
   with patch.dict(os.environ,{'W1_PRIMARY_ID':'unit-test'}),patch.object(client.http.client,'HTTPConnection',Connection):
    tr=client.Transport('unit');tr.serverlog=log;r,_=tr.request('/api/simulate',{},'127.10.0.1')
   self.assertTrue(r['server_completion_observed']);self.assertLess(r['release_observation_seconds'],2)
 def test_producer_behavior_proof_ignores_independent_workflow_builders(self):
  import precheck,tempfile
  with tempfile.TemporaryDirectory() as tmp:
   p=pathlib.Path(tmp)/'client.py';p.write_text((protocol.HERE/'client.py').read_text());before=precheck.behavior(p)
   p.write_text(p.read_text()+'\ndef unrelated_workflow_builder():return 1\n')
   self.assertEqual(precheck.behavior(p),before)
   p.write_text(p.read_text().replace('self.submitted<1024','self.submitted<64'))
   self.assertNotEqual(precheck.behavior(p),before)
