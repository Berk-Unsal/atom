#!/usr/bin/env python3
"""Render the audit from locked evidence and verified GitHub mutations."""
from collections import Counter
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
REPORT = ROOT / "docs/v0.12.2-roadmap-contribution-audit"


def read(name):
    return json.loads((OUT / name).read_text())


def write(name, data):
    (OUT / name).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


PRIORITIES = {
    "P1": "Material correctness, scientific credibility, major product friction or important contract/integration defect.",
    "P2": "Meaningful usability/workflow clarity, contributor experience or bounded technical debt.",
    "P3": "Polish, convenience, low-severity documentation or optional quality improvement.",
}
EFFORT = {"XS": "Less than half a day; tightly bounded.", "S": "Roughly a day.",
          "M": "Multi-day bounded change.", "L": "Substantial cross-surface feature.",
          "RESEARCH": "Implementation unknown until evidence resolves; not a delivery promise."}
SUITABILITY = {
    "beginner-safe": "Clear files/surface, low scientific risk, deterministic validation, no architectural prerequisite, bounded output; eligible for good first issue.",
    "contributor-friendly": "Bounded and documented, but needs workflow/tooling familiarity or maintainer interpretation review; help wanted without beginner promise.",
    "maintainer-owned": "Cross-prerequisite scientific decisions and final promotion gates; no beginner/help-wanted label.",
    "research-heavy": "External evidence or domain judgment determines whether implementation is warranted; no beginner/help-wanted label.",
}

PRODUCT = [
    ("Score interpretation", "Unresolved focused usability debt", "Results shows /100; objective help exists in Goals. Explain preference-weighted utility at Results and distinguish it from coverage or accuracy.", "score-interpretation", "frontend-react/src/App.jsx:5135; docs/modeling-limits.md:125"),
    ("Pareto/trade-offs", "Partial", "Roles and trade-off tables already exist; add a plain-language example and distinguish inspect/rerank/apply/rerun rather than rebuilding the explorer.", "score-interpretation", "frontend-react/src/App.jsx:4790"),
    ("Optimization changes/fixed inputs", "Present, contextual explanation can improve", "Configuration changes already expose per-Cell azimuth deltas. Network optimization varies azimuth; add a concise fixed-input boundary with score help.", "score-interpretation", "frontend-react/src/App.jsx:5167; docs/api.md:853"),
    ("Light/dark heroes", "Confirmed mismatch", "Observed both committed assets: light is older single-Cell Setup; dark is the later eight-Cell workspace. Capture matching actual app state.", "matched-heroes", "docs/index.html:97; frontend-react/e2e/docs-theme.spec.js:53"),
    ("Persistence/export recovery", "Unresolved recovery discoverability", "Existing notes explain retained evidence. Known guard errors display only error.message and omit a safe next step; limits themselves are intentional.", "export-recovery", "frontend-react/src/components/WorkspaceChrome.jsx:211; frontend-react/src/utils/projectStore.js:260"),
    ("Project portability expectations", "Mostly clarified in v0.12.2", "Draft/Version/Run/report exclusions are already stated. A remaining early Getting Started full-project sentence is overbroad; align it within the bounded export recovery/help task.", "export-recovery", "docs/getting-started.md:97; docs/getting-started.md:170; docs/project-format.md:1"),
    ("First-run orientation", "Present", "Visible run action, planning-estimate notice, settings-only sample and first decision text already exist. No new wizard or generic onboarding ticket.", None, "README.md:25; frontend-react/src/components/WorkspaceChrome.jsx:79; docs/getting-started.md:105"),
    ("First useful decision", "Partial", "Current guide describes the loop; sample has empty selection and no dataset binding/results. Add explicit reproducible inputs, a comparison and evidence delivery.", "worked-example", "examples/ankara-sample.atom-project.json:1; docs/getting-started.md:125"),
    ("Report usability", "Functionality present; reader help sparse", "Executive summary, baseline, alternatives, lineage, unavailable states, offline artifact downloads and map-sampling disclosure exist. Add a reader guide, not another renderer or summary.", "report-reader-guide", "frontend-react/src/utils/reportExport.js:458; frontend-react/src/components/ReportArtifactsPanel.jsx:51"),
    ("Terminology", "Partial", "Cell/tower/site/sector aliases can confuse planning records with physical infrastructure. API and candidate limits are already scoped; add one compact linked glossary.", "cell-glossary", "docs/getting-started.md:109; docs/modeling-limits.md:70; docs/features.md:111"),
    ("Errors/recovery", "Core repairs already complete", "Retry-After guidance and independent Measurement6 scope guard exist with regressions. Do not repeat those issues; remaining project export guard recovery is separate.", None, "frontend-react/src/utils/rfRecoveryMessage.js:1; frontend-react/src/utils/measurementScope.js:1"),
]

SCIENCE = [
    ("Real measurement validation", "blocked", "Tooling, CSV diagnostics and synthetic fixtures exist; latest readiness has 0 canonical field observations and no defensible canonical MAE/RMSE.", "field-validation", "docs/concept-6a1-readiness.json:1; docs/modeling-limits.md:131"),
    ("Serving-state semantics", "research prerequisite", "83 registered candidates conflict with NONE; matching transitions do not settle source authority. Version-specific collector/device evidence is missing; external evidence blocks the issue.", "serving-semantics", "docs/concept-6a1-2-serving-state-semantics.md:1; backend-go/raytracer/concept_6a1_campaign_tooling_test.go:340"),
    ("Authoritative transmitter mapping", "research prerequisite", "Exact mapping is 0; public planning records are not measured sites or power/antenna/height truth. Require exact identity and field-level provenance; external source access blocks the issue.", "transmitter-truth", "docs/concept-6a1-1-transmitter-truth.json:1; backend-go/raytracer/concept_6a1_campaign_tooling.go:452"),
    ("Receiver/resource metadata", "research prerequisite", "Receiver AGL is user-estimated and device response uncalibrated; field tracker owns receiver/endpoint evidence, resource issue owns quantity/reference-plane evidence.", "field-validation", "docs/concept-6a1-1-applicability.json:1; docs/concept-6a1-readiness.json:1"),
    ("Measurement bandwidth truth", "blocked", "CellInfo bandwidth unavailable; ServiceState vectors lack exact identity association. Do not substitute configured bandwidth or relabel RSRP as carrier power.", "resource-truth", "docs/concept-6a1-1-bandwidth-audit.json:1"),
    ("LOS/outdoor truth", "research prerequisite", "Independent endpoint/outdoor/LOS annotations are missing; model-predicted LOS cannot serve as validation truth. Track within the final reference-set gate.", "field-validation", "docs/concept-6a1-1-applicability.json:1"),
    ("Calibration prerequisites", "blocked", "Ordinary CSV holdout-checked global dB correction is implemented. Canonical calibration requires trustworthy compatible data and independent holdouts; no calibration implementation ticket yet.", "field-validation", "docs/modeling-limits.md:135; backend-go/raytracer/canonical_rf_validation_holdout.go:1"),
    ("Terrain canonicalization", "future / not justified", "Optional profile diagnostics and corrected clearance primitive exist. Canonical network terrain remains unavailable; source semantics, local control, uncertainty and diffraction qualification still block promotion. Do not reopen the corrected sign bug.", None, "docs/concept-4f3a5-terrain-clearance-primitive.md:62; docs/modeling-limits.md:70"),
    ("Clutter/morphology", "future / not justified", "Pack metadata/manual path-profile and isolated P.1411 morphology inputs exist; no authoritative canonical spatially joined clutter evidence or validated effect justifies adding losses.", None, "docs/features.md:138; docs/modeling-limits.md:70"),
    ("Antenna-pattern evidence", "research prerequisite", "Analytic and single-element reference cuts exist; measured vendor pattern import/validation is absent. TX evidence issue can establish what evidence exists before any model/import feature is admitted.", "transmitter-truth", "backend-go/raytracer/antenna_evaluator.go:64; docs/modeling-limits.md:47"),
    ("Operational discovery response schemas", "actionable engineering", "Readiness/process JSON bodies exist without OpenAPI body schemas. This is a software contract gap, not new physical validation.", "api-readiness-schemas", "docs/openapi.yaml:14; docs/openapi.yaml:506"),
]

FEATURES = [
    ("Terrain-aware canonical propagation", "absent", "Point-to-point terrain is partial supporting capability; canonical network path does not consume it. Defer promotion until source/control/uncertainty gates pass.", "docs/modeling-limits.md:70; docs/concept-4f3a5-terrain-clearance-primitive.md:62"),
    ("Clutter/morphology", "partial", "Pack sidecars and explicit reference/diagnostic inputs exist; no automatic canonical clutter join. No backlog feature without authoritative data and a decision need.", "docs/features.md:138; docs/modeling-limits.md:70"),
    ("Operator/site inventory import", "partial", "Bounded CSV/GeoJSON planning inventory already works. Operator verification/mapping does not; research truth issue covers evidence, not a broad enterprise importer.", "frontend-react/src/utils/inventoryImport.js:1; docs/features.md:25"),
    ("PCI/neighbor planning", "absent", "PCI is validated metadata; Core Lab neighbor edges are simulated coordination, not RF PCI conflict or neighbor-list planning. No demonstrated product prerequisite.", "docs/modeling-limits.md:62; backend-go/raytracer/request_inputs.go:1"),
    ("Handover/mobility", "out of scope", "No UE mobility/handover simulator. Collector identity transitions and Core Lab paths do not establish handover behavior.", "docs/modeling-limits.md:47; planning/product-compass.md:120"),
    ("Capacity/traffic", "out of scope", "Scalar Cell load and demand weights exist; no traffic/scheduler/throughput/capacity model. No new system without user/evidence basis.", "docs/modeling-limits.md:47; backend-go/raytracer/interference.go:440"),
    ("Multi-carrier", "partial", "Per-Cell frequency/band/channel/bandwidth and co-channel grouping exist. No per-Cell carrier aggregation or multi-carrier scheduler; extension not currently justified.", "docs/features.md:25; docs/modeling-limits.md:62"),
    ("Antenna-pattern imports", "absent", "Analytic presets and 3GPP single-element cuts already exist; no measured/vendor tabular import. Evidence and interpolation/validation requirements must precede such a feature.", "backend-go/raytracer/antenna_evaluator.go:64; docs/modeling-limits.md:47"),
    ("Measured KPI comparison", "partial", "User RSRP residuals and isolated evidence tooling work; credible canonical field results remain blocked. SINR/RSRQ/RSSI require independent resource context.", "docs/features.md:117; docs/concept-6a1-readiness.json:1"),
    ("Candidate-site workflows", "already present", "Known-record recommendations, bounded area/candidate search, apply-as-scenario and re-evaluation exist; ownership, permitting, cost and backhaul excluded.", "docs/features.md:109; docs/architecture.md:175"),
    ("Richer interference", "partial", "Modeled finite-horizon co-channel RSRP/SINR/RSRQ/RSSI, load/reuse/resources exist. Adjacent-channel, uplink and dynamic scheduling are absent and not currently justified extensions.", "docs/architecture.md:179; docs/modeling-limits.md:47"),
]

REJECTED = [
    ("10/12 Cells or arbitrary larger networks", "No changed W1 qualification or product decision supports a new cap."),
    ("W2/W3 or repeat W1/Profile A qualification", "No material source/evidence change justifies reopening completed work; current scope remains explicit."),
    ("Adaptive/estimator admission or Auto reopening", "Observation-only and paused admission remain deliberate policy; no new evidence."),
    ("Random RF models, generic AI optimization", "Fails evidence, explainability and feature-admission criteria."),
    ("Broad enterprise/cloud collaboration/live control", "No product demand evidence; contradicts current local-first bounded job."),
    ("Mobility/capacity/PCI systems", "No user decision/evidence need established; metadata and scalar load are not missing-system authorization."),
    ("Canonical terrain/clutter/vendor-pattern promotion", "Prerequisites remain unresolved; reference support does not qualify canonical loss composition."),
    ("Calibration or canonical MAE/RMSE now", "Zero canonical observations and incompatible/missing truth make this indefensible."),
    ("Separate epics for every area", "Only canonical field validation has genuinely independent prerequisites; avoid hierarchy overhead."),
    ("Stars campaigns, enabling Discussions or About/topic mutations", "Useful discoverability recommendations suffice; those metadata/community changes were not authorized here."),
]


def main():
    lock = read("pre-audit-lock.json")
    manifest = read("issue-manifest.json")
    results = read("mutation-results.json")
    verification = read("github-verification.json")
    by_key = {p["key"]: p for p in manifest["issues"]}
    created = {p["key"]: p for p in results["issues"]}

    def link(key):
        i = created[key]
        return f"[#{i['number']}]({i['url']})"

    def numbers(predicate):
        return ", ".join(link(p["key"]) for p in manifest["issues"] if predicate(p)) or "None"

    rows = []
    for p in manifest["issues"]:
        r = created[p["key"]]
        rows.append({**{k: p[k] for k in ["key", "title", "type", "area", "priority", "effort", "contributor_suitability", "labels", "dependencies", "project_status"]},
                     "number": r["number"], "url": r["url"], "decision": "created",
                     "project_status_applied": False})
    source_paths = {path for p in manifest["issues"] for path, _ in p["evidence"]}
    source_paths.update(lock["authoritative_sources_sha256"])
    source_paths.update(["docs/concept-4f3a5-terrain-clearance-primitive.md", "frontend-react/src/utils/rfRecoveryMessage.js",
                         "frontend-react/src/utils/measurementScope.js", "frontend-react/src/utils/inventoryImport.js",
                         "docs/assets/focused-workspace.jpg", "docs/assets/v0.12.0/network-workspace.png"])
    source_index = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in sorted(source_paths)}
    write("source-evidence-index.json", source_index)

    project_plan = {
        "status": "not_applied_permission_blocked", "discovery": "Attempted repository and owner Projects v2; denied read:project scope.",
        "existing_project_count": None, "project_used_or_created": None, "url": None,
        "issues_added": 0, "existing_project_issue_count": None,
        "recovery": "With owner-authorized project scopes, discover first, reuse an appropriate existing project, or create one A.T.O.M Roadmap only if none exists. Preserve equivalent fields/views.",
        "fields": {
            "Status": ["Backlog", "Ready", "In Progress", "Blocked", "Done"],
            "Priority": ["P1", "P2", "P3"],
            "Area": ["RF Science", "Validation", "Product / UX", "Frontend", "Backend", "API", "Docs", "Persistence", "Tooling / Community"],
            "Effort": ["XS", "S", "M", "L", "Research"],
            "Type": ["Bug", "Enhancement", "Documentation", "Research", "Chore"],
        },
        "items": [{"issue": r["number"], "url": r["url"], "desired_status": r["project_status"],
                   "priority": r["priority"], "area": r["area"], "effort": r["effort"], "type": r["type"],
                   "fields_applied": False} for r in rows],
        "views": [
            {"name": "Roadmap", "group_by": "Status", "applied": False},
            {"name": "By Area", "group_by": "Area", "applied": False},
            {"name": "Contributor Friendly", "filter_semantics": "good first issue OR help wanted", "applied": False},
        ],
        "status_counts_planned_only": dict(Counter(p["project_status"] for p in manifest["issues"])),
        "status_rule": "Default Backlog; Ready only for 11 clearly bounded independent tasks. Four research/tracking tasks remain Blocked by evidence; none In Progress.",
    }
    write("project-plan.json", project_plan)

    readiness = [
        ("Contribution entry", 1, 1, "Guide detected by GitHub; root/README entry absent and guide contradictory."),
        ("Development setup", 1, 1, "Getting Started has LFS/Docker/npm ci paths; contributor examples remain stale. No fresh-clone usability test."),
        ("Architecture/ownership boundaries", 2, 2, "Architecture, modules, AGENTS and explicit RF/reference boundaries exist. CODEOWNERS absent; do not invent maintainers."),
        ("Deterministic tests and CI", 2, 2, "Strong Go/React/docs/contract/policy checks and focused test entry points exist."),
        ("Commit/release guidance", 1, 1, "README/AGENTS use VERSION; contributor guide wrongly says edit main.go and publish tags."),
        ("Issue intake", 0, 0, "No issue forms; future issue remains unimplemented."),
        ("PR review handoff", 0, 0, "No template; future issue remains unimplemented."),
        ("Find a bounded task", 0, 2, "Before: no open issues. After: labeled bounded issues, four beginner-safe with source/check guidance."),
        ("Scientific contribution boundaries", 2, 2, "Current docs and new research issues preserve missing-truth and non-promotion gates."),
        ("Native discoverability", 1, 1, "Active releases and README; description/topics narrow, no contribution section, Discussions disabled."),
    ]
    verdict = {"code": "B", "label": "ISSUES READY — PROJECT ORGANIZATION INCOMPLETE",
               "rationale": "Verified bounded backlog and labels exist. Projects discovery/configuration could not proceed because the authenticated token lacks project scopes; existing project state is unknown."}
    final = [
        ("Starting baseline", "Clean main; HEAD 0310bd8dea2e807ea57696a1bc5b3e11286db39e; VERSION 0.12.2; empty tracked diff/stat; origin Berk-Unsal/atom. Local/remote annotated v0.12.2 and remote main resolve to this commit; published release verified."),
        ("Audit lock", "pre-audit-lock.json; SHA256 " + manifest["pre_audit_lock_sha256"] + ". Original lock preserved; predeclared supplement permits only two report catalog entries."),
        ("Existing issue count", "32 total / 0 open / 32 closed; PRs counted separately, including 7 open PRs. After: 47 total / 15 open / 32 closed."),
        ("Existing label assessment", "24 labels; useful language/dependency/component and legacy bug/enhancement labels, plus good first issue/help wanted. No priority/research/product-roadmap taxonomy. No unlabeled or stale open issues because none were open."),
        ("Existing Project assessment", "Unknown. Repository and owner Projects v2 discovery was attempted and denied for missing read:project; do not infer no Project exists."),
        ("Contribution-readiness verdict", "Partially ready. Heuristic 10/20 before, 12/20 after backlog curation; setup/guide/intake/PR improvements remain unimplemented. GitHub native community health is separately 57%."),
        ("Product roadmap findings", f"Focused decision support: score/Pareto {link('score-interpretation')}, export recovery {link('export-recovery')}, reproducible planning example {link('worked-example')}. Preserve map-first deterministic scope."),
        ("Scientific roadmap findings", "Serving semantics, TX mapping and observation-bound resources precede canonical field accuracy; receiver/LOS/compatible data and holdouts remain independent gates. No calibration/model promotion."),
        ("UX/documentation findings", f"Matched theme captures {link('matched-heroes')}, glossary {link('cell-glossary')}, report reader guide {link('report-reader-guide')}; existing workflow, executive summary and save notes are present."),
        ("Tooling/contribution findings", f"Guide {link('contributor-guide')}, intake {link('issue-forms')}, PR template {link('pr-template')}, readiness/process body schemas {link('api-readiness-schemas')}, roadmap freshness {link('roadmap-doc-freshness')}."),
        ("Rejected speculative roadmap items", "No 10/12/arbitrary Cell expansion, W2/W3/repeat qualification, adaptive admission, generic AI/new RF models, broad enterprise, mobility/capacity systems or premature terrain/clutter/vendor/calibration promotion."),
        ("Issue taxonomy", "type: enhancement/docs/chore/research; primary area: product-ux/persistence/docs/community/api/rf-science/validation; existing frontend/backend secondary areas; P1/P2/P3 and contribution/blocker labels. No unused taxonomy labels created."),
        ("Priority definitions used", "P1 correctness/credibility/major friction/integration; P2 meaningful workflow/contribution/bounded debt; P3 polish/convenience/docs quality. Scientific issues are P1 for accuracy promotion, not current runtime outages."),
        ("Effort definitions used", "XS < half-day; S ~day; M bounded multi-day; L substantial cross-surface; RESEARCH unknown until evidence resolves. Rough estimates only; no effort labels."),
        ("Contributor-suitability rules", "Beginner-safe requires exact files, bounded output, deterministic validation, low scientific risk and no architectural prerequisite; other coding/docs help is contributor-friendly; science stays research-heavy/maintainer-owned."),
        ("Dependency graph summary", f"{link('serving-semantics')} + {link('transmitter-truth')} + {link('resource-truth')} -> {link('field-validation')}; tracker additionally requires compatible data/Rx/outdoor/LOS/holdouts. Eleven independent ready tasks have no hard backlog prerequisite."),
        ("Tracking issues created/reused", f"One created: {link('field-validation')}. None reused; no area epics."),
        ("New issues created", "15: #76–#90; full verified titles, labels, estimates and URLs in inventory."),
        ("Existing issues reused", "0. No open issues existed; all 32 original issues remain closed and unchanged."),
        ("Duplicate proposals rejected", "Seven proposal families excluded: strict OpenAPI repair; Measurement6; Retry-After; save/Version/Run distinctions; closed storage/import/report/image fixes; completed qualification/performance; existing pack/release/basic-first-task work."),
        ("Issues labeled good first issue", numbers(lambda p: "good first issue" in p["labels"])),
        ("Issues labeled help wanted", numbers(lambda p: "help wanted" in p["labels"])),
        ("Research-heavy issues", numbers(lambda p: p["contributor_suitability"] == "research-heavy") + "; " + link("field-validation") + " is the maintainer-owned research tracker."),
        ("Blocked issues", numbers(lambda p: "blocked" in p["labels"]) + "; all blocked on external/independent evidence, not on normal UI engineering."),
        ("P1 issues", numbers(lambda p: p["priority"] == "P1")),
        ("P2 issues", numbers(lambda p: p["priority"] == "P2")),
        ("P3 issues", numbers(lambda p: p["priority"] == "P3")),
        ("Labels created", ", ".join(results["labels_created"]) + " (15)."),
        ("Labels reused", ", ".join(results["labels_reused"]) + "; 20 unrelated existing labels preserved, none renamed/deleted."),
        ("Project used/created", "None; discovery permission blocked. Existing Projects remain unknown."),
        ("Project URL", "Unavailable; no invented URL."),
        ("Project fields", "None applied. Proposed Status, Priority, Area, Effort and Type choices/item values are in project-plan.json; reuse equivalent fields after discovery."),
        ("Project issue count", "0 added by this audit; existing Project item count unknown. All 15 issues are available for later organization."),
        ("Project status assignments", "Not applied. Plan: 11 Ready and 4 Blocked; 0 In Progress, 0 Done. Backlog remains default for less-defined future work."),
        ("Contributor-friendly view result", "Not created/preserved through API because discovery failed. Recommend Contributor Friendly filtered to good first issue OR help wanted."),
        ("Roadmap view result", "Not applied. Recommend Roadmap grouped by Status and By Area grouped/filterable by Area; no fragile UI workaround."),
        ("Milestone decision", "No existing milestones and none created; no v0.13.0 release promise supported."),
        ("Repository discoverability findings", 'About says "High efficiency RF planning module written in Go."; topics only golang/rf. Recommend scoped local-first urban planning/React/Go description and relevant geospatial/telecom topics after owner review. README opening/releases strong, contribution entry and executable story weak. Description/topics unchanged.'),
        ("Files created", "Requested Markdown/JSON pair and audit directory containing lock/supplement, source/GitHub snapshots, validated issue manifest/bodies, mutation/verification records, Project plan, scripts and bounded check logs. docs/doc-sources.json changes only by two historical audit entries."),
        ("GitHub mutations performed", "15 labels created; 15 issues created with validated labels/dependency references. No existing issue-body edits, reopens, assignees, milestone, Project, repository About/topic changes, releases, tags or code pushes."),
        ("Permission/API limitations", "Projects v2 read denied: read:project missing; write project scope also absent. No auth refresh/device flow or unsupported view hack attempted. Issues/labels succeeded."),
        ("Methodology violations", "No user-scope or production-code violation found. Original lock unchanged; only report catalog registration is permitted by a recorded pre-edit supplement. Initial path/dependency/cwd probes were corrected and are not counted as passes; failed logs retained."),
        ("Missing evidence", "No target-user timing/fresh-clone study, new real-backend E2E/operational qualification or field campaign; no authoritative serving/TX/resources/Rx/LOS truth; existing Projects inaccessible. Historical scientific/qualification evidence is cited, not independently recollected."),
        ("Final A/B/C/D/E verdict", verdict["code"] + " — " + verdict["label"] + ". A cannot be claimed because Project organization is unavailable; C/D/E are contradicted by verified issues and evidence."),
        ("Single highest-priority issue", link("serving-semantics") + " — authoritative serving-source semantics; it is the primary current field-readiness blocker, with independent TX/resource gates retained."),
        ("Best good-first issue", link("pr-template") + " — one bounded Markdown template, existing rules, no RF/architecture prerequisite; glossary/hero/report guide offer additional entry points."),
        ("Most important scientific/research issue", link("serving-semantics") + "; " + link("field-validation") + " tracks final scientific success without disguising uncertainty as a coding task."),
        ("What NOT to work on next", "Larger Cell caps, W2/W3/adaptive admission, new RF/AI/enterprise/mobility/capacity systems, canonical terrain/clutter/vendor-pattern additions or calibration before evidence."),
        ("Freeze decision", "Keep VERSION 0.12.2, HEAD/tag, RF/search/policy/caps/budgets/persistence and all historical evidence unchanged. Freeze the approved manifest and completed audit records. No commit/release/tag/push or backlog implementation."),
        ("Single recommended next action", "Start " + link("score-interpretation") + " as the next bounded implementation task; it is ready, improves the core decision loop and does not depend on external scientific evidence. This audit stops here."),
    ]
    assert len(final) == 50
    checks = read("check-results.json")
    checks += [
        {"name": "docs-validator-tests-corrected", "exit_code": 0, "log": "docs-validator-tests-corrected.log", "result": "8 tests passed; correct cwd docs/"},
        {"name": "frontend-focused", "exit_code": 0, "log": "frontend-focused.log", "result": "6 files / 99 tests passed; no production changes"},
        {"name": "backend-evidence-focused", "exit_code": 0, "log": "backend-evidence-focused.log", "result": "Existing canonical ingestion conflict/exact identity/no-default guards passed"},
        {"name": "github-verification", "exit_code": 0, "log": "github-verification.json", "result": "15 issue URLs, bodies, labels and dependencies verified; 32 closed issues and 24 original labels unchanged"},
    ]
    if (OUT / "final-check-results.json").exists():
        for record in read("final-check-results.json"):
            assert record["exit_code"] == 0
            checks.append({"name": record["name"], "exit_code": record["exit_code"],
                           "log": record["log"], "result": "Final post-report/catalog check passed; see retained command and output."})
    data = {
        "schema_version": 1, "audit": "A.T.O.M v0.12.2 Roadmap + Contribution Readiness Audit",
        "date": "2026-10-15", "timezone": "Europe/Istanbul", "audit_only": True,
        "generated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "baseline": lock["baseline"], "audit_lock_sha256": manifest["pre_audit_lock_sha256"],
        "scope_supplement": read("audit-scope-supplement.json"), "verdict": verdict,
        "backlog_before": {"issues": 32, "open": 0, "closed": 32, "labels": 24, "milestones": 0,
                           "open_pull_requests": 7, "unlabeled_open_issues": 0, "stale_open_issues": 0,
                           "duplicate_open_issue_themes": [], "assessment": "Closed audit/security/maintenance findings, no active issue roadmap. Some historical bodies retain original pre-fix wording; closed state/current source govern deduplication."},
        "backlog_after": {"issues": 47, "open": 15, "closed": 32, "labels": verification["label_count"],
                          "reused_issues": 0, "new_issues": 15, "priority_counts": dict(Counter(p["priority"] for p in rows)),
                          "effort_counts": dict(Counter(p["effort"] for p in rows)),
                          "suitability_counts": dict(Counter(p["contributor_suitability"] for p in rows))},
        "priority_definitions": PRIORITIES, "effort_definitions": EFFORT,
        "contributor_suitability_rules": SUITABILITY,
        "contribution_readiness": {"rubric": "Ten ordinal dimensions, 0 absent/unsafe, 1 partial/conflicting, 2 clear/evidenced; heuristic, not a user study.",
                                   "maximum": 20, "before": sum(r[1] for r in readiness), "after": sum(r[2] for r in readiness),
                                   "rows": [dict(zip(["dimension", "before", "after", "rationale"], r)) for r in readiness],
                                   "verdict": "Partially ready; actionable starter backlog now exists, while guide/intake/PR fixes remain to be implemented.",
                                   "github_native_community_health_percentage": 57},
        "product_debt_review": [dict(zip(["surface", "status", "finding", "issue_key", "evidence"], r)) for r in PRODUCT],
        "scientific_roadmap": [dict(zip(["area", "classification", "evidence_gap_or_state", "issue_key", "evidence"], r)) for r in SCIENCE],
        "rf_planner_gap_matrix": [dict(zip(["capability", "classification", "decision", "evidence"], r)) for r in FEATURES],
        "rejected_speculative_work": [dict(zip(["proposal", "reason"], r)) for r in REJECTED],
        "duplicate_proposals_rejected": manifest["duplicate_proposals_rejected"],
        "issues": rows, "tracking_issues": [created["field-validation"]["number"]],
        "dependency_graph": {created[k]["number"]: [created[d]["number"] for d in deps] for k, deps in manifest["dependency_graph"].items()},
        "external_science_gates": ["authoritative collector/device semantics", "exact TX identity and source truth", "per-observation quantity/resources/frequency", "receiver response/AGL provenance", "independent outdoor/LOS truth", "licensed compatible reference set", "predeclared independent holdouts/uncertainty"],
        "project": project_plan, "mutations": results, "checks": checks,
        "methodology": {"mode": "Single-auditor repository/source and live authenticated GitHub audit; no subagents or implementation.",
                        "ux": "Impeccable product context assisted source/committed-asset review; this is not a standalone dual-agent critique, detector/WCAG certification or timed novice test.",
                        "evidence": "Current source resolves past debt; historical reports stay immutable; fully paginated REST issue inventory plus live all-state searches precede mutations.",
                        "limitations": ["No live planning journey, new full E2E/race matrix or physical campaign run", "No authoritative source clarification/vendor contact made", "No Project read or write capability", "No cold-clone/target-user study", "Historical raw qualification/campaign data not re-parsed"],
                        "corrected_probes": ["Initial goal registration found the existing active /goal; no second goal created", "Initial broad output/path/glob probes were narrowed to real source files", "REST --slurp singleton object decoding corrected for repository/tag records", "Two stale venv probes lacked PyYAML; a fresh temporary bundled-Python environment installed the pinned hash lock", "Initial docs unittest invocation used repository cwd and failed imports; rerun from docs passed all 8 tests", "Draft report filenames used Path.with_suffix on a dotted version base; corrected to explicit suffix append before terminal verification, removed the two draft files/catalog entries, and regenerated the requested names"],
                        "violations": []},
        "source_evidence_index": "../scripts/v0.12.2-roadmap-contribution-audit/source-evidence-index.json",
        "required_final_items": [{"number": i, "name": name, "result": value} for i, (name, value) in enumerate(final, 1)],
    }
    Path(str(REPORT) + ".json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")

    text = ["# A.T.O.M v0.12.2 Roadmap + Contribution Readiness Audit", "",
            "15 October 2026 · Audit and repository management only · No backlog implementation", "",
            "**B — ISSUES READY — PROJECT ORGANIZATION INCOMPLETE.** Fifteen evidence-backed issues and useful labels are live. Projects v2 discovery was denied because the token lacks `read:project`; no Project, field, view or membership result is claimed. Measured real-world RF accuracy remains unestablished.", "",
            "## Baseline, authority and lock", "",
            final[0][1], "", final[1][1], "",
            "The pre-audit lock records the commit/tree and SHA-256 identities of the maintained authoritative sources. A separate scope supplement, recorded before the edit, permits exactly two audit-report catalog entries. Original catalog entries are preserved; production code and historical evidence remain frozen.", "",
            "Evidence is current source and committed screenshots plus live authenticated GitHub REST/GraphQL reads. The retained post-release audit describes historical findings; claim reconciliation and current source determine whether they remain. No new physical measurement, qualification, full browser journey, user-timing or accessibility certification is claimed.", "",
            "## Existing GitHub state and discoverability", "",
            "Before mutation: **32 issues, 0 open, 32 closed**, separately 43 PRs including 7 open. Thus there were no stale/unlabeled open issues and no existing open roadmap to reuse. Closed themes covered request/resource security, persistence, duplication and maintainability. Full bodies and all-state searches were inspected; historical bodies sometimes still say no remediation even though closed, so current source and closed status govern reuse decisions. Existing open dependency PRs and security PR #63 were not turned into duplicate issues or automatically placed in a roadmap.", "",
            "There were **24 labels**, no milestones, no issue forms or PR template, and no root contribution entry. GitHub community profile does recognize `docs/contributing.md` (native health 57%); it is inaccurate to say no contribution guide exists. Discussions are disabled and contain zero discussions. Projects are enabled at the repository setting, but owner/repository Project inventory is unknown because access was denied.", "",
            final[37][1], "",
            "README identifies a first decision and honestly scopes planning estimates; versioned releases and a captioned v0.12.0 gallery exist. Recommend a contribution link and reproducible story through the created issues. About description/topics were only assessed, never changed.", "",
            "## Current product debt re-check", "",
            "| Surface | Current state | Finding and action | Issue |", "|---|---|---|---|"]
    for surface, status, finding, key, evidence in PRODUCT:
        text.append(f"| {surface} | {status} | {finding} Evidence: `{evidence}`. | {link(key) if key else 'No separate issue'} |")
    text += ["", "## Scientific roadmap", "",
             "2.6/28 GHz remain a deterministic urban planning subset; 140 GHz remains research/reference. The retained real pilot has 53,005 parsed raw rows and **zero canonical observations**. There is no defensible canonical field MAE/RMSE or calibration result. Synthetic tests, exact byte hashes, strict API validity and Profile A qualification address different claims.", "",
             "| Area | Classification | Current evidence / gate | Issue |", "|---|---|---|---|"]
    for area, category, finding, key, evidence in SCIENCE:
        text.append(f"| {area} | {category} | {finding} Evidence: `{evidence}`. | {link(key) if key else 'Deferred; no issue'} |")
    text += ["", "The three primary research tickets may assess independent external evidence in parallel, but none is a normal coding assignment. The tracking issue owns compatible receiver/outdoor/LOS/reference-set evidence and final held-out uncalibrated validation. A documented no-go is a valid prerequisite-research outcome and remains a blocker to claiming final accuracy. No vendor message, campaign scheduling or collection occurred.", "",
             "## RF planner feature-gap assessment", "",
             "| Capability | State | Roadmap decision | Evidence |", "|---|---|---|---|"]
    for capability, state, decision, evidence in FEATURES:
        text.append(f"| {capability} | {state} | {decision} | `{evidence}` |")
    text += ["", "## Contribution readiness", "",
             "**Partially ready: 10/20 before, 12/20 after backlog curation.** This is an explicit ordinal heuristic, not a representative developer study or the GitHub native community score. Each dimension scores 0 absent/unsafe, 1 partial/conflicting, 2 clear/evidenced. Only find-a-task improves during this audit; created guide/forms/template tickets are not implemented fixes.", "",
             "| Dimension | Before | After | Evidence / implication |", "|---|---:|---:|---|"]
    for dimension, before, after, rationale in readiness:
        text.append(f"| {dimension} | {before} | {after} | {rationale} |")
    text += ["", "An unfamiliar developer can now choose a bounded labeled issue with exact files and checks. The current contribution guide can still misdirect them: Jest instead of Vitest, golint, nonexistent helper/import examples, main.go release edits, unavailable community-file links and disabled Discussions. The safer current references are AGENTS, Getting Started, package scripts, README VERSION guidance and CI. Existing architecture identifies frontend components/hooks/utils, Gin routes, raytracer math, immutable dataset runtime and optional Core Lab boundaries; no CODEOWNERS or named RF approval policy is invented.", "",
             "## Taxonomy, priority, effort and suitability", "",
             "New labels are additive. Existing bug/enhancement/documentation and dependency/language/area labels remain unchanged. New `type:` labels provide one consistent roadmap type; no unused `type: bug`, area or effort label was created. Primary issue areas and secondary existing frontend/backend labels are explicit in the manifest.", ""]
    for name, value in PRIORITIES.items():
        text.append(f"- **{name}:** {value}")
    text += ["", "The four P1 issues are scientific-credibility gates for accuracy promotion, not claims of current application failure. Eight P2 issues improve planning/contribution/integration; three P3 issues are useful documentation polish. No issue is P0 and no release date is promised.", ""]
    for name, value in EFFORT.items():
        text.append(f"- **{name}:** {value}")
    text += ["", "Effort distribution: XS 1, S 8, M 2, RESEARCH 4; no L task was admitted. Estimates are rough, not promises.", ""]
    for name, value in SUITABILITY.items():
        text.append(f"- **{name}:** {value}")
    text += ["", "## Dependency graph fixed before mutation", "", "```mermaid", "flowchart LR",
             '  S["#87 Serving semantics"] --> V["#90 Canonical field validation"]',
             '  T["#88 Transmitter truth"] --> V', '  R["#89 Resource and bandwidth truth"] --> V',
             '  E["External compatible data, receiver and outdoor/LOS truth"] --> V',
             '  H["Predeclared holdouts and uncertainty"] --> V', "```", "",
             "One useful tracking issue groups three independent prerequisites. Source-acquisition assessments can proceed independently; final observation binding requires all gates. Eleven engineering/docs/community issues have no hard dependency in this backlog. Similar tasks were separated by consumer/output, not wording: Results help, executable walkthrough and report-reader guide; contributor instructions, intake forms and PR handoff; guard recovery versus closed bounded-import/storage defects.", "",
             "## Created/reused issue inventory", "",
             "All entries below were created and then read back through the authenticated API. Titles, full submitted bodies, exact label sets, open state, unmilestoned status and dependency references match. **Reused existing issues: zero.** No original issue was relabeled, rewritten or reopened.", "",
             "| Issue | Title | Priority / effort | Suitability | Planned Project status only |", "|---|---|---|---|---|"]
    for p in rows:
        text.append(f"| {link(p['key'])} | {p['title']} | {p['priority']} / {p['effort']} | {p['contributor_suitability']} | {p['project_status']} |")
    text += ["", "- **good first issue:** " + numbers(lambda p: "good first issue" in p["labels"]),
             "- **help wanted:** " + numbers(lambda p: "help wanted" in p["labels"]),
             "- **Blocked:** " + numbers(lambda p: "blocked" in p["labels"]), "",
             "## Duplicate and resolved proposals rejected", ""]
    for p in manifest["duplicate_proposals_rejected"]:
        text.append(f"- **{p['proposal']}:** {p['reason']}")
    text += ["", "All 32 existing issues were considered across states using paginated REST bodies, title/concept review and supplemental live searches. Keyword matches are retained even when false positives. The manifest names related closed #17/#26/#30/#31 and explains why recovery/help/current-hero work is distinct. It does not convert resolved historical security reports into new tickets.", "",
             "## Labels, Project and milestone result", "",
             "Created 15 labels: " + ", ".join(f"`{x}`" for x in results["labels_created"]) + ".", "",
             "Reused four: " + ", ".join(f"`{x}`" for x in results["labels_reused"]) + ". All 24 original label names/descriptions/colors remain unchanged; 20 unrelated labels were skipped/preserved. Final label count: 39.", "",
             "**Project result: incomplete due to permission.** The CLI token has repo access but no read:project/project scopes. The GraphQL query attempted owner and repository Projects v2 and was rejected. Existing Projects, fields, views and membership are unknown. No Project was created, no URL is fabricated, and zero issues were added to any Project. This supports B, not A. No auth flow, credential alteration or fragile browser workaround was attempted.", "",
             "`project-plan.json` preserves all 15 desired item values. Once access is available, discover first, reuse an appropriate roadmap or create exactly one **A.T.O.M Roadmap** if none exists; preserve equivalent fields. Proposed fields: Status (Backlog, Ready, In Progress, Blocked, Done), Priority (P1/P2/P3), Area, Effort (XS/S/M/L/Research), Type. Area/type choices are explicitly listed in the plan.", "",
             "Planned statuses, not applied: **11 Ready / 4 Blocked / 0 In Progress / 0 Done**. Ready is justified only for concrete independent tasks; Backlog stays the default otherwise. Recommended views, not applied: Roadmap grouped by Status, By Area grouped/filterable by Area, Contributor Friendly using good first issue OR help wanted. No milestone existed and none was created; the scientific evidence uncertainty is not a v0.13.0 commitment.", "",
             "## What not to add", ""]
    for proposal, reason in REJECTED:
        text.append(f"- **{proposal}:** {reason}")
    text += ["", "## Verification, limits and freeze", "",
             "| Check | Result / scope | Evidence |", "|---|---|---|"]
    for check in checks:
        state = "PASS" if check["exit_code"] == 0 else "FAILED PROBE; corrected below"
        text.append(f"| {check['name']} | {state}: {check.get('result', check.get('scope', ''))} | [log](../scripts/v0.12.2-roadmap-contribution-audit/{check['log']}) |")
    text += ["", "Completion checks additionally verify the unchanged baseline HEAD/VERSION and every original tracked file except the explicit additive report catalog metadata, lock/manifest hashes, permitted new paths, new-file whitespace, script syntax, all source locations and the final artifact index. `completion-verification.json` records the terminal result after report generation; no final whole-suite or fresh operational qualification is implied.", "",
             "No implementation or source-freeze violation is known. Preliminary invalid path/glob/singleton decoding probes were corrected; stale Python environments lacked PyYAML, so a fresh temporary bundled-Python venv installed the existing hashed docs requirements. The initial docs unittest invocation failed module imports from the repository cwd; the corrected docs cwd ran eight tests successfully. A draft filename suffix error was caught by the expected-path readback, its two draft files/catalog entries were removed, and the requested names were regenerated before terminal verification. Failed probes are not passing evidence. The Impeccable context aid was used for source/asset reasoning; no standalone critique, detector result, dual-agent independence or live accessibility pass is claimed.", "",
             "Missing evidence remains explicit: Project access, a target-user/fresh-clone study, new full live RF/browser/resource qualification, physical field accuracy and authoritative serving/TX/resource/Rx/LOS data. Private raw campaigns/routes, secrets and credentials were neither accessed nor copied into public issues. Public references use repository-relative links pinned to the locked source commit. The audit does not send the prepared vendor questions or contact anyone.", "",
             "**Freeze:** VERSION 0.12.2, HEAD/tag, network8/Recommendation5/Measurement6, ordinary20 + verified8, global2/per-client1/deadline60s/experiment worker1/queue16, RF/search/persistence and all historical evidence remain unchanged. Only audit/report artifacts and their two catalog entries are written. No commit, release, tag, push or backlog implementation occurred.", "",
             "## Required final results — 50 items", ""]
    for i, (name, value) in enumerate(final, 1):
        text.append(f"{i}. **{name}:** {value}\n")
    Path(str(REPORT) + ".md").write_text("\n".join(text).rstrip() + "\n")

    # Register only the requested audit artifacts, preserving all existing entries.
    catalog_path = ROOT / "docs/doc-sources.json"
    catalog = json.loads(catalog_path.read_text())
    before = json.loads(subprocess.check_output(["git", "show", "HEAD:docs/doc-sources.json"], cwd=ROOT, text=True))
    added = [str(Path(str(REPORT) + ext).relative_to(ROOT)) for ext in [".md", ".json"]]
    for name in added:
        catalog["sources"][name] = {"classification": "HISTORICAL AUDIT / QUALIFICATION",
                                   "reason": "Dated v0.12.2 roadmap/contribution audit and verified issue-management evidence; not maintained product copy or a release promise."}
    assert all(catalog["sources"][k] == v for k, v in before["sources"].items())
    assert set(catalog["sources"]) - set(before["sources"]) == set(added)
    assert {k: v for k, v in catalog.items() if k != "sources"} == {k: v for k, v in before.items() if k != "sources"}
    catalog["sources"] = dict(sorted(catalog["sources"].items()))
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print("Rendered Markdown/JSON report, Project plan and evidence index; registered exactly two audit sources.")


if __name__ == "__main__":
    main()
