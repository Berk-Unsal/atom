"""Render the product capability/UX/growth audit JSON artifacts from audit_data.py.

Run from the repository root: python3 scripts/product-capability-ux-growth-audit/build_audit_artifacts.py
Writes capability-inventory.json, friction-map.json, product-opportunities.json, candidate-issues.json
and docs/product-capability-ux-growth-audit.json. Never touches GitHub.
"""
import hashlib
import json
from collections import Counter
from pathlib import Path

import audit_data as d

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def issue(iid, title, kind, priority, area, problem, scope, acceptance, non_goals, evidence, effort, suitability, deps, opportunity, coverage):
    return {"id": iid, "proposed_title": title, "classification": kind, "priority": priority, "area": area, "problem": problem,
            "scope": scope, "acceptance_criteria": acceptance, "non_goals": non_goals, "evidence": evidence, "effort": effort,
            "contributor_suitability": suitability, "dependencies": deps, "opportunity": opportunity, "github_cross_check": coverage}


CANDIDATE_ISSUES = [
    issue("CI-01", "Fit the map to new results and area selections", "UX REPAIR", "P1", "frontend / map",
          "Runs and area selections complete outside the visible map; users see only a status chip.",
          "Request a fit when a new current result or area selection is produced, unless the user moved the map after starting the action.",
          ["Run Sector, Evaluate Network, Optimize Network and Finish (area) fit to selected cells plus planning radius", "No fit when the user panned/zoomed during the request", "Fit selected cells button unchanged", "Workflow test asserts a fit request per completed run and none for view-only toggles"],
          ["Changing zoom limits or basemap", "Animated camera work"],
          ["frontend-react/src/App.jsx:2226-2228", "screenshots/02-single-run-result-1440-light.jpg", "screenshots/11-network-evaluated.jpg"],
          "S", "good first issue with guidance", [], "O01", "genuinely new"),
    issue("CI-02", "Explain the RF result headline and stop contradictory styling", "UX REPAIR", "P1", "frontend / results",
          "Default result shows Blocked 99.2% next to a red Coverage Gaps card reporting 0 gaps; units render as 'DBm'/'M'.",
          "Add one deterministic interpretation line distinguishing blocked rays from demand gaps; neutral styling when zero gaps; '—' for unavailable Worst Rx; remove capitalize transform from metric values.",
          ["Units render exactly as produced ('dBm', 'm')", "Zero-gap card uses neutral styling", "Worst Rx shows '—' when no gaps are returned", "Interpretation copy reviewed against docs/modeling-limits.md; no new thresholds", "Unit test for the interpretation helper"],
          ["Changing RF metrics or thresholds", "Adding quality grades"],
          ["frontend-react/src/styles.css:1161", "screenshots/04-results-single-1440-light.jpg", "traces/defaults-walk.json"],
          "S", "good first issue (units/styling); interpretation copy needs maintainer review", [], "O02", "genuinely new; #76 (closed by PR #96) covered score/Pareto wording only"),
    issue("CI-03", "Let users adopt Pareto alternatives produced from the working draft", "WORKFLOW IMPROVEMENT", "P1", "frontend / persistence",
          "Optimization in an unsaved draft produces runs without a source Version; Apply solution… is disabled with no recovery path.",
          "Offer 'Save source as Version and apply' when the run's retained input fingerprint matches the draft or run snapshot; otherwise show the exact recovery step. Tell users the recommended solution is already in the draft.",
          ["Apply from an unsaved-draft optimization creates a source Version from the run's retained input, then a new Version/branch with the chosen solution", "Refused with a specific message if fingerprints do not match", "Source run remains immutable", "Persistence round-trip test (save → reload → lineage intact)"],
          ["Changing optimizer output", "Auto-saving Versions on every run"],
          ["frontend-react/src/components/ApplySolutionDialog.jsx:13-60", "frontend-react/src/App.jsx:1217", "frontend-react/src/App.jsx:3138-3150", "screenshots/55-apply-solution-dialog.jpg"],
          "M", "maintainer", ["Run input fingerprint (exists)"], "O03", "genuinely new"),
    issue("CI-04", "Restore result context when reopening a draft or Version", "TECHNICAL DEBT", "P1", "frontend / persistence",
          "Reload shows 'Run needed' (draft) or 'Ready · UNAVAILABLE · Run unavailable' (Version) although runs exist in history.",
          "Design and implement exact-fingerprint rebinding of the latest compatible run summary on restore, presented as HISTORICAL with an explicit 'Restore map layers' action; bind pre-save runs to a Version when inputs match at save time.",
          ["After reload the Results context shows the last compatible run summary with correct freshness", "Command bar never shows 'Ready' and 'UNAVAILABLE' together", "Restoring layers is an explicit, counted RF action", "No rebinding when fingerprints differ (test)"],
          ["Persisting full ray GeoJSON by default", "Changing project file format"],
          ["traces/workflow-walk.json:after-reload", "traces/tools-walk.json:reload-after-save", "screenshots/48-reload-after-save.jpg", "docs/concept-7c-run-history.md"],
          "M", "maintainer", ["Concept 7C retention policy"], "O04", "genuinely new"),
    issue("CI-05", "Make plan comparison reachable for every result type", "WORKFLOW IMPROVEMENT", "P2", "frontend / results",
          "Results → Compare shows Baseline vs Recommended for network results, hiding saved-scenario comparison; input diff lives in a collapsed Scenarios disclosure.",
          "Give Compare a source picker (current, baseline, saved Versions, Pareto alternative) combining KPI deltas, input diff and A/B map switch.",
          ["A network user can compare two saved Versions from Results", "Baseline vs Recommended remains available", "Input diff reachable from the same view", "Workflow test for both modes"],
          ["Spatial delta layer (see CI-15 follow-up)", "New metrics"],
          ["frontend-react/src/App.jsx:4545-4549", "frontend-react/src/components/ScenarioPanel.jsx:259-262"],
          "M", "maintainer", [], "O05", "genuinely new"),
    issue("CI-06", "Expose candidate cell recommendation as a primary network action", "WORKFLOW IMPROVEMENT", "P2", "frontend / workflow",
          "Recommendation is reachable only via a Results tab that disappears after optimization; prerequisites conflict with area selection.",
          "Add an explicit action with inline prerequisites and a dedicated results view independent of Pareto Solutions; allow keeping the drawn area while selecting ≤5 cells.",
          ["Action visible in Network mode with prerequisite status", "Recommendations reachable after an optimization", "Area can be reused without forcing 8-cell selection", "Workflow test: optimize → recommend → apply as scenario"],
          ["Changing candidate scoring or adding interference to it"],
          ["frontend-react/src/App.jsx:4449", "frontend-react/src/App.jsx:4565-4580", "frontend-react/src/App.jsx:2071-2075"],
          "M", "maintainer", [], "O06", "genuinely new"),
    issue("CI-07", "Name report and project downloads meaningfully", "POLISH", "P2", "frontend / reporting",
          "Reports download as '<uuid>.md'; project exports are always '<slug>.atom-project.json'.",
          "Use '<project>-<scenario>-v<N>-<yyyymmdd>[-<kind>].<ext>' with safe slugs; keep report_id in metadata.",
          ["Report and project filenames include project, scenario/Version (when present) and date", "Filenames are filesystem-safe and deterministic for a given artifact", "E2E asserts suggestedFilename pattern"],
          ["Changing artifact IDs or storage"],
          ["frontend-react/src/utils/reportArtifact.js:20-33", "frontend-react/src/components/WorkspaceChrome.jsx:240", "frontend-react/e2e/workspace.spec.js:1863"],
          "XS", "good first issue", [], "O07", "partially complements #81 (docs)"),
    issue("CI-08", "Remove duplicate sections and inline SVG bloat from Markdown reports", "UX REPAIR", "P2", "frontend / reporting",
          "Markdown reports repeat 'RF Result' as 'RF Propagation Performance', include an empty-ish executive 'RF result' table for single-cell plans, and embed ~600 lines of SVG.",
          "Deduplicate sections; omit irrelevant constraint rows; move the map to a separate attachment/HTML-only view; make the lineage line consistent with the Report source card.",
          ["No duplicated tables in single-cell or network reports (snapshot test)", "Markdown under a documented size for the sample plan", "Lineage line matches stored Report metadata"],
          ["Changing report claims or limitations text"],
          ["traces/sample-report.md", "traces/tools-walk.json:report-after"],
          "S", "contributor with guidance", ["CI-07"], "O07", "partially complements #81 (docs)"),
    issue("CI-09", "Separate view changes from input changes in stale-result messaging", "UX REPAIR", "P2", "frontend / state",
          "Switching planning mode marks results 'out of date' with hash-first copy; run history and badges use hashes; Version wording differs between header and Results.",
          "Classify invalidation reasons; use human run labels (type · cells · score · time) with hash in details; one Version-state vocabulary; scenario auto-names follow mode.",
          ["Mode switch without input change shows a neutral 'different plan mode' state", "Run labels lead with type, cell count and headline metric", "Header and Results use identical Version-state wording", "Unit tests for reason classification"],
          ["Hiding genuine staleness"],
          ["frontend-react/src/App.jsx:2765-2777", "screenshots/09-drawing-polygon.jpg", "screenshots/53-compare-tab.jpg"],
          "S", "contributor with guidance", [], "O08", "genuinely new"),
    issue("CI-10", "Make connection, server and validation errors actionable", "UX REPAIR", "P2", "frontend / errors",
          "Backend down shows 'Failed to fetch' and 'Cell No tower'; 500 shows 'internal error'; invalid fields lack inline errors and the prompt points to Inventory.",
          "Map known failure classes to cause + recovery with a Retry action; aria-invalid and inline message on invalid fields; prompts reference the tool owning the field.",
          ["Backend-unreachable state names the API origin and offers Retry", "Invalid numeric input shows inline message and aria-invalid", "Prompt navigates to the owning tool", "Interception tests for unreachable/500/429"],
          ["Automatic retries", "Changing RF request accounting"],
          ["screenshots/60-backend-unavailable.jpg", "screenshots/63-rf-500.jpg", "screenshots/65-invalid-tx-power.jpg"],
          "S", "contributor with guidance", [], "O09", "genuinely new"),
    issue("CI-11", "Resolve map chrome collisions at desktop sizes", "POLISH", "P2", "frontend / map",
          "Map key swallows area-drawing clicks and clips; '28.0 GHz' overprints 'RF details' at 1280×800; Results tabs overflow at every width; heading focus ring looks like an input.",
          "Collapse the Map key during drawing/placing; legend scrolls without clipping; command-bar truncation rules; tab labels fit; subtler programmatic-focus style.",
          ["No overlap at 1440×900, 1280×800, 1024×768 in light and dark (screenshot review)", "Area vertices can be placed anywhere on the visible map", "Tablist fits without horizontal scroll at ≥1280"],
          ["Visual redesign"],
          ["screenshots/11-network-evaluated.jpg", "screenshots/19-interference-result.jpg", "screenshots/71-results-1280x800-light.jpg", "traces/states-walk.json"],
          "S", "contributor", [], "O13", "genuinely new"),
    issue("CI-12", "Fix project-menu keyboard behavior and control naming", "UX REPAIR", "P3", "frontend / accessibility",
          "Escape does not close the project menu; trigger label ignores expanded state; 'Save version' has accessible name 'Save current'; two controls named 'Select cells'.",
          "Add Escape handling with focus return; label-in-name alignment; distinct names.",
          ["Escape closes the menu and returns focus to the trigger", "Visible and accessible names match for Save version", "Unique accessible names for primary action and map mode", "Interaction test"],
          ["Menu redesign"],
          ["frontend-react/src/components/WorkspaceChrome.jsx:206-213", "frontend-react/src/components/WorkspaceChrome.jsx:326", "traces/states-walk.json:project-menu-escape"],
          "XS", "good first issue", [], "O15", "genuinely new"),
    issue("CI-13", "Promote Measurement Validation out of Data → Research", "WORKFLOW IMPROVEMENT", "P2", "frontend / IA",
          "CSV measurement validation with explicit calibration is hidden in a Research disclosure, while a different campaign tool in RF Diagnostics uses similar wording.",
          "Give CSV Measurement Validation a first-class location and name; label the campaign tool as research evidence.",
          ["Measurement Validation reachable in ≤2 clicks from the rail", "Campaign tool renamed to avoid 'measurement validation' collision", "Explicit apply and boundary copy unchanged"],
          ["Changing calibration math or eligibility"],
          ["frontend-react/src/App.jsx:5554-5575", "frontend-react/src/components/MeasurementValidationPanel.jsx:83"],
          "S", "contributor with guidance", [], "O11", "genuinely new; science issues #87–#90 unaffected"),
    issue("CI-14", "Offer the bundled sample project from the first-run state", "WORKFLOW IMPROVEMENT", "P2", "frontend / onboarding",
          "The first screen does not say what A.T.O.M produces; the sample project needs README knowledge.",
          "Dismissible first-run card with one-sentence purpose, 'Run the pre-selected sector', 'Open sample network project' (bundled example) and glossary link.",
          ["Shown only when no saved project exists; dismissal persists", "Sample opens as a new project and does not overwrite work", "Reaching a network result from first load takes ≤3 actions", "Workflow test"],
          ["Multi-step tour or wizard"],
          ["screenshots/01-first-run-1440-light.jpg", "README.md:180", "examples/ankara-sample.atom-project.json"],
          "S", "contributor", [], "O10", "partially complements #78 (docs walkthrough)"),
    issue("CI-15", "Add a trade-off chart to network Pareto solutions", "WORKFLOW IMPROVEMENT", "P3", "frontend / results",
          "Network optimization lists 25 near-identical cards; Experiments already has a Pareto chart.",
          "Two-objective scatter with recommended/selected markers reusing existing chart helpers; list collapses to top N.",
          ["Chart is keyboard/screen-reader described", "Selecting a point inspects that solution", "No new objectives or scoring"],
          ["Changing Pareto computation"],
          ["screenshots/52-solutions-bottom.jpg", "frontend-react/src/components/ExperimentPanel.jsx:115-121"],
          "M", "contributor", ["#76 closed by PR #96 (explanations)"], "O12", "partially (explanation shipped in PR #96; visualization new)"),
    issue("CI-16", "Use Cell terminology in user-facing selection and error copy", "POLISH", "P3", "frontend / copy",
          "'towers' appears in selection notices, errors and the Report intro despite the Cell/site/tower glossary.",
          "Replace user-facing 'tower' with 'Cell' where a planning Cell is meant; explain 'nearest 8' selection and list chosen Cells.",
          ["No user-facing 'tower' where a Cell is meant (grep test on copy constants)", "Area-selection notice states the selection rule"],
          ["Renaming API fields or code identifiers"],
          ["frontend-react/src/App.jsx:2057", "frontend-react/src/App.jsx:961", "frontend-react/src/features/reports/ReportFeature.jsx:37"],
          "XS", "good first issue", [], "O09", "residual of closed #80"),
    issue("CI-17", "Add UX regression coverage for the core planning loop", "TECHNICAL DEBT", "P2", "testing",
          "No visual snapshots or automated accessibility checks; no tests for apply-without-Version, backend-unavailable copy or Compare reachability.",
          "Add Playwright light/dark screenshot baselines at 1440/1280/1024 for first run, Results and Solutions; axe smoke on main drawers; no-hidden-request assertions for view-only toggles; persistence round trip for result continuity.",
          ["Baselines committed and stable in CI", "axe smoke reports no critical violations on covered drawers", "Tests fail on F01/F04/F06 regressions"],
          ["Full WCAG certification"],
          ["frontend-react/e2e", "traces/states-walk.json"],
          "M", "contributor", ["CI-01", "CI-03", "CI-05"], "O13", "genuinely new"),
]

FOLD_INTO_EXISTING = [
    {"finding": "F28 docs/features.md says 'Ten workflow tools' (actual 14)", "existing_issue": "#86 Reconcile maintained roadmap status and unsupported API release promises", "action": "Add as a checklist item when #86 is worked; no new issue"},
    {"finding": "#76 still open after PR #96 merged", "existing_issue": "#76", "action": "Maintainer should verify acceptance criteria and close; not changed by this audit"},
]


def write(path, payload):
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def main():
    lock_sha = (HERE / "audit-lock.sha256").read_text().split()[0]
    caps = d.CAPABILITIES
    maturity = Counter(c["maturity"] for c in caps)
    meta = {"audit": "A.T.O.M product capability, UX and growth audit", "date": d.AUDIT_DATE, "head": d.HEAD, "version": d.VERSION, "audit_lock_sha256": lock_sha}
    write(HERE / "capability-inventory.json", {**meta, "maturity_scale": d.MATURITY, "maturity_counts": dict(maturity), "capabilities": caps})
    write(HERE / "friction-map.json", {**meta, "scales": {"severity|frequency|product_impact": ["HIGH", "MEDIUM", "LOW"], "effort": ["XS", "S", "M", "L", "XL"]},
                                       "counts": {"by_category": dict(Counter(f["category"] for f in d.FRICTION)), "by_severity": dict(Counter(f["severity"] for f in d.FRICTION))},
                                       "friction": d.FRICTION})
    write(HERE / "product-opportunities.json", {**meta, "safety_classes": [d.A, d.B, d.C, d.D, d.E],
                                                "top10": [dict(zip(["opportunities", "title", "classification", "user_problem", "expected_impact", "effort", "risk", "prerequisite", "why_now"], t), rank=i + 1) for i, t in enumerate(d.TOP10)],
                                                "new_feature_shortlist": d.NEW_FEATURES,
                                                "quick_wins": [dict(zip(["id", "title", "friction", "effort"], q)) for q in d.QUICK_WINS],
                                                "opportunities": d.OPPORTUNITIES})
    write(HERE / "candidate-issues.json", {**meta, "status": "PROPOSED ONLY — not filed; no GitHub state was changed", "fold_into_existing": FOLD_INTO_EXISTING, "issues": CANDIDATE_ISSUES})

    roadmap = {h: [o["id"] for o in d.OPPORTUNITIES if o["roadmap"] == h] for h in ["NOW", "NEXT", "LATER", "RESEARCH", "REJECTED"]}
    summary = {
        "schema_version": 1, **meta, "audit_only": True, "github_mutations": [],
        "runtime": {"image": "atom:product-audit-d076397", "url": "http://127.0.0.1:18090", "api_meta_application_version": "0.12.3"},
        "verdict": "C. PRODUCT WORKFLOW GAPS",
        "verdict_rationale": "Capabilities are broad and scientifically disciplined, and the run/optimize engines feel fast and well-instrumented, but the core loop breaks at transitions: results land off-screen, Pareto alternatives cannot be adopted after the default path, results do not survive reload, comparison is unreachable with network results, and shared artifacts are poorly named.",
        "capability_count": len(caps), "maturity_counts": dict(maturity),
        "friction_count": len(d.FRICTION), "high_severity_friction": [f["id"] for f in d.FRICTION if f["severity"] == "HIGH"],
        "top10": [t[0] for t in d.TOP10], "new_feature_shortlist": d.NEW_FEATURES, "quick_wins": [q[0] for q in d.QUICK_WINS],
        "roadmap": roadmap, "candidate_issue_count": len(CANDIDATE_ISSUES),
        "measured_timings_ms": {"initial_dom_ready": 100, "initial_network_idle": 1071, "run_sector": "167–281", "auto_optimize_sector": 1830, "evaluate_network_8_cells": 820, "optimize_network_8_cells": "5139–6148", "interference": 1755, "reload_to_ready": 2560},
        "artifacts": {
            "report": "docs/product-capability-ux-growth-audit.md",
            "capability_inventory": "scripts/product-capability-ux-growth-audit/capability-inventory.json",
            "friction_map": "scripts/product-capability-ux-growth-audit/friction-map.json",
            "product_opportunities": "scripts/product-capability-ux-growth-audit/product-opportunities.json",
            "candidate_issues": "scripts/product-capability-ux-growth-audit/candidate-issues.json",
            "audit_lock": "scripts/product-capability-ux-growth-audit/audit-lock.json",
            "browser_traces": "scripts/product-capability-ux-growth-audit/traces/",
            "screenshots": "scripts/product-capability-ux-growth-audit/screenshots/",
        },
        "limitations": [
            "Chromium (Playwright 1.61.1) only; no Firefox/Safari, no physical screen reader session, no real users",
            "Localhost timings on an Apple-silicon laptop; not representative of hosted deployments",
            "Inventory import, project import, Building entry, Experiments execution, research references, measurement CSV upload and 5G Core sidecar were inspected in source/panels but not executed end-to-end",
            "Phone/tablet layouts not re-audited (Concept 7F/8B scope)",
            "Audit lock captured after browser evidence collection began, before any report was written; tracked files unchanged",
        ],
    }
    write(ROOT / "docs" / "product-capability-ux-growth-audit.json", summary)
    for name in ["capability-inventory.json", "friction-map.json", "product-opportunities.json", "candidate-issues.json"]:
        print(name, hashlib.sha256((HERE / name).read_bytes()).hexdigest()[:16])
    print("capabilities", len(caps), dict(maturity))
    print("friction", len(d.FRICTION), "issues", len(CANDIDATE_ISSUES))


if __name__ == "__main__":
    main()
