import importlib.util
import unittest
from pathlib import Path

from shapely.geometry import box


MODULE_PATH = Path(__file__).with_name("external_height_pilot.py")
SPEC = importlib.util.spec_from_file_location("external_height_pilot", MODULE_PATH)
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


def external(identifier, geometry, height=20.0, properties=None):
    return {
        "id": identifier,
        "geometry": geometry,
        "height": height,
        "properties": properties or {},
    }


def osm(identifier, geometry, properties=None):
    properties = properties or {}
    height, source, raw_value = pilot.parse_osm_height(properties)
    return {
        "id": identifier,
        "geometry": geometry,
        "properties": properties,
        "height": height,
        "height_source": source,
        "raw_height_value": raw_value,
    }


class ExternalHeightPilotTests(unittest.TestCase):
    def test_controlled_fixture_inventory_a_to_l_is_explicit(self):
        self.assertEqual([fixture["id"] for fixture in pilot.CONTROLLED_FIXTURES], list("ABCDEFGHIJKL"))

    def test_a_exact_geometry_match(self):
        osm_record = osm("osm-a", box(0, 0, 0.001, 0.001), {"height": "20"})
        result = pilot.match_records([external("ext-a", box(0, 0, 0.001, 0.001))], [osm_record])
        self.assertEqual(result["summary"]["exact_geometry_matches"], 1)
        self.assertEqual(result["summary"]["accepted_one_to_one_matches"], 1)

    def test_b_high_iou_match(self):
        osm_record = osm("osm-b", box(0, 0, 0.001, 0.001), {"height": "20"})
        shifted = box(0.0001, 0, 0.0011, 0.001)
        result = pilot.match_records([external("ext-b", shifted)], [osm_record])
        self.assertEqual(result["summary"]["high_confidence_iou_matches"], 1)

    def test_c_centroid_gate_does_not_override_iou_threshold(self):
        osm_record = osm("osm-c", box(0, 0, 0.0002, 0.0002), {"height": "20"})
        enclosing = box(-0.0004, -0.0004, 0.0006, 0.0006)
        result = pilot.match_records([external("ext-c", enclosing)], [osm_record])
        self.assertEqual(result["summary"]["accepted_one_to_one_matches"], 0)
        self.assertEqual(result["record_audit"][0]["reason"], "single_centroid_gate_candidate_below_iou_threshold")

    def test_d_multiple_plausible_candidates_are_ambiguous(self):
        external_record = external("ext-d", box(0, 0, 0.001, 0.001))
        first = osm("osm-d1", box(0, 0, 0.0007, 0.001), {"height": "20"})
        second = osm("osm-d2", box(0.0003, 0, 0.001, 0.001), {"height": "20"})
        result = pilot.match_records([external_record], [first, second])
        self.assertEqual(result["summary"]["ambiguous_records"], 1)
        self.assertEqual(result["summary"]["accepted_one_to_one_matches"], 0)

    def test_e_subdivision_split_is_not_accepted(self):
        external_record = external("ext-e", box(0, 0, 0.001, 0.001))
        first = osm("osm-e1", box(0, 0, 0.0005, 0.001), {"height": "20"})
        second = osm("osm-e2", box(0.0005, 0, 0.001, 0.001), {"height": "20"})
        result = pilot.match_records([external_record], [first, second])
        self.assertEqual(result["summary"]["different_subdivisions_records"], 1)
        self.assertEqual(result["summary"]["accepted_one_to_one_matches"], 0)

    def test_f_many_to_one_attached_row_difference_is_not_accepted(self):
        osm_record = osm("osm-f", box(0, 0, 0.001, 0.001), {"height": "20"})
        records = [
            external("ext-f1", box(0, 0, 0.0007, 0.001)),
            external("ext-f2", box(0.0003, 0, 0.001, 0.001)),
        ]
        result = pilot.match_records(records, [osm_record])
        self.assertEqual(result["summary"]["many_to_one_records"], 2)
        self.assertEqual(result["summary"]["accepted_one_to_one_matches"], 0)

    def test_g_exact_source_identifier_can_match_without_geometry_overlap(self):
        osm_record = osm("osm-g", box(10, 10, 10.001, 10.001), {"height": "20"})
        record = external("ext-g", box(0, 0, 0.001, 0.001), properties={"osm_id": "osm-g"})
        result = pilot.match_records([record], [osm_record])
        self.assertEqual(result["summary"]["exact_id_matches"], 1)
        self.assertEqual(result["summary"]["accepted_one_to_one_matches"], 1)

    def test_h_large_disagreement_uses_requested_threshold(self):
        osm_record = osm("osm-h", box(0, 0, 0.001, 0.001), {"height": "10"})
        record = external("ext-h", box(0, 0, 0.001, 0.001), height=16.0)
        result = pilot.match_records([record], [osm_record])
        agreement = pilot.compute_height_agreement([record], [osm_record], result["_accepted_pairs"])
        self.assertEqual(agreement["large_disagreement_count"], 1)
        self.assertEqual(agreement["large_disagreement_cases"][0]["large_disagreement_threshold_m"], 5.0)

    def test_i_osm_explicit_precedence(self):
        osm_record = osm("osm-i", box(0, 0, 0.001, 0.001), {"height": "18"})
        record = external("ext-i", box(0, 0, 0.001, 0.001), height=20.0)
        result = pilot.match_records([record], [osm_record])
        baseline = {
            "current_loader_height_audit": {
                "explicit_height_count": 1,
                "levels_derived_count": 0,
                "fallback_only_count": 0,
                "trusted_or_qualified_count": 1,
                "unavailable_count": 0,
            }
        }
        agreement = pilot.compute_height_agreement([record], [osm_record], result["_accepted_pairs"])
        impact = pilot.compute_data_quality_impact(baseline, [osm_record], [record], result, agreement)
        self.assertEqual(impact["match_coverage"]["osm_explicit_precedence_cases"], 1)
        self.assertEqual(impact["match_coverage"]["external_selected_over_fallback"], 0)

    def test_j_levels_derived_agreement_is_separate(self):
        osm_record = osm("osm-j", box(0, 0, 0.001, 0.001), {"building:levels": "6"})
        record = external("ext-j", box(0, 0, 0.001, 0.001), height=20.0)
        result = pilot.match_records([record], [osm_record])
        agreement = pilot.compute_height_agreement([record], [osm_record], result["_accepted_pairs"])
        self.assertEqual(agreement["osm_levels_derived"]["matched_count"], 1)

    def test_k_external_can_replace_fallback(self):
        osm_record = osm("osm-k", box(0, 0, 0.001, 0.001))
        record = external("ext-k", box(0, 0, 0.001, 0.001), height=20.0)
        result = pilot.match_records([record], [osm_record])
        baseline = {
            "current_loader_height_audit": {
                "explicit_height_count": 0,
                "levels_derived_count": 0,
                "fallback_only_count": 1,
                "trusted_or_qualified_count": 0,
                "unavailable_count": 0,
            }
        }
        agreement = pilot.compute_height_agreement([record], [osm_record], result["_accepted_pairs"])
        impact = pilot.compute_data_quality_impact(baseline, [osm_record], [record], result, agreement)
        self.assertEqual(impact["match_coverage"]["external_selected_over_fallback"], 1)
        self.assertEqual(impact["coverage_before_after"]["fallback_only_count"]["after"], 0)

    def test_l_input_height_classes_are_countable(self):
        self.assertEqual(pilot.classify_external_height(None), "missing_sentinel")
        self.assertEqual(pilot.classify_external_height(-1), "missing_sentinel")
        self.assertEqual(pilot.classify_external_height(0), "nonpositive")
        self.assertEqual(pilot.classify_external_height(501), "extreme")
        self.assertEqual(pilot.classify_external_height("not-a-number"), "invalid")
        self.assertEqual(pilot.classify_external_height(12), "positive")


if __name__ == "__main__":
    unittest.main()
