#!/usr/bin/env python3
"""Supplement full all-state issue inventory with live GitHub search; read only."""
import datetime
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent


if __name__ == "__main__":
    path = OUT / "issue-manifest.json"
    manifest = json.loads(path.read_text())
    results = []
    for p in manifest["issues"]:
        term = p["search_terms"][0]
        query = 'repo:Berk-Unsal/atom is:issue ' + ('"' + term + '"' if " " in term else term)
        cmd = ["gh", "api", "-X", "GET", "search/issues", "-f", "q=" + query, "-f", "per_page=100"]
        r = subprocess.run(cmd, text=True, capture_output=True)
        assert r.returncode == 0, r.stderr
        d = json.loads(r.stdout)
        assert not d.get("incomplete_results")
        assert d["total_count"] <= 100, "Use full inventory for larger result sets."
        record = {"key": p["key"], "query": query, "state_filter": "none: includes open and closed",
                  "captured_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  "total_count": d["total_count"],
                  "matches": [{k: x[k] for k in ["number", "title", "state", "html_url"]} for x in d["items"]]}
        results.append(record)
        p["existing_duplicate_search"]["live_search"] = record
        print(p["key"], d["total_count"], [x["number"] for x in d["items"]], flush=True)
    (OUT / "duplicate-searches.json").write_text(json.dumps(results, indent=2) + "\n")
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
