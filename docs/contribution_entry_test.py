"""Keep newcomer entry points connected to public, checked-in guidance."""

from pathlib import Path
import re
import subprocess
import unittest
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent.parent


def local_links(path):
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", path.read_text()):
        url = urlsplit(target)
        if not url.scheme and url.path:
            yield (path.parent / unquote(url.path)).resolve()


class ContributionEntryTests(unittest.TestCase):
    def test_readme_and_github_entry_reach_the_maintained_guide(self):
        guide = ROOT / "docs/contributing.md"
        for entry in (ROOT / "README.md", ROOT / "CONTRIBUTING.md"):
            with self.subTest(entry=entry.name):
                self.assertIn(guide, local_links(entry))

    def test_newcomer_links_are_public_repository_files(self):
        tracked = set(subprocess.check_output(
            ["git", "ls-files"], cwd=ROOT, text=True,
        ).splitlines())
        # Newly authored files are checked before the commit too; ignored local
        # planning files must never make a broken public link appear valid.
        for source in (ROOT / "README.md", ROOT / "CONTRIBUTING.md", ROOT / "docs/contributing.md"):
            for target in local_links(source):
                with self.subTest(source=source.name, target=target):
                    self.assertTrue(target.is_file(), str(target))
                    self.assertTrue(target.is_relative_to(ROOT), str(target))
                    relative = str(target.relative_to(ROOT))
                    if relative not in tracked:
                        ignored = subprocess.run(
                            ["git", "check-ignore", "--quiet", relative], cwd=ROOT,
                            check=False,
                        )
                        self.assertEqual(ignored.returncode, 1, f"Ignored public reference: {relative}")


if __name__ == "__main__":
    unittest.main()
