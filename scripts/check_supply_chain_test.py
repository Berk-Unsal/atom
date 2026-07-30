from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("check_supply_chain.py")
SPEC = importlib.util.spec_from_file_location("check_supply_chain", MODULE_PATH)
assert SPEC and SPEC.loader
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class SupplyChainCheckTest(unittest.TestCase):
    def test_rejects_floating_container_base(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Dockerfile"
            path.write_text("FROM alpine:latest\n", encoding="utf-8")
            self.assertEqual(1, len(CHECKER.dockerfile_errors(path)))

    def test_accepts_digest_pinned_container_base(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Dockerfile"
            path.write_text(f"FROM alpine:3.24@sha256:{'a' * 64}\n", encoding="utf-8")
            self.assertEqual([], CHECKER.dockerfile_errors(path))

    def test_rejects_range_in_direct_requirements(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "requirements.in"
            path.write_text("example>=1,<2\n", encoding="utf-8")
            self.assertEqual(1, len(CHECKER.input_requirement_errors(path)))

    def test_requires_hash_for_every_locked_requirement(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "requirements.txt"
            path.write_text(
                f"first==1.0 \\\n    --hash=sha256:{'b' * 64}\nsecond==2.0\n",
                encoding="utf-8",
            )
            errors = CHECKER.lockfile_errors(path)
            self.assertEqual(1, len(errors))
            self.assertIn("dependency has no SHA-256 hash", errors[0])

    def test_requires_all_workflow_controls(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "quality.yml"
            path.write_text("jobs: {}\n", encoding="utf-8")
            errors = CHECKER.workflow_errors(path)
            self.assertEqual(5, len(errors))
            self.assertTrue(any("dependency review" in error for error in errors))
            self.assertTrue(any("SBOM generation" in error for error in errors))
            self.assertTrue(any("container vulnerability scan" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
