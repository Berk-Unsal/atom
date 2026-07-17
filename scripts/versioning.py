#!/usr/bin/env python3
"""Validate A.T.O.M version metadata and extract release notes."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$")


def read_version() -> str:
    version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
    if not SEMVER.fullmatch(version):
        raise SystemExit(f"VERSION must contain a SemVer value without a v prefix; found {version!r}")
    return version


def changelog_section(version: str) -> str:
    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    match = re.search(
        rf"^## \[{re.escape(version)}\](?:\s+-\s+[^\n]+)?\n(?P<body>.*?)(?=^## \[|\Z)",
        changelog,
        flags=re.MULTILINE | re.DOTALL,
    )
    if not match:
        raise SystemExit(f"CHANGELOG.md has no section for {version}")
    body = match.group("body").strip()
    return re.split(r"\n(?=\[[^\]]+\]:\s)", body, maxsplit=1)[0].rstrip()


def check(tag: str | None) -> None:
    version = read_version()
    package = json.loads((ROOT / "frontend-react/package.json").read_text(encoding="utf-8"))
    package_lock = json.loads((ROOT / "frontend-react/package-lock.json").read_text(encoding="utf-8"))
    declared = {
        "frontend-react/package.json": package.get("version"),
        "frontend-react/package-lock.json": package_lock.get("version"),
        "frontend-react/package-lock.json packages root": package_lock.get("packages", {}).get("", {}).get("version"),
    }
    mismatches = [f"{path}={value!r}" for path, value in declared.items() if value != version]
    if mismatches:
        raise SystemExit(f"Version metadata must match VERSION={version}: " + ", ".join(mismatches))
    changelog_section(version)
    if tag and tag != f"v{version}":
        raise SystemExit(f"Release tag {tag!r} must equal v{version}")
    print(f"A.T.O.M version metadata is consistent: {version}")


def notes(version: str, output: Path | None) -> None:
    canonical = read_version()
    if version != canonical:
        raise SystemExit(f"Requested release {version} does not match VERSION={canonical}")
    content = f"# A.T.O.M {version}\n\n{changelog_section(version)}\n"
    if output:
        output.write_text(content, encoding="utf-8")
    else:
        print(content, end="")


def main() -> None:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    check_parser = subparsers.add_parser("check")
    check_parser.add_argument("--tag")
    notes_parser = subparsers.add_parser("notes")
    notes_parser.add_argument("--version", required=True)
    notes_parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "check":
        check(args.tag)
    else:
        notes(args.version, args.output)


if __name__ == "__main__":
    main()
