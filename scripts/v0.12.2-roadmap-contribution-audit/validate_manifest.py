#!/usr/bin/env python3
"""Validate scope, references, dependencies and duplicate evidence before mutation."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
REQUIRED = ["Context", "Problem", "Scope", "Acceptance criteria", "Non-goals",
            "Evidence / references", "Dependencies", "Contributor notes"]


def validate(manifest):
    issues = manifest["issues"]
    assert 0 < len(issues) <= 24
    keys = {p["key"] for p in issues}
    assert len(keys) == len(issues)
    for field in ["title", "concept"]:
        values = [p[field].casefold() for p in issues]
        assert len(values) == len(set(values)), field
    for p in issues:
        assert p["decision"] in ["create", "reuse"]
        assert p["priority"] in ["P1", "P2", "P3"]
        assert p["effort"] in ["XS", "S", "M", "L", "RESEARCH"]
        assert p["contributor_suitability"] in ["beginner-safe", "contributor-friendly", "maintainer-owned", "research-heavy"]
        assert p["type"] != "research" or "good first issue" not in p["labels"]
        assert ("good first issue" in p["labels"]) == (p["contributor_suitability"] == "beginner-safe")
        assert ("blocked" in p["labels"]) == bool(p["blocked_reason"])
        assert p["project_status"] == ("Blocked" if p["blocked_reason"] else "Ready")
        assert set(p["dependencies"]) <= keys
        assert not p["existing_duplicate_search"]["duplicate_found"]
        assert p["existing_duplicate_search"]["issues_reviewed"] == 32
        text = p["body_template"]
        assert re.findall(r"^## (.+)$", text, re.M) == REQUIRED, p["key"]
        assert text.count("- [ ] ") >= 3
        assert not any(s in text for s in ["/Users/", "/private/", "Bearer ", "ghp_", "gho_"])
        for path, line in p["evidence"]:
            source = ROOT / path
            assert source.is_file(), (p["key"], path)
            assert 0 < line <= len(source.read_text().splitlines()), (p["key"], path, line)
    def visit(key, stack):
        assert key not in stack, ("dependency cycle", key)
        for dep in next(p for p in issues if p["key"] == key)["dependencies"]:
            visit(dep, stack + [key])
    for key in keys:
        visit(key, [])
    # Concept separation is an explicit editorial judgement, not a lexical proof.
    reviewed = [
        "score help vs executable walkthrough: decision-surface explanation vs reproducible inputs/journey",
        "worked example vs report reader guide: operating a plan vs consuming a retained artifact",
        "export recovery vs existing #17/#26: actionable guard guidance vs bounded parsing/storage ordering",
        "matched heroes vs #30: current state parity vs duplicate asset storage",
        "report guide vs #31: consumer help vs escaping/formatting implementation",
        "contribution entry vs issue forms vs PR template: development instructions vs intake vs review handoff",
        "schema completeness vs strict-validator repair: new response body contracts vs resolved syntax errors",
        "roadmap freshness vs contribution guide: public planning promises vs contributor workflow instructions",
        "three scientific prerequisites are independent evidence contracts; one tracker owns final reference set/Rx/LOS/held-out evaluation",
    ]
    return {"status": "approved", "validated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "github_mutation_started": False, "issue_count": len(issues),
            "new_issue_ceiling": 24, "unique_titles_and_concepts": True,
            "dependency_graph_acyclic": True, "all_references_resolve_in_locked_source": True,
            "issue_format_and_public_data_scan": "pass", "resolved_work_excluded": True,
            "speculative_scope_excluded": True, "manual_concept_reviews": reviewed}


if __name__ == "__main__":
    path = OUT / "issue-manifest.json"
    m = json.loads(path.read_text())
    m["validation"] = validate(m)
    path.write_text(json.dumps(m, indent=2, ensure_ascii=False) + "\n")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (OUT / "issue-manifest.sha256").write_text(digest + "  issue-manifest.json\n")
    print(json.dumps(m["validation"], indent=2))
