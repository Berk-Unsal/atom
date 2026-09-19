import importlib.util
import unittest
from pathlib import Path

from shapely.geometry import box


MODULE_PATH = Path(__file__).with_name("terrain_source_pilot.py")
SPEC = importlib.util.spec_from_file_location("terrain_source_pilot", MODULE_PATH)
pilot = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pilot)


class TerrainSourcePilotTests(unittest.TestCase):
    def test_exact_aoi_tile_selection_is_eight_tiles(self):
        tiles = pilot._source_tiles()
        self.assertEqual(len(tiles), 8)
        self.assertEqual({tile["source"] for tile in tiles}, {"nasadem", "fabdem"})
        self.assertEqual(
            {tile["official_granule"] for tile in tiles if tile["source"] == "nasadem"},
            {
                "NASADEM_HGT_n39e032",
                "NASADEM_HGT_n39e033",
                "NASADEM_HGT_n40e032",
                "NASADEM_HGT_n40e033",
            },
        )

    def test_datum_gate_never_promotes_raw_difference(self):
        result = pilot._stats_for_differences([101.0, 102.0], [100.0, 103.0])
        self.assertEqual(result["qualification"], "relative diagnostic only; not an absolute source disagreement")
        self.assertTrue(result["within_absolute_thresholds_not_reported"])
        self.assertEqual(result["sample_count"], 2)

    def test_robust_perimeter_fixture_has_vertices_edges_and_centroid(self):
        points = pilot.robust_perimeter_points(box(32.0, 39.0, 32.001, 39.001))
        self.assertEqual(len(points), 9)
        self.assertIn((32.0005, 39.0005), points)

    def test_osm_height_precedence_matches_existing_contract(self):
        explicit, explicit_source = pilot.parse_osm_height({"height": "18 m", "building:levels": "10"})
        levels, levels_source = pilot.parse_osm_height({"building:levels": "4"})
        missing, missing_source = pilot.parse_osm_height({})
        self.assertEqual((explicit, explicit_source), (18.0, "osm_explicit"))
        self.assertEqual((levels, levels_source), (12.0, "osm_levels_derived"))
        self.assertEqual((missing, missing_source), (None, "unavailable"))

    def test_source_definitions_keep_fabdem_research_only(self):
        self.assertEqual(pilot.SOURCE_DEFINITIONS["nasadem"]["vertical_datum"], "EGM96 geoid")
        self.assertEqual(pilot.SOURCE_DEFINITIONS["fabdem"]["vertical_datum"], "EGM2008")
        self.assertIn("CC BY-NC-SA", pilot.SOURCE_DEFINITIONS["fabdem"]["license"])
        self.assertEqual(pilot.SOURCE_DEFINITIONS["fabdem"]["candidate_kind"], "dtm_candidate")


if __name__ == "__main__":
    unittest.main()
