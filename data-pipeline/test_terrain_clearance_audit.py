import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("terrain_clearance_audit.py")
SPEC = importlib.util.spec_from_file_location("terrain_clearance_audit", MODULE_PATH)
audit = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(audit)


class FakeTile:
    def __init__(self, name, west, east):
        self.path = Path(name)
        self.west = west
        self.east = east

    def contains(self, lon, lat):
        return self.west <= lon < self.east


class FakeSource:
    name = "fixture"
    definition = {
        "vertical_datum": "fixture datum",
        "candidate_kind": "fixture",
    }

    def __init__(self, sampler):
        self.sampler = sampler
        self.tiles = [FakeTile("west.tif", 0.0, 0.5), FakeTile("east.tif", 0.5, 1.0)]

    def sample(self, point, interpolation="bilinear"):
        return self.sampler(point, interpolation)


class TerrainClearanceAuditTests(unittest.TestCase):
    def test_equation_sign_and_endpoint_identity(self):
        source = FakeSource(lambda point, interpolation: 100.0)
        profile = audit.evaluate_profile(source, "fixture-cell", (0.1, 0.1), 0.0)
        self.assertEqual(profile["terrain_status"], "terrain_available")
        self.assertEqual(profile["endpoint_clearance_m"], {"tx_m": 25.0, "rx_m": 1.5})
        self.assertEqual(profile["min_clearance_m"], 1.5)
        self.assertFalse(profile["obstruction_candidate"])
        self.assertAlmostEqual(audit.radio_line(125.0, 101.5, 0.5), 113.25)
        self.assertAlmostEqual(audit.signed_clearance(113.25, 100.0), 13.25)

    def test_interior_terrain_hump_is_candidate_with_correct_sign(self):
        def sample(point, interpolation):
            return 130.0 if 0.1015 < point[1] < 0.1022 else 100.0

        profile = audit.evaluate_profile(FakeSource(sample), "fixture-cell", (0.1, 0.1), 0.0)
        self.assertTrue(profile["obstruction_candidate"])
        self.assertEqual(profile["min_location"], "interior")
        self.assertLess(profile["min_clearance_m"], 0.0)
        self.assertTrue(profile["legacy_candidate"])

    def test_missing_interpolation_never_becomes_candidate(self):
        def sample(point, interpolation):
            # The center sample is unavailable regardless of interpolation.
            return None if abs(point[1] - 0.1018) < 0.0002 else 100.0

        profile = audit.evaluate_profile(FakeSource(sample), "fixture-cell", (0.1, 0.1), 0.0)
        self.assertEqual(profile["terrain_status"], "terrain_partial_or_no_data")
        self.assertIsNone(profile["min_clearance_m"])
        self.assertFalse(profile["obstruction_candidate"])
        self.assertEqual(audit.classify_clearance(None, True, 5.0), "unavailable")

    def test_spacing_and_interpolation_are_explicit(self):
        source = FakeSource(lambda point, interpolation: 100.0)
        coarse = audit.evaluate_profile(source, "fixture-cell", (0.1, 0.1), 0.0, spacing_m=60.0, interpolation="nearest")
        fine = audit.evaluate_profile(source, "fixture-cell", (0.1, 0.1), 0.0, spacing_m=15.0, interpolation="bilinear")
        self.assertEqual(coarse["interpolation"], "nearest")
        self.assertEqual(fine["interpolation"], "bilinear")
        self.assertLess(coarse["sample_count"], fine["sample_count"])
        self.assertNotEqual(coarse["effective_spacing_m"], fine["effective_spacing_m"])

    def test_tile_boundary_provenance_is_explicit(self):
        source = FakeSource(lambda point, interpolation: 100.0)
        self.assertEqual(audit.source_tile_for_point(source, (0.25, 0.1)), "west.tif")
        self.assertEqual(audit.source_tile_for_point(source, (0.75, 0.1)), "east.tif")
        self.assertIsNone(audit.source_tile_for_point(source, (1.1, 0.1)))

    def test_curvature_magnitude_and_no_model_change(self):
        result = audit.curvature_audit()
        self.assertAlmostEqual(result["unmodeled_geometric_bulge_m"], 0.00314, places=5)
        self.assertLess(result["difference_between_k1_and_k4_3_m"], 0.001)
        self.assertIn("added", result["model_change"])

    def test_datum_transform_formula_sign(self):
        h96, n96, n08 = 100.0, 20.0, 19.25
        self.assertAlmostEqual(h96 + n96 - n08, 100.75)
        self.assertEqual(audit.EGM96_GRID["model"], "EGM96")
        self.assertEqual(audit.EGM08_GRID["model"], "EGM2008")

    def test_classification_tolerance_contract(self):
        self.assertEqual(audit.classify_clearance(-0.1, False, 0.0), "obstruction_candidate")
        self.assertEqual(audit.classify_clearance(-0.1, False, 1.0), "near_uncertainty_boundary")
        self.assertEqual(audit.classify_clearance(2.0, False, 1.0), "clear")

    def test_canonical_invariance_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "manifest.json"
            manifest.write_text("fixture", encoding="utf-8")
            baseline = {"canonical_rf_snapshots": {"canonical_28_ghz": {"value": 1}}}
            result = audit.canonical_invariance(baseline, manifest)
        self.assertFalse(result["terrain_activation"])
        self.assertEqual(result["before_snapshots"], result["after_snapshots"])
        self.assertIn("P.526 diagnostic", result["targets"])
        self.assertIn("scenario fingerprints", result["explicitly_not_changed"])


if __name__ == "__main__":
    unittest.main()
