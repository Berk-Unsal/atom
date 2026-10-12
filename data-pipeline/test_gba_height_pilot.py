import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("gba_height_pilot.py")
SPEC = importlib.util.spec_from_file_location("gba_height_pilot", MODULE_PATH)
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


def sampled(identifier, source, value, osm_height=None):
    strategies = {}
    for strategy in pilot.SAMPLING_STRATEGIES:
        strategies[strategy] = {
            "intersecting_pixel_count": 4,
            "valid_pixel_count": 4,
            "nodata_pixel_count": 0,
            "nonfinite_pixel_count": 0,
            "negative_pixel_count": 0,
            "zero_pixel_count": 0,
            "coverage_fraction": 1.0,
            "support_quality": "multi_pixel_support",
            "statistics": pilot.distribution([value, value, value, value]),
            "source_model_uncertainty": {"count": 0},
            "tile_ids": ["fixture.tif"],
        }
    return {
        "id": identifier,
        "logical_id": identifier,
        "area_m2": 100.0,
        "osm_height_m": osm_height,
        "osm_height_source": source,
        "raster_tile_covered": True,
        "raster_tile_ids": ["fixture.tif"],
        "strategies": strategies,
    }


class GBAHeightPilotTests(unittest.TestCase):
    def test_required_height_distribution_statistics_include_p75(self):
        result = pilot.distribution([1.0, 2.0, 3.0, 4.0])
        self.assertEqual(result["count"], 4)
        self.assertEqual(result["min"], 1.0)
        self.assertEqual(result["median"], 2.5)
        self.assertEqual(result["p75"], 3.25)
        self.assertEqual(result["p90"], 3.7)
        self.assertEqual(result["max"], 4.0)

    def test_agreement_uses_five_metre_or_twenty_five_percent_conflict_gate(self):
        records = [sampled("explicit", "osm_explicit", 20.0, 10.0)]
        result = pilot.agreement_for_policy(records, "pixel_center_inside", "median")
        self.assertEqual(result["large_disagreement_count"], 1)
        self.assertEqual(result["large_disagreement_cases"][0]["large_disagreement_threshold_m"], 5.0)

    def test_policy_a_and_policy_b_select_different_precedence_counts(self):
        records = [
            sampled("explicit", "osm_explicit", 18.0, 18.0),
            sampled("levels", "osm_levels_derived", 18.0, 18.0),
            sampled("fallback", "unavailable", 18.0),
        ]
        baseline = {
            "current_loader_height_audit": {
                "explicit_height_count": 1,
                "levels_derived_count": 1,
                "fallback_only_count": 1,
            }
        }
        study = pilot.agreement_study(records)
        extraction = pilot.choose_extraction_policy(study, records)
        policy_a = pilot._diagnostic_policy_counts(
            records, baseline, extraction["strategy"], extraction["statistic"], "policy_a_explicit_levels_gba_fallback"
        )
        policy_b = pilot._diagnostic_policy_counts(
            records, baseline, extraction["strategy"], extraction["statistic"], "policy_b_explicit_gba_levels_fallback"
        )
        self.assertEqual(policy_a["coverage"]["selected_over_levels"], 0)
        self.assertEqual(policy_b["coverage"]["selected_over_levels"], 1)
        self.assertEqual(policy_a["coverage"]["selected_over_fallback"], 1)

    def test_promotion_gate_rejects_high_conflict_even_with_coverage(self):
        decision = pilot._promotion_decision(
            {"total_loader_visible_footprints": 100, "usable_external_height": 99},
            {"conflict_rate_over_osm_height_matches": 0.30},
            {"policy_a_explicit_levels_gba_fallback": {"coverage": {"external_selected_total": 90}}},
            {"status": "selected"},
        )
        self.assertEqual(decision["status"], "NO-GO")
        self.assertFalse(decision["gates"]["agreement_conflict_rate_below_25_pct"])

    def test_controlled_fixture_suite_a_to_l_is_reused(self):
        self.assertEqual([fixture["id"] for fixture in pilot.CONTROLLED_FIXTURES], list("ABCDEFGHIJKL"))


if __name__ == "__main__":
    unittest.main()
