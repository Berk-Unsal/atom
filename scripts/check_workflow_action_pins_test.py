#!/usr/bin/env python3

import unittest

from scripts.check_workflow_action_pins import find_unpinned_references


class WorkflowActionPinTest(unittest.TestCase):
    def test_accepts_full_commit_sha_and_local_action(self) -> None:
        workflow = """
        steps:
          - uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6.1.0
          - uses: ./github/actions/local
        """
        self.assertEqual(find_unpinned_references(workflow), [])

    def test_rejects_mutable_tag(self) -> None:
        errors = find_unpinned_references("      - uses: docker/login-action@v3\n")
        self.assertEqual(len(errors), 1)
        self.assertIn("full 40-character commit SHA", errors[0])

    def test_rejects_mutable_reusable_workflow(self) -> None:
        errors = find_unpinned_references("    uses: owner/repository/.github/workflows/build.yml@main\n")
        self.assertEqual(len(errors), 1)


if __name__ == "__main__":
    unittest.main()
