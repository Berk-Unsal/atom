#!/usr/bin/env python3
"""Create the one-time remediation baseline before any approved-source edits."""
import hashlib,json,pathlib,subprocess
from datetime import datetime,timezone
ROOT=pathlib.Path(__file__).resolve().parents[2];OUT=pathlib.Path(__file__).resolve().parent
if (OUT/'remediation-lock.json').exists():raise SystemExit('Existing lock must never be replaced')
def git(*args):return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
paths=set(git('ls-files').splitlines())
paths.update(str(p.relative_to(ROOT)) for p in (ROOT/'scripts/v0.12.1-post-release-audit').rglob('*') if p.is_file())
paths.update(['docs/v0.12.1-post-release-product-scientific-audit.md','docs/v0.12.1-post-release-product-scientific-audit.json'])
manifest={p:sha(ROOT/p) for p in sorted(paths) if (ROOT/p).is_file()}
selectors={
 'rf_science':lambda p:p.startswith('backend-go/raytracer/'),
 'optimization_search':lambda p:p.startswith('backend-go/') and any(x in p for x in ['optimization','optimiz','scenario_fingerprint']),
 'request_budget_policy':lambda p:p.startswith(('policy/','backend-go/rf_protection','backend-go/rf_workflow','frontend-react/src/generated/','frontend-react/src/utils/rfWorkflow')),
 'persistence':lambda p:any(x in p for x in ['projectStore','projectRayColumns','serialization','repository/','domain/','useProjectWorkspace','useRunHistory','useReportArtifacts']),
 'resource_admission':lambda p:p.startswith('backend-go/') and any(x in p for x in ['resource','experiment_jobs','server_lifecycle']),
 'backend':lambda p:p.startswith(('backend-go/','core-lab-adapter/')),
 'frontend':lambda p:p.startswith('frontend-react/'),
 'openapi':lambda p:p=='docs/openapi.yaml',
 'public_docs':lambda p:p.startswith('docs/') or p=='README.md',
 'audit_evidence':lambda p:p.startswith('scripts/v0.12.1-post-release-audit/') or 'post-release-product-scientific-audit' in p,
}
groups={k:{'files':len(d:={p:h for p,h in manifest.items() if f(p)}),'sha256':hashlib.sha256(json.dumps(d,sort_keys=True,separators=(',',':')).encode()).hexdigest()} for k,f in selectors.items()}
baseline={'utc':datetime.now(timezone.utc).isoformat(),'branch':git('branch','--show-current'),'head':git('rev-parse','HEAD'),'version':(ROOT/'VERSION').read_text().strip(),'initial_status':'?? docs/v0.12.1-post-release-product-scientific-audit.json\n?? docs/v0.12.1-post-release-product-scientific-audit.md\n?? scripts/v0.12.1-post-release-audit/','freeze_status':git('status','--short'),'diff_stat':git('diff','--stat')}
assert baseline['version']=='0.12.1'
assert not git('diff','HEAD','--name-only'),'Production checkout must be understood before edits'
allowed={
 'current_docs':['README.md','CHANGELOG.md','docs/overview.md','docs/algorithms.md','docs/api.md','docs/architecture.md','docs/features.md','docs/modeling-limits.md','docs/getting-started.md','docs/index.md','docs/index.html','docs/architecture.html','docs/download.html','docs/faq.md','docs/project-format.md','docs/visualization.md','docs/deployment.md','docs/contributing.md'],
 'contract_validation':['docs/openapi.yaml','docs/validate_docs.py','docs/requirements.in','docs/requirements.txt','docs/validate_openapi.py','docs/validate_openapi_test.py','docs/validate_claims.py','docs/validate_claims_test.py','docs/classify_docs.py','docs/doc-sources.json','.github/workflows/quality.yml'],
 'frontend_copy_and_prechecks':['frontend-react/src/App.jsx','frontend-react/src/App.test.jsx','frontend-react/src/App.workflow.test.jsx','frontend-react/src/components/WorkspaceChrome.jsx','frontend-react/src/components/WorkspaceChrome.test.jsx','frontend-react/src/utils/apiClient.js','frontend-react/src/utils/apiClient.test.js','frontend-react/src/utils/measurementScope.js','frontend-react/src/utils/measurementScope.test.js','frontend-react/src/utils/rfRecoveryMessage.js','frontend-react/src/utils/rfRecoveryMessage.test.js','frontend-react/src/components/ControlPanel.jsx','frontend-react/src/components/ControlPanel.test.jsx'],
 'bounded_browser_tests':['frontend-react/e2e/docs-theme.spec.js','frontend-react/e2e/workspace.spec.js','frontend-react/e2e/claim-reconciliation.spec.js'],
 'derived_docs':'Only generated HTML corresponding to approved current Markdown, generated changelog.html/search-index.json/app-theme.css if deterministic build requires it; historical output must remain identical.',
 'screenshot':'A real captured light workspace asset/reference may replace stale hero content; no synthetic image and no historical asset overwrite.',
 'deliverables':['docs/v0.12.1-claim-reconciliation.md','docs/v0.12.1-claim-reconciliation.json','scripts/v0.12.1-claim-reconciliation/'],
}
lock={'objective':'v0.12.1 Claim Reconciliation + API Contract Repair','baseline':baseline,'source_groups':groups,'allowed_surfaces':allowed,'request_sha256':sha(pathlib.Path('/Users/berkunsal/.codex/attachments/c2e4d728-534a-44b7-a784-a7dc7c09790a/Pasted text.txt')),'authoritative_audit_sha256':manifest['docs/v0.12.1-post-release-product-scientific-audit.json'],'selected_findings':['P02','P03','P04','P05','P06','P07','P08','P10','P13','P14','P15'],'additional_explicit_scope':['first-use story','portable project and draft/Version/export wording','current/historical classification','strict contract and conceptual claim regressions'],'immutable':['All backend/core-adapter source and tests','RF math/classifiers/models/antenna/receiver/terrain/measurement/calibration/scientific JSON/fingerprints','search/objectives/Pareto','policy/generated policy/budget/caps/concurrency/deadline/worker/queue','persistence implementation/guards/schemas','resource admission/Auto/estimator','all historical audit/qualification/research/internal-design evidence including prior untracked audit artifacts','VERSION/package version metadata remains0.12.1; recommend0.12.2after gates'],'quality_gates':['backend normal/race/vet','frontend full tests/lint/build','strict OpenAPI3.1 plus invalid-structure regression fixtures','docs build/validation/internal links/classification/claim regressions','version/generated-policy consistency','scientific/operational/historical invariance','git diff --check'],'verdicts':{'A':'Claim boundary reconciled','B':'Claims mostly reconciled; non-blocking debt remains','C':'Scientific claim defect remains','D':'Contract/workflow defect remains','E':'Invalid/insufficient'},'method':'Source identity and semantic invariance; actual structural OpenAPI repair; representative API JSON/schema comparison where feasible; no operational requalification unless forbidden source changes, then STOP.','freeze_policy':'Lock is immutable. Approved docs/UI/error-presentation/precheck/validation changes only; no release/tag/push or roadmap features.'}
for name,x in [('baseline.json',baseline),('source-manifest.json',manifest),('remediation-lock.json',lock)]: (OUT/name).write_text(json.dumps(x,indent=2)+'\n')
lock_sha=sha(OUT/'remediation-lock.json');(OUT/'remediation-lock.sha256').write_text(lock_sha+'  remediation-lock.json\n')
print(json.dumps({'baseline':baseline,'remediation_lock_sha256':lock_sha,'frozen_files':len(manifest),'groups':groups},indent=2))
