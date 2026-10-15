#!/usr/bin/env python3
"""Apply only a validated, hash-locked manifest. Default is a read-only dry run.

Uses structured JSON stdin, journals each mutation and never touches repository
files outside the audit directory. Re-running reuses journaled issues; it will
not automatically adopt another author's issue with a matching title.
"""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
REPO = "Berk-Unsal/atom"


def api(endpoint, payload=None):
    args = ["gh", "api", endpoint]
    if payload is not None:
        args += ["--method", "POST", "--input", "-"]
    r = subprocess.run(args, input=json.dumps(payload) if payload is not None else None,
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip())
    return json.loads(r.stdout)


def all_items(endpoint):
    r = subprocess.run(["gh", "api", "--paginate", "--slurp", endpoint],
                       capture_output=True, text=True, check=True)
    return [item for page in json.loads(r.stdout) for item in page]


def save(journal):
    (OUT / "mutation-results.json").write_text(json.dumps(journal, indent=2) + "\n")


def label_details(name):
    category, _, value = name.partition(": ")
    if category == "type":
        return "5319e7", f"Roadmap work type: {value}"
    if category == "area":
        return "1d76db", f"Primary roadmap surface: {value}"
    if category == "priority":
        return {"P1": "b60205", "P2": "fbca04", "P3": "c2e0c6"}[value], {
            "P1": "Correctness, scientific credibility, major friction or important integration",
            "P2": "Meaningful usability, contributor experience or bounded technical debt",
            "P3": "Polish, convenience or optional documentation quality",
        }[value]
    assert name == "blocked", name
    return "d93f0b", "Cannot proceed until linked prerequisites or external evidence are available"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    manifest_path = OUT / "issue-manifest.json"
    expected = (OUT / "issue-manifest.sha256").read_text().split()[0]
    assert hashlib.sha256(manifest_path.read_bytes()).hexdigest() == expected
    manifest = json.loads(manifest_path.read_text())
    assert manifest["validation"]["status"] == "approved"
    labels = all_items(f"repos/{REPO}/labels?per_page=100")
    existing_labels = {x["name"] for x in labels}
    wanted = sorted({label for p in manifest["issues"] for label in p["labels"]})
    plan = {"create": sorted(set(wanted) - existing_labels),
            "reuse": sorted(set(wanted) & existing_labels),
            "skip_preserve": sorted(existing_labels - set(wanted))}
    (OUT / "label-plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({"label_plan": plan, "issues": len(manifest["issues"]), "apply": args.apply}), flush=True)
    if not args.apply:
        return
    journal_path = OUT / "mutation-results.json"
    journal = json.loads(journal_path.read_text()) if journal_path.exists() else {
        "started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "manifest_sha256": expected, "labels_created": [], "labels_reused": plan["reuse"],
        "labels_skipped_preserved": plan["skip_preserve"], "issues": [],
        "projects": {"status": "blocked", "reason": "Discovery rejected: token lacks read:project; no creation or field mutation attempted.",
                     "project_id": None, "url": None, "actual_issue_count": None,
                     "issues_added": 0, "existing_projects": "unknown: discovery permission denied"},
        "milestones": {"created": [], "reused": [], "decision": "No coherent release promise; leave issues unmilestoned."},
        "unrelated_metadata_changed": False,
    }
    assert journal["manifest_sha256"] == expected
    live = [x for x in all_items(f"repos/{REPO}/issues?state=all&per_page=100") if "pull_request" not in x]
    original = [x for page in json.loads((OUT / "github-issues-before.json").read_text())["data"]
                for x in page if "pull_request" not in x]
    known_numbers = {x["number"] for x in original} | {x["number"] for x in journal["issues"]}
    assert {x["number"] for x in live} == known_numbers, "Issue inventory changed; re-review duplicates before mutation."
    assert all(x["state"] == "closed" for x in live if x["number"] in {i["number"] for i in original})
    titles = {x["title"].casefold() for x in live}
    for name in plan["create"]:
        color, description = label_details(name)
        created = api(f"repos/{REPO}/labels", {"name": name, "color": color, "description": description})
        journal["labels_created"].append(created["name"])
        save(journal)
        print("Created label", name, flush=True)
    by_key = {x["key"]: x for x in journal["issues"]}
    for p in manifest["issues"]:
        if p["key"] in by_key:
            continue
        assert p["decision"] == "create"
        assert p["title"].casefold() not in titles, "Matching title now exists; do not create a duplicate."
        body = p["body_template"]
        for dependency in p["dependencies"]:
            body = body.replace("{{issue:" + dependency + "}}", "#" + str(by_key[dependency]["number"]))
        assert "{{issue:" not in body
        assert all(s not in body for s in ["/Users/", "Bearer ", "ghp_", "gho_"])
        # Exact reviewable submitted bytes are retained before the request.
        (OUT / "issue-bodies" / f"{p['key']}.submitted.md").write_text(body)
        created = api(f"repos/{REPO}/issues", {"title": p["title"], "body": body, "labels": p["labels"]})
        record = {"key": p["key"], "number": created["number"], "url": created["html_url"],
                  "title": created["title"], "node_id": created["node_id"],
                  "labels": [x["name"] for x in created["labels"]],
                  "created_at": created["created_at"], "decision": "created"}
        journal["issues"].append(record)
        by_key[p["key"]] = record
        titles.add(p["title"].casefold())
        save(journal)
        print("Created issue", record["number"], record["url"], flush=True)
    journal["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(journal)


if __name__ == "__main__":
    main()
