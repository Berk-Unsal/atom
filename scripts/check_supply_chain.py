#!/usr/bin/env python3
"""Validate reproducible build inputs and required supply-chain CI controls."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIGEST_RE = re.compile(r"@sha256:[0-9a-f]{64}(?:\s|$)")
EXACT_REQUIREMENT_RE = re.compile(r"^[A-Za-z0-9_.-]+==[^\s\\]+(?:\s+\\)?$")


def dockerfile_errors(path: Path) -> list[str]:
    errors: list[str] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if line.startswith("FROM ") and not DIGEST_RE.search(line):
            errors.append(f"{display_path(path)}:{line_number}: base image is not digest-pinned")
    return errors


def input_requirement_errors(path: Path) -> list[str]:
    errors: list[str] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        stripped = line.strip()
        if stripped and not stripped.startswith("#") and not EXACT_REQUIREMENT_RE.fullmatch(stripped):
            errors.append(f"{display_path(path)}:{line_number}: dependency is not exactly pinned")
    return errors


def lockfile_errors(path: Path) -> list[str]:
    errors: list[str] = []
    lines = path.read_text(encoding="utf-8").splitlines()
    requirement_indexes = [
        index
        for index, line in enumerate(lines)
        if line and not line[0].isspace() and not line.startswith("#")
    ]
    if not requirement_indexes:
        return [f"{display_path(path)}: lockfile contains no requirements"]

    for position, start in enumerate(requirement_indexes):
        end = requirement_indexes[position + 1] if position + 1 < len(requirement_indexes) else len(lines)
        requirement = lines[start]
        if not EXACT_REQUIREMENT_RE.fullmatch(requirement):
            errors.append(f"{display_path(path)}:{start + 1}: dependency is not exactly pinned")
        block = "\n".join(lines[start:end])
        if not re.search(r"--hash=sha256:[0-9a-f]{64}", block):
            errors.append(f"{display_path(path)}:{start + 1}: dependency has no SHA-256 hash")
    return errors


def workflow_errors(path: Path) -> list[str]:
    content = path.read_text(encoding="utf-8")
    required_fragments = {
        "hashed pipeline dependency install": (
            "python -m pip install --require-hashes --only-binary=:all: "
            "-r data-pipeline/Requirements.txt"
        ),
        "hashed documentation dependency install": (
            "python -m pip install --require-hashes --only-binary=:all: -r docs/requirements.txt"
        ),
        "dependency review": "actions/dependency-review-action@",
        "SBOM generation": "anchore/sbom-action@",
        "container vulnerability scan": "aquasecurity/trivy-action@",
    }
    return [
        f"{display_path(path)}: missing {description}"
        for description, fragment in required_fragments.items()
        if fragment not in content
    ]


def display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return Path(path.name)


def collect_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for relative_path in ("Dockerfile", "core-lab-adapter/Dockerfile"):
        errors.extend(dockerfile_errors(root / relative_path))
    for relative_path in ("data-pipeline/Requirements.in", "docs/requirements.in"):
        errors.extend(input_requirement_errors(root / relative_path))
    for relative_path in ("data-pipeline/Requirements.txt", "docs/requirements.txt"):
        errors.extend(lockfile_errors(root / relative_path))
    errors.extend(workflow_errors(root / ".github/workflows/quality.yml"))
    return errors


def main() -> None:
    errors = collect_errors()
    if errors:
        raise SystemExit("Supply-chain check failed:\n- " + "\n- ".join(errors))
    print("Build inputs are immutable and required supply-chain CI controls are enabled")


if __name__ == "__main__":
    main()
