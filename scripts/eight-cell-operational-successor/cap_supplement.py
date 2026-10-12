#!/usr/bin/env python3
"""Additional contract control only; never substitute for locked measurements."""
import json
import pathlib
import subprocess
from protocol import HERE, ROOT, WORK, load, verify
from runtime import launch, close

def supplement():
    verify()
    label = 'A-shipping-explanation-cap'
    cid, follow, log = launch(label, 'A', 'standard')
    try:
        inspection = json.loads(subprocess.check_output(['docker', 'inspect', cid], text=True))[0]
        logdir = str(pathlib.PurePosixPath(inspection['LogPath']).parent)
        image = load(ROOT / 'scripts/w1-shipping-runtime-qualification/observer-image.json')['image_id']
        with (WORK / label / 'observer.log').open('x') as out:
            subprocess.run(['docker', 'run', '--rm', '--user', '0', '--pid', 'container:' + cid, '--network', 'container:' + cid, '-v', str(HERE) + ':/audit/repo:ro', '-v', str(WORK) + ':/audit/work', '-v', logdir + ':/audit/primary-logs:ro', '-e', 'W1_PRIMARY_ID=' + cid, image, 'python', '/audit/repo/cap_client.py'], stdout=out, stderr=subprocess.STDOUT, check=True)
    finally:
        close(cid, follow, log)
    responses = load(WORK / label / 'cap-responses.json')
    assert all(r['status'] == r['expected_status'] and r['stream_complete'] and r['server_completion_observed'] for r in responses)
    value = {'primary_timing_evidence': False, 'purpose': 'additional shipping cardinality contract proof', 'responses': responses, 'passed': True}
    (HERE / 'shipping-explanation-cap.json').write_text(json.dumps(value, indent=2) + '\n')
    return value

if __name__ == '__main__':
    supplement()
