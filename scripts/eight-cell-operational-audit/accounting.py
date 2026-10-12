#!/usr/bin/env python3
"""Run supplementary collector and match its science to real HTTP observations."""
import json
import shutil
import subprocess
from protocol import HERE, WORK, ROOT, sha, load, verify

def accounting():
    verify()
    context = WORK / 'build-context'
    target = context / 'backend-go/eight_cell_search_accounting_test.go'
    shutil.copyfile(HERE / 'search_accounting_test.go.txt', target)
    builder = 'atom:eight-cell-accounting-builder'
    with (WORK / 'accounting-build.log').open('x') as log:
        subprocess.run(['docker', 'build', '--platform', 'linux/arm64', '--target', 'backend-build', '-t', builder, str(context)], stdout=log, stderr=subprocess.STDOUT, check=True)
        subprocess.run(['docker', 'run', '--rm', '-v', str(WORK) + ':/evidence', builder, 'sh', '-c', 'CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go test -c -o /evidence/accounting.test .'], stdout=log, stderr=subprocess.STDOUT, check=True)
    image = load(HERE / 'binary-differential.json')['images']['audit']['image_id']
    with (WORK / 'accounting-run.log').open('x') as log:
        subprocess.run(['docker', 'run', '--rm', '--user', '0', '--cpus', '2', '--memory', '4g', '--memory-swap', '4g', '-v', str(WORK) + ':/evidence', '-e', 'ATOM_8C_SEARCH_ACCOUNTING=1', '-e', 'ATOM_8C_DATASET=/app/data-pipeline', '-e', 'ATOM_8C_FIXTURES=/evidence/fixtures', '-e', 'ATOM_8C_ACCOUNTING_OUTPUT=/evidence/search-counts.json', '--entrypoint', '/evidence/accounting.test', image, '-test.run', '^TestEightCellSearchAccounting$', '-test.timeout', '30m', '-test.v'], stdout=log, stderr=subprocess.STDOUT, check=True)
    counts = load(WORK / 'search-counts.json')
    actual = {}
    for path in WORK.glob('A-?C-single-*/runs.jsonl'):
        for line in path.read_text().splitlines():
            row = json.loads(line)
            for response in row['responses']:
                if response['endpoint'] == '/api/optimize-network' and response['status'] == 200:
                    actual.setdefault(response['request_sha256'], set()).add(response['sha256'])
    for row in counts:
        assert row['response_sha256'] in actual[row['request_sha256']], 'collector changed scientific output'
    value = {'binary_sha256': sha(WORK / 'accounting.test'), 'test_source_sha256': sha(HERE / 'search_accounting_test.go.txt'), 'qualification_timing_evidence': False, 'scientific_match_to_real_HTTP': True, 'RF_contribution_definition': 'one existing networkCellRFContribution memo miss computes Reach and BuildingCoverage through unchanged RF paths', 'rows': counts}
    (HERE / 'search-accounting.json').write_text(json.dumps(value, indent=2) + '\n')
    verify()
    return value

if __name__ == '__main__':
    accounting()
