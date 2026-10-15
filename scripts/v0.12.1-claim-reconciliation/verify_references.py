#!/usr/bin/env python3
"""Supplement strict OpenAPI validation with every local reference, including unused components."""
import json,pathlib
import yaml
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path(__file__).resolve().parent
spec=yaml.safe_load((ROOT/'docs/openapi.yaml').read_text())
refs=[]
def walk(node,path=''):
 if isinstance(node,dict):
  for key,value in node.items():
   if key=='$ref':
    assert value.startswith('#/'),('Unexpected external reference; resolve explicitly',value)
    target=spec
    for token in value[2:].split('/'):target=target[token.replace('~1','/').replace('~0','~')]
    refs.append({'at':path,'target':value})
   walk(value,path+'/'+str(key))
 elif isinstance(node,list):
  for i,value in enumerate(node):walk(value,path+'/'+str(i))
walk(spec)
result={'status':'PASS','all_local_references_resolved':len(refs),'references':refs,'method':'Supplementary pointer traversal; genuine OpenAPI3.1 structural validation remains mandatory.'}
(OUT/'openapi-references.json').write_text(json.dumps(result,indent=2)+'\n')
print('All',len(refs),'local OpenAPI references resolve, including unused components')
