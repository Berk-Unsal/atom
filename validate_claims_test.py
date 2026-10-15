import copy
import json
import unittest

from classify_docs import CATALOG, catalog_errors
from validate_claims import claim_errors, validate_current_claims


class ClaimBoundaryRegressionTests(unittest.TestCase):
    def test_current_concepts(self):
        self.assertEqual(validate_current_claims(json.loads(CATALOG.read_text())), [])

    def test_high_risk_positive_assertions_fail(self):
        examples = [
            'Network evaluation supports two to six selected cells.',
            'Select two to six towers.',
            'The default deadline is 60 seconds, six selected Cells and one worker.',
            'Measurement Validation accepts up to eight Cells.',
            'Validate vendor antenna performance across terrain profiles.',
            'Canonical network planning uses terrain.',
            'Sub-100ms beamforming response times.',
            '| API response | < 100 ms p99 | Network + serialization |',
            '1000× faster.',
            'Optimization runtime: ~250 ms.',
            'The solution is globally optimal.',
            'Find the optimal azimuth for maximum coverage.',
            'Complete OSM building and 5G tower data.',
            'The engine scales to any city with GeoJSON.',
            'Toggle beamforming on/off.',
        ]
        for example in examples:
            with self.subTest(example=example): self.assertTrue(claim_errors(example))

    def test_valid_scopes_are_not_misread_as_overclaims(self):
        examples = [
            'Network evaluation supports two to eight Cells; Measurement Validation accepts one to six.',
            'The released tool does not validate vendor antenna hardware.',
            'No general sub-100 ms response guarantee is claimed.',
            'This bounded search does not prove a global mathematical optimum.',
            'Measured real-world accuracy is not yet established.',
            'Input validation and hash verification check integrity.',
            'The RF computation deadline is 60 seconds.',
        ]
        for example in examples:
            with self.subTest(example=example): self.assertEqual(claim_errors(example), [])

    def test_current_overview_cannot_be_hidden_as_history(self):
        catalog=copy.deepcopy(json.loads(CATALOG.read_text()))
        catalog['sources']['docs/overview.md']['classification']='HISTORICAL AUDIT / QUALIFICATION'
        self.assertTrue(catalog_errors(catalog))


if __name__=='__main__':unittest.main()
