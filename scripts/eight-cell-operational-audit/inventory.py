#!/usr/bin/env python3
"""Freeze cardinality contracts and prospective migration review, without edits."""
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]

def inventory():
    rows = []
    rules = [
        ('backend-go/main.go', 'MaxNetworkTowers', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Validators inherit generated network cap; deliberately review semantics, no literal edit needed'),
        ('backend-go/resource_profile.go', 'MaxNetworkTowers', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Auto reflects existing configured constant; observation-only'),
        ('backend-go/raytracer/policy_generated.go', 'MaxNetworkTowers', 'NETWORK PRODUCT CAP', 'MUST CHANGE 6→8', 'Regenerate from canonical policy; audit changes only temporary copy'),
        ('backend-go/raytracer/interference.go', 'MaxNetworkTowers', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Shared selected-network cap'),
        ('backend-go/raytracer/building_entry.go', 'MaxNetworkTowers', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Shared selected-network cap, lower bound one'),
        ('backend-go/raytracer/optimization_explanation.go', 'MaxNetworkTowers', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Retained baseline and solution must have identical selected Cells'),
        ('backend-go/raytracer/recommendation.go', 'MaxRecommendationTowers', 'ENDPOINT-SPECIFIC CAP', 'SHOULD REMAIN INDEPENDENT', 'Five existing Cells plus a candidate is independent recommendation contract'),
        ('backend-go/raytracer/measurements.go', 'MaxMeasurementTowers', 'INDEPENDENT CAP', 'SHOULD REMAIN INDEPENDENT', 'Measurement validation six-transmitter contract; no eight-Cell invention'),
        ('frontend-react/src/generated/policy.js', 'network_towers_max', 'NETWORK PRODUCT CAP', 'MUST CHANGE 6→8', 'Regenerate canonical network policy'),
        ('frontend-react/src/generated/policy.js', 'measurement_towers_max', 'INDEPENDENT CAP', 'SHOULD REMAIN INDEPENDENT', 'Separate measurement field'),
        ('frontend-react/src/utils/networkSelection.js', 'MAX_NETWORK_CELLS', 'NETWORK PRODUCT CAP', 'MUST CHANGE 6→8', 'Production clamp remains six in this audit'),
        ('frontend-react/src/App.jsx', 'MAX_NETWORK_CELLS|normalizeNetworkSelection', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Selection, polygon selection, restore and candidate insertion inherit clamp; Recommendation enablement deserves deliberate independent review'),
        ('frontend-react/src/components/ControlPanel.jsx', 'MAX_NETWORK_CELLS', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Count and maximum labels derive clamp'),
        ('frontend-react/src/components/ControlPanel.jsx', 'two to six', 'NETWORK PRODUCT CAP', 'DOCUMENTATION ONLY', 'Literal Interference copy needs future review'),
        ('docs/openapi.yaml', 'maxItems: 6\\b|one to six', 'NETWORK PRODUCT CAP', 'MUST CHANGE 6→8', 'Network, retained explanation and Building Entry arrays; inspect each schema independently'),
        ('scripts/generate_policy.py', 'MaxNetworkTowers|MaxRecommendationTowers|MaxMeasurementTowers', 'NETWORK PRODUCT CAP', 'NO CHANGE', 'Generator maps distinct canonical fields; do not broaden every six'),
    ]
    for path, pattern, kind, action, note in rules:
        for number, line in enumerate((ROOT / path).read_text().splitlines(), 1):
            if re.search(pattern, line):
                rows.append({'path': path, 'line': number, 'contract': kind, 'future_action': action, 'source': line.strip(), 'note': note})
    # Canonical policy and relevant tests are scanned rather than inferred.
    for path in [p for p in (ROOT / 'policy').rglob('*') if p.is_file()] if (ROOT / 'policy').exists() else []:
        for number, line in enumerate(path.read_text().splitlines(), 1):
            if re.search(r'network_towers_max|recommendation_towers_max|measurement_towers_max', line):
                network = 'network_towers_max' in line
                rows.append({'path': str(path.relative_to(ROOT)), 'line': number, 'contract': 'NETWORK PRODUCT CAP' if network else 'INDEPENDENT CAP', 'future_action': 'MUST CHANGE 6→8' if network else 'SHOULD REMAIN INDEPENDENT', 'source': line.strip()})
    independent = {
        'backend-go/raytracer/request_inputs.go': 'Generated-style request structs have no binding cardinality tags; explicit route/RF validators own caps',
        'backend-go/experiment_jobs.go': 'Experiment matrix limits and retained jobs/cache independent of selected-network cardinality',
        'frontend-react/src/utils/requestPayloads.js': 'Builders map selected arrays; simulation receives one Cell; indices choose per-Cell profiles',
        'frontend-react/src/utils/projectStore.js': 'v3 graph encoding has independent 16MiB file,32MiB expansion,1million nodes; restoration App selection clamp remains six',
        'frontend-react/src/utils/reportExport.js': 'Array-driven network report and map numbering; independent sampling/frontier display limits',
        'frontend-react/src/components/ResultTabs.jsx': 'Result arrays and per-Cell solutions are data-driven; inspect bounded test fixture',
    }
    for path, note in independent.items():
        rows.append({'path': path, 'exists': (ROOT / path).exists(), 'contract': 'NO CARDINALITY DEPENDENCE', 'future_action': 'NO CHANGE', 'note': note})
    for path in (ROOT / 'backend-go').rglob('*test.go'):
        if re.search(r'MaxNetworkTowers|MaxCells != 6', path.read_text()):
            rows.append({'path': str(path.relative_to(ROOT)), 'contract': 'NETWORK PRODUCT CAP', 'future_action': 'TEST ONLY', 'note': 'Future promotion would require explicit production-cap expectations review'})
    value = {'schema_version': 1, 'production_edits_applied': False, 'rows': rows}
    (HERE / 'cardinality-contracts.json').write_text(json.dumps(value, indent=2) + '\n')
    return value

if __name__ == '__main__':
    inventory()
