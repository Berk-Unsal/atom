#!/usr/bin/env python3
"""Freeze all inputs, domains and groups prospectively; never overwrite a lock."""
import datetime
import json
import random
import subprocess
from protocol import HERE, ROOT, WORK, load, sha, preserved
from inventory import inventory

def write(name, value):
    path = HERE / (name + '.json')
    with path.open('x') as out:
        json.dump(value, out, indent=2, sort_keys=True)
        out.write('\n')
    with (HERE / (name + '.sha256')).open('x') as out:
        out.write(sha(path) + '  ' + path.name + '\n')

def freeze():
    if (HERE / 'audit-lock.json').exists():
        raise ValueError('already frozen; no overwrite')
    if list(WORK.glob('A-*/runs.jsonl')):
        raise ValueError('scoring evidence already exists')
    preserved()
    checks = load(HERE / 'baseline-checks.json')
    assert len(checks) == 10 and all(v['exit_code'] == 0 for v in checks.values())
    binary = load(HERE / 'binary-differential.json')
    assert len(binary['source_differences']) == 1
    domains = load(WORK / 'layout-selection.json')
    geometry = load(WORK / 'layout-geometry.json')
    for d in domains['selected']:
        d['paired_geometry'] = geometry[d['id']]
        assert d['stats']['footprints'] == geometry[d['id']]['6C']['footprints']
        assert d['stats']['vertices'] == geometry[d['id']]['6C']['vertices']
        d['profiles_by_frequency'] = {str(f): [t['rf_profile'] for t in load(WORK / 'fixtures' / f"{d['id']}-{f}-8C-W1.json")['network']['towers']] for f in [2.6, 28]}
    write('domain-manifest', domains)
    write('historical-comparison', load(WORK / 'historical-comparison.json'))
    inventory()
    dataset = load(ROOT / 'scripts/w1-shipping-runtime-qualification/qualification-lock.json')['dataset']
    for filename, digest in dataset['sha256'].items():
        assert sha(ROOT / 'data-pipeline' / filename) == digest
    plans, order, kinds = {}, [], {}
    seed = 20261007
    def case(d, freq, n, op, repeat=0, capture=False):
        return {'fixture': f"{d['id']}-{freq}-{n}C-W1", 'operation': op, 'repeat': repeat, 'capture': capture}
    def batch(label, rows, kind):
        random.Random(seed + len(order)).shuffle(rows)
        plans[label] = rows
        order.append(label)
        kinds[label] = kind
    sparse = next(d for d in domains['selected'] if d['id'] == 'sparse-certification-1')
    dense = next(d for d in domains['selected'] if d['id'] == 'dense-certification-1')
    batch('A-6C-contracts', [case(sparse, 2.6, 8, 'standard-cap')], 'standard')
    # Five repeats per DOMAIN/frequency/cardinality for Evaluate/Interference,
    # three for Optimize/Explain/Building Entry. All eight domains participate.
    for segment, repeats in enumerate([[0, 1], [2, 3], [4]]):
        for n in ([6, 8] if segment % 2 == 0 else [8, 6]):
            rows = []
            for d in domains['selected']:
                for freq in [2.6, 28]:
                    for repeat in repeats:
                        for op in ['evaluate', 'interference', 'optimize', 'explain', 'building-entry']:
                            if op in ['optimize', 'explain', 'building-entry'] and repeat >= 3:
                                continue
                            capture = repeat == 0 and d['id'] == dense['id'] and freq == 2.6 and op in ['evaluate', 'optimize', 'interference', 'explain']
                            rows.append(case(d, freq, n, op, repeat, capture))
            batch(f'A-{n}C-single-{segment}', rows, 'standard' if n == 6 else 'audit')
    for n in [6, 8]:
        rows = [case(d, freq, n, op, 0, d['id'] == dense['id'] and freq == 2.6) for d in domains['selected'] for freq in [2.6, 28] for op in ['evaluate-maps', 'optimize-maps']]
        rows += [case(d, freq, n, op) for d in [sparse, dense] for freq in [2.6, 28] for op in ['cycle-boundary', 'two-workflows', 'shared-ip', 'journey-A', 'journey-B', 'journey-C', 'journey-D']]
        batch(f'A-{n}C-workflows', rows, 'standard' if n == 6 else 'audit')
    for repeat in range(3):
        rows = [case(d, freq, 8, op, repeat) for d in [sparse, dense] for freq in [2.6, 28] for op in ['two-optimizers', 'optimize-evaluate', 'two-evaluates', 'async-optimize', 'async-evaluate', 'sustained-optimize', 'sustained-evaluate']]
        batch(f'A-8C-mixed-{repeat}', rows, 'audit')
    batch('A-8C-cancellation', [case(d, freq, 8, 'cancel', repeat) for d in [sparse, dense] for freq in [2.6, 28] for repeat in range(3)], 'audit')
    historical = {'id': 'historical-continuity'}
    for n in [6, 8]:
        batch(f'A-{n}C-historical', [case(historical, freq, n, op) for freq in [2.6, 28] for op in ['evaluate', 'optimize', 'interference']], 'standard' if n == 6 else 'audit')
    write('run-plans', plans)
    files = subprocess.check_output(['git', 'ls-files', 'backend-go', 'frontend-react/src', 'policy', 'Dockerfile', 'VERSION', 'docs/openapi.yaml', 'scripts/generate_policy.py'], cwd=ROOT, text=True).splitlines()
    files += [str(p.relative_to(ROOT)) for p in HERE.iterdir() if p.name in ['client.py', 'transport.py', 'runtime.py', 'protocol.py', 'run.py', 'layouts.mjs', 'geometry.go', 'historical.mjs', 'freeze.py', 'build.py', 'inventory.py', 'binary-differential.json', 'cardinality-contracts.json']]
    files += ['scripts/w1-shipping-runtime-qualification/client.py', 'scripts/w1-shipping-runtime-qualification/protocol.py']
    lock = {'schema_version': 1, 'locked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'baseline': {k: v for k, v in load(HERE / 'baseline.json').items() if k != 'preserved_sha256'}, 'source_differential': binary, 'dataset': dataset, 'profile': {'id': 'A', 'cpus': 2, 'memory_gib': 4}, 'W1': {'rays': 120, 'radius_m': 400, 'tx_power_dbm': 30, 'beam_width_deg': 120, 'frequencies_ghz': [2.6, 28], 'interference_bandwidth_mhz': {'2.6': 20, '28': 100}, 'search': 'unchanged legacy two-pass coordinate search', 'cells': [6, 8], 'single_cell_simulation': 'unchanged'}, 'production_invariants': {'cell_cap': 6, 'attempts': 20, 'window_seconds': 60, 'identity': 'ClientIP from real TCP source IP; no proxy substitute', 'global_concurrency': 2, 'per_client_concurrency': 1, 'deadline_seconds': 60, 'workers': 1, 'queue': 16, 'auto': 'observation-only', 'adaptive_admission': 'paused'}, 'gates': {'request_elapsed_max_seconds': 45, 'deadline_headroom_min_seconds': 15, 'cgroup_peak_fraction_max': .75, 'memory_limit_bytes': 4 << 30, 'oom': 0, 'oom_kill': 0, 'max': 0, 'cancel_after_seconds': .1, 'cancel_release_max_seconds': 2, 'science_volatile_exclusions': ['Building Entry diagnostics.elapsed_ms'], 'concurrency': 'both true overlapping requests successful; probes confirm two global/per-client slots usable'}, 'timing': {'clocks': ['monotonic', 'UTC'], 'score': 'longer interval for requests and complete groups', 'discontinuity_threshold_seconds': 1, 'handling': 'preserve original observation; no replacement; affected required group invalidates conclusion; execute remaining locked groups'}, 'background': {'method': 'unchanged certified W1 client Background/workload', 'workers': 1, 'queue': 16, 'normal_runs': 16, 'sustained_runs_per_job': 64, 'target_pending_jobs': 8, 'maximum_submissions': 1024, 'sample_seconds': .05, 'active_first_30_seconds_fraction': .95, 'final_tail': 'additional interactive request at/after thirty seconds from actual first request; native interval contains each launch; producer through completion', 'drain': 'cancel pending then uncached sentinel; existing protocol'}, 'repeats': {'evaluate_per_domain_frequency_cardinality': 5, 'interference_per_domain_frequency_cardinality': 5, 'optimize_explain_building_entry_per_domain_frequency_cardinality': 3, 'mixed_per_sparse_dense_frequency': 3}, 'decision_space': {'A': 'GO', 'B': 'CONDITIONAL GO — REQUEST-BUDGET POLICY BLOCKER', 'C': 'NO-GO — OPERATIONAL CAPACITY', 'D': 'INVALID / INSUFFICIENT'}, 'budget_product_fit_rule': 'Concrete accepted/denied journeys, residual attempts and actual anchored-window time; mechanical fit alone is insufficient. No new limiter threshold.', 'B_comparison': 'not preregistered; forbidden as rescue', 'batch_order': order, 'batch_binary': kinds, 'seed': seed, 'domain-manifest_sha256': sha(HERE / 'domain-manifest.json'), 'run-plans_sha256': sha(HERE / 'run-plans.json'), 'input_sha256': {name: sha(ROOT / name) for name in files if (ROOT / name).is_file()}, 'fixture_sha256': {p.name: sha(p) for p in sorted((WORK / 'fixtures').glob('*.json'))}, 'no_early_stopping': True, 'no_posthoc_replacements': True, 'storage': 'raw files kept in reproducible /tmp/atom-eight-cell-operational-audit; tracked SHA256/size/group/category manifest only'}
    write('audit-lock', lock)
    for suffix in ['md', 'json']:
        path = ROOT / 'docs' / ('eight-cell-operational-budget-audit.' + suffix)
        with path.open('x') as out:
            out.write('# Eight-Cell Operational + Request-Budget Re-audit\n\nPreregistered; execution pending. Production cap remains six.\n' if suffix == 'md' else json.dumps({'schema_version': 1, 'status': 'PREREGISTERED / NOT COMPLETE', 'audit_lock_sha256': sha(HERE / 'audit-lock.json'), 'product_cap': 6}, indent=2) + '\n')
    print('LOCK', sha(HERE / 'audit-lock.json'), 'groups', sum(map(len, plans.values())), flush=True)

if __name__ == '__main__':
    freeze()
