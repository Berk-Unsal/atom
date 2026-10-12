"""Fail-closed final promotion audit from retained raw evidence and source identities."""
import datetime,hashlib,json,pathlib,re,subprocess,importlib.util
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-eight-cell-product-cap-promotion')
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def audit():
 lock=load(HERE/'promotion-lock.json');base=load(HERE/'baseline.json');checks=load(HERE/'checks.json');q=load(HERE/'qualification.json')
 assert sha(HERE/'promotion-lock.json')==(HERE/'promotion-lock.sha256').read_text().split()[0]
 assert sha(HERE/'baseline.json')==lock['baseline_sha256'] and sha(WORK/'request.md')==lock['request_sha256']
 assert len(lock['phases'])==37 and len(checks)==14 and all(r['exit_code']==0 for r in checks.values())
 for name,r in checks.items():
  assert sha(pathlib.Path(r['stdout_path']))==r['stdout_sha256'],name
  if name.endswith('e2e'):
   g=r['execution_guard'];assert all(g[k]==1 for k in ['discovered','executed','passed']) and g['failed']==g['skipped']==0 and g['opt_in_active']
 assert load(HERE/'contracts.json')['passed']
 assert (ROOT/'VERSION').read_text().strip()=='0.12.0';subprocess.run(['python3','scripts/versioning.py','check'],cwd=ROOT,check=True)
 build=load(HERE/'shipping-build.json');old=load(WORK/'qualified-0.11-shipping-build.json');assert build['VERSION']=='0.12.0' and build['source_sha256']==old['source_sha256'] and not build['audit_override'] and build['normal_product_cap']==8
 assert sha(WORK/'server')==build['binary_sha256']
 final=load(WORK/'final-0.12-verified/final-smoke.json');assert final['passed'] and final['scientific_matches']==28 and final['VERSION']=='0.12.0' and final['F28_accounting']==[20,8,0,0] and final['post29_denied']
 assert load(WORK/'final-0.12-verified/process-identity.json')['exe_sha256']==build['binary_sha256']
 assert load(WORK/'normal-eight/process-identity.json')['exe_sha256']==old['binary_sha256']
 assert sha(ROOT/'scripts/eight-cell-operational-successor/domain-manifest.json')==lock['domain_manifest_sha256']
 fixtures=sorted(p for p in (WORK/'fixtures').glob('*-8C-W1.json') if not p.name.startswith('historical-continuity'));assert len(fixtures)==16
 for p in fixtures:
  assert sha(p)==sha(pathlib.Path('/tmp/atom-bounded-followup-policy')/'fixtures'/p.name)
 rows=[json.loads(l) for l in (WORK/'normal-eight/requests.jsonl').read_text().splitlines()];frozen=load(WORK/'frozen-science.json');matrix=rows[:16*51];assert len(matrix)==816
 for i in range(16):
  group=matrix[i*51:(i+1)*51];flow=group[:28];assert all(r['status']==200 for r in flow) and group[28]['status']==429
  assert flow[-1]['headers']['ratelimit-remaining']=='0' and flow[-1]['headers']['rf-followup-remaining']=='0'
  assert [r['endpoint'] for r in flow]==['/api/evaluate-network']+['/api/simulate']*8+['/api/interference','/api/evaluate-network']+['/api/simulate']*8+['/api/optimize-network']+['/api/simulate']*8
 good=[r for r in matrix if r['status']==200];assert len(good)==800
 for r in good:assert frozen[r['endpoint']+' '+r['request_sha256']]==r['response_sha256']
 # Independently confirm endpoint payload identity against every frozen fixture.
 for i,p in enumerate(fixtures):
  f=load(p);body=json.dumps(f['network'],separators=(',',':'),ensure_ascii=False).encode();assert matrix[i*51]['request_sha256']==hashlib.sha256(body).hexdigest()
 allrows=rows+[json.loads(l) for l in (WORK/'promotion-extra/requests.jsonl').read_text().splitlines()]+[json.loads(l) for l in (WORK/'final-0.12-verified/requests.jsonl').read_text().splitlines()]
 for r in allrows:
  assert r['after']['cgroup_peak_bytes']<=3<<30 and all(r['after']['events'][k]==0 for k in ['max','oom','oom_kill'])
  if r['status']==200:assert r['elapsed_seconds']<=45 and r['deadline_headroom_seconds']>=15
 spec=importlib.util.spec_from_file_location('qualified_protocol',ROOT/'scripts/w1-shipping-runtime-qualification/protocol.py');protocol=importlib.util.module_from_spec(spec);spec.loader.exec_module(protocol)
 extra=q['supplemental'];assert extra['passed'] and extra['scientific_explanation_building_matches']==32
 cap=extra['cap_results'];assert len([r for r in cap if r['cells']==9 and r['status']==400])==80
 for name,count,accept in [('/api/recommend-sites',5,True),('/api/recommend-sites',6,False),('/api/recommend-sites',8,False),('/api/measurements/evaluate',6,True),('/api/measurements/evaluate',7,False),('/api/measurements/evaluate',8,False)]:assert any(r['endpoint']==name and r['cells']==count and r['status']==(200 if accept else 400) for r in cap)
 for m in extra['mixed']:
  assert all(r['status']==200 and r['stream_complete'] and r['server_completion_observed'] and r['elapsed_seconds']<=45 for r in m['responses'])
  if m['operation'].startswith(('async','sustained')):
   assert m['qualified_guard_failures']==[] and protocol.background_failures(m,load(WORK/m['extra']['background_file']))==[]
  else:
   pairs=m['responses'];assert max(datetime.datetime.fromisoformat(r['start']) for r in pairs)<min(datetime.datetime.fromisoformat(r['end']) for r in pairs)
 cancel=load(WORK/'final-cancellation/cancellation-check.json');assert cancel['passed'] and cancel['same_client_after_cancel'] and cancel['other_client_after_cancel'] and cancel['holds_released']
 assert load(WORK/'normal-eight/critical-cases.json')['skipped']==0
 presentation=load(WORK/'presentation.json')['stats'];assert presentation['expected']==8 and presentation['skipped']==presentation['unexpected']==0
 assert len(list((WORK/'presentation').glob('*.png')))==18
 assert '439 passed' in (WORK/'frontend_tests.log').read_text()
 preserved={p:s for p,s in base['sha256'].items() if any(p.startswith(prefix) for prefix in lock['historical_prefixes'])}
 for p,s in preserved.items():assert sha(ROOT/p)==s,p
 invariant=load(HERE/'invariance.json');assert invariant['verified']
 for p,s in invariant['policy_persistence_builders_sha256'].items():assert sha(ROOT/p)==s,p
 assert q['cases']==q['passed']==16 and q['required_calls']==448 and q['skipped']==0 and q['scientific_matches']==800
 changed=[p for p,s in base['sha256'].items() if (ROOT/p).exists() and sha(ROOT/p)!=s]
 evidence={0:['baseline.json','promotion-lock.json'],1:['cap-inventory.txt','contracts.json'],2:['contracts.json'],3:['contracts.json','qualification.json'],4:['backend_tests','contracts.json'],5:['contracts.json','docs_validation'],6:['frontend_tests','product_e2e'],7:['presentation.json','product_e2e'],8:['frontend_tests','invariance.json'],9:['qualification.json','invariance.json'],10:['final-0.12-verified/auto.json'],11:['shipping-build.json'],12:['qualification.json'],13:['qualification.json','contracts.json'],14:['frontend_tests','product_e2e'],15:['qualification.json'],16:['qualification.json'],17:['normal-eight/requests.jsonl'],18:['fixtures/','promotion-lock.json'],19:['qualification.json','final-0.12-verified/final-smoke.json'],20:['qualification.json'],21:['qualification.json'],22:['final-cancellation/cancellation-check.json'],23:['qualification.json','frozen-science.json'],24:['backend_tests','contracts.json'],25:['normal-eight/requests.jsonl','invariance.json'],26:['frontend_tests','invariance.json'],27:['frontend_tests','productCap.test.js'],28:['docs_validation','invariance.json'],29:['CHANGELOG.md'],30:['version_consistency','shipping-build.json'],31:['backend_tests','backend_race'],32:['frontend_tests'],33:['rf_budget_e2e','rf_deadline_e2e','bounded_six_e2e','product_e2e'],34:list(checks)+['contracts.json'],35:['qualification.json','checks.json'],36:['VERSION','promotion-lock.json','invariance.json']}
 result={'status':'COMPLETE','verdict':'A — PROMOTED — READY FOR 0.12.0 RELEASE','audited_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'promotion_lock_sha256':sha(HERE/'promotion-lock.json'),'normal_cap':8,'VERSION':'0.12.0','checks':len(checks),'frontend_tests':439,'real_e2e':{'discovered':4,'executed':4,'passed':4,'skipped':0},'presentation_tests':8,'frozen_cases':16,'F28_calls':448,'matrix_scientific_matches':800,'supplemental_scientific_matches':32,'final_image_scientific_matches':28,'preserved_historical_files':len(preserved),'changed_from_promotion_baseline':changed,'phase_evidence':[{'phase':p['phase'],'title':p['title'],'status':'COMPLETE','evidence':evidence[p['phase']]} for p in lock['phases']],'final_shipping':build,'final_smoke':final,'cancellation':cancel,'methodology':q['methodology'],'scope':lock['scope'],'tag':False,'publish':False,'push':False}
 (HERE/'completion-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['status','verdict','checks','frozen_cases','preserved_historical_files']}))
if __name__=='__main__':audit()
