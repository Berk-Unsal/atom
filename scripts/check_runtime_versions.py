#!/usr/bin/env python3
"""Keep supported runtime versions aligned across builds and developer tooling."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GO_VERSION = "1.26.5"
NODE_VERSION = "24"
ALPINE_VERSION = "3.24"
IMAGE_DIGEST_PATTERN = r"sha256:[0-9a-f]{64}"


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> None:
    errors: list[str] = []

    for module in ("backend-go/go.mod", "core-lab-adapter/go.mod"):
        content = (ROOT / module).read_text(encoding="utf-8")
        match = re.search(r"^go (\S+)$", content, flags=re.MULTILINE)
        actual = match.group(1) if match else None
        require(actual == GO_VERSION, f"{module}: expected go {GO_VERSION}, found {actual!r}", errors)

    dockerfiles: dict[str, tuple[str, ...]] = {
        "Dockerfile": (
            rf"FROM node:{NODE_VERSION}-alpine@{IMAGE_DIGEST_PATTERN} AS frontend-build",
            rf"FROM golang:{GO_VERSION}-alpine@{IMAGE_DIGEST_PATTERN} AS backend-build",
            rf"FROM alpine:{ALPINE_VERSION}@{IMAGE_DIGEST_PATTERN} AS production",
        ),
        "core-lab-adapter/Dockerfile": (
            rf"FROM golang:{GO_VERSION}-alpine@{IMAGE_DIGEST_PATTERN} AS build",
            rf"FROM alpine:{ALPINE_VERSION}@{IMAGE_DIGEST_PATTERN}",
        ),
    }
    for dockerfile, expected_patterns in dockerfiles.items():
        content = (ROOT / dockerfile).read_text(encoding="utf-8")
        for pattern in expected_patterns:
            require(
                re.search(rf"^{pattern}$", content, flags=re.MULTILINE) is not None,
                f"{dockerfile}: missing pattern {pattern!r}",
                errors,
            )

    package = json.loads((ROOT / "frontend-react/package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((ROOT / "frontend-react/package-lock.json").read_text(encoding="utf-8"))
    expected_engine = f">={NODE_VERSION}"
    require(package.get("engines", {}).get("node") == expected_engine,
            f"frontend-react/package.json: expected Node engine {expected_engine}", errors)
    require(package_lock.get("packages", {}).get("", {}).get("engines", {}).get("node") == expected_engine,
            f"frontend-react/package-lock.json: expected Node engine {expected_engine}", errors)
    require((ROOT / "frontend-react/.nvmrc").read_text(encoding="utf-8").strip() == NODE_VERSION,
            f"frontend-react/.nvmrc: expected {NODE_VERSION}", errors)

    workflow = (ROOT / ".github/workflows/quality.yml").read_text(encoding="utf-8")
    node_versions = re.findall(r"^\s+node-version:\s*(\S+)$", workflow, flags=re.MULTILINE)
    require(node_versions and set(node_versions) == {NODE_VERSION},
            f"quality workflow: expected only Node {NODE_VERSION}, found {node_versions}", errors)

    if errors:
        raise SystemExit("Runtime version check failed:\n- " + "\n- ".join(errors))
    print(
        f"Runtime versions and image digests are consistent: "
        f"Go {GO_VERSION}, Node {NODE_VERSION}, Alpine {ALPINE_VERSION}"
    )


if __name__ == "__main__":
    main()
