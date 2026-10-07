"""Preregistered guards; fail closed on missing or interrupted evidence."""
import hashlib
import importlib.util
import json
import pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORK = pathlib.Path('/tmp/atom-eight-cell-operational-audit')
spec = importlib.util.spec_from_file_location('w1_protocol', ROOT / 'scripts/w1-shipping-runtime-qualification/protocol.py')
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
complete_request = prior.complete_request
overlap = prior.overlap
slots = prior.slots
memory = prior.memory
background_failures = prior.background_failures

def load(path):
    return json.loads(path.read_text())

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def preserved():
    for name, digest in load(HERE / 'baseline.json')['preserved_sha256'].items():
        if sha(ROOT / name) != digest:
            raise ValueError('historical evidence changed: ' + name)

def verify():
    lock = load(HERE / 'audit-lock.json')
    assert sha(HERE / 'audit-lock.json') == (HERE / 'audit-lock.sha256').read_text().split()[0]
    for file in ['run-plans', 'domain-manifest']:
        assert sha(HERE / (file + '.json')) == lock[file + '_sha256']
    for name, digest in lock['input_sha256'].items():
        if sha(ROOT / name) != digest:
            raise ValueError('frozen input changed: ' + name)
    for name, digest in lock['fixture_sha256'].items():
        assert sha(WORK / 'fixtures' / name) == digest
    preserved()
    return lock

def reference_key(case):
    # Immutable fixture hash includes domain, frequency, cardinality, RF/search.
    return ('A', case['fixture'], sha(WORK / 'fixtures' / (case['fixture'] + '.json')), case['operation'])

def mixed_guard(plans, observations):
    available = {}
    for label, cases in plans.items():
        if '-single-' not in label or not label.startswith('A-8C-'):
            continue
        rows = observations.get(label, [])
        if len(rows) != len(cases):
            raise ValueError('incomplete isolated batch: ' + label)
        for index, (case, row) in enumerate(zip(cases, rows)):
            if row['plan_index'] != index or row['fixture'] != case['fixture'] or row['operation'] != case['operation'] or row['repeat'] != case['repeat'] or row['cardinality'] != 8:
                raise ValueError('isolated identity mismatch')
            if case['operation'] in ['evaluate', 'optimize']:
                if not all(r['status'] == 200 and r['stream_complete'] and r['server_completion_observed'] and not r['clock_discontinuity'] for r in row['responses']) or row['group_clock_discontinuity']:
                    raise ValueError('isolated reference incomplete or invalid')
                available.setdefault(reference_key(case), set()).add(case['repeat'])
    required = {}
    for label, cases in plans.items():
        if '-mixed-' not in label:
            continue
        for case in cases:
            op = case['operation']
            operations = ['optimize', 'evaluate'] if op == 'optimize-evaluate' else ['optimize'] if op in ['two-optimizers', 'async-optimize', 'sustained-optimize'] else ['evaluate']
            for operation in operations:
                key = reference_key({**case, 'operation': operation})
                required[key] = 5 if operation == 'evaluate' else 3
    missing = [key for key, repeats in required.items() if available.get(key, set()) != set(range(repeats))]
    if missing:
        raise ValueError('missing exact isolated references: ' + repr(missing))
    return {'passed': True, 'required_keys': [{'key': list(key), 'repeats': repeats} for key, repeats in sorted(required.items())]}

def budget_cost(operation, n):
    return {'evaluate-maps': n + 1, 'optimize-maps': n + 1, 'cycle': 2 * n + 3, 'cycle-boundary': 2 * n + 5, 'two-workflows': 2 * n + 2}[operation]

def manifest_verify(manifest, root=WORK):
    for row in manifest['artifacts']:
        path = root / row['path']
        if not path.is_file() or path.stat().st_size != row['byte_size'] or sha(path) != row['sha256']:
            raise ValueError('evidence identity failed: ' + row['path'])
