#!/usr/bin/env python3
"""Repeat audit checks. Never regenerates production docs or qualification evidence.

Run with Python 3.12 plus PyYAML 6.0.3 and openapi-spec-validator 0.9.0.
Use --full to additionally rerun suites; default repeats static checks only.
"""
import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--full', action='store_true')
args = parser.parse_args()
env = dict(os.environ, GOTOOLCHAIN='go1.26.9')
for task_key in list(env):
    if task_key.startswith('ATOM_RUN_'):
        env.pop(task_key)
bundled_node = pathlib.Path('/Users/berkunsal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin')
if bundled_node.exists():
    env['PATH'] = str(bundled_node) + os.pathsep + env['PATH']
checks = [
    ('docs-validation', ROOT, [sys.executable, 'docs/validate_docs.py']),
    ('version', ROOT, [sys.executable, 'scripts/versioning.py', 'check']),
    ('policy', ROOT, [sys.executable, 'scripts/generate_policy.py', '--check']),
    ('openapi-contracts', ROOT, [sys.executable, str(OUT / 'contracts.py')]),
    ('invariance', ROOT, [sys.executable, str(OUT / 'audit.py'), 'verify']),
    ('diff-check', ROOT, ['git', 'diff', '--check']),
]
if args.full:
    checks += [
        ('backend-vet', ROOT / 'backend-go', ['go', 'vet', './...']),
        ('backend-tests', ROOT / 'backend-go', ['go', 'test', '-race', './...']),
        ('frontend-lint', ROOT / 'frontend-react', ['npm', 'run', 'lint']),
        ('frontend-tests', ROOT / 'frontend-react', ['npm', 'test']),
        ('frontend-build', ROOT / 'frontend-react', ['npm', 'run', 'build']),
        ('browser-checks', ROOT / 'frontend-react', ['npx', 'playwright', 'test', 'e2e/eight-cell-presentation.spec.js', 'e2e/docs-theme.spec.js', '--project=desktop-1440', '--project=mobile-390', '--workers=2']),
        ('workflow-browser-checks', ROOT / 'frontend-react', ['npx', 'playwright', 'test', 'e2e/workspace.spec.js', '--project=desktop-1440', '--project=mobile-390', '--workers=2', '--grep', 'completes the Run, optimization, apply, Version, and historical Report journey|explores a retained Pareto alternative|lazily explains a selected cell|switching Projects clears|keeps an unsaved draft|runs a sector and preserves a named scenario']),
        ('dataset-validation', ROOT / 'backend-go', ['go', 'run', './cmd/validate-dataset', '../data-pipeline']),
    ]
results = []
for name, cwd, command in checks:
    start = time.monotonic()
    with (OUT / 'logs' / (name + '.log')).open('w') as log:
        result = subprocess.run(command, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT)
    row = {'name': name, 'command': command, 'cwd': str(cwd.relative_to(ROOT)), 'exit_code': result.returncode, 'seconds': round(time.monotonic() - start, 3), 'log': 'logs/' + name + '.log'}
    results.append(row)
    print(json.dumps(row), flush=True)
(OUT / ('full-checks.json' if args.full else 'static-checks.json')).write_text(json.dumps(results, indent=2) + '\n')
raise SystemExit(any(x['exit_code'] for x in results))
