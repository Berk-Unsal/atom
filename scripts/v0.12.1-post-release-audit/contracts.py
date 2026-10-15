#!/usr/bin/env python3
"""Validate current contracts without rewriting generated or historical files."""
import hashlib
import json
import pathlib
import sys
import yaml
from openapi_spec_validator import OpenAPIV31SpecValidator

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = pathlib.Path(__file__).resolve().parent
spec = yaml.safe_load((ROOT / 'docs/openapi.yaml').read_text())
errors = [{'path': list(e.path), 'message': e.message} for e in OpenAPIV31SpecValidator(spec).iter_errors()]
schemas = spec['components']['schemas']
expected = {'NetworkRequest': 8, 'BuildingEntryAnalysisRequest': 8, 'RecommendationRequest': 5, 'MeasurementRequest': 6}
for name, cap in expected.items():
    assert schemas[name]['allOf'][1]['properties']['towers']['maxItems'] == cap, name
refs = []
def walk(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key == '$ref' and isinstance(child, str) and child.startswith('#/'):
                node = spec
                for part in child[2:].split('/'):
                    node = node[part.replace('~1', '/').replace('~0', '~')]
                refs.append(child)
            else:
                walk(child)
    elif isinstance(value, list):
        for child in value:
            walk(child)
walk(spec)
shipping = json.loads((ROOT / 'scripts/eight-cell-product-cap-promotion/shipping-build.json').read_text())
hashes = shipping['source_sha256']
changed = [p for p, h in hashes.items() if hashlib.sha256((ROOT / p).read_bytes()).hexdigest() != h]
assert not changed, changed
result = {'openapi_version': spec['openapi'], 'spec_validator': '0.9.0', 'schema_validation': 'failed' if errors else 'passed', 'schema_errors': errors, 'local_references_resolved': len(refs), 'caps': expected, 'shipping_source_files_compared': len(hashes), 'shipping_source_changed': changed, 'historical_shipping_version': shipping['VERSION'], 'current_version': (ROOT / 'VERSION').read_text().strip(), 'interpretation': '82 production source identities match historical normal cap8 shipping evidence. Go toolchain/dependency updates and frontend/docs changes do not requalify another binary or hardware profile; historical timings stay attributed to Go1.26.6 Linux/arm64 Profile A.'}
(OUT / 'contracts.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))

raise SystemExit(bool(errors))
