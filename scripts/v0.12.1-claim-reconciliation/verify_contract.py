#!/usr/bin/env python3
"""Record exact contract-only repairs and bounded live schema probes."""
import copy, hashlib, json, pathlib, subprocess, urllib.request, urllib.error
import yaml
from jsonschema import Draft202012Validator
ROOT=pathlib.Path(__file__).resolve().parents[2]; OUT=pathlib.Path(__file__).resolve().parent
old=yaml.safe_load(subprocess.check_output(['git','show','HEAD:docs/openapi.yaml'],cwd=ROOT,text=True))
new=yaml.safe_load((ROOT/'docs/openapi.yaml').read_text())
import sys
sys.path.insert(0,str(ROOT/'docs'))
from validate_openapi import openapi_errors
baseline_errors=openapi_errors(old)
assert len(baseline_errors)==5,baseline_errors
assert openapi_errors(new)==[]
locations=[('/api/meta','get','200'),('/api/analyze-sector','post','200'),('/api/processes/batch-experiment','get','200'),('/api/core/topology','get','200')]
repairs=[]
for path, method, code in locations:
 a=old['paths'][path][method]['responses'][code]; b=new['paths'][path][method]['responses'][code]
 repairs.append({'path':path,'method':method,'response_code':code,'original_invalid_structure':copy.deepcopy(a),'corrected_structure':copy.deepcopy(b)})
 old['paths'][path][method]['responses'][code]=copy.deepcopy(b)
a=old['components']['responses']['TooComplex'];b=new['components']['responses']['TooComplex']
uses=[]
for p,methods in new['paths'].items():
 for method,operation in methods.items():
  if not isinstance(operation,dict):continue
  for code,response in operation.get('responses',{}).items():
   if response.get('$ref')=='#/components/responses/TooComplex':uses.append({'path':p,'method':method,'response_code':code})
repairs.append({'path':'#/components/responses/TooComplex','method':'shared response','response_code':'422','used_by':uses,'original_invalid_structure':copy.deepcopy(a),'corrected_structure':copy.deepcopy(b)})
old['components']['responses']['TooComplex']=copy.deepcopy(b)
annotations=[]
for path in ['/api/optimize-azimuth','/api/optimize-network']:
 for key in ['summary','description']:
  a=old['paths'][path]['post'];b=new['paths'][path]['post']
  if a.get(key)!=b.get(key):
   annotations.append({'path':path,'method':'post','field':key,'before':a.get(key),'after':b.get(key)})
   a[key]=b[key]
a=old['paths']['/api/optimize-azimuth']['post']['responses']['200'];b=new['paths']['/api/optimize-azimuth']['post']['responses']['200']
annotations.append({'path':'/api/optimize-azimuth','method':'post','response_code':'200','field':'description','before':a['description'],'after':b['description']})
a['description']=b['description']
assert old==new,'Contract changed outside repaired Response Objects and documented summary/description annotations'
(OUT/'openapi-wording-repairs.json').write_text(json.dumps(annotations,indent=2)+'\n')
for item in repairs:
 before=item['original_invalid_structure'];after=item['corrected_structure']
 assert before.get('content')==after.get('content')
 assert set(after) <= {'description','content','headers'}
 assert {k:v for k,v in before.items() if k in after and k!='description'}=={k:v for k,v in after.items() if k!='description'}
 assert all(v is None for k,v in before.items() if k not in after)
(OUT/'openapi-repairs.json').write_text(json.dumps(repairs,indent=2)+'\n')
caps={}
for name,cap in [('NetworkRequest',8),('RecommendationRequest',5),('MeasurementRequest',6)]:
 schema=new['components']['schemas'][name]
 value=next(x['properties']['towers']['maxItems'] for x in schema['allOf'] if 'towers' in x.get('properties',{}))
 assert value==cap;caps[name]=value
# Embed the original components to resolve local JSON Schema references.
def validate(instance,schema):
 wrapped={'components':new['components'],'allOf':[schema]}
 errors=list(Draft202012Validator(wrapped).iter_errors(instance))
 assert not errors,'; '.join(str(x) for x in errors)
probes=[]
def probe(path,method='get',body=None):
 req=urllib.request.Request('http://127.0.0.1:18082'+path,data=None if body is None else json.dumps(body).encode(),method=method.upper(),headers={'Content-Type':'application/json'})
 try: response=urllib.request.urlopen(req,timeout=30)
 except urllib.error.HTTPError as e: response=e
 data=response.read();obj=json.loads(data);status=str(response.status)
 assert response.status == (400 if body == {'rays':0} else 200), (path, response.status, obj)
 operation=new['paths'][path][method];response_schema=operation['responses'][status]
 if '$ref' in response_schema:response_schema=new['components']['responses'][response_schema['$ref'].split('/')[-1]]
 content=response_schema.get('content',{});schema=next(iter(content.values()))['schema'] if content else None
 if schema:validate(obj,schema)
 record={'path':path,'method':method,'status':int(status),'schema_checked':bool(schema),'json_sha256':hashlib.sha256(data).hexdigest(),'request':body,'response':obj}
 probes.append(record)
for path in ['/healthz','/readyz','/api/meta','/api/processes/batch-experiment','/api/core/topology']:probe(path)
probe('/api/simulate','post',{'tower_lon':32.85,'tower_lat':39.92,'azimuth':0,'rays':8,'radius_m':25,'frequency_ghz':28,'tx_power_dbm':30,'beam_width':120})
probe('/api/simulate','post',{'rays':0})
result={'wording_only_annotations':annotations,'baseline_strict_errors':baseline_errors,'baseline_strict_error_count':len(baseline_errors),'final_strict_error_count':0,'semantic_contract_comparison':'PASS: five Response Object description/YAML repairs plus bounded-search wording annotations; content/schemas/requests/statuses unchanged','caps':caps,'probes':probes,'rf_invariance_basis':'All backend sources hash-identical; existing deterministic/science tests pass. This probe validates representative runtime shapes; it is not a new before/after RF qualification.'}
(OUT/'contract-compatibility.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'repairs':len(repairs),'caps':caps,'probes':[{k:x[k] for k in ['path','method','status','schema_checked']} for x in probes]},indent=2))
