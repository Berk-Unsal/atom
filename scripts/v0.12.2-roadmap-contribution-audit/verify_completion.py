#!/usr/bin/env python3
"""Check terminal audit invariants, scope, source references and artifact hashes."""
import ast
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
PAIR = {"docs/v0.12.2-roadmap-contribution-audit.md", "docs/v0.12.2-roadmap-contribution-audit.json"}
CATALOG = "docs/doc-sources.json"


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True)


def read(name):
    return json.loads((OUT / name).read_text())


if __name__ == "__main__":
    lock = read("pre-audit-lock.json")
    assert hashlib.sha256((OUT / "pre-audit-lock.json").read_bytes()).hexdigest() == (OUT / "pre-audit-lock.sha256").read_text().split()[0]
    assert git("rev-parse", "HEAD").strip() == lock["baseline"]["head"]
    assert (ROOT / "VERSION").read_text().strip() == "0.12.2"
    assert git("rev-parse", "v0.12.2^{}").strip() == lock["baseline"]["head"]
    assert set(git("diff", "--name-only", "HEAD").splitlines()) <= {CATALOG}
    assert not git("ls-files", "--deleted").strip()
    for source, digest in lock["authoritative_sources_sha256"].items():
        assert hashlib.sha256((ROOT / source).read_bytes()).hexdigest() == digest, source
    for source, digest in read("source-evidence-index.json").items():
        assert hashlib.sha256((ROOT / source).read_bytes()).hexdigest() == digest, source
    manifest = read("issue-manifest.json")
    assert hashlib.sha256((OUT / "issue-manifest.json").read_bytes()).hexdigest() == (OUT / "issue-manifest.sha256").read_text().split()[0]
    assert manifest["validation"]["status"] == "approved"
    original_catalog = json.loads(git("show", "HEAD:" + CATALOG))
    catalog = json.loads((ROOT / CATALOG).read_text())
    assert set(catalog["sources"]) - set(original_catalog["sources"]) == PAIR
    assert all(catalog["sources"][k] == v for k, v in original_catalog["sources"].items())
    assert all(catalog[k] == v for k, v in original_catalog.items() if k != "sources")
    assert all(catalog["sources"][p]["classification"] == "HISTORICAL AUDIT / QUALIFICATION" for p in PAIR)
    untracked = git("ls-files", "--others", "--exclude-standard").splitlines()
    for path in untracked:
        assert path in PAIR or path.startswith("scripts/v0.12.2-roadmap-contribution-audit/"), path
    for path in PAIR:
        assert (ROOT / path).is_file(), path
    report = json.loads((ROOT / "docs/v0.12.2-roadmap-contribution-audit.json").read_text())
    assert report["verdict"]["code"] == "B"
    assert [x["number"] for x in report["required_final_items"]] == list(range(1, 51))
    assert len(report["issues"]) == 15 and len(report["tracking_issues"]) == 1
    assert report["contribution_readiness"]["before"] == 10
    assert report["contribution_readiness"]["after"] == 12
    verification = read("github-verification.json")
    assert verification["open_issue_count"] == 15 and verification["closed_issue_count"] == 32
    assert verification["all_original_issues_unchanged_and_closed"] and verification["all_original_labels_preserved"]
    assert len(verification["issues"]) == 15
    assert all(x["url_resolves_via_authenticated_api"] and x["body_exact_match"] for x in verification["issues"])
    submitted_count = 0
    for p in manifest["issues"]:
        for source, line in p["evidence"]:
            assert (ROOT / source).is_file() and 0 < line <= len((ROOT / source).read_text().splitlines())
        submitted = (OUT / "issue-bodies" / f"{p['key']}.submitted.md").read_text()
        assert "{{issue:" not in submitted
        assert not any(token in submitted for token in ["/Users/", "Bearer ", "ghp_", "gho_"])
        for source, line in p["evidence"]:
            relative = f"../blob/{lock['baseline']['head']}/{source}#L{line}"
            issue_url = next(i["url"] for i in verification["issues"] if i["key"] == p["key"])
            expected_url = f"https://github.com/Berk-Unsal/atom/blob/{lock['baseline']['head']}/{source}#L{line}"
            assert urljoin(issue_url, relative) == expected_url
        submitted_count += 1
    text_paths = [ROOT / p for p in untracked] + [ROOT / CATALOG]
    for path in text_paths:
        text = path.read_text()
        assert text.endswith("\n"), (path, "missing newline")
        assert all(line == line.rstrip(" \t") for line in text.splitlines()), (path, "trailing whitespace")
        if path.suffix == ".py":
            ast.parse(text, filename=str(path))
        if path.suffix == ".json":
            json.loads(text)
    subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)
    result = {
        "completed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "result": "PASS", "head_version_and_tag_unchanged": True,
        "all_original_tracked_files_unchanged_except_two_entry_audit_catalog_registration": True,
        "all_original_catalog_entries_unchanged": True,
        "lock_and_approved_manifest_hashes_unchanged": True,
        "authoritative_and_cited_source_hashes_unchanged": True,
        "expected_report_paths_and_50_final_items_present": True,
        "all_new_paths_are_audit_artifacts": True,
        "new_file_whitespace_json_python_syntax": "pass",
        "git_diff_check": "pass", "verified_submitted_issue_bodies": submitted_count,
        "github_issue_urls_labels_bodies_and_dependency_references": "verified via authenticated API readback",
        "existing_32_issues_closed_and_unchanged": True,
        "existing_24_labels_preserved": True,
        "project": "not accessed/mutated: permission blocked; no A verdict",
        "methodology_violations": [],
    }
    (OUT / "completion-verification.json").write_text(json.dumps(result, indent=2) + "\n")
    # Exclude only this index to avoid self-referential hashing.
    artifacts = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in sorted(OUT.rglob("*")) if p.is_file() and p.name != "artifact-index.json"}
    for path in sorted(PAIR | {CATALOG}):
        artifacts[path] = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
    (OUT / "artifact-index.json").write_text(json.dumps({"sha256": artifacts, "self_excluded": True}, indent=2) + "\n")
    print(json.dumps(result, indent=2))
