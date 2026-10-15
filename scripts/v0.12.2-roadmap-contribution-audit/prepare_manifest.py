#!/usr/bin/env python3
"""Prepare reviewable issue bodies and a dependency manifest; no GitHub mutations."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
HEAD = json.loads((OUT / "pre-audit-lock.json").read_text())["baseline"]["head"]
PROPOSALS = []


def issue(key, title, kind, area, priority, effort, suitability, problem, scope,
          acceptance, non_goals, evidence, notes, terms, dependencies=(),
          blocked_reason=None, related_closed=(), rationale=None):
    PROPOSALS.append(dict(
        key=key, title=title, type=kind, area=area, priority=priority,
        effort=effort, contributor_suitability=suitability, problem=problem,
        scope=scope, acceptance_criteria=acceptance, non_goals=non_goals,
        evidence=evidence, contributor_notes=notes, search_terms=terms,
        dependencies=list(dependencies), blocked_reason=blocked_reason,
        related_closed=list(related_closed), rationale=rationale or problem,
        decision="create", concept=key,
    ))


issue("score-interpretation", "Explain normalized network scores and Pareto alternatives in Results",
      "enhancement", "product-ux", "P2", "S", "contributor-friendly",
      "Results shows a score /100 and defines Pareto mostly as non-dominated. Priorities already have objective help, but the decision surface does not explain that the score is a preference-weighted utility rather than coverage percentage or measured accuracy.",
      "Add brief accessible help beside evaluation scores and Alternative solutions: weighted normalized utility, objective directions, a plain-language trade-off example, and the distinction between inspecting, reranking retained alternatives and rerunning search. Explain that network optimization changes azimuths while other configured RF/site inputs stay fixed.",
      ["A novice can explain /100 without calling it percentage coverage, measured accuracy or a probability.",
       "A small illustrative two-option example explains why neither alternative dominates the other and why priorities change the recommendation.",
       "Help distinguishes retained-frontier reranking, inspection, explicit apply and a new search; inspection sends no new RF work.",
       "Existing raw compatibility fields and score/search behavior are unchanged; relevant App workflow tests cover accessible help and no hidden RF requests."],
      "No scoring equations, Pareto/search policies, thresholds, API fields, navigation redesign or global-optimum claim.",
      [("frontend-react/src/App.jsx", 4790), ("frontend-react/src/App.jsx", 5135), ("frontend-react/src/components/OptimizationGoalsPanel.jsx", 34), ("docs/modeling-limits.md", 125)],
      "Use App.jsx Results/Pareto components and App.workflow.test.jsx; optimizationConfig.js is the semantics reference. No RF-model change is required; maintainer checks the wording.",
      ["score", "Pareto", "non-dominated", "normalized"])

issue("export-recovery", "Surface portable-project export guard recovery guidance",
      "enhancement", "persistence", "P2", "S", "contributor-friendly",
      "ProjectMenu catches export/import exceptions and displays only error.message. The current note explains retained evidence, but a size/node guard failure gives no next safe action. Large ray-bearing exports can hit the unchanged guards at six or eight Cells.",
      "Add contextual recovery help for known project-budget failures and a link to the portable-format limits. Explain how to preserve an available report and current local project, and distinguish reduced future scenarios from archival export. Verify any suggested action actually works in the current UI.",
      ["Known encoded-size, decoded-size and node/depth budget errors show specific recovery guidance; unknown errors retain their original message.",
       "Guidance names browser-local state and separately downloaded reports accurately; it does not promise that a report is a full editable backup.",
       "Failure preserves the active project, retained evidence and file contents and triggers no RF retry or automatic deletion.",
       "Deterministic ProjectMenu interaction tests inject budget failures and assert the guidance, preserved data and no download on failure; existing project reliability tests still pass."],
      "Do not raise guards, change schemas, trim scientific data, implement a new archive/export mode or automatically delete Scenarios.",
      [("frontend-react/src/components/WorkspaceChrome.jsx", 211), ("frontend-react/src/utils/projectStore.js", 260), ("docs/project-format.md", 33), ("docs/eight-cell-product-cap-promotion.md", 25)],
      "WorkspaceChrome.jsx ProjectMenu owns the message; projectStore.js and projectRayColumns.js own guards. Use existing projectFileReliability.test.js and App.workflow.test.jsx patterns. RF expertise is unnecessary.",
      ["export", "portable", "project", "import"], related_closed=[17, 26],
      rationale="Closed #17 implemented bounded imports and #26 fixed storage ordering. This is recovery discoverability around correct, unchanged guards, not reopening those defects.")

issue("worked-example", "Add a reproducible baseline-to-recommendation planning walkthrough",
      "docs", "docs", "P2", "M", "contributor-friendly",
      "README and Getting Started now state the first planning question, but the shipped sample has no selected Cells, dataset binding or results. The four-step network guide leaves the user to choose a plan and infer what a useful comparison looks like.",
      "Document one small public Ankara planning question using explicit dataset identity, selectable records or a validated importable planning-only fixture, RF settings, priorities and a baseline. Walk through evaluate, optimize, one meaningful metric trade-off, save/apply and separate project/report downloads.",
      ["A fresh clone with the documented public pack can reproduce the selected Cells and inputs without private data or guessed operator truth.",
       "The example records dataset/model version and distinguishes changed azimuths from fixed settings; it states the planning and unestablished-accuracy boundaries.",
       "The walkthrough explains a baseline delta and trade-off and ends with evidence a reviewer can reopen or read offline.",
       "Any new project fixture passes existing import/reliability checks; instructions are exercised once and generated docs/link validation passes. Numeric expectations are scoped to the recorded dataset/configuration."],
      "No new optimizer, onboarding wizard, deployment recommendation, larger network support or fabricated measured data. Preserve the legacy settings-only sample as a valid input-only example.",
      [("README.md", 25), ("docs/getting-started.md", 105), ("examples/ankara-sample.atom-project.json", 1), ("frontend-react/src/utils/projectFileReliability.test.js", 146)],
      "Work in docs/getting-started.md and examples/. Follow existing project-schema tests; use a bounded two-to-four Cell example. Maintainer reviews interpretation of the planning result. This is an executable example, not a replacement first-use slogan.",
      ["walkthrough", "example", "onboarding", "first-use"])

issue("matched-heroes", "Add matched current light and dark documentation hero captures",
      "docs", "docs", "P3", "S", "beginner-safe",
      "The docs landing page uses focused-workspace.jpg for light mode and v0.12.0/network-workspace.png for dark mode. Inspection confirms different navigation generations, map extents and Cell selections. Claim reconciliation explicitly deferred this mismatch.",
      "Capture a matched pair from the current real app with the same public planning state, map extent, selected Cells and viewport. Wire the pair into the existing theme previews, with accurate alt text and capture provenance.",
      ["Both theme images show the same current workspace/state and identify source version, viewport and public dataset/configuration.",
       "Images are actual app captures, not synthetic or repainted screenshots; do not invent successful RF output.",
       "Landing-page light/dark alt text and fixture paths match the assets; desktop/mobile theme tests and docs asset/link checks pass.",
       "Existing historical gallery and qualification images remain intact."],
      "No UI redesign, image deduplication campaign, RF change, new scientific evidence claim or rewrite of historical screenshots.",
      [("docs/index.html", 97), ("frontend-react/e2e/docs-theme.spec.js", 53), ("docs/v0.12.1-claim-reconciliation.md", 31)],
      "docs/index.html, docs/assets/ and e2e/docs-theme.spec.js are the bounded surface. Run the app using documented Docker/LFS setup, capture the same state in both appearances, then run the theme tests. No RF expertise is required.",
      ["hero", "screenshot", "theme", "image"], related_closed=[30],
      rationale="Closed #30 deduplicated image storage. It did not align the two active hero states; visual/source evidence confirms this separate remaining P10.")

issue("cell-glossary", "Explain Cell, sector and site terminology in the planning help",
      "docs", "docs", "P2", "S", "beginner-safe",
      "UI labels use Cell, the API and active dataset use tower records, and candidates are known planning records. Getting Started says choose a tower while inventory uses Cells; no compact glossary explains that one physical site can contain several Cells or that a candidate record is not a verified site.",
      "Add a short linked terminology section to current user help, covering planning Cell/sector/site/tower record, co-location, dataset identity and candidate feasibility. Reuse existing model-limit definitions rather than introducing new RF semantics.",
      ["A reader can distinguish a selected planning Cell from a physical site and understand multiple sectors at one location.",
       "Candidate records are explicitly not evidence of ownership, availability, permitting, cost or backhaul.",
       "Setup/Inventory and first-workflow documentation lead to the glossary; existing API names remain compatible.",
       "Current generated docs, navigation and link validation pass; maintainer reviews definitions against the existing model contract."],
      "No API/schema renames, physical inventory verification, RF equations or repository-wide historical terminology rewrite.",
      [("docs/getting-started.md", 109), ("docs/modeling-limits.md", 59), ("docs/modeling-limits.md", 70), ("docs/features.md", 111), ("frontend-react/src/components/InventoryPanel.jsx", 1)],
      "Start with docs/getting-started.md or docs/faq.md. Existing definitions and UI names supply the answer; deep RF knowledge is unnecessary. Build current references and run docs validation; do not edit historical audits.",
      ["terminology", "glossary", "sector", "site"])

issue("report-reader-guide", "Document how to read and preserve a planning report",
      "docs", "docs", "P3", "S", "beginner-safe",
      "The report already contains an executive summary, baseline comparison, Pareto table, source lineage and limitations. User help mainly says export Markdown or printable PDF; it does not teach an outside reader to check historical/current source, missing analyses, ray sampling or integrity meaning.",
      "Add a bounded reader guide tied to the existing report sections. Explain source Scenario/Version/Run, evaluated versus recommended status, absent interference, map sampling, offline HTML/Markdown/PDF delivery and separate report/project retention.",
      ["An annotated example or section map shows where to find assumptions, achieved metrics, baseline, alternatives and limitations without inventing new metrics.",
       "The guide explains historical/unsaved source context and that hashes verify artifact bytes rather than physical accuracy.",
       "It states map sampling and absent-analysis behavior and separates stored HTML/Markdown download from printing to PDF and portable project export.",
       "Steps are checked against existing report renderer/fixtures and linked from the current help; docs validation passes."],
      "No report renderer redesign, new report calculations, new archives, scientific claims or template-system implementation.",
      [("docs/getting-started.md", 184), ("frontend-react/src/components/ReportArtifactsPanel.jsx", 51), ("frontend-react/src/utils/reportExport.js", 458), ("frontend-react/src/utils/reportExport.js", 713), ("frontend-react/src/utils/reportExport.test.js", 572)],
      "Use docs/getting-started.md/faq.md and existing reportExport fixtures as references. No RF code change or deep RF judgement is needed. Do not duplicate a new executive summary: it already exists.",
      ["report", "read", "guide", "export"], related_closed=[31],
      rationale="Closed #31 consolidated report formatting/escaping. The report functionality is present; this ticket only teaches consumers how to use it.")

issue("contributor-guide", "Repair the contribution entry point, setup examples and validation guidance",
      "docs", "community", "P2", "M", "contributor-friendly",
      "GitHub detects docs/contributing.md, but no root CONTRIBUTING.md or README contribution entry exists. The guide calls Vitest tests Jest, invokes golint, demonstrates nonexistent RF helper/import paths, prescribes editing main.go for releases, links absent community files, and recommends disabled Discussions and speculative RF priorities.",
      "Create a discoverable canonical contribution entry and repair the maintained guide against AGENTS.md, package scripts, CI and VERSION tooling. Include a small-change route from issue to files to focused checks, architecture/ownership boundaries, Docker/LFS prerequisites and current release process.",
      ["README and a GitHub-recognized contribution entry lead to one maintained source without contradictory duplicate instructions.",
       "Fresh-clone Docker and frontend/backend development steps include LFS, readiness and correct working directories; documented snippets use real symbols/files or are explicitly pseudocode.",
       "The test matrix names Vitest, frontend lint/build/Playwright, Go vet/race, docs and version/policy checks, with focused-versus-full guidance matching CI.",
       "VERSION is canonical; contributor PRs use Unreleased rather than instructions to edit main.go or publish tags. Missing CoC/contributor promises are removed or linked only if real.",
       "Communication uses available Issues while Discussions is disabled; RF changes are routed to maintainer review and bounded newcomer work to the roadmap. Commands/links are checked and docs validation passes."],
      "No enabling Discussions, inventing CODEOWNERS/maintainers or community policy, adding RF models, changing CI gates, runtime upgrades or releasing software.",
      [("docs/contributing.md", 58), ("docs/contributing.md", 207), ("docs/contributing.md", 332), ("docs/contributing.md", 432), ("README.md", 210), ("AGENTS.md", 1), (".github/workflows/quality.yml", 45)],
      "docs/contributing.md, README.md, a root CONTRIBUTING.md and docs build mapping are the likely surfaces. This is editorial/tooling verification; do not change working production code to match stale examples. GitHub community-profile snapshot confirms the detected guide.",
      ["contribut", "setup", "onboarding", "release guidance"])

issue("issue-forms", "Add issue forms for reproducible planning bugs and scoped proposals",
      "chore", "community", "P2", "S", "contributor-friendly",
      "Neither the tracked .github tree nor GitHub community profile has an issue template. A useful planning bug needs model/dataset identity, supported workflow, expected/actual result and reproducible inputs; arbitrary screenshots or private campaigns are insufficient.",
      "Add lightweight bug and feature/research proposal forms that request the evidence appropriate to the problem, point to duplicate search and model limits, and keep private route data and credentials out of submissions.",
      ["Bug form captures app version, dataset/model identity, workflow/technology, minimal steps, expected/actual and relevant safe logs; setup-only bugs do not require RF data.",
       "Proposal form asks which planning decision improves, evidence/prerequisites, bounded scope and non-goals.",
       "Forms explicitly discourage secrets, private campaign locations and raw routes, and direct scientifically uncertain work to maintainer review.",
       "Templates validate as GitHub issue-form YAML, use existing labels, and do not route users to disabled Discussions or require inaccessible private datasets."],
      "No auto-triage bots, permission changes, forced raw measurement upload, new support service or reopening resolved security findings.",
      [(".github/workflows/quality.yml", 1), ("docs/contributing.md", 7), ("planning/product-compass.md", 108), ("docs/modeling-limits.md", 131)],
      "Create .github/ISSUE_TEMPLATE/*.yml and optionally config.yml. Cross-check supported YAML syntax and existing issue labels; no deep RF implementation knowledge is required. No workflow automation is needed.",
      ["issue template", "issue form", "bug report"])

issue("pr-template", "Add a pull-request template with scoped validation and model boundaries",
      "chore", "community", "P2", "XS", "beginner-safe",
      "The repository and GitHub community profile have no PR template. AGENTS.md already requires impact, validation, issue links and UI screenshots, but new contributors do not get these prompts when opening a PR.",
      "Add a concise PR template that asks for the problem/result, linked issue, affected surfaces, exact checks run or skipped, screenshots for UI changes and relevant scientific/persistence/cap boundary changes.",
      ["GitHub recognizes the template and prepopulates a new PR body.",
       "Prompts ask for concrete before/after behavior, issue reference and relevant validation commands/results, without requiring unrelated full suites for a typo.",
       "UI changes request screenshots; RF, scope, persistence or compatibility changes request explicit boundary explanation and maintainer review.",
       "Template matches AGENTS.md and VERSION/Unreleased policy, contains no fabricated validation checklist results and needs no CI/production change."],
      "No new merge policy, automatic approvals, CODEOWNERS, branch protection changes or CI automation.",
      [("AGENTS.md", 36), ("README.md", 223), (".github/workflows/quality.yml", 1)],
      "One file: .github/PULL_REQUEST_TEMPLATE.md. Read AGENTS.md and existing CI, then preview the Markdown and verify GitHub-recognized placement. No RF expertise or architecture prerequisite.",
      ["pull request template", "PR template", "review checklist"])

issue("api-readiness-schemas", "Define response schemas for readiness and batch-process discovery",
      "enhancement", "api", "P2", "S", "contributor-friendly",
      "OpenAPI 3.1 is now strictly valid, but /readyz 200/503 and /api/processes/batch-experiment 200 declare descriptions only. Strict schema validity cannot validate these actual JSON bodies or provide typed integration contracts.",
      "Describe the existing readiness and batch-process discovery response bodies in OpenAPI and add response-contract fixtures using the existing handlers. Keep this bounded to the two operational discovery endpoints.",
      ["/readyz success and failure schemas match status/buildings/towers/frontend/dataset_error, preserving sanitized dependency errors.",
       "Batch-process discovery schema describes id, version, job_control_options, dimensions and max_runs exactly as returned today.",
       "Contract tests accept real handler outputs and reject missing/wrong-type required values; strict OpenAPI and local reference validation still pass.",
       "No response/status behavior, RF budget or experiment limits change, and these schemas do not imply a new RF evidence class."],
      "No repeat repair of the five resolved malformed Response Objects, new endpoint, entire Core Lab schema expansion, RF equation or runtime behavior changes.",
      [("docs/openapi.yaml", 14), ("docs/openapi.yaml", 506), ("backend-go/main.go", 630), ("backend-go/experiment_jobs.go", 431), ("docs/v0.12.1-claim-reconciliation.md", 85)],
      "Use docs/openapi.yaml, docs/validate_openapi_test.py, readiness tests in backend-go/interference_route_test.go and experiment_jobs_test.go. Follow existing schema-test conventions; no deep RF expertise is required.",
      ["OpenAPI", "readiness", "process discovery", "schema"])

issue("roadmap-doc-freshness", "Reconcile maintained roadmap status and unsupported API release promises",
      "docs", "docs", "P3", "S", "contributor-friendly",
      "planning/future_plans.md still calls tagged images, browser coverage and an additional pack release-completion work despite current release workflow/E2E/sample-pack evidence. docs/api.md says future versions will add webhooks and other capabilities without an admitted objective or milestone.",
      "Reconcile maintained roadmap rows with the released source and this evidence-backed issue backlog. Replace unconditional API future promises with supported current behavior or clearly gated candidates. Preserve dated historical research and qualification reports.",
      ["Each maintained roadmap row is marked implemented, partial, blocked or deferred with current source/issue evidence; existing sample-pack and release/E2E work is not recreated.",
       "Measurement reference-set text distinguishes synthetic/tooling fixtures from a usable real field-validation dataset.",
       "API documentation makes no uncommitted webhook, terrain, custom-model or release promise; API contract version is kept distinct from application VERSION.",
       "Current docs build/classification/link checks pass and historical artifacts are unchanged."],
      "No v0.13.0 milestone or release commitment, qualification reopening, new APIs, new field measurements or implementation of listed ideas.",
      [("planning/future_plans.md", 21), ("docs/api.md", 1285), ("backend-go/raytracer/testdata/sample-pack/manifest.json", 1), (".github/workflows/release.yml", 1), ("frontend-react/playwright.config.js", 1)],
      "Edit only current planning/future_plans.md and docs/api.md plus regenerated current docs as needed. Verify completion evidence rather than marking all broad rows complete. Maintainer reviews roadmap wording; no RF math changes.",
      ["roadmap", "future", "release", "webhook"])

issue("serving-semantics", "Resolve serving-cell semantics required for canonical field validation",
      "research", "validation", "P1", "RESEARCH", "research-heavy",
      "The retained pilot parsed 53,005 rows but promoted zero canonical observations. All 83 registered candidates also say CONNECTION_NONE. Matching serving-change events do not settle that conflict; the latest semantics audit explicitly remains unresolved.",
      "Scientific question: which version-specific collector/device evidence can establish an authoritative serving identity when recorded fields conflict? Record the collector build/device scope, authoritative clarification and a deterministic decision table, or a documented no-go. Known evidence is the sanitized conflict/transition audit; missing evidence is source authority and build-specific behavior.",
      ["An authoritative version/device-scoped explanation reconciles registered, connection status and event identity/derivation, including contradictory PS identity evidence; otherwise record why the source remains unusable and what new capture evidence would be necessary.",
       "A reviewed evidence matrix specifies accepted/rejected/ambiguous cases without strongest-signal, proximity or model-output inference.",
       "Any later proposed adapter behavior requires separate scoped implementation review with sanitized positive/negative fixtures; this research issue does not silently weaken current guards.",
       "The decision and provenance are public-safe, and canonical observation/calibration readiness stays false until all independent gates pass."],
      "No vendor contact is authorized by this issue creation; no parser fallback, private routes, new field campaign, canonical residuals, calibration or RF changes in this audit.",
      [("docs/concept-6a1-readiness.json", 1), ("docs/concept-6a1-2-serving-state-semantics.md", 1), ("docs/concept-6a1-2-vendor-questions.md", 1), ("backend-go/raytracer/concept_6a1_campaign_tooling_test.go", 340)],
      "Maintainer-owned research requiring collector/Android source understanding and external evidence. Use sanitized existing artifacts; do not publish raw recordings, Cell IDs or campaign locations. Prepared questions already exist; do not merely rewrite them as completion.",
      ["serving", "canonical", "measurement", "collector"],
      blocked_reason="External version-specific collector/device source clarification is missing.")

issue("transmitter-truth", "Establish authoritative transmitter mapping and RF truth for field validation",
      "research", "rf-science", "P1", "RESEARCH", "research-heavy",
      "The pilot has zero exact mappings to the planning pack. OpenCellID-derived points and configured RF defaults do not establish the actual sector, position, conducted power/reference plane, height, orientation or antenna response.",
      "Scientific question: can a permitted reference transmitter or operator-provided source support exact identity mapping and an auditable RF link budget? Obtain or assess an authoritative evidence package with field-level provenance and uncertainty. Known evidence is the transmitter-reconciliation/truth audit; all source-specific TX parameters are currently missing.",
      ["The source has explicit usage/privacy rights and exact PLMN plus Cell/sector mapping; nearest-tower or strongest-signal matching is never substituted.",
       "Position, antenna height/azimuth/tilt, conducted TX power and reference plane, gain/pattern, system/polarization assumptions, frequency and channel are each known with provenance or explicitly block validation.",
       "A sanitized mapping/field-completeness decision is reviewed against the existing transmitter-map contract and rejects ambiguous identities.",
       "No public issue contains precise private sites/raw routes or confidential operator data; missing truth produces a recorded no-go rather than guessed defaults."],
      "No general operator inventory product, proximity mapper, vendor-pattern importer, guessed TX values, RF extension, campaign collection or calibration promotion.",
      [("docs/concept-6a1-1-real-pilot-ingestion.md", 78), ("docs/concept-6a1-1-transmitter-truth.json", 1), ("docs/concept-6a1-1-transmitter-reconciliation.json", 1), ("backend-go/raytracer/concept_6a1_campaign_tooling.go", 452)],
      "Maintainer-owned scientific/data-provenance work. Source access is an external prerequisite; existing transmitter-map validation supplies the deterministic contract. Coordinate with serving-semantics for final observation binding, but source acquisition can be assessed independently.",
      ["transmitter", "mapping", "operator", "truth"],
      blocked_reason="Authoritative identity and transmitter RF/source evidence is unavailable.")

issue("resource-truth", "Establish observation-bound bandwidth and measurement-resource truth",
      "research", "validation", "P1", "RESEARCH", "research-heavy",
      "Pilot B7 rows have unavailable CellInfo bandwidth; ServiceState vectors cannot be assigned exactly to a candidate identity. RSRP cannot be relabeled as carrier power, and RSRQ/SINR/RSSI additionally lack a defensible resource/interferer context.",
      "Scientific question: which observed quantity/reference plane and identity/time-bound resource evidence permits a like-for-like comparison? Establish provenance for bandwidth, reference-signal/resource definition, frequency and neighbor/load context per intended KPI, or explicitly exclude unsupported quantities.",
      ["Every accepted quantity has a documented measurement definition/reference plane, units, identity/time binding and uncertainty; unavailable sentinels remain missing.",
       "Bandwidth is independently assignable to the exact observation; channel/subscription proximity or configured planning defaults do not fill missing truth.",
       "The 2.665 versus canonical 2.600 GHz mismatch is resolved through a compatible evidence source or explicit no-go, without widening the frozen profile tolerance.",
       "RSRP, carrier power, RSRQ, SINR and RSSI eligibility is assessed separately; missing denominator/neighbor truth explicitly blocks affected KPIs.",
       "Publish only sanitized quantity-readiness decisions and reviewable positive/negative assignment examples."],
      "No invented bandwidth, signal-quantity conversion, new carrier model, canonical tolerance change, extra KPI accuracy claim or calibration.",
      [("docs/concept-6a1-1-bandwidth-audit.json", 1), ("docs/concept-6a1-1-applicability.json", 1), ("docs/concept-6a1-readiness.json", 1), ("backend-go/raytracer/concept_6a1_campaign_tooling.go", 1054)],
      "Research-heavy measurement/RF semantics; not beginner work. Reuse current quantity-readiness and explicit resource ledgers. Serving and TX tasks establish final observation identity, while evidence-source assessment can proceed independently.",
      ["bandwidth", "resource", "RSRP", "measurement"],
      blocked_reason="Observation-bound bandwidth/resource/quantity evidence is missing; identity remains unresolved.")

issue("field-validation", "Track evidence gates for canonical real-world RF validation",
      "research", "validation", "P1", "RESEARCH", "maintainer-owned",
      "Measurement tooling and synthetic fixtures exist, but current canonical real-pilot observations are zero and measured accuracy remains unestablished. Three independent evidence-source blockers need coordinated closure; more raw rows alone will not establish accuracy.",
      "Track the serving, transmitter and resource prerequisites plus the remaining compatible reference dataset, receiver characterization/AGL provenance, independent outdoor/LOS labels and declared-scope holdout evaluation. Scientific question: what uncalibrated held-out error can the released canonical model support under a fully evidenced scope? Known evidence is the retained readiness ledger and existing validation tooling; a qualifying reference set and endpoint truth are missing.",
      ["Linked serving, transmitter and resource issues reach evidence-backed decisions; no-go decisions remain blockers rather than counting as successful validation.",
       "A licensed/public-safe compatible-frequency reference set has trustworthy serving identity, authoritative TX truth, receiver height/response provenance and independent outdoor/LOS annotations, with exclusions/counts retained.",
       "The study predeclares quantity, dataset/model identity, scope, spatial/site/campaign holdouts, uncertainty and handling of repeated/autocorrelated samples before examining residual improvements.",
       "Only after all gates pass, uncalibrated held-out residuals, subgroup counts, limitations and reproducible sanitized fixtures/report are published; no threshold/MAE target is invented from current missing evidence.",
       "Calibration remains a separate later study using independent holdouts; artifact hashes and synthetic tests are not presented as physical accuracy."],
      "No campaign scheduling or collection authorized by this audit, no forced salvage of the current pilot, no calibration implementation, 140 GHz promotion, new model or commercial-accuracy claim.",
      [("docs/concept-6a1-readiness.json", 1), ("docs/concept-6a1-1-applicability.json", 1), ("docs/concept-6a-canonical-rf-validation.md", 1), ("backend-go/raytracer/canonical_rf_validation.go", 1), ("backend-go/raytracer/canonical_rf_validation_holdout.go", 1)],
      "One tracking issue is justified by the independent evidence prerequisites; it owns final study readiness and receiver/LOS/reference-set evidence, not duplicate prerequisite research. Maintainer/RF review required. No raw private route data in GitHub.",
      ["field validation", "canonical", "accuracy", "measurement"],
      dependencies=["serving-semantics", "transmitter-truth", "resource-truth"],
      blocked_reason="Depends on three evidence prerequisites and external receiver/outdoor/LOS compatible reference-set evidence.")


def load_issues():
    record = json.loads((OUT / "github-issues-before.json").read_text())
    assert record["exit_code"] == 0
    return [item for page in record["data"] for item in page if "pull_request" not in item]


def body(p):
    refs = "\n".join(f"- [{path}:L{line}](../blob/{HEAD}/{path}#L{line})"
                     for path, line in p["evidence"])
    deps = "\n".join(f"- {{{{issue:{key}}}}}" for key in p["dependencies"]) or "None in this backlog."
    if p["blocked_reason"]:
        deps += "\n\nExternal/evidence blocker: " + p["blocked_reason"]
    criteria = "\n".join("- [ ] " + text for text in p["acceptance_criteria"])
    return f'''## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `{HEAD[:7]}`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

{p['problem']}

## Scope

{p['scope']}

## Acceptance criteria

{criteria}

## Non-goals

{p['non_goals']}

## Evidence / references

{refs}

## Dependencies

{deps}

## Contributor notes

Suitability: **{p['contributor_suitability']}**. Rough effort: **{p['effort']}** (planning estimate, not a promise). Priority: **{p['priority']}**.

{p['contributor_notes']}
'''


def main():
    existing = load_issues()
    for p in PROPOSALS:
        matches = [dict(number=i["number"], title=i["title"], state=i["state"])
                   for i in existing if any(term.casefold() in (i["title"] + "\n" + (i["body"] or "")).casefold()
                                            for term in p["search_terms"])]
        p["existing_duplicate_search"] = {
            "coverage": "All open AND closed issues, fully paginated REST baseline; PRs excluded.",
            "issues_reviewed": len(existing), "keyword_matches": matches,
            "related_closed_reviewed": p["related_closed"], "duplicate_found": False,
            "adjudication": p["rationale"] if p["related_closed"] else "No existing issue represents this coherent problem; all matched historical findings are resolved, different in scope or general keyword overlap.",
        }
        p["labels"] = [f"type: {p['type']}", f"area: {p['area']}", f"priority: {p['priority']}"]
        if p["contributor_suitability"] in ["beginner-safe", "contributor-friendly"]:
            p["labels"].append("help wanted")
        if p["contributor_suitability"] == "beginner-safe":
            p["labels"].append("good first issue")
        if p["blocked_reason"]:
            p["labels"].append("blocked")
        p["project_status"] = "Blocked" if p["blocked_reason"] else "Ready"
        p["body_template"] = body(p)
    manifest = {
        "schema_version": 1, "prepared_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": "Berk-Unsal/atom", "source_head": HEAD,
        "pre_audit_lock_sha256": hashlib.sha256((OUT / "pre-audit-lock.json").read_bytes()).hexdigest(),
        "mutation_authorization": "Explicit objective phases 22-28; issues/labels/one Project only; no implementation.",
        "issues": PROPOSALS,
        "dependency_graph": {p["key"]: p["dependencies"] for p in PROPOSALS},
        "tracking_issues": ["field-validation"],
        "duplicate_proposals_rejected": [
            {"proposal": "Repair strict OpenAPI 3.1 validation", "reason": "Resolved by v0.12.2; new operational schemas are a distinct completeness task."},
            {"proposal": "Add Measurement6 UI guard", "reason": "measurementScope.js and App workflow tests already enforce it."},
            {"proposal": "Translate Retry-After into wait guidance", "reason": "rfRecoveryMessage.js and regressions already implement it."},
            {"proposal": "Explain draft/Version/Run/project retention", "reason": "Current ProjectMenu/README/project-format already explain the distinctions; only guard recovery remains."},
            {"proposal": "Fix dual-store ordering/import limits/report escaping/image deduplication", "reason": "Closed #26/#17/#31/#30 respectively; the proposed docs/recovery work does not reopen these defects."},
            {"proposal": "Repeat 8-Cell/W1 budget or optimization performance repair", "reason": "Completed and scoped in preserved evidence; no changed evidence justifies reopening."},
            {"proposal": "Add sample dataset pack/release workflow/basic first-decision narrative", "reason": "Already present in testdata/sample-pack, release.yml and README/getting-started; only freshness and executable walkthrough remain."},
        ],
        "validation": {"status": "pending", "github_mutation_started": False},
    }
    (OUT / "issue-manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    bodies = OUT / "issue-bodies"
    bodies.mkdir(exist_ok=True)
    for p in PROPOSALS:
        (bodies / f"{p['key']}.md").write_text(p["body_template"])
    print(f"Prepared {len(PROPOSALS)} proposals; no GitHub mutations.")


if __name__ == "__main__":
    main()
