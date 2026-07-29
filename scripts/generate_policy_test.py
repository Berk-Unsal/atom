import tempfile
import unittest
from pathlib import Path

from scripts import generate_policy


class GeneratePolicyTest(unittest.TestCase):
    def test_every_runtime_binding_contains_each_scenario(self):
        policy = generate_policy.load_policy()
        rendered = generate_policy.generated_files(policy)
        scenario_outputs = [
            content
            for path, content in rendered.items()
            if (
                path.name in {"core_lab_policy_generated.go", "policy_generated.go", "policy.js"}
                and ("allowedCoreLabScenarios" in content or path.name == "policy.js")
            )
        ]

        self.assertEqual(len(scenario_outputs), 3)
        for scenario in policy["core_lab_scenarios"]:
            for output in scenario_outputs:
                self.assertIn(f'"{scenario["id"]}"', output)

    def test_stale_files_detects_missing_and_modified_bindings(self):
        with tempfile.TemporaryDirectory() as directory:
            current = Path(directory) / "current.go"
            modified = Path(directory) / "modified.js"
            missing = Path(directory) / "missing.go"
            current.write_text("current", encoding="utf-8")
            modified.write_text("old", encoding="utf-8")

            stale = generate_policy.stale_files({
                current: "current",
                modified: "new",
                missing: "generated",
            })

            self.assertEqual(stale, [modified, missing])


if __name__ == "__main__":
    unittest.main()
