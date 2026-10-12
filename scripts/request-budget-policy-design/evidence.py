#!/usr/bin/env python3
"""Index current-policy quality logs outside Git."""
import datetime,hashlib,json,pathlib,sys,tarfile
HERE=pathlib.Path(__file__).resolve().parent;WORK=pathlib.Path('/tmp/atom-eight-cell-request-budget-policy-design')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def index(archive=False):
 rows=[{'path':str(p.relative_to(WORK)),'sha256':sha(p),'byte_size':p.stat().st_size} for p in sorted(WORK.rglob('*')) if p.is_file()]
 value={'indexed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'storage_root':str(WORK),'artifacts':rows,'scope':'current production quality + study input; no new eight-Cell RF performance traces'}
 if archive:
  out=pathlib.Path('/tmp/atom-eight-cell-request-budget-policy-design-raw.tar.gz');assert not out.exists()
  with tarfile.open(out,'w:gz') as stream:
   for row in rows:stream.add(WORK/row['path'],arcname=row['path'],recursive=False)
  value['archive']={'path':str(out),'sha256':sha(out),'byte_size':out.stat().st_size,'members':len(rows)}
 path=HERE/'evidence-manifest.json';path.write_text(json.dumps(value,indent=2)+'\n');(HERE/'evidence-manifest.sha256').write_text(sha(path)+'  evidence-manifest.json\n');return value
if __name__=='__main__':print(len(index('--archive' in sys.argv)['artifacts']),'artifacts')
