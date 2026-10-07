#!/usr/bin/env python3
"""Validate the refreshed final docs; retain a separate small quality archive."""
import datetime,json,pathlib,subprocess,tarfile
from protocol import HERE,ROOT,sha

def validate():
 work=pathlib.Path('/tmp/atom-eight-cell-successor-terminal-validation');work.mkdir(exist_ok=False)
 commands={'docs_build':['sh','docs/build-reference-pages.sh'],'docs_validation':['/tmp/atom-persistence-docs-venv/bin/python','docs/validate_docs.py'],'version_consistency':['python3','scripts/versioning.py','check'],'diff_check':['git','diff','--check']}
 records={}
 for name,command in commands.items():
  path=work/(name+'.log');started=datetime.datetime.now(datetime.timezone.utc).isoformat()
  with path.open('x') as log:code=subprocess.run(command,cwd=ROOT,stdout=log,stderr=subprocess.STDOUT).returncode
  records[name]={'command':command,'exit_code':code,'started_at':started,'completed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'path':str(path),'sha256':sha(path),'byte_size':path.stat().st_size}
  print(name,code,flush=True)
  if code:raise ValueError('final refreshed document quality failed: '+name)
 archive=pathlib.Path('/tmp/atom-eight-cell-successor-terminal-quality.tar.gz')
 assert not archive.exists()
 with tarfile.open(archive,'w:gz') as out:
  for name in commands:out.add(work/(name+'.log'),arcname=name+'.log',recursive=False)
 value={'purpose':'post-archive/final-report refreshed documentation quality; RF timings remain immutable','passed':True,'records':records,'archive':{'path':str(archive),'sha256':sha(archive),'byte_size':archive.stat().st_size,'members':len(records)}}
 (HERE/'terminal-validation.json').write_text(json.dumps(value,indent=2)+'\n');return value
if __name__=='__main__':validate()
