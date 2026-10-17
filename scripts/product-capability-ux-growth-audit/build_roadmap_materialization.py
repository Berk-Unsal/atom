"""Render roadmap-materialization.json from roadmap_issues.py and roadmap-created.json (repository-local record)."""
import json
from datetime import datetime, timezone
from pathlib import Path

import roadmap_issues as m

HERE = Path(__file__).resolve().parent
created = json.loads((HERE / "roadmap-created.json").read_text())["created"]
by_key = {issue["key"]: issue for issue in m.ISSUES}


def deps(issue):
    text = issue["body"].split("## Dependencies")[1].split("## Contributor notes")[0]
    keys = [k for k in by_key if "{dep:" + k + "}" in text]
    return [f"#{created[k]['number']}" for k in keys] + (["#78"] if "#78" in text and issue["key"] == "first-run" else [])


candidates = []
for cid, disposition, key, rationale, duplicate_of, folded_into in m.DISPOSITIONS:
    issue = by_key.get(key) if key else None
    resulting = created[key]["number"] if key else None
    if folded_into == "map-chrome + a11y":
        resulting_list = [created["map-chrome"]["number"], created["a11y"]["number"]]
    else:
        resulting_list = [resulting] if resulting else []
    if cid == "CI-02":
        resulting_list = [created["interpret"]["number"], created["polish-results-copy"]["number"]]
    candidates.append({
        "candidate_id": cid, "disposition": disposition,
        "resulting_issue_number": resulting_list[0] if len(resulting_list) == 1 else resulting_list,
        "roadmap_group": issue["group"] if issue else "NOW",
        "priority": issue["priority"] if issue else None,
        "rationale": rationale, "duplicate_of": duplicate_of,
        "folded_into": (f"#{created['map-chrome']['number']} + #{created['a11y']['number']}" if folded_into else None),
        "dependencies": deps(issue) if issue else [],
    })

issues = [{
    "number": created[i["key"]]["number"], "url": created[i["key"]]["url"], "title": i["title"], "key": i["key"],
    "source_candidates": i["candidates"], "audit_opportunity": i.get("audit_opportunity"), "absorbed_findings": i.get("absorbs_findings", []),
    "roadmap_group": i["group"], "priority": i["priority"], "contributor_suitability": i["suitability"], "kind": i["kind"],
    "capability_safety_class": i["safety"], "labels": created[i["key"]]["labels"], "dependencies": deps(i),
    "verification": created[i["key"]]["checks"],
} for i in m.ISSUES]

record = {
    "schema_version": 1,
    "generated_at_utc": datetime.now(timezone.utc).isoformat(),
    "task": "Materialize the product capability, UX and growth audit into a GitHub roadmap; no implementation",
    "baseline": {"head": "d0763974e2b5b68c209fda5c680cdfd8b1bdde2a", "origin_main": "d0763974e2b5b68c209fda5c680cdfd8b1bdde2a", "version": "0.12.3", "describe": "v0.12.3-7-gd076397", "release": "v0.12.3 (2026-10-16)", "merged_since_audit": []},
    "verdict": "A. ROADMAP MATERIALIZED CLEANLY",
    "issue_76_verification": {
        "result": "ALL CRITERIA PASS", "closed": True, "close_reason": "completed",
        "comment": "https://github.com/Berk-Unsal/atom/issues/76#issuecomment-6233868777",
        "evidence": [
            "frontend-react/src/components/OptimizationHelp.jsx — score is preference-weighted utility; not coverage/accuracy/probability/confidence",
            "OptimizationHelp.jsx — illustrative A/B trade-off; inspect/rerank/apply/new-search list",
            "frontend-react/src/App.workflow.test.jsx:841-905 — help content, no hidden RF requests on inspect/rerank, payload unchanged",
            "frontend-react/e2e/workspace.spec.js:2526 — keyboard score help across four viewports",
        ],
    },
    "existing_issue_updates": [
        {"issue": 76, "action": "commented and closed as completed after verification"},
        {"issue": 86, "action": "appended bounded item: docs/features.md tool inventory (ten → fourteen tools); labels/state unchanged"},
    ],
    "existing_issues_preserved": [78, 79, 81, 82, 87, 88, 89, 90],
    "related_existing_issues": {"#78": "dependency of the first-run sample issue", "#81": "documentation complement to shareable downloads", "#80 (closed)": "glossary context for Cell wording", "#87-#90": "research context for measurement validation; unchanged", "PR #63": "also edits apiClient.js; coordinate with the error-recovery issue"},
    "candidates": candidates,
    "issues_created": issues,
    "not_created": [
        {"idea": "Optimize near the network result", "audit_opportunity": "O14", "disposition": "DEFERRED", "rationale": "No candidate; placement should follow the candidate-action issue's decision on where network actions live. Revisit after that lands."},
        {"idea": "Undo/redo for plan edits", "audit_opportunity": "O20", "disposition": "DEFERRED (technical foundation)", "rationale": "Needs state-ownership work; no observed workflow break beyond Versions."},
        {"idea": "Network-scope experiments", "audit_opportunity": "O21", "disposition": "DEFERRED (technical foundation)", "rationale": "Requires RF request-budget re-qualification."},
        {"idea": "Calibrated / confidence-weighted predictions", "audit_opportunity": "O22", "disposition": "COVERED BY EXISTING RESEARCH", "rationale": "Blocked on #87-#90; no new issue."},
        {"idea": "Tilt/power/site-selection optimization", "audit_opportunity": "O23", "disposition": "RESEARCH / NOT NOW", "rationale": "Changes optimization semantics and request budget; no validation evidence."},
    ],
    "rejected": [
        {"idea": "Onboarding wizard", "rationale": "The command bar already teaches the first action; a dismissible first-run card (#%d) addresses orientation." % created["first-run"]["number"]},
        {"idea": "Command palette", "rationale": "14 tools in 4 stages is navigable; Concepts 7F/8A reached the same conclusion."},
        {"idea": "3D city view", "rationale": "Decorative relative to the 2.5D model; would imply fidelity the model lacks."},
        {"idea": "Cloud collaboration", "rationale": "Conflicts with the local-first premise (Product Compass)."},
        {"idea": "Cost/backhaul/equity scoring", "rationale": "No authoritative data; would manufacture certainty."},
    ],
    "labels_created": [],
    "github_mutations": [
        "issue #76: comment + close (completed)",
        "issue #86: body appended (features.md tool inventory item)",
        "issues #97-#115 created (19)",
    ],
}
(HERE / "roadmap-materialization.json").write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n")
print("candidates", len(candidates), "issues", len(issues))
