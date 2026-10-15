#!/usr/bin/env python3
"""Fail if this bounded remediation touches any frozen non-approved source."""
import hashlib,json,pathlib,subprocess,sys
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'docs'))
from classify_docs import CURRENT
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
lock=json.loads((OUT/'remediation-lock.json').read_text());manifest=json.loads((OUT/'source-manifest.json').read_text())
assert sha(OUT/'remediation-lock.json')==(OUT/'remediation-lock.sha256').read_text().split()[0]
allowed=set()
for x in lock['allowed_surfaces'].values():
 if isinstance(x,list):allowed.update(x)
allowed.update(p for p in CURRENT if p.endswith('.html'))
allowed.add('docs/search-index.json')
changes=[p for p,h in manifest.items() if not (ROOT/p).exists() or sha(ROOT/p)!=h]
violations=[p for p in changes if p not in allowed]
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=ROOT,text=True).splitlines()
newviolations=[p for p in new if p not in manifest and p not in allowed and not p.startswith('scripts/v0.12.1-claim-reconciliation/')]
# Exact group membership and hash rules copied from the immutable pre-edit freeze.
selectors={
 'rf_science':lambda p:p.startswith('backend-go/raytracer/'),
 'optimization_search':lambda p:p.startswith('backend-go/') and any(x in p for x in ['optimization','optimiz','scenario_fingerprint']),
 'request_budget_policy':lambda p:p.startswith(('policy/','backend-go/rf_protection','backend-go/rf_workflow','frontend-react/src/generated/','frontend-react/src/utils/rfWorkflow')),
 'persistence':lambda p:any(x in p for x in ['projectStore','projectRayColumns','serialization','repository/','domain/','useProjectWorkspace','useRunHistory','useReportArtifacts']),
 'resource_admission':lambda p:p.startswith('backend-go/') and any(x in p for x in ['resource','experiment_jobs','server_lifecycle']),
 'backend':lambda p:p.startswith(('backend-go/','core-lab-adapter/')),
 'audit_evidence':lambda p:p.startswith('scripts/v0.12.1-post-release-audit/') or 'post-release-product-scientific-audit' in p,
}
groups={}
for name,select in selectors.items():
 d={p:sha(ROOT/p) for p in manifest if select(p)}
 h=hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 groups[name]={'files':len(d),'sha256':h,'unchanged':h==lock['source_groups'][name]['sha256']}
 assert groups[name]['unchanged'],name
history=[p for p in manifest if p.startswith('docs/') and p.endswith(('.md','.html','.json','.yaml','.yml')) and p not in CURRENT and p!='docs/search-index.json']
assert all(sha(ROOT/p)==manifest[p] for p in history),'Historical/reference/design documentation changed'
old_changelog=subprocess.check_output(['git','show','HEAD:CHANGELOG.md'],cwd=ROOT,text=True)
a=old_changelog.split('\n## [',2)[-1];b=(ROOT/'CHANGELOG.md').read_text().split('\n## [',2)[-1]
assert a==b,'Published changelog changed'
# No byte changes allowed in backend/science/policy/persistence/resource or previous audit evidence.
assert not violations,violations
assert not newviolations,newviolations
r={'status':'PASS','remediation_lock_sha256':sha(OUT/'remediation-lock.json'),'baseline_files':len(manifest),'changed_frozen_files':changes,'new_approved_files':[p for p in new if p not in manifest], 'forbidden_changes':violations+newviolations,'groups':groups,'historical_reference_design_docs_unchanged':len(history),'published_changelog_unchanged':True,'rf_response_invariance':'Source identity plus deterministic regression suite; no RF/scientific response serializer or math changed. Representative live schema checks recorded separately; no new operational qualification inferred.'}
(OUT/'invariance.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({k:r[k] for k in ['status','baseline_files','forbidden_changes','groups','historical_reference_design_docs_unchanged','published_changelog_unchanged']},indent=2))
