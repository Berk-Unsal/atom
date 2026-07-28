#!/usr/bin/env python3
"""Reject external GitHub Actions that are not pinned to full commit SHAs."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_ROOT = ROOT / ".github" / "workflows"
USES_PATTERN = re.compile(r"^\s*(?:-\s*)?uses:\s*([^\s#]+)", flags=re.MULTILINE)
FULL_COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")


def find_unpinned_references(content: str) -> list[str]:
    errors: list[str] = []
    for match in USES_PATTERN.finditer(content):
        reference = match.group(1)
        if reference.startswith("./"):
            continue
        if "@" not in reference:
            errors.append(f"{reference}: external action must include @<commit-sha>")
            continue
        _, revision = reference.rsplit("@", 1)
        if not FULL_COMMIT_SHA.fullmatch(revision):
            errors.append(f"{reference}: revision must be a full 40-character commit SHA")
    return errors


def workflow_files() -> list[Path]:
    return sorted((*WORKFLOW_ROOT.glob("*.yml"), *WORKFLOW_ROOT.glob("*.yaml")))


def main() -> None:
    errors: list[str] = []
    files = workflow_files()
    if not files:
        raise SystemExit("No GitHub Actions workflow files found")

    for path in files:
        relative_path = path.relative_to(ROOT)
        for error in find_unpinned_references(path.read_text(encoding="utf-8")):
            errors.append(f"{relative_path}: {error}")

    if errors:
        raise SystemExit("Workflow action pin check failed:\n- " + "\n- ".join(errors))
    print(f"All external actions are pinned to full commit SHAs ({len(files)} workflows)")


if __name__ == "__main__":
    main()
