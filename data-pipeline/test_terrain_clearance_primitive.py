import unittest

from terrain_clearance_primitive import (
    CLASS_CLEAR,
    CLASS_NEAR_UNCERTAINTY_BOUNDARY,
    CLASS_OBSTRUCTION_CANDIDATE,
    CLASS_UNAVAILABLE,
    STATUS_PARTIAL,
    STATUS_AVAILABLE,
    TerrainClearanceSampleInput,
    TerrainSourceMetadata,
    evaluate_terrain_clearance,
    radio_line_elevation,
    terrain_clearance_m,
)


SOURCE = TerrainSourceMetadata(
    source="controlled-dtm",
    source_version="fixture-1",
    dataset_id="fixture-dataset",
    source_checksum="fixture-checksum",
    raster_resolution_m=30.0,
    interpolation="bilinear",
    vertical_datum="EGM2008",
    datum_kind="orthometric",
    geoid_model="EGM2008",
)


def samples(values, statuses=None):
    statuses = statuses or ["valid"] * len(values)
    total = (len(values) - 1) * 25.0
    return [
        TerrainClearanceSampleInput(
            index=index,
            path_distance_m=index * 25.0,
            path_fraction=index / (len(values) - 1),
            lon=32.0 + index * 0.0002,
            lat=39.0,
            terrain_elevation_m=value,
            sample_status=statuses[index],
        )
        for index, value in enumerate(values)
    ], total


class TerrainClearancePrimitiveTests(unittest.TestCase):
    def evaluate(self, values, statuses=None, margin=None, interpolation="bilinear"):
        path, distance = samples(values, statuses)
        source = SOURCE if interpolation == SOURCE.interpolation else TerrainSourceMetadata(**{**SOURCE.__dict__, "interpolation": interpolation})
        return evaluate_terrain_clearance(
            path,
            source=source,
            tx_height_agl_m=25.0,
            rx_height_agl_m=1.5,
            distance_m=distance,
            requested_spacing_m=25.0,
            effective_spacing_m=30.0,
            margin_m=margin,
        )

    def test_flat_fixture_and_endpoint_sign_regression(self):
        result = self.evaluate([100.0] * 5)
        self.assertEqual(result.status, STATUS_AVAILABLE)
        self.assertEqual(result.classification, CLASS_CLEAR)
        self.assertEqual(result.tx_endpoint_clearance_m, 25.0)
        self.assertEqual(result.rx_endpoint_clearance_m, 1.5)
        self.assertEqual(result.minimum_clearance_m, 1.5)
        self.assertEqual(result.minimum_location, "at_rx")
        self.assertEqual(result.samples[2].clearance_m, 13.25)
        self.assertNotEqual(result.fingerprint, "")

    def test_known_crest_and_near_boundary_margin(self):
        crest = self.evaluate([100.0, 100.0, 115.25, 100.0, 100.0])
        self.assertAlmostEqual(crest.minimum_clearance_m, -2.0)
        self.assertEqual(crest.classification, CLASS_OBSTRUCTION_CANDIDATE)
        self.assertEqual(crest.minimum_location, "interior")
        boundary = self.evaluate([100.0, 100.0, 113.75, 100.0, 100.0], margin=1.0)
        self.assertAlmostEqual(boundary.minimum_clearance_m, -0.5)
        self.assertEqual(boundary.classification, CLASS_NEAR_UNCERTAINTY_BOUNDARY)

    def test_ascending_descending_and_no_data(self):
        ascending = self.evaluate([100.0, 105.0, 110.0, 115.0, 120.0])
        descending = self.evaluate([120.0, 115.0, 110.0, 105.0, 100.0])
        self.assertEqual(ascending.classification, CLASS_CLEAR)
        self.assertEqual(descending.classification, CLASS_CLEAR)
        self.assertGreaterEqual(ascending.minimum_clearance_m, 1.5)
        self.assertGreaterEqual(descending.minimum_clearance_m, 1.5)
        partial = self.evaluate([100.0, None, 100.0, 100.0, 100.0], ["valid", "no_data", "valid", "valid", "valid"])
        self.assertEqual(partial.status, STATUS_PARTIAL)
        self.assertEqual(partial.classification, CLASS_UNAVAILABLE)
        self.assertEqual(partial.minimum_clearance_m, 1.5)
        self.assertIsNone(partial.samples[1].clearance_m)

    def test_minimum_location_contract(self):
        at_tx = evaluate_terrain_clearance(
            samples([100.0] * 5)[0],
            source=SOURCE,
            tx_height_agl_m=0.0,
            rx_height_agl_m=1.5,
            distance_m=100.0,
            requested_spacing_m=25.0,
            effective_spacing_m=30.0,
        )
        near_tx = self.evaluate([100.0, 120.0, 100.0, 100.0, 100.0])
        near_rx = self.evaluate([100.0, 100.0, 100.0, 108.0, 100.0])
        crest = self.evaluate([100.0, 100.0, 115.25, 100.0, 100.0])
        flat = self.evaluate([100.0] * 5)
        self.assertEqual({at_tx.minimum_location, near_tx.minimum_location, crest.minimum_location, near_rx.minimum_location, flat.minimum_location}, {"at_tx", "near_tx", "interior", "near_rx", "at_rx"})

    def test_source_local_datum_and_interpolation_fingerprint(self):
        path, distance = samples([100.0, 100.0, 100.0])
        path[1] = TerrainClearanceSampleInput(**{**path[1].__dict__, "source_metadata": TerrainSourceMetadata(**{**SOURCE.__dict__, "vertical_datum": "EGM96"})})
        with self.assertRaisesRegex(ValueError, "vertical datum identity"):
            evaluate_terrain_clearance(
                path,
                source=SOURCE,
                tx_height_agl_m=25,
                rx_height_agl_m=1.5,
                distance_m=distance,
                requested_spacing_m=25,
                effective_spacing_m=30,
            )
        bilinear = self.evaluate([100.0, 100.0, 100.0], interpolation="bilinear")
        nearest = self.evaluate([100.0, 100.0, 100.0], interpolation="nearest")
        self.assertNotEqual(bilinear.fingerprint, nearest.fingerprint)

    def test_equation_is_source_local_and_explicit(self):
        self.assertEqual(radio_line_elevation(125.0, 101.5, 0.5), 113.25)
        self.assertEqual(terrain_clearance_m(113.25, 100.0), 13.25)


if __name__ == "__main__":
    unittest.main()
