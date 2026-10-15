#!/usr/bin/env python3
"""Read-only audit support: freeze tracked source, scan claims, verify invariance."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()

def digest(data):
    return hashlib.sha256(data).hexdigest()

def write(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n')

def files():
    return git('ls-files').splitlines()

def identities():
    return {p: digest((ROOT / p).read_bytes()) for p in files() if (ROOT / p).is_file()}

def groups(manifest):
    selectors = {
        'backend': lambda p: p.startswith('backend-go/'),
        'frontend': lambda p: p.startswith('frontend-react/'),
        'rf_science': lambda p: p.startswith(('backend-go/raytracer/', 'backend-go/geo/')) or 'model' in p.lower() and p.startswith('backend-go/'),
        'policy_admission': lambda p: any(x in p.lower() for x in ('policy', 'admission', 'rf_protection', 'rf_workflow', 'resource_profile', 'resourceprofile')),
        'persistence': lambda p: any(x in p.lower() for x in ('persist', 'serializ', 'project', 'report', 'runhistory')),
        'openapi': lambda p: 'openapi' in p.lower(),
        'docs': lambda p: p.startswith('docs/') or p in ('README.md', 'CHANGELOG.md'),
        'version': lambda p: p == 'VERSION',
        'all_tracked': lambda p: True,
    }
    return {name: {'count': len(items := {p: h for p, h in manifest.items() if select(p)}),
                   'sha256': digest(json.dumps(items, sort_keys=True, separators=(',', ':')).encode())}
            for name, select in selectors.items()}

def freeze():
    if (OUT / 'criteria-lock.json').exists():
        raise SystemExit('Refusing to replace an existing pre-evaluation lock')
    baseline = {'utc': datetime.now(timezone.utc).isoformat(), 'branch': git('branch', '--show-current'),
                'head': git('rev-parse', 'HEAD'), 'version': (ROOT / 'VERSION').read_text().strip(),
                'status_porcelain': git('status', '--porcelain=v1'), 'diff_stat': git('diff', '--stat'),
                'tracked_diff': git('diff', 'HEAD', '--stat')}
    manifest = identities()
    write('baseline.json', baseline)
    write('source-manifest.json', manifest)
    criteria = {
        'audit': 'A.T.O.M v0.12.1 Post-Release Product + Scientific Coherence Audit',
        'locked_before_evaluation': True, 'baseline': baseline,
        'source_groups': groups(manifest),
        'request_sha256': digest(pathlib.Path('/Users/berkunsal/.codex/attachments/e52ba388-69f5-4a66-b65e-402811844bd0/Pasted text.txt').read_bytes()),
        'constraints': ['Audit only; no production changes', 'No caps, equations, search, Pareto, persistence, admission, Auto, concurrency, deadline, worker or resource changes', 'No fixes, release, tag, push, README rewrite or version change', 'Historical qualification reports are evidence, not copy to rewrite', 'No expensive requalification unless source differs materially'],
        'dimensions': ['product clarity', 'workflow coherence', 'scientific defensibility', 'evidence/claim alignment', 'external readiness'],
        'coverage': 'All requested phases 0–39 and final response items 1–51; report contains explicit phase and response mapping',
        'evidence_levels': {'A': 'Formally/deterministically verified in software', 'B': 'Operationally qualified within frozen scope', 'C': 'Standards-based model implementation', 'D': 'Research/reference only', 'E': 'Experimental/not validated against real measurements', 'F': 'Unsupported/overstated'},
        'claim_rule': 'Each atomic claim has exactly one primary A–F category; separate implementation correctness, operational qualification, standards basis and measured accuracy',
        'verdicts': {'A': 'Coherent and defensible', 'B': 'Strong product with positioning/workflow debt', 'C': 'Scientific claim-boundary defect', 'D': 'Product coherence defect', 'E': 'Invalid/insufficient evidence'},
        'decision_rule': 'Choose one verdict on material evidence. C if current product-facing wording materially implies unsupported accuracy/applicability; D for major disconnected/broken primary workflows; E if evidence insufficient; otherwise B for material clarity/workflow debt or A for alignment. Historical reports and isolated aspirational wording alone do not force C.',
        'score_anchors': {'1': 'Materially absent/misleading or blocks use', '2': 'Substantial gaps requiring expert recovery', '3': 'Usable with meaningful ambiguity/friction', '4': 'Clear and coherent with limited gaps', '5': 'Consistently explicit and well supported'},
        'score_dimensions': ['Purpose clarity', 'Onboarding', 'Workflow coherence', 'RF transparency', 'Result explainability', 'Scientific honesty', 'Visual hierarchy', 'Documentation', 'Persistence expectations', 'External readiness'],
        'severity': {'high': 'Material misinterpretation or workflow/claim failure', 'medium': 'Recoverable confusion or meaningful missing context', 'low': 'Local terminology/discoverability friction'},
        'method': ['Trace source with file/line evidence', 'Inspect current shipped screenshots and live local UI if feasible', 'Inspect frozen operational evidence without reproducing benchmarks', 'Run relevant backend/frontend tests, docs/OpenAPI/version/generated-policy checks', 'Record failures, unavailable surfaces, missing evidence and source drift explicitly', 'External feedback is qualitative supplied input, never proof', 'No enterprise capabilities inferred from labels'],
        'raw_evidence_policy': 'Store bounded command logs, scan inventory, source hashes and structured findings in audit directory; do not copy measurement campaigns, secrets, personal data, or regenerate historical evidence. Existing evidence cited in place. Live UI observations distinguish mock/backend/source; no measured accuracy inference.'
    }
    write('criteria-lock.json', criteria)
    sha = digest((OUT / 'criteria-lock.json').read_bytes())
    (OUT / 'criteria-lock.sha256').write_text(sha + '  criteria-lock.json\n')
    print(json.dumps({'baseline': baseline, 'audit_lock_sha256': sha, 'source_groups': criteria['source_groups']}, indent=2))

def verify():
    original = json.loads((OUT / 'source-manifest.json').read_text())
    current = identities()
    changed = [p for p, h in original.items() if current.get(p) != h]
    lock_sha = digest((OUT / 'criteria-lock.json').read_bytes())
    expected = (OUT / 'criteria-lock.sha256').read_text().split()[0]
    result = {'original_tracked_files': len(original), 'changed_or_missing_original_files': changed,
              'new_tracked_files': sorted(set(current) - set(original)), 'criteria_lock_unchanged': lock_sha == expected,
              'version': (ROOT / 'VERSION').read_text().strip(), 'head_unchanged': git('rev-parse', 'HEAD') == json.loads((OUT / 'baseline.json').read_text())['head'],
              'source_groups': groups({p: current[p] for p in original if p in current}), 'status': git('status', '--porcelain=v1')}
    write('invariance.json', result)
    print(json.dumps(result, indent=2))
    return bool(changed or lock_sha != expected or result['version'] != '0.12.1' or not result['head_unchanged'])

def scan():
    pattern = re.compile(r'accurat\w*|validat\w*|realis\w*|real.world|operator.grade|precis\w*|calibrat\w*|production.grade|verified RF|1\.5|2 minutes|seconds|eight.cell|8.cell|Profile A|2 CPU|4 GiB', re.I)
    rows = []
    for p in files():
        if p.startswith(('scripts/v0.12.1-post-release-audit/', 'docs/v0.12.1-post-release-product-scientific-audit.')):
            continue
        if not (p == 'README.md' or p == 'CHANGELOG.md' or p.startswith(('docs/', 'frontend-react/src/', 'examples/'))):
            continue
        if pathlib.Path(p).suffix not in ('.md', '.html', '.yaml', '.yml', '.jsx', '.js'):
            continue
        if '.test.' in p:
            continue
        try:
            lines = (ROOT / p).read_text().splitlines()
        except (UnicodeDecodeError, OSError):
            continue
        for n, line in enumerate(lines, 1):
            if pattern.search(line):
                rows.append({'file': p, 'line': n, 'text': line[:1800], 'surface': 'historical_evidence' if any(x in p for x in ('audit', 'qualification', 'study', 'design', 'report', 'validation-plan', 'concept-')) else 'review_required'})
    write('claim-language-scan.json', rows)
    print(f'{len(rows)} candidate occurrences; semantic context must be assessed, not inferred from matches')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['freeze', 'verify', 'scan'])
    args = parser.parse_args()
    if args.command == 'freeze': freeze()
    elif args.command == 'scan': scan()
    else: raise SystemExit(verify())
