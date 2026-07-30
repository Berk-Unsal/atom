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


def runtime_user_errors(path: Path) -> list[str]:
    lines = path.read_text(encoding="utf-8").splitlines()
    runtime_start = max(
        (index for index, line in enumerate(lines) if line.lstrip().startswith("FROM ")),
        default=-1,
    )
    runtime_users = [
        line.split(None, 1)[1].strip()
        for line in lines[runtime_start + 1 :]
        if line.lstrip().startswith("USER ")
    ]
    if not runtime_users:
        return [f"{display_path(path)}: final runtime stage has no USER directive"]
    if runtime_users[-1].lower() in {"0", "root", "0:0", "root:root"}:
        return [f"{display_path(path)}: final runtime stage runs as root"]
    return []


def core_lab_compose_errors(path: Path) -> list[str]:
    content = path.read_text(encoding="utf-8")
    match = re.search(r"^  core-lab-adapter:\n(?P<body>.*?)(?=^  [^ \n][^:]*:|\Z)", content, re.MULTILINE | re.DOTALL)
    if not match:
        return [f"{display_path(path)}: core-lab-adapter service is missing"]
    body = match.group("body")
    required_fragments = {
        "service-network-only exposure": "    expose:\n",
        "read-only filesystem": "    read_only: true\n",
        "capability drop": "    cap_drop:\n      - ALL\n",
        "privilege escalation prevention": "    security_opt:\n      - no-new-privileges:true\n",
    }
    errors = [
        f"{display_path(path)}: core-lab-adapter is missing {description}"
        for description, fragment in required_fragments.items()
        if fragment not in body
    ]
    if "    ports:\n" in body:
        errors.append(f"{display_path(path)}: core-lab-adapter must not publish a host port")
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
        "frontend npm advisory scan": "- run: npm run audit:security",
        "SBOM generation": "anchore/sbom-action@",
        "container vulnerability scan": "aquasecurity/trivy-action@",
    }
    errors = [
        f"{display_path(path)}: missing {description}"
        for description, fragment in required_fragments.items()
        if fragment not in content
    ]
    errors.extend(go_vulnerability_scan_errors(content, display_path(path)))
    return errors


def go_vulnerability_scan_errors(content: str, path: Path = Path("quality.yml")) -> list[str]:
    errors: list[str] = []
    if content.count("go install golang.org/x/vuln/cmd/govulncheck@") < 2:
        errors.append(f"{path}: both Go jobs must install a pinned govulncheck release")
    if content.count("- run: govulncheck ./...") < 2:
        errors.append(f"{path}: both Go jobs must run govulncheck")
    return errors


def display_path(path: Path) -> Path:
    try:
        return path.relative_to(ROOT)
    except ValueError:
        return Path(path.name)


def collect_errors(root: Path = ROOT) -> list[str]:
    errors: list[str] = []
    for relative_path in ("Dockerfile", "core-lab-adapter/Dockerfile"):
        errors.extend(dockerfile_errors(root / relative_path))
        errors.extend(runtime_user_errors(root / relative_path))
    errors.extend(core_lab_compose_errors(root / "docker-compose.core-lab.yml"))
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
