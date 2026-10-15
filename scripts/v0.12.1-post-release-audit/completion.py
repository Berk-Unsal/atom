#!/usr/bin/env python3
"""Audit-only completion gate: artifacts, references, requirements, unchanged source, known failures.

This verifies coverage and evidence identities, not whether physical predictions are accurate.
A recorded OpenAPI failure is required evidence on the frozen release, not a passing gate.
"""
import ast
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent
REPORT = ROOT / 'docs/v0.12.1-post-release-product-scientific-audit'
checks = []

def check(name, condition, details=None):
    checks.append({'requirement': name, 'passed': bool(condition), 'evidence': details})

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

def git(*args): return subprocess.check_output(['git',*args],cwd=ROOT,text=True).strip()

r = json.loads(pathlib.Path(str(REPORT)+'.json').read_text())
md = pathlib.Path(str(REPORT)+'.md').read_text()
lock_sha = (OUT/'criteria-lock.sha256').read_text().split()[0]
check('Requested exact Markdown/JSON paths exist',pathlib.Path(str(REPORT)+'.md').is_file() and pathlib.Path(str(REPORT)+'.json').is_file())
check('Pre-evaluation criteria lock preserved',sha(OUT/'criteria-lock.json')==lock_sha==r['audit_lock_sha256'],lock_sha)
check('All requested phases0–39 accounted for', [p['phase'] for p in r['phases']]==list(range(40)) and all(p['finding'] and p['evidence'] for p in r['phases']))
check('All required final items1–51 answered', [a['number'] for a in r['required_final_items']]==list(range(1,52)) and all(a['title'] and a['answer'] for a in r['required_final_items']))
check('Every phase and final item appears in Markdown', all(f"## Phase {p['phase']} —" in md for p in r['phases']) and all(f"{a['number']}. **{a['title']}:**" in md for a in r['required_final_items']))
check('Exactly one overall verdict',r['verdict']['category']=='C' and r['required_final_items'][44]['answer'].startswith('C —'))
claims=r['claim_inventory']
check('Atomic claim inventory has unique IDs and one A–F grade each', len({c['id'] for c in claims})==len(claims) and all(c['evidence_level'] in list('ABCDEF') for c in claims),len(claims))
minimum=['eight','2.6','28','140','speedup','2 CPU','3GPP','accuracy','optimization','Interference','Measurement','Persistence']
claim_text=' '.join(c['claim']+' '+c['current_wording_location'] for c in claims).lower()
check('Requested minimum claim-matrix topics included',all(s.lower() in claim_text for s in minimum),minimum)
check('All claim-matrix columns populated',all(all(c.get(k) for k in ['claim','current_wording_location','evidence_level','supported','qualification_needed','recommended_wording','evidence']) for c in claims))
check('At most five ranked options and one recommendation',0<len(r['ranked_next_options'])<=5 and [x['rank'] for x in r['ranked_next_options']]==list(range(1,len(r['ranked_next_options'])+1)) and r['single_recommendation']==r['ranked_next_options'][0])
check('Each option has benefit/evidence/cost/risk/dependency/success',all(all(x.get(k) for k in ['initiative','benefit','evidence','cost','risk','dependency','success']) for x in r['ranked_next_options']))
expected_dimensions=['Purpose clarity','Onboarding','Workflow coherence','RF transparency','Result explainability','Scientific honesty','Visual hierarchy','Documentation','Persistence expectations','External readiness']
check('Exact requested ordinal scorecard with rationales',[x['dimension'] for x in r['scorecard']]==expected_dimensions and all(1<=x['score']<=5 and x['rationale'] for x in r['scorecard']))
check('All five requested personas evaluated',len(r['personas'])==5 and all(len(x)==5 and all(x) for x in r['personas']))
check('Workflow includes intent/UI/backend/state/next action/friction',len(r['workflow'])==12 and all(len(x)==7 and all(x) for x in r['workflow']))
check('Tools/terms/use cases/commercial gaps/feedback are classified',all(r.get(x) for x in ['tools','terminology','use_cases','commercial_expectation_gap','external_feedback']))
check('Product debt has evidence/impact/severity/blockers/fix-soon',all(all(k in x for k in ['id','category','severity','evidence','impact','blocks_current_use','fix_soon']) for x in r['product_debt']))
check('Scientific debt separated',len(r['scientific_debt'])>=7 and bool(r['product_debt']))
check('Screenshots inspected are recorded',len(r['screenshots'])==5 and all((ROOT/x[0]).is_file() for x in r['screenshots']))
reference_errors=[]
for key,ref in r['evidence_index'].items():
    p=ROOT/ref['file']
    if not p.is_file() or not 1<=ref['line']<=len(p.read_text().splitlines()): reference_errors.append(key)
check('All cited evidence paths and lines resolve',not reference_errors,reference_errors)
check('Latest serving-state evidence and zero canonical observations retained',r['evidence_index']['pilot']['file']=='docs/concept-6a1-readiness.json' and 'A_SEMANTICS_UNRESOLVED' in r['phases'][10]['finding'] and json.loads((ROOT/'docs/concept-6a1-readiness.json').read_text())['canonical_observation_count']==0)
check('Overview applicability claims explicitly determine final verdict','docs/overview.md' in r['verdict']['rationale'] and any(c['id']=='C49' and c['evidence_level']=='F' for c in claims))
check('Project-export exclusions acknowledged','separate Run History' in r['phases'][24]['finding'] and 'coverage surfaces' in r['phases'][24]['finding'])
scan=json.loads((OUT/'claim-language-scan.json').read_text())
assessment=json.loads((OUT/'claim-language-assessment.json').read_text())
check('Every lexical occurrence retained and routed once',len(scan)==assessment['occurrences']==len(assessment['rows']) and [(x['file'],x['line']) for x in scan]==[(x['file'],x['line']) for x in assessment['rows']],len(scan))
claim_ids={c['id'] for c in claims}
check('Occurrence routing references known atomic claims',all(x['atomic_claims'] and all(v['id'] in claim_ids for v in x['atomic_claims']) for x in assessment['rows']))
check('Unsupported wording exceptions explicitly retained',set(x['claim_id'] for x in assessment['unsupported_wording_exceptions'])=={c['id'] for c in claims if c['evidence_level']=='F'})
contract=json.loads((OUT/'contracts.json').read_text())
check('Strict OpenAPI failure preserved, not reported green',contract['schema_validation']=='failed' and len(contract['schema_errors'])==5 and next(x for x in r['checks'] if x['name']=='OpenAPI schema and semantic contracts')['exit_code']==1)
check('Current8/8/5/6 contracts and410references verified',contract['caps']=={'NetworkRequest':8,'BuildingEntryAnalysisRequest':8,'RecommendationRequest':5,'MeasurementRequest':6} and contract['local_references_resolved']==410)
check('Historical82source identities compared without extrapolation',contract['shipping_source_files_compared']==82 and not contract['shipping_source_changed'])
check('Required quality checks recorded with available logs',all((OUT/x['log']).is_file() for x in r['checks']) and len(r['checks'])>=12)
front=(OUT/'logs/frontend-tests.log').read_text()
back=(OUT/'logs/backend-tests.log').read_text()
browser=(OUT/'logs/browser-checks.log').read_text()
workflow=(OUT/'logs/workflow-browser-checks.log').read_text()
check('Current suite outputs substantiate counts','439 passed' in front and '70 passed' in front and 'ok  \tankara-5g-raytracer' in back and '16 passed' in browser and '11 passed' in workflow and '1 skipped' in workflow)
check('Mock/live/historical/skip evidence boundaries explicit','mocked' in r['phases'][5]['finding'].lower() and 'skips mobile' in md and any('historical raw' in x.lower() for x in r['methodology']['limits']))
check('Limits, methodology errors, raw policy and freeze decision disclosed',all(r['methodology'].get(x) for x in ['nonfatal_probe_errors','limits','not_run','raw_evidence_policy','freeze_decision','single_next_action']))
check('Historical raw archive availability recorded',(OUT/'frozen-evidence-availability.json').is_file())
# AST validation avoids writing pycache outside the requested artifacts.
syntax_errors=[]
for p in OUT.glob('*.py'):
    try: ast.parse(p.read_text(),filename=str(p))
    except SyntaxError as e: syntax_errors.append(str(e))
check('Audit Python support scripts parse',not syntax_errors,syntax_errors)
json_errors=[]
for p in [pathlib.Path(str(REPORT)+'.json'),*OUT.glob('*.json')]:
    try: json.loads(p.read_text())
    except Exception as e: json_errors.append(f'{p.name}: {e}')
check('Audit JSON artifacts parse',not json_errors,json_errors)
proc=subprocess.run(['python3',str(OUT/'audit.py'),'verify'],cwd=ROOT,text=True,capture_output=True)
(OUT/'logs/invariance.log').write_text(proc.stdout+proc.stderr)
invariance=json.loads((OUT/'invariance.json').read_text())
check('Every originally tracked source unchanged',proc.returncode==0 and not invariance['changed_or_missing_original_files'],invariance['original_tracked_files'])
check('HEAD branch version frozen',git('rev-parse','HEAD')==r['baseline']['head'] and git('branch','--show-current')=='main' and (ROOT/'VERSION').read_text().strip()=='0.12.1')
tracked_changed=git('diff','HEAD','--name-only')
allowed_reports={str(pathlib.Path(str(REPORT)+'.md').relative_to(ROOT)),str(pathlib.Path(str(REPORT)+'.json').relative_to(ROOT))}
new=git('ls-files','--others','--exclude-standard').splitlines()
unexpected=[p for p in new if p not in allowed_reports and not p.startswith('scripts/v0.12.1-post-release-audit/')]
check('Only requested audit additions; no production diff',not tracked_changed and not unexpected,unexpected)
check('git diff --check completed',subprocess.run(['git','diff','--check'],cwd=ROOT,capture_output=True).returncode==0)
whitespace=[]
for path in [pathlib.Path(str(REPORT)+'.md'),pathlib.Path(str(REPORT)+'.json'),*OUT.rglob('*')]:
    if not path.is_file() or path.suffix not in ('.md','.py','.json','.sha256'): continue
    for n,line in enumerate(path.read_text().splitlines(),1):
        if line.rstrip(' \t')!=line: whitespace.append(f'{path.relative_to(ROOT)}:{n}')
check('New audit text has no trailing whitespace',not whitespace,whitespace[:20])
result={'schema_version':1,'status':'complete' if all(x['passed'] for x in checks) else 'incomplete','scope':'Audit deliverables and evidence/freeze verification; intentionally does not repair frozen release defects.','checks':checks,'passed':sum(x['passed'] for x in checks),'total':len(checks),'known_product_gate_failures':['Strict OpenAPI3.1 schema has five invalid Response Objects; reported and left unchanged.'],'source_status':git('status','--short')}
(OUT/'completion-audit.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
# Manifest excludes itself only; no field in completion-audit.json embeds its hash.
paths=[pathlib.Path(str(REPORT)+'.md'),pathlib.Path(str(REPORT)+'.json'),*[p for p in OUT.rglob('*') if p.is_file() and p.name!='evidence-manifest.json']]
manifest={str(p.relative_to(ROOT)):{'sha256':sha(p),'bytes':p.stat().st_size} for p in sorted(paths)}
(OUT/'evidence-manifest.json').write_text(json.dumps({'policy':'All new audit artifacts except this self-referential manifest. Original source hashes remain in source-manifest.json.','files':manifest},indent=2)+'\n')
print(json.dumps({'status':result['status'],'passed':result['passed'],'total':result['total'],'failed':[x for x in checks if not x['passed']],'new_evidence_files':len(manifest)},indent=2))
raise SystemExit(result['status']!='complete')
