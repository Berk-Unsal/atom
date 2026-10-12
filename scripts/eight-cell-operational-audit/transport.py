#!/usr/bin/env python3
"""Streamed real TCP transport, derived from the certified W1 observer."""
import concurrent.futures, copy, datetime, hashlib, http.client, json, math, os, pathlib, re, socket, threading, time
ROOT=pathlib.Path('/audit/repo'); WORK=pathlib.Path('/audit/work'); CG=pathlib.Path('/proc/1/root/sys/fs/cgroup')

def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def stamp(v):return datetime.datetime.fromisoformat(v.replace('Z','+00:00')).timestamp()
def encode(v):return json.dumps(v,separators=(',',':'),ensure_ascii=False).encode()
def save(p,v):
 with p.open('x') as out:json.dump(v,out,indent=2);out.write('\n')
class NumericToken(str):pass

def canonical(body):
 value=json.loads(body,parse_int=NumericToken,parse_float=NumericToken)
 if not isinstance(value,dict) or not isinstance(value.get('diagnostics'),dict) or 'elapsed_ms' not in value['diagnostics']:raise ValueError('missing exact volatile field')
 del value['diagnostics']['elapsed_ms']
 def emit(v):
  if isinstance(v,NumericToken):return str(v)
  if isinstance(v,dict):return '{'+','.join(json.dumps(k,ensure_ascii=False)+':'+emit(v[k]) for k in sorted(v))+'}'
  if isinstance(v,list):return '['+','.join(emit(x) for x in v)+']'
  return json.dumps(v,ensure_ascii=False,separators=(',',':'))
 return hashlib.sha256(emit(value).encode()).hexdigest()

def counters():
 status=(pathlib.Path('/proc/1/status')).read_text(); stats=(pathlib.Path('/proc/1/stat')).read_text().rsplit(')',1)[1].split()
 pairs=lambda p:{k:int(v) for k,v in (line.split() for line in (CG/p).read_text().splitlines())}
 rss=int(re.search(r'^VmRSS:\s+(\d+)',status,re.M).group(1))*1024
 return {'at':utc(),'rss_bytes':rss,'cgroup_current_bytes':int((CG/'memory.current').read_text()),'cgroup_peak_bytes':int((CG/'memory.peak').read_text()),'memory_events':pairs('memory.events'),'cpu':pairs('cpu.stat'),'process_cpu_seconds':(int(stats[11])+int(stats[12]))/os.sysconf('SC_CLK_TCK')}

class Transport:
 def __init__(self,label):self.label=label;self.serial=0;self.capture_directory=None;self.capture_serial=0;self.mu=threading.Lock();self.serverlog=pathlib.Path('/audit/primary-logs')/(os.environ['W1_PRIMARY_ID']+'-json.log')
 def ip(self,pool=10):
  with self.mu:self.serial+=1;v=self.serial
  return f'127.{pool}.{v//250%250}.{v%250+1}'
 def request(self,endpoint,body=None,ip=None,method='POST',cancel=False,small=False,science_file=None,completion=True):
  ip=ip or self.ip();data=body if isinstance(body,bytes) else encode(body) if body is not None else None
  conn=http.client.HTTPConnection('127.0.0.1',8080,timeout=75,source_address=(ip,0));start=time.monotonic();at=utc();offset=0;inode=None
  if completion:
   try:info=self.serverlog.stat();offset=info.st_size;inode=info.st_ino
   except FileNotFoundError:pass
  result={'endpoint':endpoint,'client_ip':ip,'method':method,'start':at,'request_sha256':hashlib.sha256(data or b'').hexdigest(),'status':0,'response_bytes':0,'sha256':'','stream_complete':False,'remaining':None}
  timer=None;h=hashlib.sha256();buffer=bytearray();out=None;capture=None
  def abort():
   try:
    if conn.sock:conn.sock.shutdown(socket.SHUT_RDWR)
   except OSError:pass
  try:
   conn.connect()
   if cancel:timer=threading.Timer(.1,abort);timer.start()
   conn.request(method,endpoint,data,{'Content-Type':'application/json'});response=conn.getresponse();result['status']=response.status;result['remaining']=response.getheader('RateLimit-Remaining');result['rate_limit']=response.getheader('RateLimit-Limit');result['rate_reset_seconds']=response.getheader('RateLimit-Reset');result['retry_after']=response.getheader('Retry-After')
   if science_file:out=science_file.open('xb')
   if self.capture_directory is not None:
    with self.mu:self.capture_serial+=1;serial=self.capture_serial
    capture_path=self.capture_directory/(str(serial)+'-'+endpoint.rsplit('/',1)[-1]+'.json');capture=capture_path.open('xb');result['captured_body']=str(capture_path.relative_to(WORK))
   while True:
    chunk=response.read(65536)
    if not chunk:break
    h.update(chunk);result['response_bytes']+=len(chunk)
    if small:buffer.extend(chunk)
    if out:out.write(chunk)
    if capture:capture.write(chunk)
   result['sha256']=h.hexdigest();result['stream_complete']=True
  except Exception as e:result['error']=type(e).__name__+': '+str(e);result['status']=0
  finally:
   if timer:timer.cancel()
   if out:out.close()
   if capture:capture.close()
   conn.close()
  end=time.monotonic();result['end']=utc();result['monotonic_seconds']=end-start;result['utc_seconds']=stamp(result['end'])-stamp(at);result['elapsed_seconds']=max(result['monotonic_seconds'],result['utc_seconds']);result['clock_discontinuity']=abs(result['utc_seconds']-result['monotonic_seconds'])>1
  if completion:
   deadline=time.monotonic()+5;match=None
   pattern=re.compile(r'\[GIN\].*?\|\s*(\d+)\s*\|.*?\|\s*'+re.escape(ip)+r'\s*\|\s*'+method+r'\s+"'+re.escape(endpoint)+r'"')
   while time.monotonic()<deadline:
    for logfile in [self.serverlog,*self.serverlog.parent.glob(self.serverlog.name+'.*')]:
     if logfile.suffix=='.gz':continue
     try:
      info=logfile.stat()
      if info.st_ino!=inode and logfile!=self.serverlog:continue
      seek=offset if info.st_ino==inode and info.st_size>=offset else 0
      with logfile.open() as log:log.seek(seek);text=log.read()
     except FileNotFoundError:continue  # Atomic logger rename is not a server failure.
     for raw in text.splitlines():
      try:
       entry=json.loads(raw);line=entry['time']+' '+entry['log']
       if stamp(entry['time'])<stamp(at):continue
      except (ValueError,KeyError):continue
      if pattern.search(line):match=line;break
     if match:break
    if match:break
    time.sleep(.005)
   result['server_completion_observed']=match is not None;result['release_observation_seconds']=time.monotonic()-end;result['server_completion_log']=match
  if science_file and result['status']==200 and result['stream_complete']:
   result['scientific_sha256']=canonical(science_file.read_bytes());result['science_file']=str(science_file.relative_to(WORK))
  return result,bytes(buffer)
 def api(self,path,body=None,method='GET'):
  r,b=self.request(path,body,self.ip(220),method=method,small=True,completion=False)
  return r,json.loads(b) if b else {}

