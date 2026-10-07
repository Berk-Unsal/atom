import copy
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import build
import client
import protocol

class AuditProtocolTests(unittest.TestCase):
    def test_only_cardinality_source_change(self):
        source = (protocol.ROOT / build.POLICY).read_text()
        changed = build.audit_source(source)
        self.assertEqual(changed.replace('MaxNetworkTowers                   = 8', 'MaxNetworkTowers                   = 6'), source)
        with self.assertRaises(ValueError):
            build.audit_source(changed)
        self.assertIn('MaxRecommendationTowers            = 5', changed)
        self.assertIn('MaxMeasurementTowers               = 6', changed)

    def test_all_paired_layouts_preserve_six(self):
        manifest = protocol.load(protocol.WORK / 'layout-selection.json')
        self.assertEqual(len(manifest['selected']), 8)
        for domain in manifest['selected']:
            self.assertEqual(domain['original_six_ids'], [t['cellId'] for t in domain['towers'][:6]])
            self.assertEqual(len({t['cellId'] for t in domain['towers']}), 8)
            for freq in [2.6, 28]:
                six = protocol.load(protocol.WORK / 'fixtures' / f"{domain['id']}-{freq}-6C-W1.json")
                eight = protocol.load(protocol.WORK / 'fixtures' / f"{domain['id']}-{freq}-8C-W1.json")
                frozen = protocol.load(protocol.ROOT / 'scripts/w1-shipping-runtime-qualification/fixtures' / f"{domain['id']}-{freq}-W1.json")
                self.assertEqual(six, frozen)
                for key in ['network', 'interference']:
                    self.assertEqual(eight[key]['towers'][:6], six[key]['towers'])
                self.assertEqual(eight['simulations'][:6], six['simulations'])
                self.assertEqual(eight['rays'], 120)
                self.assertEqual(eight['radius'], 400)
                self.assertNotIn('search_policy', eight['network'])

    def test_empirical_request_construction_counts(self):
        fixture = protocol.load(protocol.WORK / 'fixtures/sparse-certification-1-2.6-8C-W1.json')
        class Fake:
            def __init__(self): self.calls = []
            def request(self, endpoint, body, ip, **kwargs):
                self.calls.append((endpoint, body, ip))
                value = {'optimized_towers': [{'id': t['id'], 'optimal_azimuth': i * 10} for i, t in enumerate(fixture['network']['towers'])]}
                return {'status': 200}, json.dumps(value).encode()
        for n in [6, 8]:
            selected = copy.deepcopy(fixture)
            selected['network']['towers'] = selected['network']['towers'][:n]
            selected['interference']['towers'] = selected['interference']['towers'][:n]
            selected['simulations'] = selected['simulations'][:n]
            for op in ['evaluate-maps', 'optimize-maps', 'cycle', 'two-workflows']:
                tr = Fake()
                responses, _ = client.workload(tr, selected, op, 'one-client', 'other-client', pathlib.Path('/unused'), 1)
                self.assertEqual(len(responses), protocol.budget_cost(op, n))
                self.assertEqual(len(tr.calls), len(responses))
                self.assertTrue(all(ip == 'one-client' for _, _, ip in tr.calls))
                if op == 'optimize-maps':
                    self.assertEqual([body['azimuth'] for ep, body, _ in tr.calls if ep == '/api/simulate'], [i * 10 for i in range(n)])

    def test_reference_guard_fails_closed(self):
        with self.assertRaises(ValueError):
            protocol.mixed_guard({'A-8C-single-0': [{'fixture': 'missing', 'operation': 'evaluate', 'repeat': 0}]}, {})
        with patch.object(protocol, 'reference_key', side_effect=lambda c: ('A', c['fixture'], 'hash', c['operation'])):
            with self.assertRaises(ValueError):
                protocol.mixed_guard({'A-8C-mixed-0': [{'fixture': 'x', 'operation': 'two-optimizers'}]}, {})

    def test_evidence_manifest_requires_hash_and_size(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / 'raw').write_bytes(b'exact evidence')
            manifest = {'artifacts': [{'path': 'raw', 'sha256': protocol.sha(root / 'raw'), 'byte_size': (root / 'raw').stat().st_size}]}
            protocol.manifest_verify(manifest, root)
            (root / 'raw').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                protocol.manifest_verify(manifest, root)

    def test_science_excludes_only_existing_building_elapsed(self):
        original = b'{"science":[1.00,2],"diagnostics":{"elapsed_ms":123,"count":3}}'
        from transport import canonical
        self.assertEqual(canonical(original), canonical(original.replace(b'123', b'999')))
        self.assertNotEqual(canonical(original), canonical(original.replace(b'1.00', b'1.01')))
        self.assertNotEqual(canonical(original), canonical(original.replace(b'"count":3', b'"count":4')))
        self.assertNotEqual(canonical(original), canonical(original.replace(b'[1.00,2]', b'[2,1.00]')))

    def test_background_requires_native_overlap_and_final_tail(self):
        request = {'start': '2026-10-07T00:00:01+00:00', 'end': '2026-10-07T00:00:02+00:00'}
        row = {'responses': [request], 'extra': {'launches': [{'job': {'status': 'running', 'cache_hit': False, 'completed_runs': 1, 'total_runs': 64}}]}}
        evidence = {'errors': [], 'drain_barrier_pass': True, 'final_jobs': [{'job_id': 'j', 'status': 'succeeded', 'cache_hit': False, 'started_at': '2026-10-07T00:00:00+00:00', 'finished_at': '2026-10-07T00:00:03+00:00'}], 'sustained': False}
        self.assertEqual(protocol.background_failures(row, evidence), [])
        evidence['sustained'] = True
        evidence['samples'] = [{'elapsed_seconds': 0, 'active': True}]
        evidence['duration_seconds'] = 31
        self.assertIn('missing final interactive call at/after30seconds', protocol.background_failures(row, evidence))
        evidence['final_jobs'][0]['started_at'] = '2026-10-07T00:00:03+00:00'
        self.assertTrue(any('outside ALL actual' in s for s in protocol.background_failures(row, evidence)))

    def test_frozen_inputs_when_available(self):
        if (protocol.HERE / 'audit-lock.json').exists():
            lock = protocol.verify()
            self.assertEqual(lock['profile'], {'id': 'A', 'cpus': 2, 'memory_gib': 4})
            self.assertEqual(lock['production_invariants']['cell_cap'], 6)

    def test_cap_proof_raw_building_hash_is_not_a_scientific_repeat(self):
        from analyze import scientific_digest
        response = {'endpoint': '/api/building-entry-analysis', 'sha256': 'raw-with-elapsed'}
        self.assertIsNone(scientific_digest(response, 'standard-cap'))
        with self.assertRaises(ValueError):
            scientific_digest(response, 'building-entry')
        response['scientific_sha256'] = 'canonical-with-only-elapsed-removed'
        self.assertEqual(scientific_digest(response, 'building-entry'), response['scientific_sha256'])
        self.assertEqual(scientific_digest({'endpoint': '/api/evaluate-network', 'sha256': 'exact'}, 'evaluate'), 'exact')

    def test_native_overlap_is_distinct_from_client_connect_overlap(self):
        from analyze import native_interval, native_overlap
        one = {'server_completion_log': '2026-10-07T00:00:02Z [GIN] | 200 | 1.5s | client'}
        two = {'server_completion_log': '2026-10-07T00:00:03Z [GIN] | 200 | 1250ms | client'}
        self.assertAlmostEqual(native_interval(one)[1] - native_interval(one)[0], 1.5)
        self.assertTrue(native_overlap([one, two]))
        two['server_completion_log'] = '2026-10-07T00:00:03Z [GIN] | 200 | 500ms | client'
        self.assertFalse(native_overlap([one, two]))

    def test_zero_exit_skipped_e2e_is_not_validation(self):
        from checks import required_test_executed
        for name in ['rf_budget_e2e', 'rf_deadline_e2e']:
            self.assertFalse(required_test_executed(name, '1 skipped'))
            self.assertFalse(required_test_executed(name, 'No tests found'))
            self.assertFalse(required_test_executed(name, '1 passed 1 skipped'))
            self.assertTrue(required_test_executed(name, '1 passed (12s)'))

    def test_methodology_defect_cannot_be_retroactively_promoted(self):
        from analyze import classification
        self.assertEqual(classification(True, ['baseline skipped'], [], True, True, 'PRODUCT BLOCKER'), 'D')
        self.assertEqual(classification(True, [], [], True, True, 'PRODUCT BLOCKER'), 'B')
        self.assertEqual(classification(True, [], [], False, True, 'PRODUCT BLOCKER'), 'C')
        self.assertEqual(classification(True, [], [], True, True, 'HEALTHY'), 'A')
        self.assertEqual(classification(False, [], [], True, True, 'HEALTHY'), 'D')

if __name__ == '__main__':
    unittest.main()
