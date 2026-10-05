"""Verify supplemental execution copies against the unchanged main preregistration."""
import argparse,datetime,json,pathlib
from protocol import HERE,WORK,load,sha,verify
FOLDERS={'workflow':'/tmp/atom-resource-fixed-explanation','surface':'/tmp/atom-resource-fixed-surface','science':'/tmp/atom-resource-fixed-science'}
def audit_copies(folder,main,supp,main_digest):
 geometry=folder/'geometry'
 if sha(geometry/'certification-lock.json')!=main_digest:raise ValueError('supplement runtime main lock mismatch')
 if sha(folder/'fixed.test')!=supp['binary_sha256']:raise ValueError('supplement binary mismatch')
 for name,digest in main['fixture_sha256'].items():
  if sha(geometry/name)!=digest:raise ValueError('supplement fixture mismatch: '+name)
 for label,cases in supp['plans'].items():
  if load(geometry/f'plans-{label}.json')!=cases:raise ValueError('supplement execution plan mismatch: '+label)
 return {'main_lock_sha256':main_digest,'binary_sha256':supp['binary_sha256'],'fixture_count':len(main['fixture_sha256']),'plans_verified':list(supp['plans'])}
def verify_supplement(kind,phase):
 main=verify();supp=load(HERE/f'{kind}-supplement-lock.json')
 expected=(HERE/f'{kind}-supplement-lock.sha256').read_text().split()[0]
 if sha(HERE/f'{kind}-supplement-lock.json')!=expected:raise ValueError('supplement lock mismatch')
 if supp['main_lock_sha256']!=sha(HERE/'certification-lock.json'):raise ValueError('supplement parent lock mismatch')
 result=audit_copies(pathlib.Path(FOLDERS[kind]),main,supp,supp['main_lock_sha256'])
 result.update(kind=kind,phase=phase,checked_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),supplement_lock_sha256=expected)
 return result
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('kind',choices=FOLDERS);parser.add_argument('phase',choices=['before','after']);args=parser.parse_args()
 result=verify_supplement(args.kind,args.phase)
 with (WORK/'geometry/supplement-input-audit.jsonl').open('a') as out:out.write(json.dumps(result)+'\n')
 print('Supplement copies verified',args.kind,args.phase,flush=True)
