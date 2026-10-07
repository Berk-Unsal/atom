#!/usr/bin/env python3
"""Audit observer. Reuse certified producer/search payload semantics unchanged."""
import concurrent.futures
import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import threading
import time
from transport import Transport, counters, save, stamp, utc, encode

ROOT = pathlib.Path('/audit/repo')
WORK = pathlib.Path('/audit/work')
prior_path = pathlib.Path('/audit/prior/client.py')
if not prior_path.exists():
    prior_path = pathlib.Path(__file__).resolve().parent.parent / 'w1-shipping-runtime-qualification/client.py'
spec = importlib.util.spec_from_file_location('certified_w1_client', prior_path)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
prior.WORK = WORK

def workload(tr, fixture, op, peer, peer2, folder, index):
    if op == 'standard-cap':
        responses = []
        for n in [6, 7, 8]:
            for endpoint, key in [('/api/evaluate-network', 'network'), ('/api/optimize-network', 'network'), ('/api/interference', 'interference'), ('/api/building-entry-analysis', 'network')]:
                body = copy.deepcopy(fixture[key])
                body['towers'] = body['towers'][:n]
                response, raw = tr.request(endpoint, body, tr.ip(), small=n > 6)
                response['input_cells'] = n
                response['expected_status'] = 200 if n == 6 else 400
                if n > 6:
                    response['body'] = raw.decode()
                responses.append(response)
        return responses, {'shipping_contract': True}
    def previous(name, ip=peer):
        return prior.workload(tr, fixture, name, ip, peer2, folder, index)[0]
    if op == 'cycle-boundary':
        responses = previous('cycle')
        before = counters()
        responses.append(tr.request('/api/simulate', fixture['simulations'][0], peer)[0])
        denied_before = counters()
        responses.append(tr.request('/api/simulate', fixture['simulations'][0], peer, small=True)[0])
        denied_after = counters()
        return responses, {'denied_compute_before': denied_before, 'denied_compute_after': denied_after, 'boundary_before': before}
    if op == 'two-workflows':
        return previous('evaluate-maps') + previous('optimize-maps'), {}
    if op == 'shared-ip':
        # Separate TCP sessions represent tabs; both use the same ClientIP.
        responses = previous('evaluate-maps') + previous('optimize-maps')
        other = tr.request('/api/evaluate-network', fixture['network'], peer2)[0]
        responses += previous('interference') + previous('evaluate') + previous('evaluate')
        return responses, {'distinct_ip_probe': other, 'tab_identity': 'same source IP, separate real TCP connections'}
    if op.startswith('journey-'):
        code = op.removeprefix('journey-')
        operations = {'A': ['evaluate-maps', 'interference'], 'B': ['evaluate-maps', 'optimize-maps'], 'C': ['cycle', 'optimize', 'interference', 'evaluate-maps'], 'D': ['optimize-maps', 'explain']}[code]
        # For D the frontend retains the preceding Optimize result. Build the
        # explanation from that result without a duplicate prerequisite call.
        if code == 'D':
            first, body = tr.request('/api/optimize-network', fixture['network'], peer, small=True)
            result = json.loads(body) if first['status'] == 200 else {}
            azimuths = {t['id']: t['optimal_azimuth'] for t in result.get('optimized_towers', [])}
            responses = [first]
            for cell, sim in zip(fixture['network']['towers'], fixture['simulations']):
                request = copy.deepcopy(sim)
                if cell['id'] in azimuths:
                    request['azimuth'] = azimuths[cell['id']]
                responses.append(tr.request('/api/simulate', request, peer)[0])
            if result:
                recommended = result['optimization']['recommended_solution_id']
                solution = next(s for s in result['pareto_frontier'] if s['id'] == recommended)
                request = {'run_id': result['optimization_run_id'], 'solution_id': solution['id'], 'cell_id': fixture['network']['towers'][0]['id'], 'baseline': result['baseline'], 'solution': solution, 'optimization': fixture['network']['optimization'], 'optimization_domain': result['optimization_domain']}
                responses.append(tr.request('/api/explain-network-cell', request, peer)[0])
            return responses, {'journey': code, 'retained_optimization': True}
        return [r for name in operations for r in previous(name)], {'journey': code, 'operations': operations, 'C_note': 'Required cycle then Optimize, plus prospectively declared Interference/Evaluate follow-ups to locate first denial'}
    return prior.workload(tr, fixture, op, peer, peer2, folder, index)

def batch(label):
    folder = WORK / label
    tr = Transport(label)
    save(folder / 'process-identity.json', {'observed_at': utc(), 'primary_executable_sha256': hashlib.sha256(pathlib.Path('/proc/1/exe').read_bytes()).hexdigest(), 'primary_cmdline': pathlib.Path('/proc/1/cmdline').read_bytes().decode().replace('\x00', ' '), 'primary_cgroup': pathlib.Path('/proc/1/cgroup').read_text(), 'observer_cgroup': pathlib.Path('/proc/self/cgroup').read_text(), 'initial_counters': counters()})
    plan = json.loads((ROOT / 'run-plans.json').read_text())[label]
    fixture = json.loads((WORK / 'fixtures' / (plan[0]['fixture'] + '.json')).read_text())
    save(folder / 'warmup.json', tr.request('/api/simulate', fixture['simulations'][0], tr.ip())[0])
    with (folder / 'runs.jsonl').open('x') as ledger:
        for index, case in enumerate(plan):
            fixture = json.loads((WORK / 'fixtures' / (case['fixture'] + '.json')).read_text())
            if case.get('capture'):
                tr.capture_directory = folder / ('bodies-' + str(index))
                tr.capture_directory.mkdir()
            else:
                tr.capture_directory = None
            before = counters()
            samples = [before]
            done = threading.Event()
            def sample():
                while not done.wait(.05):
                    samples.append(counters())
            thread = threading.Thread(target=sample, daemon=True)
            thread.start()
            peer, peer2 = tr.ip(), tr.ip()
            start, at = time.monotonic(), utc()
            try:
                responses, extra = workload(tr, fixture, case['operation'], peer, peer2, folder, index)
            finally:
                done.set()
                thread.join()
            end = utc()
            duration = time.monotonic() - start
            utc_duration = stamp(end) - stamp(at)
            after = counters()
            samples.append(after)
            # Probes use original canceled client, but fresh clients after
            # budget scenarios so a correctly exhausted bucket cannot mask slots.
            budget = case['operation'] in ['cycle-boundary', 'two-workflows', 'shared-ip'] or case['operation'].startswith('journey-')
            tr.capture_directory = None
            probe_fixture = copy.deepcopy(fixture)
            if case['operation'] == 'standard-cap':
                probe_fixture['network']['towers'] = probe_fixture['network']['towers'][:6]
            followups = prior.probes(tr, probe_fixture, tr.ip() if budget else peer, tr.ip() if budget else peer2)
            post = counters()
            record = {'audit_lock_sha256': hashlib.sha256((ROOT / 'audit-lock.json').read_bytes()).hexdigest(), 'profile': 'A', 'batch': label, 'plan_index': index, **case, 'domain': fixture['domain'], 'band': fixture['band'], 'frequency_ghz': fixture['frequencyGHz'], 'cardinality': fixture['n'], 'started_at': at, 'group_end': end, 'finished_at': utc(), 'group_monotonic_seconds': duration, 'group_utc_seconds': utc_duration, 'group_elapsed_seconds': max(duration, utc_duration), 'group_clock_discontinuity': abs(duration - utc_duration) > 1, 'responses': responses, 'slot_probes': followups, 'before': before, 'after': after, 'after_probes': post, 'rss_sampled_max_bytes': max(s['rss_bytes'] for s in samples), 'cgroup_sampled_max_bytes': max(s['cgroup_current_bytes'] for s in samples), 'cgroup_lifetime_peak_bytes': post['cgroup_peak_bytes'], 'extra': extra}
            ledger.write(json.dumps(record, separators=(',', ':')) + '\n')
            ledger.flush()
            print(label, index, case['operation'], [r['status'] for r in responses], flush=True)

if __name__ == '__main__':
    batch(os.environ['W1_BATCH'])
