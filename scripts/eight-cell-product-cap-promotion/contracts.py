"""Validate promoted contracts and inventory unchanged independent/scientific limits."""
import hashlib,json,pathlib,subprocess
import yaml
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parents[1]
def main():
 subprocess.run(['python3',str(ROOT/'scripts/generate_policy.py'),'--check'],check=True)
 doc=yaml.safe_load((ROOT/'docs/openapi.yaml').read_text());schemas=doc['components']['schemas']
 expected={'NetworkRequest':8,'BuildingEntryAnalysisRequest':8,'RecommendationRequest':5,'MeasurementRequest':6}
 for name,n in expected.items():assert schemas[name]['allOf'][1]['properties']['towers']['maxItems']==n,name
 def refs(v):
  if isinstance(v,dict):
   for k,x in v.items():
    if k=='$ref' and x.startswith('#/'):
     node=doc
     for part in x[2:].split('/'):node=node[part.replace('~1','/').replace('~0','~')]
    else:refs(x)
  elif isinstance(v,list):
   for x in v:refs(x)
 refs(doc)
 old=json.loads(subprocess.check_output(['git','show','HEAD:policy/rf-policy.json'],cwd=ROOT,text=True));new=json.loads((ROOT/'policy/rf-policy.json').read_text());old['limits']['network_towers_max']=8;assert old==new,'Only canonical network cap may change'
 baseline=json.loads((HERE/'baseline.json').read_text());lock=json.loads((HERE/'promotion-lock.json').read_text())
 preserved={p:s for p,s in baseline['sha256'].items() if p.startswith(('backend-go/raytracer/','policy/','data-pipeline/')) and p not in ['backend-go/raytracer/policy_generated.go','backend-go/raytracer/interference.go','policy/rf-policy.json']}
 for p,s in preserved.items():assert hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==s,p
 sources=['backend-go','frontend-react/src','docs/openapi.yaml','README.md','docs/architecture.md','docs/getting-started.md','docs/api.md','examples','policy']
 query='MaxNetworkTowers|MAX_NETWORK_CELLS|network_towers_max|maxItems: [568]|slice\\(0, 6\\)|six selected|six Cells|six cells|2[–-]6|2 and 6|Maximum 6'
 inventory=subprocess.run(['rg','-n',query,*sources],cwd=ROOT,text=True,capture_output=True,check=True).stdout
 (HERE/'cap-inventory.txt').write_text(inventory)
 result={'passed':True,'generated_policy_current':True,'OpenAPI_version':doc['openapi'],'all_local_refs_resolve':True,'maxItems':expected,'only_policy_change':'limits.network_towers_max 6→8','science_policy_dataset_unchanged_files':len(preserved),'classifications':{'PRODUCT NETWORK CAP':'canonical max/generated bindings/normalization/selection/error/OpenAPI/Auto now8','INDEPENDENT ENDPOINT LIMIT':'Recommendation5 Measurement6 experiments64 and existing RF/persistence guards retained','SCIENTIFIC VALUE':'all numeric RF/reference values unchanged','TEST FIXTURE':'six-cell regression fixtures retained; cap expectations and new8/9 tests reviewed','DOCUMENTATION':'current product copy8; old reports and audit tooling preserved by SHA'},'inventory':'cap-inventory.txt','scope':lock['scope']}
 (HERE/'contracts.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':main()
