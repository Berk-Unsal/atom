from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import classify_docs


class SourceDiscoveryTests(unittest.TestCase):
    def test_local_hidden_tool_state_is_not_a_public_document(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ("guide.md", "assets/evidence.json", "report/.impeccable/design.json", ".venv/config.yaml", ".well-known/security.yaml"):
                target = root / "docs" / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("{}")
            with patch.object(classify_docs, "ROOT", root):
                sources = classify_docs.source_paths()
            self.assertIn("docs/guide.md", sources)
            self.assertIn("docs/assets/evidence.json", sources)
            self.assertIn("docs/.well-known/security.yaml", sources)
            self.assertNotIn("docs/report/.impeccable/design.json", sources)
            self.assertNotIn("docs/.venv/config.yaml", sources)


if __name__ == "__main__":
    unittest.main()
