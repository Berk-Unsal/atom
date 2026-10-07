"""Final fail-closed validation without rerunning RF."""
import hashlib,json,pathlib,re,tarfile
from e2e_guard import REQUIRED,verify_execution
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-bounded-followup-policy')
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def complete():
 lock=load(HERE/'implementation-lock.json');assert sha(HERE/'implementation-lock.json')==(HERE/'implementation-lock.sha256').read_text().split()[0]
 assert sha(HERE/'baseline.json')==lock['baseline_sha256']
 report=load(ROOT/'docs/bounded-followup-policy-implementation.json');assert report['status']=='COMPLETE' and len(report['required_final_items'])==116 and [p['phase'] for p in report['phase_coverage']]==list(range(84)) and all(p['status']=='COMPLETE' for p in report['phase_coverage'])
 assert len(report['checks'])==13 and all(r['exit_code']==0 for r in report['checks'].values())
 for name in REQUIRED:
  row=report['checks'][name];p=pathlib.Path(row['stdout_path']);assert sha(p)==row['stdout_sha256'];verify_execution(name,load(p),row['environment'],row['exit_code'])
 inv=load(HERE/'invariance.json')
 for category in ['preserved_artifact_hashes','science_policy_dataset_hashes']:
  for name,digest in inv[category].items():assert sha(ROOT/name)==digest,name
 assert (ROOT/'VERSION').read_text().strip()=='0.11.0'
 binary=load(HERE/'binary-differential.json');assert len(binary['source_differences'])==1 and binary['source_differences'][0]['path']=='backend-go/raytracer/policy_generated.go'
 for name,digest in binary['production_source_sha256'].items():assert sha(ROOT/name)==digest,name
 assert re.search(r'MaxNetworkTowers\s*=\s*6\b',(ROOT/'backend-go/raytracer/policy_generated.go').read_text())
 for n,step in [(6,40),(8,51)]:
  folder=WORK/f'policy-{n}-r4';summary=load(folder/'summary.json');assert [summary[k] for k in ['discovered','executed','passed','skipped']]==[16,16,16,0]
  assert summary['scientific_missing']==[] and summary['scientific_matches']==(640 if n==6 else 800)
  assert summary['worst_success_seconds']<=45 and summary['peak_cgroup_bytes']<=3<<30 and all(summary['final_counters']['events'][k]==0 for k in ['oom','oom_kill','max'])
  identity=load(folder/'process-identity.json');assert identity['exe_sha256']==binary['images']['standard' if n==6 else 'audit']['binary_sha256']
  rows=load(folder/'requests.json')
  for i in range(16):
   flow=rows[i*step:i*step+3*n+4];assert len(flow)==3*n+4 and all(r['status']==200 for r in flow)
   assert flow[-1]['headers']['ratelimit-remaining']==('6' if n==6 else '0') and flow[-1]['headers']['rf-followup-remaining']=='0'
   if n==8:assert rows[i*step+28]['status']==429
  assert load(folder/'critical-cases.json')['skipped']==0
 sat=load(HERE/'saturation.json');g=lock['state_memory_gate'];assert sat['go_heap_peak_increment_bytes']<=g['incremental_heap_alloc_max_bytes'] and sat['rss_increment_bytes']<=g['incremental_RSS_max_bytes'] and int(sat['cgroup_peak_bytes'])<=g['cgroup_peak_max_bytes']
 assert sat['clients']==4096 and sat['workflows']==sat['heap_entries']==114688 and sat['runtime']=='go1.26.6' and sat['GOOS']=='linux' and sat['GOARCH']=='arm64' and sat['gomaxprocs']==2
 assert load(WORK/'extra-normal/extra-summary.json')['passed']
 manifest=load(HERE/'evidence-manifest.json');assert sha(HERE/'evidence-manifest.json')==(HERE/'evidence-manifest.sha256').read_text().split()[0]
 for row in manifest['artifacts']:
  p=WORK/row['path'];assert p.stat().st_size==row['byte_size'] and sha(p)==row['sha256'],row['path']
 archive=pathlib.Path(manifest['archive']['path']);assert sha(archive)==manifest['archive']['sha256']
 with tarfile.open(archive) as tar:
  for row in manifest['artifacts']:
   data=tar.extractfile(row['path']).read();assert len(data)==row['byte_size'] and hashlib.sha256(data).hexdigest()==row['sha256']
 value={'status':'COMPLETE','verdict':'A — VALIDATED — READY FOR NORMAL RELEASE','implementation_lock_sha256':sha(HERE/'implementation-lock.json'),'phases':84,'required_final_items':116,'preserved_tracked_files':len(inv['preserved_artifact_hashes']),'science_policy_dataset_files':len(inv['science_policy_dataset_hashes']),'raw_artifacts':len(manifest['artifacts']),'archive':manifest['archive'],'normal_cells':6,'VERSION':'0.11.0','next_minor':'0.12.0','promotion_performed':False,'publish_performed':False,'next_action':'Separate Product Cell Cap Promotion6→8 in frozen scope'}
 (HERE/'completion-audit.json').write_text(json.dumps(value,indent=2)+'\n');print(json.dumps(value))
if __name__=='__main__':complete()
