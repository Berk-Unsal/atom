"""Keep current public scope guidance aligned with executable repository sources."""
import re
import subprocess
import unittest
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit

import yaml

ROOT = Path(__file__).resolve().parent.parent


class CurrentProductGuidanceTests(unittest.TestCase):
    def test_workspace_inventory_matches_current_tool_definitions(self):
        source = (ROOT / "frontend-react/src/components/workspaceTools.js").read_text().split("export const WORKSPACE_STAGES", 1)[0]
        stages = defaultdict(list)
        for label, stage in re.findall(r'label: "([^"]+)"[^\n]*stage: "([^"]+)"', source):
            stages[stage].append(label)
        guide = (ROOT / "docs/features.md").read_text()
        self.assertEqual(sum(map(len, stages.values())), 14)
        for stage, tools in stages.items():
            row = re.search(rf'^\| {stage.capitalize()} \| ([^|]+) \|$', guide, re.M)
            self.assertIsNotNone(row, stage)
            self.assertEqual([value.strip() for value in row[1].split(",")], tools)

    def test_maintained_roadmap_rows_have_status_and_public_source_evidence(self):
        path = ROOT / "planning/future_plans.md"
        text = path.read_text()
        rows = [line.split("|")[1:-1] for line in text.splitlines() if line.startswith("|")]
        content = [row for row in rows if row[1].strip() != "Status" and not all(re.fullmatch(r'\s*:?-+:?\s*', cell) for cell in row)]
        self.assertGreaterEqual(len(content), 20)
        for row in content:
            self.assertEqual(len(row), 3, row)
            self.assertIn(row[1].strip(), {"Implemented", "Partial", "Blocked", "Deferred"}, row[0])
            self.assertIn("](", row[2], row[0])
        tracked = set(subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True).splitlines())
        for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', text):
            url = urlsplit(target)
            if url.scheme or not url.path:
                continue
            relative = (path.parent / url.path).resolve().relative_to(ROOT).as_posix()
            self.assertIn(relative, tracked, f"Roadmap depends on a non-public source: {relative}")
            self.assertTrue((ROOT / relative).is_file(), relative)

    def test_api_contract_identity_matches_openapi_and_stays_distinct_from_application(self):
        contract = yaml.safe_load((ROOT / "docs/openapi.yaml").read_text())
        guide = (ROOT / "docs/api.md").read_text().split("## Versioning", 1)[1].split("## Troubleshooting", 1)[0]
        self.assertIn(f'**{contract["info"]["version"]}**', guide)
        self.assertIn("application_version", guide)
        self.assertIn("VERSION", guide)
        self.assertIn("separate", guide)


if __name__ == "__main__":
    unittest.main()
