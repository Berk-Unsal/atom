#!/usr/bin/env python3
"""Index and archive raw evidence outside Git; hashes cover bytes, size and groups."""
import datetime
import hashlib
import json
import pathlib
import tarfile
from protocol import HERE, WORK, sha, manifest_verify

def index(make_archive=True):
    artifacts = []
    for path in sorted(WORK.rglob('*')):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(WORK)
        if relative.parts[0] == 'build-context' or (len(relative.parts) > 1 and relative.parts[0].startswith('frontend-smoke')):
            continue
        group = relative.parts[0] if relative.parts[0].startswith('A-') else 'presentation' if relative.parts[0] == 'presentation' else 'supporting'
        category = 'async-native-trace' if path.name.startswith('async-') else 'HTTP-ledger' if path.name == 'runs.jsonl' else 'streamed-response' if path.name.startswith('body-') or any(p.startswith('bodies-') for p in relative.parts) else 'runtime/resource' if path.name in ['auto.json', 'docker-inspect.json', 'process-identity.json', 'pre-rf-verification.json', 'server.log'] else 'presentation/persistence' if group == 'presentation' else 'tooling/quality/input'
        with path.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        artifacts.append({'logical_id': str(relative), 'path': str(relative), 'sha256': digest, 'byte_size': path.stat().st_size, 'category': category, 'run_group': group})
    value = {'schema_version': 1, 'indexed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'storage_root': str(WORK), 'git_storage': 'raw evidence and generated traces stay in /tmp; only this SHA256/size/category/group manifest is tracked', 'artifacts': artifacts}
    manifest_verify(value)
    if make_archive:
        archive = pathlib.Path('/tmp/atom-eight-cell-operational-audit-raw.tar.gz')
        if archive.exists():
            raise ValueError('raw archive already exists; do not overwrite')
        with tarfile.open(archive, 'w:gz', compresslevel=6) as output:
            for row in artifacts:
                output.add(WORK / row['path'], arcname=row['path'], recursive=False)
        value['local_archive'] = {'path': str(archive), 'sha256': sha(archive), 'byte_size': archive.stat().st_size, 'members': len(artifacts)}
    path = HERE / 'evidence-manifest.json'
    path.write_text(json.dumps(value, indent=2) + '\n')
    (HERE / 'evidence-manifest.sha256').write_text(sha(path) + '  ' + path.name + '\n')
    return value

if __name__ == '__main__':
    import sys
    value = index('--index-only' not in sys.argv)
    print('evidence files', len(value['artifacts']), 'archive bytes', value.get('local_archive', {}).get('byte_size'))
