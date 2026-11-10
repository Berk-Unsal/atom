import importlib.util
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("extract_candidate", Path(__file__).parents[1] / "scripts/extract-candidate.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CandidateExtractionTest(unittest.TestCase):
    def test_only_approved_regular_bytes_are_extracted(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "candidate.zip"
            with zipfile.ZipFile(archive, "w") as bundle:
                bundle.writestr("approved.deb", b"exact")
                bundle.writestr("ignored.txt", b"ignored")
            module.extract(archive, root / "out", [{"name": "approved.deb", "bytes": 5}])
            self.assertEqual((root / "out/approved.deb").read_bytes(), b"exact")
            self.assertFalse((root / "out/ignored.txt").exists())

    def test_traversal_links_and_wrong_sizes_fail(self):
        for name, mode, size in [("../outside", 0, 5), ("approved.deb", stat.S_IFLNK | 0o777, 5), ("approved.deb", 0, 100)]:
            with self.subTest(name=name, mode=mode, size=size), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                with zipfile.ZipFile(root / "candidate.zip", "w") as bundle:
                    entry = zipfile.ZipInfo(name)
                    entry.external_attr = mode << 16
                    bundle.writestr(entry, b"exact")
                with self.assertRaises(ValueError):
                    module.extract(root / "candidate.zip", root / "out", [{"name": "approved.deb", "bytes": size}])


if __name__ == "__main__":
    unittest.main()
