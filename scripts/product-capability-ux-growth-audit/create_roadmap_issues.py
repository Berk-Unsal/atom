"""Create approved roadmap issues one at a time, verifying each before continuing.

Usage (repository root): python3 scripts/product-capability-ux-growth-audit/create_roadmap_issues.py [--only KEY] [--dry-run]
Results are appended to roadmap-created.json; already-created keys are skipped.
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import roadmap_issues as manifest

HERE = Path(__file__).resolve().parent
BODIES = HERE / "issue-bodies"
STATE = HERE / "roadmap-created.json"
REPO = "Berk-Unsal/atom"


def gh(*args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"gh {' '.join(args[:3])} failed: {result.stderr.strip()}")
    return result.stdout


def load_state():
    return json.loads(STATE.read_text()) if STATE.exists() else {"repo": REPO, "created": {}}


def resolve(text, created):
    def repl(match):
        key = match.group(1)
        if key not in created:
            raise SystemExit(f"dependency {key} not created yet")
        return f"#{created[key]['number']}"
    return re.sub(r"\{dep:([a-z-]+)\}", repl, text)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    BODIES.mkdir(exist_ok=True)
    state = load_state()
    labels = set(json.loads(gh("label", "list", "--repo", REPO, "--limit", "200", "--json", "name")) and
                 [label["name"] for label in json.loads(gh("label", "list", "--repo", REPO, "--limit", "200", "--json", "name"))])
    for issue in manifest.ISSUES:
        key = issue["key"]
        if args.only and key != args.only:
            continue
        if key in state["created"]:
            print(f"skip {key}: already #{state['created'][key]['number']}")
            continue
        missing = [label for label in issue["labels"] if label not in labels]
        if missing:
            raise SystemExit(f"{key}: missing labels {missing}")
        body = resolve(issue["body"], state["created"])
        if "{dep:" in body:
            raise SystemExit(f"{key}: unresolved dependency")
        existing = json.loads(gh("issue", "list", "--repo", REPO, "--state", "all", "--limit", "300", "--json", "number,title"))
        clash = [item for item in existing if item["title"].strip().lower() == issue["title"].strip().lower()]
        if clash:
            raise SystemExit(f"{key}: title already exists as #{clash[0]['number']}")
        body_path = BODIES / f"{key}.md"
        body_path.write_text(body)
        if args.dry_run:
            print(f"dry-run {key}: {issue['title']} labels={issue['labels']}")
            continue
        command = ["issue", "create", "--repo", REPO, "--title", issue["title"], "--body-file", str(body_path)]
        for label in issue["labels"]:
            command += ["--label", label]
        url = gh(*command).strip().splitlines()[-1]
        number = int(url.rstrip("/").split("/")[-1])
        fetched = json.loads(gh("issue", "view", str(number), "--repo", REPO, "--json", "number,title,state,labels,body,assignees,milestone,url"))
        checks = {
            "title": fetched["title"] == issue["title"],
            "state_open": fetched["state"] == "OPEN",
            "labels": sorted(label["name"] for label in fetched["labels"]) == sorted(issue["labels"]),
            "body": fetched["body"].strip() == body.strip(),
            "no_assignees": not fetched["assignees"],
            "no_milestone": fetched["milestone"] is None,
        }
        state["created"][key] = {"number": number, "url": fetched["url"], "title": fetched["title"], "labels": sorted(issue["labels"]), "checks": checks}
        STATE.write_text(json.dumps(state, indent=2) + "\n")
        print(f"created {key}: #{number} {fetched['url']} checks={'OK' if all(checks.values()) else checks}")
        if not all(checks.values()):
            sys.exit(f"verification failed for #{number}; stopping")


if __name__ == "__main__":
    main()
