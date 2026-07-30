import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import pack_studio


class DatasetPackStudioTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.towers = self.root / "source-towers.geojson"
        self.buildings = self.root / "source-buildings.geojson"
        write_geojson(self.towers, [feature("tower-a", "Point", [500000, 4500000], {"cell_id": "source-alpha", "radio_type": "LTE"})], crs="EPSG:3857")
        write_geojson(
            self.buildings,
            [feature("building-a", "Polygon", [[[3650000, 4850000], [3650100, 4850100], [3650000, 4850100], [3650100, 4850000], [3650000, 4850000]]], {"building": "yes"})],
            crs="EPSG:3857",
        )

    def tearDown(self):
        self.temporary.cleanup()

    def test_inspect_previews_reprojection_geometry_and_missing_fields(self):
        args = pack_studio.parser().parse_args([
            "inspect",
            "--towers", str(self.towers),
            "--buildings", str(self.buildings),
            "--towers-crs", "EPSG:3857",
            "--buildings-crs", "EPSG:3857",
        ])
        report = pack_studio.inspect_sources(args)
        self.assertEqual(report["target_crs"], "EPSG:4326")
        self.assertEqual(report["layers"]["buildings"]["invalid_input"], 1)
        self.assertGreaterEqual(report["layers"]["buildings"]["repaired"], 1)
        self.assertEqual(report["layers"]["buildings"]["missing_fields"]["height"], 1)

    def test_build_writes_schema_v2_manifest_hashes_quality_and_optional_terrain(self):
        terrain = self.root / "terrain.tif"
        terrain.write_bytes(b"not-a-real-raster-fixture")
        output = self.root / "pack"
        args = pack_studio.parser().parse_args([
            "build",
            "--id", "test-region",
            "--name", "Test Region",
            "--version", "1.0.0",
            "--output", str(output),
            "--source", "Synthetic fixture",
            "--license", "MIT",
            "--confidence", "Synthetic tests only",
            "--towers", str(self.towers),
            "--buildings", str(self.buildings),
            "--towers-crs", "EPSG:3857",
            "--buildings-crs", "EPSG:3857",
            "--terrain", str(terrain),
            "--terrain-crs", "EPSG:3857",
        ])
        manifest = pack_studio.build_pack(args)
        stored = json.loads((output / "manifest.json").read_text())
        self.assertEqual(stored["schema_version"], 2)
        self.assertEqual(stored["files"]["terrain"], "terrain.tif")
        self.assertTrue(stored["layers"]["terrain"]["optional"])
        self.assertEqual(stored["quality"]["geometry"]["buildings"]["invalid_input"], 1)
        tower_feature = json.loads((output / "towers.geojson").read_text())["features"][0]
        self.assertEqual(tower_feature["properties"]["cell_id"], 1)
        self.assertEqual(tower_feature["properties"]["source_cell_id"], "source-alpha")
        for filename, expected in stored["sha256"].items():
            actual = hashlib.sha256((output / filename).read_bytes()).hexdigest()
            self.assertEqual(actual, expected)
        self.assertEqual(manifest, stored)

    def test_build_refuses_to_overwrite_nonempty_output(self):
        output = self.root / "pack"
        output.mkdir()
        (output / "keep.txt").write_text("user data")
        args = pack_studio.parser().parse_args([
            "build", "--id", "x", "--name", "X", "--version", "1",
            "--output", str(output), "--source", "x", "--license", "x", "--confidence", "x",
            "--towers", str(self.towers), "--buildings", str(self.buildings),
            "--towers-crs", "EPSG:3857", "--buildings-crs", "EPSG:3857",
        ])
        with self.assertRaisesRegex(ValueError, "must not already contain"):
            pack_studio.build_pack(args)
        self.assertEqual((output / "keep.txt").read_text(), "user data")

    def test_build_requires_explicit_terrain_crs(self):
        terrain = self.root / "terrain.tif"
        terrain.write_bytes(b"fixture")
        args = pack_studio.parser().parse_args([
            "build", "--id", "x", "--name", "X", "--version", "1",
            "--output", str(self.root / "pack"), "--source", "x", "--license", "x", "--confidence", "x",
            "--towers", str(self.towers), "--buildings", str(self.buildings),
            "--towers-crs", "EPSG:3857", "--buildings-crs", "EPSG:3857", "--terrain", str(terrain),
        ])
        with self.assertRaisesRegex(ValueError, "terrain requires --terrain-crs"):
            pack_studio.build_pack(args)


def feature(identifier, geometry_type, coordinates, properties):
    return {"type": "Feature", "id": identifier, "properties": properties, "geometry": {"type": geometry_type, "coordinates": coordinates}}


def write_geojson(path, features, crs):
    path.write_text(json.dumps({
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": crs}},
        "features": features,
    }))


if __name__ == "__main__":
    unittest.main()
