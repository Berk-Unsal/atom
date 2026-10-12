#!/usr/bin/env python3
"""Measure unchanged production container via loopback; resource probes use proc/cgroup."""
import argparse,json,pathlib,subprocess,time,threading,re
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');a=p.parse_args()
if not a.run:p.error('explicit --run required')
w=pathlib.Path('/tmp/atom-resource-study');name='atom-resource-study'
def shell(cmd):return subprocess.check_output(['docker','exec',name,'sh','-c',cmd],text=True)
def stats():
 v=shell("cat /sys/fs/cgroup/cpu.stat; cat /proc/1/status; cat /sys/fs/cgroup/memory.current")
 d={}
 for line in v.splitlines():
  x=line.split()
  if len(x)>1 and x[0] in ['usage_usec','VmRSS:','VmHWM:','Threads:']:d[x[0].rstrip(':')]=int(x[1])
 return d
rows=[]
for freq in [2.6,28]:
 f=json.loads((w/'fixtures'/f'6-{freq}.json').read_text())
 workloads=[('simulate',f['simulations'][0]),('evaluate-network',f['network']),('interference',f['interference']),('optimize-network',f['network'])]
 high=json.loads((w/'plans'/f'high-{freq}.json').read_text())
 for plan in high:
  if plan['label'] in ['high-rays-radius','high-evaluate','high-optimize','high-surface','high-recommend']:workloads.append((plan['requests'][0]['endpoint'].removeprefix('/api/'),plan['requests'][0]['body']))
 for index,(endpoint,body) in enumerate(workloads):
  inp=w/'container-input.json';inp.write_text(json.dumps(body));subprocess.run(['docker','cp',str(inp),name+':/tmp/request.json'],check=True,stdout=subprocess.DEVNULL)
  before=stats();peak=before['VmRSS'];done=threading.Event();samples=[]
  def sample():
   while not done.wait(.1): samples.append(stats())
  t=threading.Thread(target=sample);t.start();started=time.time()
  r=subprocess.run(['docker','exec',name,'sh','-c','wget -SO- --header="Content-Type: application/json" --post-file=/tmp/request.json http://127.0.0.1:8080/api/'+endpoint],capture_output=True,timeout=130)
  wall=time.time()-started;done.set();t.join();after=stats();cpu=(after['usage_usec']-before['usage_usec'])/1e6
  (w/'raw'/f'container-{freq}-{index}-{endpoint}.response.json').write_bytes(r.stdout)
  status=re.search(r'HTTP/1\.1 (\d{3})',r.stderr.decode());status=int(status[1]) if status else None
  rows.append(dict(status=status,workload='default' if index<4 else 'high',received_response_bytes=len(r.stdout) if r.returncode==0 else None,endpoint='/api/'+endpoint,workload_index=index,frequency_ghz=freq,wall_seconds=wall,cpu_seconds=cpu,equivalent_cores=cpu/wall,rss_sampled_max_bytes=max(x['VmRSS'] for x in [before,after]+samples)*1024,response_bytes=len(r.stdout) if r.returncode==0 else None,request_bytes=inp.stat().st_size,exit_code=r.returncode,stderr=r.stderr.decode(),samples=len(samples),heap_bytes=None,geometry=None))
  (w/'container.json').write_text(json.dumps(dict(method='unaltered Dockerfile image; docker exec wget loopback, CPU cgroup usage, RSS /proc/1/status; exec/sample overhead in wall; Go heap unavailable',rows=rows),indent=2));print(freq,endpoint,wall,cpu,flush=True)
