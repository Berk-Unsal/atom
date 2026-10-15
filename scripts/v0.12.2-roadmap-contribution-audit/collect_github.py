#!/usr/bin/env python3
"""Read-only GitHub baseline collector. Never prints credentials or raw campaign data."""
import datetime
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
REPO = "Berk-Unsal/atom"


def capture(name, args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True)
    try:
        data = json.loads(result.stdout) if result.stdout else None
    except json.JSONDecodeError:
        data = result.stdout
    record = {"captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "command": ["gh", *args], "exit_code": result.returncode,
              "data": data, "stderr": result.stderr.strip()}
    (OUT / f"github-{name}.json").write_text(json.dumps(record, indent=2) + "\n")
    print(name, "exit", result.returncode,
          "items", len(data) if isinstance(data, list) else "object",
          record["stderr"][:250])
    return record


if __name__ == "__main__":
    # --paginate --slurp retains every REST page, including closed issues and PRs.
    for name, endpoint in [
        ("repository", f"repos/{REPO}"),
        ("issues-before", f"repos/{REPO}/issues?state=all&per_page=100&sort=created&direction=asc"),
        ("labels-before", f"repos/{REPO}/labels?per_page=100"),
        ("milestones", f"repos/{REPO}/milestones?state=all&per_page=100"),
        ("releases", f"repos/{REPO}/releases?per_page=100"),
        ("remote-tag", f"repos/{REPO}/git/ref/tags/v0.12.2"),
    ]:
        capture(name, ["api", "--paginate", "--slurp", endpoint])
    capture("projects-discovery", ["api", "graphql", "-f", "query=" +
        'query { viewer { login } repository(owner:"Berk-Unsal",name:"atom") {'
        ' hasDiscussionsEnabled projectsV2(first:30) { nodes { id number title url closed } }'
        ' discussions(first:30) { totalCount nodes { number title url } } }'
        ' user(login:"Berk-Unsal") { projectsV2(first:50) { nodes { id number title url closed } } } }'])
    capture("discussions", ["api", "graphql", "-f", "query=" +
        'query { repository(owner:"Berk-Unsal",name:"atom") { hasDiscussionsEnabled '
        'discussions(first:50) { totalCount nodes { number title url category { name } } } } }'])
