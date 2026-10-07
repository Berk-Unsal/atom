#!/usr/bin/env python3
"""Capture quality checks independently of timed RF evidence."""
import datetime
import json
import pathlib
import os
import re
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORK = pathlib.Path('/tmp/atom-eight-cell-operational-audit')
COMMANDS = {
    'backend_tests': ('backend-go', ['go', 'test', './...']),
    'backend_race': ('backend-go', ['go', 'test', '-race', './...']),
    'backend_vet': ('backend-go', ['go', 'vet', './...']),
    'frontend_tests': ('frontend-react', ['npm', 'test']),
    'frontend_lint': ('frontend-react', ['npm', 'run', 'lint']),
    'frontend_build': ('frontend-react', ['npm', 'run', 'build']),
    'rf_budget_e2e': ('frontend-react', ['npx', 'playwright', 'test', 'e2e/rf-budget.spec.js', '--project=desktop-1440', '--workers=1']),
    'rf_deadline_e2e': ('frontend-react', ['npx', 'playwright', 'test', 'e2e/network-deadline.spec.js', '--project=desktop-1440', '--workers=1']),
    'auto_resource_profile_tests': ('backend-go', ['go', 'test', './...', '-run', 'ResourceProfile|AutoResource']),
    'w1_preservation_tests': ('.', ['python3', '-m', 'unittest', 'discover', '-s', 'scripts/w1-shipping-runtime-qualification', '-p', 'test_*.py']),
}

def required_test_executed(name, output):
    if name not in ['rf_budget_e2e', 'rf_deadline_e2e']:
        return True
    return bool(re.search(r'\b1 passed\b', output)) and not re.search(r'\b[1-9]\d* skipped\b', output)

def checks(stage):
    commands = dict(COMMANDS)
    if stage == 'final':
        commands.update({
            'audit_protocol_tests': ('.', ['python3', '-m', 'unittest', 'discover', '-s', str(HERE), '-p', 'test_*.py']),
            'docs_build': ('.', ['sh', 'docs/build-reference-pages.sh']),
            'docs_validation': ('.', [os.environ.get('ATOM_AUDIT_DOCS_PYTHON', '/tmp/atom-persistence-docs-venv/bin/python'), 'docs/validate_docs.py']),
            'version_consistency': ('.', ['python3', 'scripts/versioning.py', 'check']),
            'diff_check': ('.', ['git', 'diff', '--check']),
        })
    result = {}
    for name, (cwd, command) in commands.items():
        start = time.monotonic()
        logpath = WORK / f'{stage}-{name}.log'
        environment = dict(os.environ)
        if name in ['rf_budget_e2e', 'rf_deadline_e2e']:
            environment['ATOM_REAL_E2E'] = '1'
        with logpath.open('x') as log:
            code = subprocess.run(command, cwd=ROOT / cwd, env=environment, stdout=log, stderr=subprocess.STDOUT).returncode
        skipped = not required_test_executed(name, logpath.read_text())
        result[name] = {'command': command, 'cwd': cwd, 'exit_code': code, 'required_test_executed': not skipped, 'test_environment': {'ATOM_REAL_E2E': '1'} if name in ['rf_budget_e2e', 'rf_deadline_e2e'] else {}, 'seconds': time.monotonic() - start, 'completed_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        (HERE / f'{stage}-checks.json').write_text(json.dumps(result, indent=2) + '\n')
        print(stage, name, code, flush=True)
    return all(value['exit_code'] == 0 and value['required_test_executed'] for value in result.values())

if __name__ == '__main__':
    sys.exit(0 if checks(sys.argv[1]) else 1)
