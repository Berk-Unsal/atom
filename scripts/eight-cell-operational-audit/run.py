#!/usr/bin/env python3
"""Execute each preregistered group once; preserve failures and original handles."""
import datetime
import json
from protocol import HERE, WORK, load, verify, mixed_guard
from runtime import launch, observe, close

def execute():
    lock = verify()
    plans = load(HERE / 'run-plans.json')
    path = HERE / 'execution.json'
    execution = load(path) if path.exists() else {'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'batches': {}}
    for label in lock['batch_order']:
        verify()
        if label in execution['batches']:
            if execution['batches'][label].get('exit_code') == 0:
                continue
            raise ValueError('existing nonterminal or failed batch; inspect original, never replace: ' + label)
        if '-mixed-' in label:
            observations = {name: [json.loads(line) for line in (WORK / name / 'runs.jsonl').read_text().splitlines()] for name in plans if '-single-' in name and (WORK / name / 'runs.jsonl').exists()}
            proof = mixed_guard(plans, observations)
            (HERE / 'mixed-reference-guard.json').write_text(json.dumps(proof, indent=2) + '\n')
        kind = lock['batch_binary'][label]
        cid, follow, log = launch(label, 'A', kind)
        execution['batches'][label] = {'container_id': cid, 'binary_kind': kind, 'started_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'auto_valid': True, 'external_valid': True}
        path.write_text(json.dumps(execution, indent=2) + '\n')
        print('BEGIN', label, len(plans[label]), flush=True)
        try:
            code = observe(label, cid)
        finally:
            close(cid, follow, log)
        execution['batches'][label].update({'exit_code': code, 'finished_at': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        path.write_text(json.dumps(execution, indent=2) + '\n')
        if code:
            raise ValueError('observer failed; retain evidence: ' + label)
        print('DONE', label, flush=True)
    execution['finished_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    path.write_text(json.dumps(execution, indent=2) + '\n')

if __name__ == '__main__':
    execute()
