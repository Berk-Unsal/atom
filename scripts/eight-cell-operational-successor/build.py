#!/usr/bin/env python3
"""Build shipping and audit images; only a disposable source copy permits eight."""
import difflib
import hashlib
import json
import pathlib
import re
import shutil
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
WORK = pathlib.Path('/tmp/atom-eight-cell-operational-successor')
POLICY = 'backend-go/raytracer/policy_generated.go'

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def audit_source(source):
    result, count = re.subn(r'(\bMaxNetworkTowers\s*= )6\b', r'\g<1>8', source)
    if count != 1:
        raise ValueError('expected exactly one default six-Cell constant')
    return result

def build():
    copy = WORK / 'build-context'
    copy.mkdir(exist_ok=False)
    for name in ['Dockerfile', 'VERSION']:
        shutil.copy2(ROOT / name, copy / name)
    for name in ['backend-go', 'frontend-react']:
        shutil.copytree(ROOT / name, copy / name, ignore=shutil.ignore_patterns('node_modules', 'dist', '.gocache', 'coverage', 'playwright-report', 'test-results', '.DS_Store'))
    (copy / 'data-pipeline').mkdir()
    for name in ['ankara_buildings.geojson', 'ankara_5g_nodes.geojson', 'ankara_5g_nodes.csv', 'manifest.json']:
        shutil.copy2(ROOT / 'data-pipeline' / name, copy / 'data-pipeline' / name)
    source = (copy / POLICY).read_text()
    (copy / POLICY).write_text(audit_source(source))
    differences = []
    for path in sorted((copy / 'backend-go').rglob('*')):
        if path.is_file():
            relative = str(path.relative_to(copy))
            if sha(ROOT / relative) != sha(path):
                differences.append({'path': relative, 'standard_sha256': sha(ROOT / relative), 'audit_sha256': sha(path), 'diff': ''.join(difflib.unified_diff((ROOT / relative).read_text().splitlines(True), path.read_text().splitlines(True), fromfile='standard/' + relative, tofile='audit/' + relative))})
    assert [v['path'] for v in differences] == [POLICY]
    metadata = {'source_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'VERSION': (ROOT / 'VERSION').read_text().strip(), 'mechanism': 'disposable /tmp source copy; unchanged Dockerfile; no production override or environment switch', 'source_differences': differences, 'scope': 'MaxNetworkTowers 6 to 8 only; also reflected by the existing Auto max_cells metadata', 'dockerfile_sha256': sha(ROOT / 'Dockerfile'), 'images': {}}
    for kind, context in [('standard', ROOT), ('audit', copy)]:
        tag = 'atom:eight-cell-successor-' + kind
        with (WORK / (kind + '-image-build.log')).open('x') as out:
            subprocess.run(['docker', 'build', '--platform', 'linux/arm64', '--build-arg', 'VERSION=' + metadata['VERSION'], '--build-arg', 'COMMIT=' + metadata['source_head'], '-t', tag, str(context)], stdout=out, stderr=subprocess.STDOUT, check=True)
        identity = json.loads(subprocess.check_output(['docker', 'image', 'inspect', tag], text=True))[0]
        cid = subprocess.check_output(['docker', 'create', tag], text=True).strip()
        try:
            subprocess.run(['docker', 'cp', cid + ':/app/server', str(WORK / (kind + '-server'))], check=True)
        finally:
            subprocess.run(['docker', 'rm', cid], check=True, stdout=subprocess.DEVNULL)
        details = subprocess.check_output(['go', 'version', '-m', str(WORK / (kind + '-server'))], text=True)
        assert 'go1.26.6' in details and 'CGO_ENABLED=0' in details and 'GOARCH=arm64' in details and 'GOOS=linux' in details
        metadata['images'][kind] = {'image_id': identity['Id'], 'binary_sha256': sha(WORK / (kind + '-server')), 'go_version': 'go1.26.6', 'GOOS': 'linux', 'GOARCH': 'arm64', 'CGO_ENABLED': '0', 'build_metadata': details, 'os': identity['Os'], 'architecture': identity['Architecture']}
        (HERE / 'binary-differential.json').write_text(json.dumps(metadata, indent=2) + '\n')
        print(kind, metadata['images'][kind]['image_id'], flush=True)

if __name__ == '__main__':
    build()
