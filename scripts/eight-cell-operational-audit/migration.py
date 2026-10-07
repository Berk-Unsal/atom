#!/usr/bin/env python3
"""Future cap-migration review only. No requested future changes are applied."""
import json
import pathlib
import re
from protocol import HERE, ROOT, load, sha

def migration():
    value = load(HERE / 'cardinality-contracts.json')
    rows = list(value['rows'])
    app = ROOT / 'frontend-react/src/App.jsx'
    for number, line in enumerate(app.read_text().splitlines(), 1):
        if 'selectedNetworkTowers.length >= MAX_NETWORK_CELLS' in line:
            rows.append({'path': str(app.relative_to(ROOT)), 'line': number, 'contract': 'ENDPOINT-SPECIFIC CAP', 'future_action': 'SHOULD REMAIN INDEPENDENT', 'source': line.strip(), 'note': 'Recommendation presently accepts five existing Cells plus one candidate. Raising the shared network cap must not enable seven existing Cells for this independent endpoint.'})
    current_docs = ['README.md', 'docs/api.md', 'docs/features.md', 'docs/faq.md', 'docs/deployment.md', 'docs/project-format.md']
    for name in current_docs:
        for number, line in enumerate((ROOT / name).read_text().splitlines(), 1):
            if re.search(r'(?i)(six[- ]cells?|six selected|(?:up to|maximum|at most)\s+6|2.{0,4}6.*cells)', line):
                rows.append({'path': name, 'line': number, 'contract': 'NETWORK PRODUCT CAP', 'future_action': 'DOCUMENTATION ONLY', 'source': line.strip(), 'note': 'Review current product wording deliberately; retain historical six-Cell qualification and benchmark evidence unchanged.'})
    rows += [{'path': 'frontend-react/src/utils/apiClient.js', 'contract': 'INDEPENDENT CAP', 'future_action': 'SHOULD REMAIN INDEPENDENT', 'note': '32MiB JSON and64MiB blob response guards are independent. Compare measured individual response volume; do not automatically raise guards.'}, {'path': 'frontend-react/src/utils/reportExport.js', 'contract': 'INDEPENDENT CAP', 'future_action': 'SHOULD REMAIN INDEPENDENT', 'note': 'Map/frontier sampling limits are independent of selected-network cap.'}, {'path': 'scripts/eight-cell-operational-audit', 'contract': 'NETWORK PRODUCT CAP', 'future_action': 'TEST ONLY', 'note': 'Keep this audit-only override and immutable evidence; promotion needs a separate reviewed production patch.'}]
    result = {'schema_version': 1, 'frozen_contract_inventory_sha256': sha(HERE / 'cardinality-contracts.json'), 'changes_applied': False, 'rows': rows}
    (HERE / 'future-cap-migration-manifest.json').write_text(json.dumps(result, indent=2) + '\n')
    return result

if __name__ == '__main__':
    migration()
