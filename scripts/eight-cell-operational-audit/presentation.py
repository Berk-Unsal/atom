#!/usr/bin/env python3
"""Prepare disposable eight-Cell UI; never modify production source or clamp."""
import json
import shutil
import subprocess
from protocol import HERE, ROOT, WORK, sha, verify

def presentation():
    verify()
    attempt = 2 if (WORK / 'presentation-artifacts.log').exists() else 1
    while (WORK / f'presentation-artifacts-{attempt}.log').exists():
        attempt += 1
    if not (HERE / 'presentation-persistence.json').exists():
        with (WORK / f'presentation-artifacts-{attempt}.log').open('x') as log:
            subprocess.run(['node', str(HERE / 'artifacts.mjs'), str(WORK)], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, check=True)
    frontend = WORK / f'frontend-smoke-{attempt}'
    shutil.copytree(ROOT / 'frontend-react', frontend, ignore=shutil.ignore_patterns('node_modules', 'dist', 'test-results', 'playwright-report', 'coverage'))
    (frontend / 'node_modules').symlink_to(ROOT / 'frontend-react/node_modules', target_is_directory=True)
    path = frontend / 'src/utils/networkSelection.js'
    source = path.read_text()
    assert source.count('MAX_NETWORK_CELLS = 6') == 1
    path.write_text(source.replace('MAX_NETWORK_CELLS = 6', 'MAX_NETWORK_CELLS = 8'))
    shutil.copyfile(HERE / 'frontend-smoke.spec.js.txt', frontend / 'e2e/eight-cell-audit.spec.js')
    # Dedicated port prevents reusing a shipping frontend by mistake.
    config = frontend / 'playwright.config.js'
    config.write_text(config.read_text().replace('4173', '18473').replace('retries: process.env.CI ? 2 : 0', 'retries: 0'))
    import os
    with (WORK / f'frontend-smoke-{attempt}.log').open('x') as log:
        code = subprocess.run(['npx', 'playwright', 'test', 'e2e/eight-cell-audit.spec.js', '--project=desktop-1440', '--workers=1'], cwd=frontend, env={**os.environ, 'ATOM_EIGHT_CELL_WORK': str(WORK), 'ATOM_EIGHT_CELL_UI_ATTEMPT': str(attempt)}, stdout=log, stderr=subprocess.STDOUT).returncode
    differential = {'attempt': attempt, 'shipping_selection_source_sha256': sha(ROOT / 'frontend-react/src/utils/networkSelection.js'), 'audit_selection_source_sha256': sha(path), 'source_difference': 'temporary frontend copy MAX_NETWORK_CELLS 6 to 8; production file unchanged; generated policy remains six', 'test_template_sha256': sha(HERE / 'frontend-smoke.spec.js.txt'), 'exit_code': code, 'result': json.loads((WORK / f'presentation/frontend-smoke-result-{attempt}.json').read_text()) if code == 0 else None, 'raw_log': str(WORK / f'frontend-smoke-{attempt}.log'), 'budget_stop_smoke': json.loads((WORK / f'presentation/frontend-budget-stop-{attempt}.json').read_text()) if code == 0 else None}
    with (WORK / f'presentation/frontend-smoke-attempt-{attempt}.json').open('x') as out:
        json.dump(differential, out, indent=2)
    (HERE / 'frontend-smoke.json').write_text(json.dumps(differential, indent=2) + '\n')
    verify()
    return code

if __name__ == '__main__':
    raise SystemExit(presentation())
