#!/usr/bin/env python3
"""Verify the actual remote result, all issue bodies/labels and preserved metadata."""
import datetime
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
REPO = "Berk-Unsal/atom"


def api(endpoint, pages=False):
    cmd = ["gh", "api"] + (["--paginate", "--slurp"] if pages else []) + [endpoint]
    r = subprocess.run(cmd, capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)
    return [x for page in d for x in page] if pages else d


if __name__ == "__main__":
    manifest = json.loads((OUT / "issue-manifest.json").read_text())
    mutations = json.loads((OUT / "mutation-results.json").read_text())
    by_key = {x["key"]: x for x in mutations["issues"]}
    verified = []
    for p in manifest["issues"]:
        saved = by_key[p["key"]]
        live = api(f"repos/{REPO}/issues/{saved['number']}")
        assert live["state"] == "open" and live["title"] == p["title"]
        assert live["html_url"] == saved["url"]
        assert sorted(x["name"] for x in live["labels"]) == sorted(p["labels"])
        submitted = (OUT / "issue-bodies" / f"{p['key']}.submitted.md").read_text()
        assert live["body"] == submitted
        assert live["milestone"] is None
        assert "{{issue:" not in submitted
        for dep in p["dependencies"]:
            assert "#" + str(by_key[dep]["number"]) in submitted
        verified.append({"key": p["key"], "number": live["number"], "url": live["html_url"],
                         "state": live["state"], "labels": [x["name"] for x in live["labels"]],
                         "body_exact_match": True, "dependencies_resolved": True,
                         "url_resolves_via_authenticated_api": True})
        print("Verified", live["number"], flush=True)
    live_all = api(f"repos/{REPO}/issues?state=all&per_page=100", True)
    issues = [x for x in live_all if "pull_request" not in x]
    before = [x for page in json.loads((OUT / "github-issues-before.json").read_text())["data"]
              for x in page if "pull_request" not in x]
    before_numbers = {x["number"] for x in before}
    assert len(issues) == len(before) + len(verified)
    assert {x["number"] for x in issues if x["state"] == "open"} == {x["number"] for x in verified}
    for old in before:
        live = next(x for x in issues if x["number"] == old["number"])
        assert live["state"] == old["state"] == "closed"
        assert live["title"] == old["title"] and live["body"] == old["body"]
        assert live["labels"] == old["labels"]
    titles = [x["title"].casefold() for x in issues if x["state"] == "open"]
    assert len(titles) == len(set(titles))
    live_labels = api(f"repos/{REPO}/labels?per_page=100", True)
    old_labels = [x for page in json.loads((OUT / "github-labels-before.json").read_text())["data"] for x in page]
    for old in old_labels:
        live = next(x for x in live_labels if x["name"] == old["name"])
        assert all(live[k] == old[k] for k in ["name", "color", "description"])
    repo = api(f"repos/{REPO}")
    old_repo = json.loads((OUT / "github-repository.json").read_text())["data"][0]
    assert all(repo[k] == old_repo[k] for k in ["description", "topics", "homepage", "has_discussions", "default_branch"])
    milestones = api(f"repos/{REPO}/milestones?state=all&per_page=100", True)
    assert milestones == []
    result = {"verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "issues": verified, "total_issue_count": len(issues),
              "open_issue_count": sum(x["state"] == "open" for x in issues),
              "closed_issue_count": sum(x["state"] == "closed" for x in issues),
              "all_original_issues_unchanged_and_closed": True,
              "no_duplicate_open_titles": True, "all_original_labels_preserved": True,
              "label_count": len(live_labels), "repository_metadata_unchanged": True,
              "milestones_unchanged": True, "project_verification": "unavailable: read:project scope missing"}
    (OUT / "github-verification.json").write_text(json.dumps(result, indent=2) + "\n")
    (OUT / "github-issues-after.json").write_text(json.dumps({"issues": [
        {"number": x["number"], "title": x["title"], "state": x["state"], "url": x["html_url"],
         "labels": [l["name"] for l in x["labels"]]} for x in issues]}, indent=2) + "\n")
    (OUT / "github-labels-after.json").write_text(json.dumps([
        {k: x[k] for k in ["name", "color", "description"]} for x in live_labels], indent=2) + "\n")
    print("Verified all issue URLs via API, exact bodies/labels/dependencies, 32 unchanged closed issues and all original labels.")
