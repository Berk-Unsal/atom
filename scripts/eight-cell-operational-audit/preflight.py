#!/usr/bin/env python3
"""Future audits must execute required baseline E2Es before freezing any inputs."""
from protocol import HERE, WORK, load
from checks import required_test_executed

def preflight():
    records = load(HERE / 'baseline-checks.json')
    if len(records) != 10 or not all(v['exit_code'] == 0 for v in records.values()):
        raise ValueError('all ten baseline commands must succeed')
    for name in ['rf_budget_e2e', 'rf_deadline_e2e']:
        if not required_test_executed(name, (WORK / ('baseline-' + name + '.log')).read_text()):
            raise ValueError('required baseline E2E did not execute: ' + name)
    return True

if __name__ == '__main__':
    preflight()
