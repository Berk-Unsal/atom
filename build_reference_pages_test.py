import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class DocumentationBuildVersionTests(unittest.TestCase):
    def run_build(self, version):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docs = root / "docs"
            docs.mkdir()
            shutil.copy(Path(__file__).with_name("build-reference-pages.sh"), docs)
            # Stop after the version check, before generating any documentation.
            (docs / "build_theme_assets.py").write_text(
                "from pathlib import Path\n"
                "Path('generation-started').touch()\n"
                "raise SystemExit(27)\n"
            )
            binary = root / "pandoc"
            binary.write_text('#!/bin/sh\nprintf "pandoc %s\\n" "$TEST_PANDOC_VERSION"\n')
            binary.chmod(0o755)
            result = subprocess.run(
                ["sh", str(docs / "build-reference-pages.sh")],
                env={**os.environ, "PATH": f"{root}{os.pathsep}{os.environ['PATH']}",
                     "TEST_PANDOC_VERSION": version},
                capture_output=True, text=True, timeout=10,
            )
            return result, (docs / "generation-started").exists()

    def test_other_versions_fail_before_changing_generated_files(self):
        for version in ("3.12.1", "3.10.1"):
            with self.subTest(version=version):
                result, started = self.run_build(version)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(started)
                self.assertIn("Pandoc 3.10", result.stderr)
                self.assertIn(version, result.stderr)

    def test_ci_version_reaches_generation(self):
        result, started = self.run_build("3.10")
        self.assertEqual(result.returncode, 27, result.stderr)
        self.assertTrue(started)


if __name__ == "__main__":
    unittest.main()
