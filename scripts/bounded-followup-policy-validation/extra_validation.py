"""Additional real normal-build cap/meta/CORS and root slot controls."""
import copy,hashlib,http.client,json,os,pathlib,socket,time
import observer as o

def main():
 f=json.loads(next((o.WORK/'fixtures').glob('dense-certification-1-2.6-6C-W1.json')).read_text())
 eight=json.loads(next((o.WORK/'fixtures').glob('dense-certification-1-2.6-8C-W1.json')).read_text())
 row,body,_=o.request('/api/meta',method='GET');assert row['status']==200 and json.loads(body)['rf_budget_policy']=='bounded-followups-v1'
 c=http.client.HTTPConnection('127.0.0.1',8080);c.request('OPTIONS','/api/evaluate-network',headers={'Origin':'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'RF-Workflow,RF-Workflow-ID,RF-Workflow-Index'});r=c.getresponse();h={k.lower():v for k,v in r.getheaders()};assert r.status==204 and all(v in h['access-control-allow-headers'].lower() for v in ['rf-workflow','rf-workflow-id','rf-workflow-index']);r.read();c.close()
 caps=[]
 root,body,_=o.request('/api/optimize-network',f['network']);assert root['status']==200;result=json.loads(body)
 solution=next(s for s in result['pareto_frontier'] if s['id']==result['optimization']['recommended_solution_id'])
 explanation={'run_id':result['optimization_run_id'],'solution_id':solution['id'],'cell_id':f['network']['towers'][0]['id'],'baseline':result['baseline'],'solution':solution,'optimization':f['network']['optimization'],'optimization_domain':result['optimization_domain']}
 for count in [6,7,8]:
  body=copy.deepcopy(explanation)
  for i in range(6,count):
   t=eight['network']['towers'][i];body['baseline']['cell_configurations'].append({'id':t['id'],'tower_lon':t['tower_lon'],'tower_lat':t['tower_lat'],'azimuth_deg':t['azimuth'],'rf_profile':result['baseline']['cell_configurations'][0]['rf_profile'],'receiver_threshold':result['baseline']['cell_configurations'][0]['receiver_threshold']})
  row,_,_=o.request('/api/explain-network-cell',body);assert row['status']==(200 if count==6 else 400);caps.append({'endpoint':row['endpoint'],'cells':count,'status':row['status']})
  src=eight['interference'];measurement={k:copy.deepcopy(src[k]) for k in ['network_tech','towers','radius_m','frequency_ghz','tx_power_dbm','beam_width','bandwidth_mhz','noise_figure_db','calibration_offset_db']};measurement['towers']=measurement['towers'][:count];measurement['samples']=[{'id':'cap-sample','lon':32.85,'lat':39.92,'technology':'4g','rsrp_dbm':-90}]
  row,_,_=o.request('/api/measurements/evaluate',measurement);assert row['status']==(200 if count==6 else 400);caps.append({'endpoint':row['endpoint'],'cells':count,'status':row['status']})
 # Two authenticated/admitted roots block in bounded JSON decoding. Neither
 # has reached prebooking/RF; a third root must see the same global2 boundary.
 sockets=[]
 try:
  for _ in range(2):
   peer=o.ip();data=o.encode(f['network']);sock=socket.create_connection(('127.0.0.1',8080),timeout=5,source_address=(peer,0));header=(f'POST /api/evaluate-network HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\nContent-Type: application/json\r\nRF-Workflow: network-maps-v1\r\nContent-Length: {len(data)}\r\n\r\n').encode();sock.sendall(header+data[:1]);sockets.append(sock)
  time.sleep(.03)
  row,_,h=o.request('/api/evaluate-network',f['network'],headers={'RF-Workflow':'network-maps-v1'});assert row['status']==429 and h['retry-after']=='1' and 'rf-workflow-id' not in h
 finally:
  for sock in sockets:sock.close()
 time.sleep(.03)
 peer=o.ip();row,_,h=o.request('/api/evaluate-network',f['network'],peer,{'RF-Workflow':'network-maps-v1'});assert row['status']==200
 row,_,_=o.request('/api/rf-workflows',None,peer,{'RF-Workflow-ID':h['rf-workflow-id']},'DELETE');assert row['status']==204
 (o.OUT/'extra-summary.json').write_text(json.dumps({'passed':True,'skipped':0,'cap_results':caps,'api_meta':True,'cors':True,'root_root_global2':True,'slots_released_after_body_disconnect':True,'final_counters':o.counters()},indent=2)+'\n')
 (o.OUT/'requests.json').write_text(json.dumps(o.rows,indent=2)+'\n')
if __name__=='__main__':main()
