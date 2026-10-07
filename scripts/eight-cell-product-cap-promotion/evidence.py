"""Archive raw evidence outside Git with an independently checkable SHA index."""
import hashlib,json,pathlib,tarfile
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1];WORK=pathlib.Path('/tmp/atom-eight-cell-product-cap-promotion')
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 source={str(p.relative_to(ROOT)):sha(p) for folder in ['backend-go','frontend-react/src','policy'] for p in (ROOT/folder).rglob('*') if p.is_file() and p.suffix in ['.go','.js','.jsx','.json']}
 for name in ['VERSION','frontend-react/package.json','frontend-react/package-lock.json','docs/openapi.yaml']:
  source[name]=sha(ROOT/name)
 (WORK/'final-source-sha256.json').write_text(json.dumps(source,indent=2)+'\n')
 index={str(p.relative_to(WORK)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(WORK.rglob('*')) if p.is_file() and p.name!='raw-sha256-index.json'}
 (WORK/'raw-sha256-index.json').write_text(json.dumps(index,indent=2)+'\n')
 archive=WORK.parent/'atom-eight-cell-product-cap-promotion-raw.tar.gz'
 with tarfile.open(archive,'w:gz') as t:t.add(WORK,arcname=WORK.name)
 with tarfile.open(archive,'r:gz') as t:
  files=[m for m in t.getmembers() if m.isfile()];assert len(files)==len(index)+1
  for m in files:
   name=str(pathlib.PurePosixPath(m.name).relative_to(WORK.name))
   if name=='raw-sha256-index.json':continue
   assert hashlib.sha256(t.extractfile(m).read()).hexdigest()==index[name]['sha256']
 result={'path':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'raw_files':len(index),'archive_files':len(files),'index_path':str(WORK/'raw-sha256-index.json'),'index_sha256':sha(WORK/'raw-sha256-index.json'),'verified_archive_members':True,'policy':'Raw HTTP/resources/binaries/logs/screenshots remain outside Git. Tracked reports, locks, tests and manifests describe the evidence. Failed development probes retained; no failed/skip substituted as final evidence.'}
 (HERE/'raw-evidence.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
