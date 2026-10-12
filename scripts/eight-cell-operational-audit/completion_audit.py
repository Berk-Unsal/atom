#!/usr/bin/env python3
"""Completion is distinct from qualification; this run remains formal decision D."""
import datetime
import json
import re
import subprocess
import sys
from protocol import HERE, ROOT, WORK, load, sha, verify, manifest_verify

def complete(draft=False):
    lock = verify()
    result = load(ROOT / 'docs/eight-cell-operational-budget-audit.json')
    assert result['observed_groups'] == result['planned_groups'] == 837
    assert all(v['complete'] for v in result['completion'].values())
    assert result['classification'] == 'D' and result['methodology_defects']
    assert result['science']['stable'] and result['six_cell_preservation']['passed']
    assert result['budget']['mechanical_pass'] and result['budget']['product_fit'] == 'PRODUCT BLOCKER'
    assert load(HERE / 'search-accounting.json')['scientific_match_to_real_HTTP']
    assert load(HERE / 'frontend-smoke.json')['exit_code'] == 0
    assert load(HERE / 'shipping-explanation-cap.json')['passed']
    expected = lock['source_differential']['images']
    for label in lock['batch_order']:
        folder = WORK / label
        process = load(folder / 'process-identity.json')
        assert process['primary_executable_sha256'] == expected[lock['batch_binary'][label]]['binary_sha256']
        assert load(folder / 'pre-rf-verification.json')['auto_valid']
        assert load(folder / 'pre-rf-verification.json')['external_constraints_valid']
    manifest_path = HERE / 'evidence-manifest.json'
    if manifest_path.exists():
        manifest_verify(load(manifest_path))
    if not draft:
        assert manifest_path.exists() and load(manifest_path).get('local_archive')
        checks = load(HERE / 'final-checks.json')
        assert len(checks) == 15 and all(v['exit_code'] == 0 and v['required_test_executed'] for v in checks.values())
        assert result['publication_ready']
        assert (ROOT / 'VERSION').read_text().strip() == '0.11.0'
        archive = load(manifest_path)['local_archive']
        assert sha(__import__('pathlib').Path(archive['path'])) == archive['sha256']
    labels = re.findall(r'^(\d+)\. (.+)$', (WORK / 'request.txt').read_text().split('FINAL RESPONSE — REQUIRED')[1], re.M)
    assert [int(n) for n, _ in labels] == list(range(1, 82))
    evidence = {
        'baseline/invariance': ['baseline.json', 'baseline-checks.json', 'methodology-defect.json'],
        'frozen protocol/layouts': ['audit-lock.json', 'domain-manifest.json', 'run-plans.json', 'historical-comparison.json'],
        'binary/runtime': ['binary-differential.json', 'execution.json', 'shipping-explanation-cap.json'],
        'measurements/science': ['docs/eight-cell-operational-budget-audit.json', 'search-accounting.json', 'mixed-reference-guard.json'],
        'frontend/persistence/migration': ['frontend-smoke.json', 'presentation-persistence.json', 'cardinality-contracts.json', 'future-cap-migration-manifest.json'],
        'quality/storage': ['final-checks.json', 'evidence-manifest.json', 'evidence-manifest.sha256'],
    }
    phases = []
    for phase in range(55):
        status = 'COMPLETE / PREREGISTRATION DEFECT' if phase == 1 else 'NOT APPLICABLE TO D' if phase in [48, 49, 50] else 'PENDING FINAL CHECKS' if phase == 54 and draft else 'COMPLETE'
        phases.append({'phase': phase, 'status': status, 'evidence_groups': list(evidence)})
    value = {'schema_version': 1, 'audited_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'completion_status': 'DRAFT / FINAL VALIDATION PENDING' if draft else 'COMPLETE', 'classification': 'D', 'qualification': 'INVALID / INSUFFICIENT; missing pre-measurement real E2E execution cannot be repaired retrospectively', 'locked_groups_verified': 837, 'locked_batches_verified': len(lock['batch_order']), 'measured_operational_gate_pass': result['measured_operational_gate_pass'], 'budget_mechanical_pass': result['budget']['mechanical_pass'], 'budget_product_fit': result['budget']['product_fit'], 'six_cell_science_preservation': result['six_cell_preservation'], 'frozen_input_hashes_verified': True, 'historical_artifacts_preserved': True, 'standard_cap': 6, 'production_changes': False, 'VERSION': '0.11.0', 'audit_lock_sha256': sha(HERE / 'audit-lock.json'), 'domain_manifest_sha256': sha(HERE / 'domain-manifest.json'), 'run_plan_sha256': sha(HERE / 'run-plans.json'), 'evidence_manifest_sha256': sha(manifest_path) if manifest_path.exists() else None, 'phase_coverage': phases, 'required_final_items': [{'number': int(n), 'label': label, 'report': 'docs/eight-cell-operational-budget-audit.md + JSON; final response'} for n, label in labels], 'evidence_groups': evidence, 'next_action': 'Perform a new prospectively locked audit after verified real baseline E2E execution; preserve this invalid run and keep production cap six.'}
    (HERE / 'completion-audit.json').write_text(json.dumps(value, indent=2) + '\n')
    return value

if __name__ == '__main__':
    value = complete('--draft' in sys.argv)
    print(value['completion_status'], value['classification'], value['locked_groups_verified'])
