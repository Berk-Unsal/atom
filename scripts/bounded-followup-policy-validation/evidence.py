"""Local raw evidence archive; retain index in Git, not high-volume traces."""
import datetime,hashlib,json,pathlib,tarfile
HERE=pathlib.Path(__file__).resolve().parent;WORK=pathlib.Path('/tmp/atom-bounded-followup-policy')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def archive():
 rows=[]
 for p in sorted(WORK.rglob('*')):
  if not p.is_file() or any(part.startswith('build-context') for part in p.relative_to(WORK).parts):continue
  rows.append({'path':str(p.relative_to(WORK)),'byte_size':p.stat().st_size,'sha256':sha(p)})
 out=pathlib.Path('/tmp/atom-bounded-followup-policy-raw.tar.gz')
 with tarfile.open(out,'w:gz') as tar:
  for row in rows:tar.add(WORK/row['path'],arcname=row['path'],recursive=False)
 manifest={'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'storage_root':str(WORK),'artifacts':rows,'excluded':'reproducible build-context directories; preserved source hashes/diff/binaries/logs qualify the audit copy','archive':{'path':str(out),'byte_size':out.stat().st_size,'sha256':sha(out)}}
 p=HERE/'evidence-manifest.json';p.write_text(json.dumps(manifest,indent=2)+'\n');(HERE/'evidence-manifest.sha256').write_text(sha(p)+'  evidence-manifest.json\n')
 print(len(rows),manifest['archive'])
if __name__=='__main__':archive()
