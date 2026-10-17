"""Verify audit completeness, unchanged source scope and immutable baseline."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent


def main():
    load = lambda p: json.loads(p.read_text())
    lock = HERE / 'pre-audit-lock.json'
    expected_hash = (HERE / 'pre-audit-lock.sha256').read_text().split()[0]
    assert hashlib.sha256(lock.read_bytes()).hexdigest() == expected_hash
    assert not lock.stat().st_mode & 0o222
    audit = load(ROOT / 'docs/v0.12.2-live-issue-validation-audit.json')
    plan = load(HERE / 'issue-mutation-plan.json')
    assert [i['issue_number'] for i in audit['issues']] == list(range(76, 91))
    assert len(plan['changes']) == 15 and plan['proposal_only'] and not plan['executed']
    assert not audit['github_mutations_executed'] and not audit['production_edits']
    counts = {}
    for issue in audit['issues']:
        assert issue['current_body'] and issue['acceptance_criteria']
        for criterion in issue['acceptance_criteria']:
            assert criterion['status'] in ['PASS', 'FAIL', 'PARTIAL', 'NOT YET TESTABLE', 'BLOCKED']
            assert criterion['explanation'] and criterion['evidence']
            counts[criterion['status']] = counts.get(criterion['status'], 0) + 1
        if issue['state'] == 'closed':
            assert all(c['status'] == 'PASS' for c in issue['acceptance_criteria'])
    assert sum(counts.values()) == 63
    changed = subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=ROOT, text=True).splitlines()
    assert changed == ['docs/doc-sources.json'], changed
    old_catalog = json.loads(subprocess.check_output(['git', 'show', 'HEAD:docs/doc-sources.json'], cwd=ROOT, text=True))
    new_catalog = load(ROOT / 'docs/doc-sources.json')
    additions = set(new_catalog['sources']) - set(old_catalog['sources'])
    assert additions == {'docs/v0.12.2-live-issue-validation-audit.md', 'docs/v0.12.2-live-issue-validation-audit.json'}
    for key, value in old_catalog.items():
        if key != 'sources':
            assert new_catalog[key] == value
    for path, value in old_catalog['sources'].items():
        assert new_catalog['sources'][path] == value, path
    labels = {x['name'] for x in load(HERE / 'evidence/labels.json')}
    forms = []
    for path in sorted((ROOT / '.github/ISSUE_TEMPLATE').glob('*.yml')):
        form = yaml.safe_load(path.read_text())
        if path.name == 'config.yml':
            assert form['blank_issues_enabled'] is False
            continue
        assert form['name'] and form['description'] and form['body']
        assert set(form['labels']) <= labels
        ids = [x['id'] for x in form['body'] if x['type'] != 'markdown']
        assert len(ids) == len(set(ids))
        for item in form['body']:
            assert item['type'] in ['markdown', 'input', 'textarea', 'dropdown', 'checkboxes']
            assert 'attributes' in item
            if item['type'] != 'markdown':
                assert item['attributes']['label']
        forms.append(path.relative_to(ROOT).as_posix())
    assert len(forms) == 2
    untracked = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=ROOT, text=True).splitlines()
    for path in untracked:
        assert path.startswith('scripts/v0.12.2-live-issue-validation-audit/') or path in additions, path
    files = [p for p in HERE.rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.name not in ['artifact-index.json', 'completion-verification.json']]
    files += [ROOT / path for path in additions]
    index = {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
    (HERE / 'artifact-index.json').write_text(json.dumps(index, indent=2) + '\n')
    result = {'passed': True, 'roadmap_issues': 15, 'criteria': counts, 'closed_material_criteria_all_pass': True,
              'original_lock_sha256': expected_hash, 'production_files_unchanged': True,
              'existing_catalog_entries_unchanged': True, 'catalog_additions': sorted(additions),
              'issue_forms_structurally_valid': forms, 'artifact_files_indexed': len(index), 'python': sys.version.split()[0]}
    (HERE / 'completion-verification.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
