#!/usr/bin/env python3
"""Score the immutable matrix and budget journeys; retain every failure."""
import collections
import datetime
import gzip
import json
import re
import statistics
from protocol import HERE, ROOT, WORK, load, sha, verify, complete_request, slots, memory, overlap, background_failures

LIMIT = 4 << 30

def median(values):
    return statistics.median(values) if values else None

def native_interval(response):
    log = response.get('server_completion_log') or ''
    parts = log.split('|')
    if len(parts) < 3:
        return None
    end = datetime.datetime.fromisoformat(log.split()[0].replace('Z', '+00:00')).timestamp()
    duration = parts[2].strip()
    units = {'ns': 1e-9, 'µs': 1e-6, 'us': 1e-6, 'ms': .001, 's': 1, 'm': 60, 'h': 3600}
    tokens = re.findall(r'([\d.]+)(ns|µs|us|ms|s|m|h)', duration)
    if not tokens:
        return None
    elapsed = sum(float(value) * units[unit] for value, unit in tokens)
    return end - elapsed, end

def native_overlap(responses):
    intervals = [native_interval(r) for r in responses]
    return len(intervals) == 2 and all(v is not None for v in intervals) and min(v[1] for v in intervals) > max(v[0] for v in intervals)

def scientific_digest(response, operation):
    if response['endpoint'] == '/api/building-entry-analysis':
        if 'scientific_sha256' not in response:
            if operation != 'standard-cap':
                raise ValueError('missing required Building Entry canonical evidence')
            return None
        return response['scientific_sha256']
    return response['sha256']

def classification(complete, violations, interruptions, measured_capacity, mechanical_budget, fit):
    if not complete or violations or interruptions:
        return 'D'
    if not measured_capacity:
        return 'C'
    if mechanical_budget and fit == 'PRODUCT BLOCKER':
        return 'B'
    if mechanical_budget and fit in ['HEALTHY', 'TIGHT BUT USABLE']:
        return 'A'
    return 'D'

def summarize(rows):
    responses = [r for q in rows for r in q['responses']]
    return {'groups': len(rows), 'responses': len(responses), 'statuses': dict(collections.Counter(str(r['status']) for r in responses)), 'max_request_seconds': max((r['elapsed_seconds'] for r in responses), default=0), 'median_group_seconds': median([q['group_elapsed_seconds'] for q in rows]), 'max_group_seconds': max((q['group_elapsed_seconds'] for q in rows), default=0), 'median_cpu_seconds': median([(q['after']['cpu']['usage_usec'] - q['before']['cpu']['usage_usec']) / 1e6 for q in rows]), 'median_process_cpu_seconds': median([q['after']['process_cpu_seconds'] - q['before']['process_cpu_seconds'] for q in rows]), 'max_RSS_bytes': max((q['rss_sampled_max_bytes'] for q in rows), default=0), 'max_cgroup_current_sampled_bytes': max((q['cgroup_sampled_max_bytes'] for q in rows), default=0), 'max_cgroup_lifetime_peak_bytes': max((q['cgroup_lifetime_peak_bytes'] for q in rows), default=0), 'median_response_bytes': median([sum(r['response_bytes'] for r in q['responses']) for q in rows]), 'largest_single_response_bytes': max((r['response_bytes'] for r in responses), default=0), 'largest_workflow_response_bytes': max((sum(r['response_bytes'] for r in q['responses']) for q in rows), default=0)}

def expected_denial(row, index):
    op = row['operation']
    if op == 'cycle-boundary' and row['cardinality'] == 8:
        return index == 20
    if op in ['journey-C', 'shared-ip']:
        return index >= 20
    return False

def group_failures(row):
    reasons = []
    op = row['operation']
    for index, r in enumerate(row['responses']):
        if op == 'standard-cap':
            good = r['status'] == r['expected_status'] and r['stream_complete'] and r['server_completion_observed']
        elif op == 'cancel':
            good = r['status'] == 0 and r['server_completion_observed'] and r['elapsed_seconds'] < 1 and r['release_observation_seconds'] <= 2 and row['slot_probes'][0]['remaining'] == '18'
        elif expected_denial(row, index) and r['status'] == 429:
            good = r['stream_complete'] and r['server_completion_observed'] and r['remaining'] == '0' and int(r.get('retry_after') or 0) > 0
        else:
            good = complete_request(r)
        if not good:
            reasons.append(f'request {index + 1}: HTTP/complete stream/time/release contract')
    if not slots(row):
        reasons.append('two distinct-client slot probes failed or did not overlap')
    if not memory(row, LIMIT):
        reasons.append('cgroup peak or OOM/max event gate')
    if op in ['two-optimizers', 'optimize-evaluate', 'two-evaluates'] and (not overlap(row['responses']) or not native_overlap(row['responses'])):
        reasons.append('primary client and native Gin intervals did not overlap')
    if op.startswith(('async-', 'sustained-')):
        path = WORK / row['extra']['background_file']
        reasons += background_failures(row, load(path)) if path.exists() else ['missing native background evidence']
    if op == 'shared-ip' and not complete_request(row['extra']['distinct_ip_probe']):
        reasons.append('distinct-IP protected probe failed')
    return reasons

def budget_row(row):
    responses = row['responses']
    op, n = row['operation'], row['cardinality']
    cycle = responses[:2 * n + 3] if op == 'cycle-boundary' else responses
    first, final = cycle[0], cycle[-1]
    elapsed = max(datetime.datetime.fromisoformat(final['end']).timestamp() - datetime.datetime.fromisoformat(first['start']).timestamp(), sum(r['monotonic_seconds'] for r in cycle))
    # Shipping metadata is relative integer seconds, not an exact server epoch.
    # Report the actual client interval and a clearly labelled anchor estimate.
    start = datetime.datetime.fromisoformat(first['start'])
    expiry = start + datetime.timedelta(seconds=60)
    mechanical = None
    if op in ['evaluate-maps', 'optimize-maps', 'cycle-boundary', 'two-workflows']:
        expected_count = n + 1 if op in ['evaluate-maps', 'optimize-maps'] else 2 * n + 3 if op == 'cycle-boundary' else 2 * n + 2
        mechanical = len(cycle) == expected_count and all(r['status'] == 200 for r in cycle) and [r['remaining'] for r in cycle] == [str(19 - i) for i in range(expected_count)]
        if op == 'cycle-boundary' and n == 8:
            mechanical = mechanical and len(responses) == 21 and responses[19]['status'] == 200 and responses[19]['remaining'] == '0' and responses[20]['status'] == 429 and responses[20]['remaining'] == '0' and int(responses[20]['retry_after'] or 0) > 0
    return {'batch': row['batch'], 'index': row['plan_index'], 'fixture': row['fixture'], 'cardinality': n, 'operation': op, 'attempts': len(responses), 'workflow_attempts': len(cycle), 'accepted': sum(r['status'] == 200 for r in responses), 'first_429_attempt': next((i + 1 for i, r in enumerate(responses) if r['status'] == 429), None), 'first_attempt_at': first['start'], 'final_workflow_response_at': final['end'], 'anchored_bucket_expiry_client_estimate': expiry.isoformat(), 'anchor_precision': 'client request start; true server admission occurs after TCP connect/body send; shipping headers expose only integer relative reset seconds', 'elapsed_first_to_final_seconds': elapsed, 'remaining_after_workflow': final['remaining'], 'remaining_window_client_estimate_seconds': max(0, 60 - elapsed), 'last_admission_reset_header_seconds': final.get('rate_reset_seconds'), 'mechanical_exact_one_window_pass': mechanical, 'total_response_bytes': sum(r['response_bytes'] for r in responses), 'logical_workflow_response_bytes': sum(r['response_bytes'] for r in cycle), 'sequence': [{'attempt': i + 1, 'endpoint': r['endpoint'], 'client_ip': r['client_ip'], 'status': r['status'], 'remaining': r['remaining'], 'reset_seconds': r.get('rate_reset_seconds'), 'retry_after': r.get('retry_after'), 'start': r['start'], 'end': r['end'], 'bytes': r['response_bytes']} for i, r in enumerate(responses)], 'extra': row['extra']}

def analyze():
    lock = verify()
    plans = load(HERE / 'run-plans.json')
    execution = load(HERE / 'execution.json') if (HERE / 'execution.json').exists() else {'batches': {}}
    rows, completion, violations, interruptions, failures = [], {}, [], [], []
    for label, cases in plans.items():
        folder = WORK / label
        path = folder / 'runs.jsonl'
        observed = [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []
        meta = execution['batches'].get(label, {})
        completion[label] = {'planned': len(cases), 'observed': len(observed), 'complete': len(cases) == len(observed) and meta.get('exit_code') == 0}
        for index, row in enumerate(observed):
            if index >= len(cases) or any(row.get(k) != v for k, v in {**cases[index], 'batch': label, 'plan_index': index, 'audit_lock_sha256': sha(HERE / 'audit-lock.json')}.items()):
                violations.append(label + ': ledger identity mismatch')
            if row['group_clock_discontinuity'] or any(r['clock_discontinuity'] for r in row['responses'] + row['slot_probes']):
                interruptions.append({'batch': label, 'index': index})
            reasons = group_failures(row)
            if reasons:
                failures.append({'batch': label, 'index': index, 'fixture': row['fixture'], 'operation': row['operation'], 'cardinality': row['cardinality'], 'reasons': reasons})
        rows += observed
    all_complete = all(v['complete'] for v in completion.values())
    defect_path = HERE / 'methodology-defect.json'
    methodology_defects = [load(defect_path)] if defect_path.exists() else []
    violations += [d['id'] + ': ' + d['description'] for d in methodology_defects]
    scientific = collections.defaultdict(set)
    contexts = collections.defaultdict(set)
    auxiliary_uncanonical = []
    for row in rows:
        for r in row['responses'] + row['slot_probes']:
            if r['status'] != 200 or not r['stream_complete']:
                continue
            try:
                digest = scientific_digest(r, row['operation'])
            except ValueError as error:
                violations.append(str(error))
                digest = None
            if digest is None:
                # The initial shipping cap proof streams a success body to a
                # raw hash only. It is contract evidence, not a scientific
                # qualification repeat: elapsed_ms remains in that raw hash.
                # All required Building Entry repeats retain canonical bodies.
                auxiliary_uncanonical.append({'batch': row['batch'], 'index': row['plan_index'], 'endpoint': r['endpoint'], 'raw_sha256': r['sha256'], 'scope': 'shipping cap proof only; not scientific evidence'})
                continue
            key = (r['endpoint'], r['request_sha256'])
            scientific[key].add(digest)
            contexts[key].add('isolated' if '-single-' in row['batch'] else 'concurrent' if row['operation'] in ['two-optimizers', 'two-evaluates', 'optimize-evaluate'] else 'async' if row['operation'].startswith(('async-', 'sustained-')) else 'workflow/control')
    unstable = [{'endpoint': k[0], 'request_sha256': k[1], 'hashes': sorted(v)} for k, v in scientific.items() if len(v) != 1]
    science = {'stable': bool(scientific) and not unstable, 'exact_input_groups': len(scientific), 'unstable': unstable, 'contexts': [{'endpoint': k[0], 'request_sha256': k[1], 'contexts': sorted(v)} for k, v in sorted(contexts.items()) if len(v) > 1], 'volatile_exclusions': ['Building Entry diagnostics.elapsed_ms only'], 'auxiliary_raw_cap_proof_hashes_not_scientific_evidence': auxiliary_uncanonical}
    prior_hashes = collections.defaultdict(set)
    prior_dir = ROOT / 'scripts/w1-shipping-runtime-qualification/evidence'
    for path in prior_dir.glob('A-*-runs.jsonl.gz'):
        for line in gzip.decompress(path.read_bytes()).decode().splitlines():
            old = json.loads(line)
            for r in old['responses'] + old['slot_probes']:
                if r['status'] == 200 and r['stream_complete']:
                    prior_hashes[(r['endpoint'], r['request_sha256'])].add(r.get('scientific_sha256', r['sha256']))
    regressions, preservation_matches, preservation_missing = [], 0, []
    six = [q for q in rows if q['batch'].startswith('A-6C-') and '-single-' in q['batch']]
    for q in six:
        for r in q['responses']:
            key = (r['endpoint'], r['request_sha256'])
            if key not in prior_hashes:
                preservation_missing.append(list(key))
            elif r.get('scientific_sha256', r['sha256']) not in prior_hashes[key]:
                regressions.append({'endpoint': key[0], 'request_sha256': key[1]})
            else:
                preservation_matches += 1
    preservation = {'passed': bool(six) and not regressions and not preservation_missing and not any(f['cardinality'] == 6 for f in failures), 'responses_matching_frozen_W1': preservation_matches, 'missing_reference_keys': sorted({tuple(v) for v in preservation_missing}), 'regressions': regressions}
    pairs = []
    grouped = collections.defaultdict(list)
    for row in rows:
        if '-single-' in row['batch'] or row['operation'] in ['evaluate-maps', 'optimize-maps']:
            grouped[(row['domain'], row['frequency_ghz'], row['operation'], row['cardinality'])].append(row)
    for domain, freq, op in sorted({k[:3] for k in grouped}):
        six_stats = summarize(grouped[(domain, freq, op, 6)])
        eight_stats = summarize(grouped[(domain, freq, op, 8)])
        def ratio(field):
            a, b = six_stats[field], eight_stats[field]
            return b / a if a is not None and b is not None and a else None
        pairs.append({'domain': domain, 'frequency_ghz': freq, 'operation': op, '6C': six_stats, '8C': eight_stats, 'wall_ratio': ratio('median_group_seconds'), 'cpu_ratio': ratio('median_cpu_seconds'), 'response_byte_ratio': ratio('median_response_bytes'), 'sampled_cgroup_current_delta_bytes': eight_stats['max_cgroup_current_sampled_bytes'] - six_stats['max_cgroup_current_sampled_bytes'], 'sampled_RSS_delta_bytes': eight_stats['max_RSS_bytes'] - six_stats['max_RSS_bytes']})
    eight = [q for q in rows if q['cardinality'] == 8 and q['operation'] != 'standard-cap']
    required = [r for q in eight for i, r in enumerate(q['responses']) if q['operation'] != 'cancel' and not (expected_denial(q, i) and r['status'] == 429)] + [r for q in eight for r in q['slot_probes']]
    required += [q['extra']['distinct_ip_probe'] for q in eight if q['operation'] == 'shared-ip']
    worst = max(required, key=lambda r: r['elapsed_seconds']) if required else None
    budgets = [budget_row(q) for q in rows if q['operation'] in ['evaluate-maps', 'optimize-maps', 'cycle-boundary', 'two-workflows', 'shared-ip'] or q['operation'].startswith('journey-')]
    mechanical_cases = [b for b in budgets if b['cardinality'] == 8 and b['mechanical_exact_one_window_pass'] is not None]
    shared = [q for q in eight if q['operation'] == 'shared-ip']
    shared_pass = bool(shared) and all(q['extra']['distinct_ip_probe']['status'] == 200 and q['extra']['distinct_ip_probe']['remaining'] == '19' and q['responses'][20]['status'] == 429 and len({r['client_ip'] for r in q['responses']}) == 1 for q in shared)
    mechanical_pass = all_complete and bool(mechanical_cases) and all(b['mechanical_exact_one_window_pass'] for b in mechanical_cases) and shared_pass
    cycles = [b for b in budgets if b['cardinality'] == 8 and b['operation'] == 'cycle-boundary']
    # Predeclared qualitative rule: one remaining attempt, with an empirically
    # denied immediate substantive next workflow inside the same live window.
    fragile = bool(cycles) and all(b['remaining_after_workflow'] == '1' and b['remaining_window_client_estimate_seconds'] > 0 for b in cycles) and any(b['operation'] == 'journey-C' and b['cardinality'] == 8 and b['first_429_attempt'] == 21 for b in budgets)
    product_fit = 'PRODUCT BLOCKER' if fragile else 'TIGHT BUT USABLE' if mechanical_pass else 'UNDETERMINED'
    capacity_failures = [f for f in failures if f['cardinality'] == 8 and f['operation'] != 'standard-cap']
    measured_operational_pass = all_complete and not capacity_failures and not unstable and preservation['passed'] and not interruptions
    operational_pass = measured_operational_pass and not violations
    decision = classification(all_complete, violations, interruptions, measured_operational_pass, mechanical_pass, product_fit)
    contention = []
    for q in eight:
        if '-mixed-' not in q['batch']:
            continue
        for r in q['responses']:
            op = 'optimize' if r['endpoint'] == '/api/optimize-network' else 'evaluate'
            refs = [x['responses'][0]['elapsed_seconds'] for x in grouped[(q['domain'], q['frequency_ghz'], op, 8)]]
            if refs:
                contention.append({'batch': q['batch'], 'index': q['plan_index'], 'fixture': q['fixture'], 'operation': q['operation'], 'endpoint': r['endpoint'], 'seconds': r['elapsed_seconds'], 'isolated_median_seconds': median(refs), 'inflation_ratio': r['elapsed_seconds'] / median(refs)})
    background = [{'batch': q['batch'], 'index': q['plan_index'], 'operation': q['operation'], 'fixture': q['fixture'], 'passed': not group_failures(q), 'reasons': group_failures(q), 'interactive_calls': len(q['responses']), 'final_tail_overlap': not background_failures(q, load(WORK / q['extra']['background_file'])) if q['operation'].startswith('sustained-') else None} for q in eight if q['operation'].startswith(('async-', 'sustained-'))]
    gc = {}
    for label in plans:
        path = WORK / label / 'server.log'
        lines = path.read_text() if path.exists() else ''
        heaps = [tuple(map(int, v)) for v in re.findall(r'(\d+)->(\d+)->(\d+) MB', lines)]
        gc[label] = {'events': len(heaps), 'max_gc_start_heap_mib': max((v[0] for v in heaps), default=None), 'max_gc_end_heap_mib': max((v[1] for v in heaps), default=None), 'max_gc_live_heap_mib': max((v[2] for v in heaps), default=None), 'limitation': 'stock GODEBUG=gctrace diagnostics at GC events; not continuous HeapAlloc peak'}
    result = {'schema_version': 1, 'status': 'complete' if all_complete else 'in progress', 'classification': decision, 'decision': lock['decision_space'][decision], 'scope': 'Exact eight paired W1 domains, frequencies 2.6/28 GHz, shipping Go1.26.6 Linux/arm64 CGO0 cgroupv2 Profile A 2CPU/4GiB; audit-only eight Cells', 'baseline': lock['baseline'], 'hashes': {'audit_lock': sha(HERE / 'audit-lock.json'), 'domain_manifest': sha(HERE / 'domain-manifest.json'), 'run_plans': sha(HERE / 'run-plans.json')}, 'binary_differential': lock['source_differential'], 'dataset': lock['dataset'], 'W1': lock['W1'], 'production_invariants': lock['production_invariants'], 'planned_groups': sum(map(len, plans.values())), 'observed_groups': len(rows), 'completion': completion, 'methodology_violations': violations, 'methodology_defects': methodology_defects, 'measured_operational_gate_pass': measured_operational_pass, 'interrupted_observations': interruptions, 'all_group_failures': failures, 'operational_pass': operational_pass, 'capacity_failures': capacity_failures, 'eight_cell_summary': summarize(eight), 'worst_required_eight_cell_request': worst, 'minimum_deadline_headroom_seconds': 60 - worst['elapsed_seconds'] if worst else None, 'memory': {'peak_bytes': max((q['cgroup_lifetime_peak_bytes'] for q in eight), default=0), 'headroom_fraction': 1 - max((q['cgroup_lifetime_peak_bytes'] for q in eight), default=0) / LIMIT, 'peak_RSS_bytes': max((q['rss_sampled_max_bytes'] for q in eight), default=0), 'events': {k: max((q['after_probes']['memory_events'].get(k, 0) for q in rows), default=0) for k in ['oom', 'oom_kill', 'max']}, 'GC': gc}, 'paired_results': pairs, 'operations': {op: summarize([q for q in eight if q['operation'] == op]) for op in ['evaluate', 'optimize', 'interference', 'explain', 'building-entry', 'evaluate-maps', 'optimize-maps', 'cycle-boundary', 'two-optimizers', 'optimize-evaluate', 'two-evaluates', 'async-optimize', 'async-evaluate', 'sustained-optimize', 'sustained-evaluate', 'cancel']}, 'concurrency_overlap_pass': all(overlap(q['responses']) and native_overlap(q['responses']) for q in eight if q['operation'] in ['two-optimizers', 'optimize-evaluate', 'two-evaluates']), 'background_results': background, 'largest_contention_inflation': max(contention, key=lambda r: r['inflation_ratio']) if contention else None, 'cancellation': {'cases': sum(q['operation'] == 'cancel' for q in eight), 'passed': sum(q['operation'] == 'cancel' and not group_failures(q) for q in eight), 'max_release_observation_seconds': max((q['responses'][0]['release_observation_seconds'] for q in eight if q['operation'] == 'cancel'), default=0)}, 'science': science, 'six_cell_preservation': preservation, 'budget': {'mechanical_pass': mechanical_pass, 'product_fit': product_fit, 'shared_ip_and_distinct_ip_pass': shared_pass, 'arithmetic': {'6C': {'evaluate_maps': 7, 'optimize_maps': 7, 'cycle': 15, 'remaining_after_cycle': 5}, '8C': {'evaluate_maps': 9, 'optimize_maps': 9, 'cycle': 19, 'remaining_after_cycle': 1}}, 'cases': budgets}, 'shipping_cap_proof': [q for q in rows if q['operation'] == 'standard-cap'], 'baseline_checks': load(HERE / 'baseline-checks.json'), 'final_checks': load(HERE / 'final-checks.json') if (HERE / 'final-checks.json').exists() else {}, 'historical_comparison': load(HERE / 'historical-comparison.json'), 'cardinality_contract_manifest': 'scripts/eight-cell-operational-audit/cardinality-contracts.json', 'raw_evidence_location': str(WORK), 'limits': ['Shared Linux/arm64 development VM; quota is not dedicated physical cores.', 'Actual loopback streamed bytes/time; no WAN SLO or browser rendering qualification.', 'Finite repeats; no percentiles or general eight-Cell layout extrapolation.', 'Integer shipping reset metadata limits exact server-admission epoch reconstruction.', 'No W2/W3, higher-tier rescue, policy change or product promotion.'], 'next_action': 'Product Cap Promotion 6 → 8 in a separate task' if decision == 'A' else 'Eight-Cell Request-Budget / Workflow Policy Design in a separate task' if decision == 'B' else 'Keep six Cells; separately scope the failing operational dimension' if decision == 'C' else 'Resolve documented evidence/protocol insufficiency before a new prospective audit', 'version_recommendation': 'Keep VERSION 0.11.0; no release', 'freeze_decision': 'Keep immutable audit inputs and evidence; production cap six, fixed policy unchanged, adaptive admission paused, Auto observation-only'}
    (ROOT / 'docs/eight-cell-operational-budget-audit.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

if __name__ == '__main__':
    result = analyze()
    print(result['status'], result['observed_groups'], '/', result['planned_groups'], result['decision'])
