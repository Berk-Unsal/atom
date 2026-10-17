"""Approved GitHub issues materialized from the product capability/UX/growth audit.

Each entry maps audit candidates (internal IDs, never shown publicly) to one public issue.
`{dep:key}` placeholders are replaced with created issue numbers at creation time.
"""

SHA = "d0763974e2b5b68c209fda5c680cdfd8b1bdde2a"
OBSERVED = "Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026."


def ln(path, start=None, end=None):
    anchor = "" if start is None else f"#L{start}" + (f"-L{end}" if end else "")
    label = path + ("" if start is None else f":L{start}" + (f"-L{end}" if end else ""))
    return f"[{label}](../blob/{SHA}/{path}{anchor})"


def body(context, problem, scope, acceptance, non_goals, evidence, dependencies, notes):
    parts = [
        "## Context\n\n" + context,
        "## Problem\n\n" + problem,
        "## Scope\n\n" + scope,
        "## Acceptance criteria\n\n" + "\n".join(f"- [ ] {item}" for item in acceptance),
        "## Non-goals\n\n" + non_goals,
        "## Evidence / references\n\n" + "\n".join(f"- {item}" for item in evidence),
        "## Dependencies\n\n" + dependencies,
        "## Contributor notes\n\n" + notes,
    ]
    return "\n\n".join(parts) + "\n"


def notes(suitability, effort, priority, risk, extra=""):
    text = f"Suitability: **{suitability}**. Rough effort: **{effort}** (planning estimate, not a promise). Priority: **{priority}**. Semantic/scientific risk: **{risk}**."
    return text + ("\n\n" + extra if extra else "")


ISSUES = [
    {
        "key": "fit", "candidates": ["CI-01"], "absorbs_findings": ["F01", "F12", "F32"], "group": "NOW", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "UX REPAIR", "safety": "A",
        "title": "Bring completed results into view after runs, area selection and interference",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2", "help wanted"],
        "body": body(
            "Run Sector, Evaluate Network, Optimize Network and Analyze Interference are the core planning actions. Each finishes quickly (0.2–6 s locally), but the user has to go looking for what changed, which weakens the first impression and every later iteration.",
            OBSERVED + "\n\n"
            "- After **Run Sector**, **Evaluate Network** or **Optimize Network** the map stays at the city-wide default zoom. Rays are a few pixels long and the only visible change is the command-bar `CURRENT Run …` chip. `fitRequestVersion` is only incremented by the icon-only **Fit selected cells** button.\n"
            "- After drawing a selection area (\"272 towers found, nearest 8 selected\") the selected Cells are not brought into view.\n"
            "- Even after **Fit selected cells**, a 400 m single-sector result occupies a small part of the map.\n"
            "- After **Analyze Interference**, the Interference tool looks unchanged: no summary and no pointer to Review → Results → Interference, where the result is shown.",
            "- Request a map fit when a new **current** result is produced (sector run, network evaluation, network optimization) and when an area selection completes, framing the selected Cells plus their planning radius.\n"
            "- Do not move the map if the user panned or zoomed after starting the action.\n"
            "- Keep **Fit selected cells** as the manual control; consider a text label or tooltip that names it.\n"
            "- After interference analysis, show a compact summary (for example serviceable share and affected demand, using existing result fields) and an **Open in Results** action in the Interference tool.",
            [
                "Completing each of the three RF actions and an area selection triggers exactly one fit that contains the selected Cells and planning radius.",
                "No fit occurs when the user moved the map during the request, or for view-only actions (Signal/Rays toggles, ray scope, legend, inspection).",
                "Single-sector fit frames the planning radius rather than the city extent.",
                "The Interference tool shows an existing-metric summary and an Open in Results action after a successful analysis.",
                "Workflow tests cover fit requests per completed action and no fit or RF request for view-only toggles.",
            ],
            "No new map features, clustering, animation, zoom-limit changes or RF/request changes. No new interference metrics.",
            [ln("frontend-react/src/App.jsx", 2226, 2228) + " — fit only on button press", ln("frontend-react/src/App.jsx", 263), ln("frontend-react/src/App.jsx", 2034, 2058) + " — area selection", ln("frontend-react/src/components/ControlPanel.jsx", 263, 340) + " — Interference tool", ln("frontend-react/src/App.jsx", 4533, 4537) + " — interference results only in Results"],
            "None. Coordinate with the map-chrome layout issue if both touch the map toolbar.",
            notes("help wanted", "S", "P2", "none — presentation only", "MapCanvas already consumes `fitRequestVersion`; most of the change is deciding when to request a fit."),
        ),
    },
    {
        "key": "interpret", "candidates": ["CI-02"], "absorbs_findings": ["F02"], "group": "NOW", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "UX REPAIR", "safety": "A",
        "title": "Explain what the single-sector RF result shows before its metrics",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2", "help wanted"],
        "body": body(
            "The first result most users see is the pre-selected sector at 28 GHz. Its metrics are correct but uninterpreted, so it reads as a failure. Network results already have score help (closed #76); the single-sector RF view has none.",
            OBSERVED + "\n\n"
            "Default result: **Blocked 99.2%**, **Average Rx −185.5 dBm**, Max range 400 m, Min range 8.5 m, directly above a **Coverage Gaps** card showing 0 underserved buildings, 0.0% gap ratio and 0 unmet demand. With 4G LTE the same sector is 84.2% blocked. Nothing explains that *blocked rays* (geometry obstruction along sampled rays) and *coverage gaps* (demand buildings inside the sector below the service threshold) measure different things, so the two read as contradictory.",
            "- Add one short, deterministic interpretation line above the RF metrics, built from existing result fields, that distinguishes ray blockage from demand coverage gaps and states the receiver threshold used.\n"
            "- Add an accessible \"About these metrics\" disclosure, matching the existing score-help pattern, defining Blocked, Average Rx (over sampled rays), usable range and coverage gaps.\n"
            "- Wording must follow `docs/modeling-limits.md`: planning estimate, no quality grade or accuracy claim.",
            [
                "With the default sector, a novice can tell from the screen why 99% blocked and 0 gaps are not contradictory.",
                "Interpretation text is generated from existing fields only and covered by unit tests for blocked/unblocked, gaps/no-gaps and unavailable values.",
                "The disclosure is keyboard operable and does not trigger RF requests (workflow test).",
                "Maintainer approves the wording against the modeling-limits page.",
            ],
            "No change to RF metrics, thresholds, averaging or defaults. No pass/fail or quality grading. No changes to network score help.",
            [ln("frontend-react/src/App.jsx", 4470, 4488) + " — RF metric list", ln("frontend-react/src/App.jsx", 5698, 5740) + " — Coverage gap panel", ln("frontend-react/src/components/OptimizationHelp.jsx") + " — existing help pattern", ln("docs/modeling-limits.md")],
            "None. The metric-presentation polish issue edits the same panel; either can land first.",
            notes("help wanted", "S", "P2", "low — wording must not imply quality thresholds or accuracy; maintainer reviews copy"),
        ),
    },
    {
        "key": "polish-results-copy", "candidates": ["CI-02 (presentation part)", "CI-16"], "absorbs_findings": ["F03", "F34", "F10", "F33"], "group": "NOW", "priority": "P2",
        "suitability": "GOOD FIRST ISSUE", "kind": "POLISH", "safety": "A",
        "title": "Fix result unit casing, zero-gap styling and residual tower wording",
        "labels": ["area: frontend", "area: product-ux", "bug", "priority: P2", "good first issue", "help wanted"],
        "body": body(
            "Small presentation defects on the result and selection surfaces undermine trust: units are mis-cased, empty results look like alarms, and the copy contradicts the Cell/site/tower glossary added in #80.",
            OBSERVED + "\n\n"
            "- `.metric-row strong` uses `text-transform: capitalize`, so `-185.5 dBm` renders as **-185.5 DBm** and `400.0 m` as **400.0 M** (which reads as mega). The accessibility tree has the correct text.\n"
            "- The Coverage Gaps card uses red alert styling when there are 0 underserved buildings, and shows **Worst Rx 0.0 dBm** when no gap was returned.\n"
            "- User-facing copy still says *tower* where a planning Cell is meant: \"272 towers found, nearest 8 selected.\", \"No tower selected\", \"Select at least 2 towers…\", \"Tower GeoJSON could not be loaded\", command bar \"Cell No tower\", and the Report intro \"Export the selected tower…\". The area-selection notice does not say what \"nearest\" means.",
            "- Remove the capitalize transform from metric values; keep labels styled as they are.\n"
            "- Use neutral styling for the Coverage Gaps card when no gaps are returned, and show the unavailable placeholder instead of `0.0 dBm` for Worst Rx in that case.\n"
            "- Replace user-facing *tower* with *Cell* where a planning Cell is meant (copy only).\n"
            "- Make the area-selection notice state the rule (nearest to the drawn area's centre, up to the network limit) and how to change the selection.",
            [
                "Metric values render units exactly as produced (`dBm`, `m`, `%`).",
                "A zero-gap result shows neutral styling and an unavailable Worst Rx; a non-zero result keeps the alert styling.",
                "No user-facing string uses *tower* where a planning Cell is meant; API fields and code identifiers are unchanged.",
                "Area-selection feedback states the selection rule when the area holds more Cells than the limit.",
                "Unit/workflow tests cover the copy and styling states; existing tests are updated rather than deleted.",
            ],
            "No renaming of API fields, data files or code identifiers. No change to the selection algorithm or the network limit. No restyling beyond the zero-gap state.",
            [ln("frontend-react/src/styles.css", 1157, 1162), ln("frontend-react/src/App.jsx", 5698, 5740), ln("frontend-react/src/App.jsx", 2034, 2058), ln("frontend-react/src/App.jsx", 515), ln("frontend-react/src/App.jsx", 961), ln("frontend-react/src/App.jsx", 1155), ln("frontend-react/src/App.jsx", 2523), ln("frontend-react/src/features/reports/ReportFeature.jsx", 36, 39), ln("docs/terminology.md")],
            "None. Glossary context: #80 (closed).",
            notes("good first issue", "S", "P2", "none — copy and styling only", "Files: `styles.css`, `App.jsx` (CoverageGapPanel, selection notice, error strings), `ReportFeature.jsx`. Search tests for the old strings first. The work can be split into separate PRs."),
        ),
    },
    {
        "key": "a11y", "candidates": ["CI-12", "CI-17 (accessibility smoke part)"], "absorbs_findings": ["F16", "F17", "F31"], "group": "NOW", "priority": "P3",
        "suitability": "GOOD FIRST ISSUE", "kind": "ACCESSIBILITY", "safety": "A",
        "title": "Make the project menu keyboard-dismissible and align Save version and Select cells names",
        "labels": ["area: frontend", "area: product-ux", "bug", "priority: P3", "good first issue", "help wanted"],
        "body": body(
            "The project menu holds Save version, Import and Export. Keyboard and assistive-technology users hit small but real naming and dismissal defects there and in the selection controls.",
            OBSERVED + "\n\n"
            "- The project menu closes only on an outside pointer-down. **Escape does nothing**, and the trigger keeps the accessible name \"Open project menu\" while expanded.\n"
            "- The visible **Save version** button has the accessible name **\"Save current\"** (label-in-name mismatch). The same action appears as \"Save version\", \"Save Version\" and \"Saving scenario…\".\n"
            "- In Network mode with fewer than two Cells, the primary action and the map toolbar mode button are both named **\"Select cells\"**.",
            "- Escape closes the project menu and returns focus to the trigger; the trigger name reflects the expanded state or relies on `aria-expanded` alone.\n"
            "- Align the visible text, accessible name and progress text for Save version, using one casing across the project menu and Scenarios.\n"
            "- Give the primary action and the map mode button distinct accessible names.\n"
            "- Add an automated accessibility smoke check (for example axe via Playwright) for the project menu and the Setup and Results drawers.",
            [
                "Escape closes the project menu and focus returns to its trigger (interaction test).",
                "Save version's visible text is contained in its accessible name; casing is consistent in both places.",
                "No two simultaneously visible controls share the name \"Select cells\".",
                "The accessibility smoke check runs in the existing e2e suite and reports no critical violations on the covered surfaces.",
            ],
            "No menu redesign, no new keyboard shortcuts, no full WCAG certification.",
            [ln("frontend-react/src/components/WorkspaceChrome.jsx", 206, 213), ln("frontend-react/src/components/WorkspaceChrome.jsx", 265, 276), ln("frontend-react/src/components/WorkspaceChrome.jsx", 326, 327), ln("frontend-react/src/components/WorkspaceChrome.jsx", 253), ln("frontend-react/src/components/ScenarioPanel.jsx", 183), ln("frontend-react/src/App.jsx", 2749, 2758)],
            "None.",
            notes("good first issue", "S", "P3", "none", "Existing tests click `Save current` by name; update them together with the label change."),
        ),
    },
    {
        "key": "adopt", "candidates": ["CI-03"], "absorbs_findings": ["F04"], "group": "NOW", "priority": "P1",
        "suitability": "MAINTAINER-OWNED", "kind": "WORKFLOW / PERSISTENCE", "safety": "B",
        "title": "Allow Pareto alternatives from a working-draft optimization to be applied",
        "labels": ["area: frontend", "area: persistence", "area: product-ux", "type: enhancement", "priority: P1"],
        "body": body(
            "Optimization now explains its score and alternatives (#96). Choosing a non-recommended alternative is the decision step the explanation exists for, but it only works if the user saved a Version *before* optimizing. Most users optimize directly in the working draft.",
            OBSERVED + "\n\n"
            "Select 8 Cells → **Optimize Network** in the working draft → Results → Solutions → **Apply solution…**. The dialog says *\"This solution is not bound to a retained source Version, so it cannot be applied safely\"*, and both **Create new Version** and **Create branch** are disabled. No recovery step is shown, although App already has one (\"Save a Scenario Version before applying…\"). The UI never says that the *recommended* azimuths were already written into the working draft when optimization completed. The workflow test for apply saves a Version before optimizing, which is exactly the step users are not told to take.",
            "Bounded semantic change (lineage and persistence). Choose and implement one of the following:\n\n"
            "1. **Save source and apply:** when the optimization run has no source Version, save a source Version from the run's retained exact input (refused unless its input fingerprint matches), then apply the chosen solution as a new Version or branch.\n"
            "2. **Guided recovery:** if (1) is rejected, the dialog states the exact recovery steps and offers a Save version action, without silent re-optimization.\n\n"
            "In both cases, the Solutions view states when the recommended solution is already in the working draft.",
            [
                "From an unsaved-draft optimization, a user can adopt a non-recommended alternative with explicit confirmation and without re-running optimization (option 1), or is told exactly how to (option 2).",
                "The source run stays immutable; the created Version or branch records the solution and source run lineage.",
                "Apply is refused with a specific message when fingerprints do not match.",
                "Solutions view indicates when the recommended solution already matches the working draft.",
                "Workflow and persistence round-trip tests: optimize in draft → apply alternative → reload → lineage intact.",
            ],
            "No optimizer, scoring or Pareto changes. No automatic Version creation on every run. No change to project file format beyond existing Version and lineage fields.",
            [ln("frontend-react/src/components/ApplySolutionDialog.jsx", 13), ln("frontend-react/src/components/ApplySolutionDialog.jsx", 55, 60), ln("frontend-react/src/App.jsx", 1217) + " — recommended azimuths written to draft", ln("frontend-react/src/App.jsx", 3136, 3150) + " — existing recovery message", ln("frontend-react/src/App.workflow.test.jsx", 857, 862) + " — test saves a Version before optimizing"],
            "None. Related: the result-continuity issue also binds runs to Versions; agree on one binding rule.",
            notes("maintainer-owned", "M", "P1", "bounded — lineage semantics; no RF or optimizer change", "Requires a maintainer decision between options 1 and 2 before implementation."),
        ),
    },
    {
        "key": "shareable", "candidates": ["CI-07", "CI-08"], "absorbs_findings": ["F13", "F14", "F15"], "group": "NOW", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "UX REPAIR", "safety": "A",
        "title": "Make report and project downloads readable and clearly named outside A.T.O.M",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2", "help wanted"],
        "body": body(
            "Reports and project files are how planning evidence leaves A.T.O.M. A reviewer who does not run the app sees only the downloaded file. #81 documents how to read a report; this issue fixes what the files themselves contain and are called.",
            OBSERVED + "\n\n"
            "- A Markdown report downloads as **`f079b4f3-b688-4148-9fc3-5289e4c1523a.md`** (the report ID). Project export is always `<project-slug>.atom-project.json`, so repeated exports collide.\n"
            "- The single-sector report repeats the same table as **RF Result** and **RF Propagation Performance**. Its executive \"RF result\" table contains only \"Constraints: Not configured\".\n"
            "- About 600 lines (82 KB) of inline SVG map paths are embedded in the Markdown, and many Markdown viewers do not render inline SVG.\n"
            "- The Report source card showed \"No saved Version\", while the stored Report generated seconds later shows \"Sector plan 1 · Version 1 · Runs: None\" with a HISTORICAL source badge.",
            "- Filenames: `<project>-<scenario>-v<N>-<yyyymmdd>[-<kind>].<ext>` with safe slugs (omit missing parts); keep the report ID in metadata.\n"
            "- Remove duplicated report sections; omit constraint rows when no constraints are configured.\n"
            "- In Markdown, reference the map as a separate attachment or link to the HTML report instead of embedding the full SVG; the HTML report keeps the map.\n"
            "- Make the stored Report's lineage line come from the same metadata the Report source card uses.",
            [
                "Report and project downloads have deterministic, filesystem-safe names including project, scenario/Version (when present) and date; e2e asserts the pattern instead of only `.md`.",
                "Snapshot tests show no duplicated tables in single-cell and network reports.",
                "Markdown output for the sample single-sector plan has no embedded SVG path data; HTML output still contains the map.",
                "The Report source card and the stored Report list identical Scenario/Version/Run lineage for the same artifact.",
            ],
            "No new report calculations, claims or sections. No archive or bundle mode (tracked separately). No artifact ID or storage changes.",
            [ln("frontend-react/src/utils/reportArtifact.js", 20, 33), ln("frontend-react/src/domain/report.js", 63), ln("frontend-react/src/components/WorkspaceChrome.jsx", 240), ln("frontend-react/src/utils/reportExport.js", 575) + " / " + ln("frontend-react/src/utils/reportExport.js", 665) + " — duplicated sections", ln("frontend-react/src/utils/reportExport.js", 1775) + " — inline SVG", ln("frontend-react/e2e/workspace.spec.js", 1863) + " — filename test checks only `.md`"],
            "Complements #81 (documentation). No blocking dependency.",
            notes("help wanted", "S–M", "P2", "low — keep existing limitations and provenance text verbatim", "Filename work alone is a good first PR."),
        ),
    },
    {
        "key": "state-language", "candidates": ["CI-09"], "absorbs_findings": ["F09", "F22", "F23"], "group": "NOW", "priority": "P2",
        "suitability": "MAINTAINER-OWNED", "kind": "UX REPAIR / STATE", "safety": "A",
        "title": "Distinguish plan-mode changes from input changes and use readable run labels",
        "labels": ["area: frontend", "area: product-ux", "area: persistence", "type: enhancement", "priority: P2"],
        "body": body(
            "Result freshness (CURRENT / STALE / UNAVAILABLE) is one of A.T.O.M's trust mechanisms. When it fires for view-level changes and speaks in hashes, users learn to ignore it.",
            OBSERVED + "\n\n"
            "- Switching **Single → Network** immediately shows **STALE** with the map prompt \"Result out of date — Optimization 3ca91dc3…eec14b came from its original input. Run again for this plan.\"\n"
            "- Run identity leads with hashes in the command bar, Results context and Run history (\"Optimization · f1a1e6d2…73ba08 · Working draft · No saved Version\"), with no type summary, Cell count or headline metric.\n"
            "- A scenario auto-named **\"Sector plan 1\"** keeps that name after becoming an 8-Cell network. For the same state the header says **\"Version 1 Unsaved\"** while Results says **\"Sector plan 1 · No saved Version\"**.",
            "- Classify invalidation reasons so that a plan-mode switch without input changes is presented neutrally (for example \"Result belongs to Single-sector mode\"), while genuine input changes keep STALE.\n"
            "- Lead run labels with type · Cell count · headline metric · time; keep the hash in details.\n"
            "- Use one vocabulary for Version state in the header, Results and Scenarios (saved Version vs draft with changes).\n"
            "- Derive default scenario names from the plan at first save without silently renaming existing scenarios.",
            [
                "A mode switch with no input change does not show STALE; any input change still does (unit tests for reason classification).",
                "Run history entries and the command-bar chip show type, Cell count and a headline metric; hashes remain available in details.",
                "Header, Results and Scenarios use identical wording for the same Version state (workflow test).",
                "New default scenario names reflect plan mode; existing names are never changed automatically.",
            ],
            "Must not hide genuine staleness or weaken fingerprint checks. No persistence schema change. No change to which results are retained.",
            [ln("frontend-react/src/App.jsx", 1982, 1990) + " — mode change invalidates results", ln("frontend-react/src/App.jsx", 2765, 2777) + " — stale prompt", ln("frontend-react/src/App.jsx", 4088, 4091) + " — hash run label", ln("frontend-react/src/components/RunHistoryPanel.jsx"), ln("frontend-react/src/components/ResultContextBadge.jsx")],
            "None. Coordinate with the result-continuity issue, which also changes how restored freshness is shown.",
            notes("maintainer-owned", "S–M", "P2", "low — state presentation; invalidation rules need maintainer sign-off"),
        ),
    },
    {
        "key": "errors", "candidates": ["CI-10"], "absorbs_findings": ["F18", "F19"], "group": "NOW", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "UX REPAIR", "safety": "A",
        "title": "Show actionable recovery for unreachable backend, server errors and invalid inputs",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2", "help wanted"],
        "body": body(
            "A.T.O.M is local-first, so new users often run a frontend without a reachable backend or enter out-of-range values. The rate-limit message is already a good model (\"RF request budget reached. Try again in about 17 seconds.\"); other failures are not.",
            OBSERVED + " Failures were injected with request interception.\n\n"
            "- **Backend unreachable:** the Setup drawer shows only **\"Failed to fetch\"**, the command bar reads **\"Single · Cell No tower\"**, the primary action is disabled, and there is no retry.\n"
            "- **RF 500:** the message is the raw **\"internal error\"**.\n"
            "- **Invalid input** (Conducted TX power 99 dBm, valid 0–60): the field shows no error state or `aria-invalid`, the primary becomes disabled **\"Resolve setup issues\"**, and the map prompt says **\"Fix 1 invalid selected cell profile in Inventory\"** although the value was entered in Setup.",
            "- Map known failure classes (network unreachable, 5xx, invalid JSON) to cause, recovery and a Retry action for startup data loads; keep server-provided validation text where it is user-safe.\n"
            "- Invalid numeric inputs show an inline message and `aria-invalid`.\n"
            "- The invalid-setup prompt names and opens the tool that owns the invalid field.",
            [
                "With the backend unreachable, the UI names the API origin it tried, explains the likely cause and offers Retry; no \"No tower\" placeholder text appears.",
                "A 5xx RF response shows a recovery message plus server detail; 429 behavior is unchanged.",
                "Out-of-range numeric fields show inline errors and `aria-invalid=true`; fixing the value clears both.",
                "The setup prompt routes to Setup or Inventory according to where the invalid value lives.",
                "Interception tests cover unreachable, 500 and 429 (existing), plus an invalid-field interaction test.",
            ],
            "No automatic retries, no changes to RF request accounting or rate limits, no backend error-format change.",
            [ln("frontend-react/src/App.jsx", 499, 560) + " — startup loads", ln("frontend-react/src/utils/apiClient.js"), ln("frontend-react/src/utils/rfRecoveryMessage.js") + " — existing 429 pattern", ln("frontend-react/src/components/ControlPanel.jsx", 376, 410) + " — numeric fields", ln("frontend-react/src/App.jsx", 2765, 2771) + " — misdirected prompt"],
            "None. Open PR #63 also edits `apiClient.js` (HTTPS base-URL assertion); rebase rather than overlap.",
            notes("help wanted", "S", "P2", "none"),
        ),
    },
    {
        "key": "map-chrome", "candidates": ["CI-11", "CI-17 (visual baseline part)"], "absorbs_findings": ["F11", "F20", "F21", "F30"], "group": "NOW", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "POLISH", "safety": "A",
        "title": "Fix map key, command bar and Results tab collisions at desktop sizes",
        "labels": ["area: frontend", "area: product-ux", "bug", "priority: P2", "help wanted"],
        "body": body(
            "The map is the primary working surface (PRODUCT.md: map first). Overlays and header text currently collide at common desktop sizes, and one collision breaks area drawing.",
            OBSERVED + " Light and dark were checked at 1440×900, 1280×800 and 1024×768.\n\n"
            "- **Map key swallows drawing clicks:** a selection-area vertex clicked over the expanded Map key is lost (a 4-point area became a triangle).\n"
            "- With interference visible at 1440×900 the **SINR legend is clipped**, and the result-source chip truncates to \"Working dr…\".\n"
            "- At **1280×800**, \"28.0 GHz\" **overprints \"RF details\"** in the command bar when a run chip is present.\n"
            "- The **Results tab strip overflows at every width** (content 403 px; visible 335/321/295 px), clipping the fifth tab (\"C…\", \"ptimization\").\n"
            "- Programmatic heading focus when a drawer opens draws a rectangle around the title that reads as an editable field.",
            "- Collapse or disable pointer capture on the Map key while drawing, placing a Cell or picking a path endpoint; let the legend scroll instead of clipping.\n"
            "- Define truncation priority for command-bar segments so text never overlaps.\n"
            "- Make Results tabs fit at ≥1280 px (shorter labels or an overflow affordance) without hiding a tab.\n"
            "- Use a subtler focus treatment for programmatically focused headings while keeping visible keyboard focus on controls.\n"
            "- Add Playwright screenshot baselines (light/dark × 1440/1280/1024) for first run, Results and Solutions to prevent regressions.",
            [
                "Area vertices can be placed anywhere on the visible map while drawing (e2e).",
                "No text overlap in the command bar at 1280×800 and 1024×768 in either theme.",
                "All Results tabs are fully visible at ≥1280 px; at 1024 px every tab remains reachable.",
                "Legend content is scrollable rather than clipped when interference and received-power keys are both shown.",
                "Screenshot baselines are committed and stable in CI (basemap tiles disabled as in existing e2e fixtures).",
            ],
            "No visual redesign or token changes (Concept 8H system stays). No new map controls.",
            [ln("frontend-react/src/components/WorkspaceChrome.jsx", 1040) + " — MapLegend", ln("frontend-react/src/components/ResultTabs.jsx", 3), ln("frontend-react/src/components/WorkspaceChrome.jsx", 560, 564) + " — heading focus", ln("frontend-react/src/App.jsx", 4444, 4450) + " — five result views"],
            "None. If the candidate-recommendation issue changes the Results views, update baselines accordingly.",
            notes("help wanted", "S–M", "P2", "none"),
        ),
    },
    {
        "key": "continuity", "candidates": ["CI-04"], "absorbs_findings": ["F08"], "group": "NEXT", "priority": "P1",
        "suitability": "MAINTAINER-OWNED", "kind": "PERSISTENCE / STATE", "safety": "C",
        "title": "Restore result context when reopening a working draft or saved Version",
        "labels": ["area: frontend", "area: persistence", "type: enhancement", "priority: P1"],
        "body": body(
            "Local-first persistence is a core product promise. Inputs are restored on reload, but results are not, and the resulting states read as data loss even though Run history still holds the runs.",
            OBSERVED + "\n\n"
            "- Run Sector, then reload: inputs are restored; the status is **\"Run needed\"**; no result context is shown.\n"
            "- Run Sector, **Save version**, then reload: the command bar shows **\"Ready · UNAVAILABLE · Run unavailable\"** and the Map key shows `UNAVAILABLE`. The run is still listed in Run history as \"Working draft · No saved Version\", because runs made before the save stay bound to the draft. App reports \"The restored result has no unambiguous retained Run.\"",
            "Technical foundation required. Design first, then implement:\n\n"
            "- On restore, rebind the latest **exactly compatible** run summary (matching input and scenario fingerprints) and present it as HISTORICAL, with an explicit **Restore map layers** action that performs a counted RF run.\n"
            "- When saving a Version whose inputs exactly match a just-completed draft run, record that run as the Version's source run.\n"
            "- Never show \"Ready\" together with \"UNAVAILABLE\".",
            [
                "After reload, Results shows the last compatible run summary with correct freshness, or an explicit explanation of why none applies.",
                "Saving a Version immediately after a run binds that run when fingerprints match; mismatches never bind (unit tests).",
                "Restoring map layers is an explicit user action and is the only RF request on restore (no-hidden-request test).",
                "The command bar never combines \"Ready\" with \"UNAVAILABLE\".",
                "Persistence round-trip e2e: run → save → reload → result context intact.",
            ],
            "No persistence of full ray GeoJSON by default, no project file format change, no relaxation of fingerprint matching.",
            [ln("frontend-react/src/App.jsx", 2640, 2648) + " — unambiguous-run rule", ln("frontend-react/src/hooks/useProjectWorkspace.js"), ln("frontend-react/src/repository/runHistoryRepository.js"), ln("frontend-react/src/domain/resultContext.js"), ln("docs/concept-7c-run-history.md") + " — retention policy"],
            "Agree on the run-to-Version binding rule with the Pareto-apply issue ({dep:adopt}).",
            notes("maintainer-owned", "M", "P1", "medium — result binding semantics; fingerprints must stay exact", "Prioritized P1 for trust, grouped NEXT because it needs a short design decision on binding and retention first."),
        ),
    },
    {
        "key": "compare", "candidates": ["CI-05"], "absorbs_findings": ["F06"], "group": "NEXT", "priority": "P2",
        "suitability": "MAINTAINER-OWNED", "kind": "WORKFLOW", "safety": "A",
        "title": "Make plan comparison reachable from Results for every result type",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2"],
        "body": body(
            "Comparing named planning claims is central to the Product Compass (\"close the compare-to-decision loop\") and is documented as implemented. In the main network workflow, though, users cannot reach it.",
            OBSERVED + "\n\n"
            "- **Results → Compare** shows *Baseline vs Recommended* whenever a network result exists, and shows saved-scenario A/B comparison only otherwise. A network planner with two saved Versions cannot reach the scenario comparison from Results.\n"
            "- Input differences between Scenarios and Versions live in a third place: a collapsed **Compare Scenarios and Versions** disclosure in Plan → Scenarios.",
            "- Give Results → Compare a source picker for two states: current result, its optimization baseline, any saved Version, and the inspected Pareto alternative where available.\n"
            "- Show KPI deltas (existing summaries), the input diff (existing `scenarioDiff`) and the A/B map switch in one view.\n"
            "- Keep Baseline vs Recommended as the default pair after an optimization.",
            [
                "With a network result present, a user can compare two saved Versions from Results (workflow test).",
                "Baseline vs Recommended remains the default after optimization.",
                "Input differences are visible in the same view; the Scenarios disclosure links to it or is removed without losing capability.",
                "Comparing states with different dataset or model identity shows a clear incompatibility notice instead of deltas.",
                "No RF requests are sent by selecting comparison sources (no-hidden-request test).",
            ],
            "No new metrics, no spatial delta layer (tracked separately), no new rail tool.",
            [ln("frontend-react/src/App.jsx", 4545, 4549) + " — Compare branches by result type", ln("frontend-react/src/App.jsx", 4583, 4615) + " — scenario comparison", ln("frontend-react/src/components/ScenarioPanel.jsx", 259, 262) + " — input diff", ln("frontend-react/src/domain/scenarioDiff.js")],
            "None.",
            notes("maintainer-owned", "M", "P2", "none if only existing summaries are compared", "Needs a maintainer decision on picker layout in a 360 px drawer."),
        ),
    },
    {
        "key": "candidates", "candidates": ["CI-06"], "absorbs_findings": ["F05"], "group": "NEXT", "priority": "P2",
        "suitability": "MAINTAINER-OWNED", "kind": "WORKFLOW", "safety": "A",
        "title": "Expose candidate Cell recommendation as an explicit network action",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2"],
        "body": body(
            "Candidate recommendation (find one additional Cell from dataset records inside a drawn area) is an implemented, bounded and documented capability. It is effectively undiscoverable.",
            OBSERVED + "\n\n"
            "- Its only entry point is the fifth Results tab, **Candidates**. After any Pareto optimization the same tab becomes **Solutions** and the recommendation panel is no longer reachable.\n"
            "- Prerequisites are 2–5 selected Cells **and** a drawn search area, but drawing an area auto-selects up to 8 Cells (\"272 towers found, nearest 8 selected\"), which immediately violates the 2–5 limit.\n"
            "- At desktop widths the tab label itself is clipped (\"C…\").",
            "- Add an explicit **Find an additional Cell** action in Network mode, next to the existing network actions, with inline prerequisite status (Cell count 2–5, search area present, 4G/5G).\n"
            "- Give recommendations a Results view that does not share a slot with Pareto Solutions.\n"
            "- Allow keeping or drawing a search area without forcing the 8-Cell area selection (for example a separate \"search area\" mode).",
            [
                "Recommendations are reachable before and after a network optimization (workflow test: optimize → recommend → apply as scenario).",
                "Prerequisites are shown before the action is attempted; unmet ones explain how to satisfy them.",
                "A user with 2–5 selected Cells can draw a search area without their selection being replaced.",
                "Candidate scoring and request payloads are unchanged (request-equivalence test).",
            ],
            "No change to candidate scoring, the 50-record prefilter, the five-option limit or the Recommendation5 cap. No interference in candidate scoring. No site-availability claims.",
            [ln("frontend-react/src/App.jsx", 4449) + " — tab label swaps", ln("frontend-react/src/App.jsx", 4565, 4580) + " — panel replaced by Solutions", ln("frontend-react/src/App.jsx", 2071, 2080) + " — prerequisites", ln("frontend-react/src/App.jsx", 2043) + " — area selection keeps up to 8", ln("frontend-react/src/App.jsx", 4617, 4637) + " — recommendation panel"],
            "None. Results tab changes interact with the desktop collision issue ({dep:map-chrome}).",
            notes("maintainer-owned", "M", "P2", "none — presentation and selection-mode workflow only"),
        ),
    },
    {
        "key": "measurement", "candidates": ["CI-13"], "absorbs_findings": ["F07"], "group": "NEXT", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "WORKFLOW / IA", "safety": "A",
        "title": "Give CSV Measurement Validation a first-class place in Review → Data",
        "labels": ["area: frontend", "area: product-ux", "area: validation", "type: enhancement", "priority: P2", "help wanted"],
        "body": body(
            "Measurement Validation (import up to 5,000 RSRP samples, evaluate residuals and holdout evidence, and explicitly apply a global bias correction) is a documented feature whose apply action changes the canonical plan. The field-validation research in #87–#90 will make it more important, not less.",
            OBSERVED + "\n\n"
            "- The CSV workflow sits inside a collapsed **Research / reference** disclosure in Review → Data, although it is a supported workflow with an explicit canonical action.\n"
            "- Analyze → RF Diagnostics hosts a different campaign-file tool whose region is labeled \"RF diagnostics and measurement validation\". Two different tools share the measurement-validation name.",
            "- Move CSV Measurement Validation out of the Research disclosure into its own first-class section of Review → Data. Do not add a rail tool.\n"
            "- Rename or relabel the RF Diagnostics campaign tool so it is clearly research campaign evidence, distinct from CSV Measurement Validation.\n"
            "- Keep all boundary copy, the six-Cell limit disclosure and the explicit apply confirmation.",
            [
                "CSV Measurement Validation is reachable in two actions from the rail without expanding a Research disclosure.",
                "No two tools or regions share the name \"measurement validation\".",
                "Boundary copy, scope limits, explicit apply and invalidation behavior are unchanged (existing tests pass; workflow test updated for the new location).",
            ],
            "No change to calibration math, eligibility, holdout rules or limits. No new rail tool. No claim of real-world accuracy.",
            [ln("frontend-react/src/App.jsx", 5554, 5575), ln("frontend-react/src/components/MeasurementValidationPanel.jsx", 83, 84), ln("frontend-react/src/features/rf-diagnostics/RFDiagnosticsResearchFeature.jsx"), ln("docs/features.md") + " — Measurement Validation section"],
            "None. Research context: #87, #88, #89, #90 (unchanged by this issue).",
            notes("help wanted", "S", "P2", "none — placement and naming only"),
        ),
    },
    {
        "key": "first-run", "candidates": ["CI-14"], "absorbs_findings": ["F25"], "group": "NEXT", "priority": "P2",
        "suitability": "HELP WANTED", "kind": "WORKFLOW", "safety": "A",
        "title": "Offer the bundled sample planning project from the first-run workspace",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P2", "help wanted"],
        "body": body(
            "The workspace opens with a clear primary action, but nothing says what A.T.O.M produces, and the network workflow — the product's main value — needs several unexplained steps. #78 is creating a reproducible, documented sample plan; this issue makes such a sample reachable from inside the product.",
            OBSERVED + "\n\n"
            "- First load shows the Setup drawer and **Run Sector**, with no statement of purpose or outcome.\n"
            "- The bundled `examples/ankara-sample.atom-project.json` is reachable only by reading README and importing it through the project menu. The current sample is settings-only (no selected Cells or results), so on its own it does not produce a network result.",
            "- When no saved project exists, show a dismissible first-run card: one sentence on what A.T.O.M does, **Run the pre-selected sector**, **Open sample network project**, and a glossary link.\n"
            "- Opening the sample creates a new project and never overwrites existing work.\n"
            "- Use the validated planning fixture produced by #78 (selected Cells, dataset identity). Until it exists, the card can omit the sample action.",
            [
                "The card appears only when no saved project exists; dismissal persists.",
                "Opening the sample creates a separate project; existing projects are unchanged (persistence test).",
                "From first load, a user reaches a network evaluation result in three actions or fewer using the sample.",
                "The sample passes existing import/reliability checks.",
            ],
            "No wizard, tour or modal sequence. No new optimizer behavior or fabricated measurements.",
            [ln("README.md", 180), ln("examples/ankara-sample.atom-project.json"), ln("frontend-react/src/utils/projectFileReliability.test.js")],
            "Depends on #78 for a sample with selected Cells and dataset identity (the card and purpose sentence can land first).",
            notes("help wanted", "S", "P2", "none"),
        ),
    },
    {
        "key": "pareto-chart", "candidates": ["CI-15"], "absorbs_findings": ["F24"], "group": "NEXT", "priority": "P3",
        "suitability": "HELP WANTED", "kind": "WORKFLOW", "safety": "A",
        "title": "Add a trade-off chart to network Pareto solutions",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P3", "help wanted"],
        "body": body(
            "#96 explains what non-dominated alternatives mean. Choosing among them is still hard, because the frontier is presented only as a long list.",
            OBSERVED + "\n\n"
            "An 8-Cell optimization returned **25** solution cards in Results → Solutions. Values are often near-identical (\"Demand 28.3%\" on every card), so the trade-off structure is invisible. Experiments already renders a Pareto SVG; network optimization does not.",
            "- Add a two-objective scatter of the retained frontier with user-selectable axes from the existing objectives, marking Recommended, Selected and Inspected.\n"
            "- Selecting a point inspects that solution (no RF request).\n"
            "- Collapse the list to the top N with a \"show all\" control.\n"
            "- Reuse existing chart helpers where practical.",
            [
                "The chart is keyboard operable and has a text alternative listing plotted solutions.",
                "Selecting a point inspects that solution without RF requests (workflow test).",
                "Plotted values come only from retained solution metrics; no new objectives or scoring.",
            ],
            "No change to Pareto computation, search policy, scoring or the number of retained solutions.",
            [ln("frontend-react/src/App.jsx", 4797) + " — ParetoSolutionsPanel", ln("frontend-react/src/components/ExperimentPanel.jsx", 115, 121) + " — existing Pareto SVG", ln("frontend-react/src/utils/comparisonCharts.js")],
            "None. Follow-up to #76 (closed by #96).",
            notes("help wanted", "M", "P3", "none"),
        ),
    },
    {
        "key": "decision-compare", "candidates": [], "audit_opportunity": "O16", "group": "LATER", "priority": "P2",
        "suitability": "MAINTAINER-OWNED", "kind": "NEW FEATURE", "safety": "B",
        "title": "Show where two compatible plans differ with a spatial served-state comparison",
        "labels": ["area: frontend", "area: backend", "area: api", "area: product-ux", "type: enhancement", "priority: P2"],
        "body": body(
            "Defending a recommendation needs *where*, not only *how much*: which demand becomes served, which is lost, and where overlap changes. Today comparisons are aggregate KPI deltas only.",
            "Network evaluation and optimization responses return aggregate counts (`unique_demand_buildings`, `unique_residential_buildings`, `overlap_buildings`, scores) but no per-building served state, so the frontend cannot draw differences between two plans. Results → Compare shows numeric deltas only.",
            "**Class B — bounded semantic change** (API addition, no new physics). MVP:\n\n"
            "- For two compatible network results with **identical dataset and model fingerprints**, show a map layer with demand buildings **newly served**, **newly lost** and **overlap changed**, with counts.\n"
            "- Backend: a bounded, opt-in per-building served/overlap classification in network evaluation responses, or a deterministic comparison endpoint, within existing response and request budgets.\n"
            "- Include the delta counts and a static map in the report comparison section.",
            [
                "Delta classes are computed only when both results share dataset and model fingerprints; otherwise a clear incompatibility notice is shown.",
                "Per-building data is opt-in, bounded and covered by OpenAPI schema and response-bound tests.",
                "Delta counts reconcile exactly with the aggregate KPI deltas for the same pair (tests).",
                "The map layer has a legend and is reachable from the unified Compare view.",
            ],
            "No new RF physics, no cross-model or cross-dataset comparison, no SINR deltas in the MVP, no animation.",
            [ln("backend-go/raytracer/static_simulation.go", 155, 170) + " — aggregate network stats", ln("backend-go/raytracer/static_simulation.go", 212, 223) + " — network response", ln("frontend-react/src/App.jsx", 4545, 4549) + " — current Compare"],
            "Depends on {dep:compare} (unified comparison surface).",
            notes("maintainer-owned", "L", "P2", "bounded — API addition; must not alter served/overlap classification"),
        ),
    },
    {
        "key": "aoi", "candidates": [], "audit_opportunity": "O17", "group": "LATER", "priority": "P2",
        "suitability": "MAINTAINER-OWNED", "kind": "NEW FEATURE", "safety": "B",
        "title": "Report network KPIs inside one drawn area of interest",
        "labels": ["area: frontend", "area: backend", "area: api", "area: product-ux", "type: enhancement", "priority: P2"],
        "body": body(
            "Planners are often asked whether a plan serves a specific district, not the whole footprint. A.T.O.M already draws bounded polygons for selection and candidate search, but KPIs are network-wide only.",
            "Network results report served demand weight, residential buildings and overlap for the whole evaluated domain. The drawn polygon is used only to select Cells or to restrict candidate search; it cannot scope KPIs.",
            "**Class B — bounded semantic change** (aggregation only). MVP:\n\n"
            "- Allow one bounded area of interest (reusing existing polygon limits) on network evaluation and optimization summaries.\n"
            "- Report served demand weight, residential buildings served and overlap inside the area, next to network-wide values, and in reports.\n"
            "- Backend: an optional `aoi` filter on summary aggregation; no change to the evaluated domain or scoring.",
            [
                "With an area set, Results shows inside-area KPIs beside network-wide KPIs; without one, nothing changes.",
                "Inside-area values are a subset aggregation of the same per-building results (tests with fixtures where the area covers all, none and part of the domain).",
                "The polygon is validated with existing vertex and size bounds; OpenAPI documents the optional field.",
                "Optimization objectives and scores are unchanged by the area.",
            ],
            "No area-driven optimization objective, no multiple areas, no imported GIS boundaries or general GIS editing.",
            [ln("frontend-react/src/App.jsx", 2034, 2058) + " — existing polygon", ln("backend-go/raytracer/static_simulation.go", 155, 170) + " — aggregate stats", "Closed #16 — polygon complexity bounds"],
            "None (benefits from {dep:compare} for side-by-side display).",
            notes("maintainer-owned", "M", "P2", "bounded — aggregation of existing results only"),
        ),
    },
    {
        "key": "site-template", "candidates": [], "audit_opportunity": "O18", "group": "LATER", "priority": "P3",
        "suitability": "MAINTAINER-OWNED", "kind": "NEW FEATURE", "safety": "B",
        "title": "Place and manage co-located multi-sector Cells as one site group",
        "labels": ["area: frontend", "area: persistence", "area: product-ux", "type: enhancement", "priority: P3"],
        "body": body(
            "Real layouts usually add a site with several sectors. The glossary (#80) defines site versus Cell, but the inventory supports only individual Cells.",
            "Adding a three-sector site takes three **Place new Cell** actions plus position and azimuth edits per Cell. Co-located Cells cannot be moved or edited together.",
            "**Class B — bounded semantic change** (inventory and schema grouping). MVP:\n\n"
            "- **Place site** creates N co-located Cells (default 3 at 0/120/240°) that share position and move together; each remains an ordinary Cell in every request.\n"
            "- Group membership is an optional field in the inventory and project schema; ungrouping restores independent Cells.",
            [
                "Placing a site creates N Cells with the chosen azimuths; RF requests contain N ordinary Cells (request-equivalence test).",
                "Moving the group moves all members; editing one member's RF profile does not change the others unless explicitly applied to the group.",
                "Projects with groups round-trip through export/import; older files without groups import unchanged.",
                "Copy follows the glossary and makes no feasibility, ownership or cost claim.",
            ],
            "No shared-antenna or co-siting physics, no mast-height optimization, no site cost, ownership or permitting.",
            [ln("frontend-react/src/components/InventoryPanel.jsx"), ln("frontend-react/src/domain/inventory.js"), ln("docs/terminology.md"), ln("docs/project-format.md")],
            "None.",
            notes("maintainer-owned", "M", "P3", "bounded — schema grouping; must not imply physical site feasibility"),
        ),
    },
    {
        "key": "review-package", "candidates": [], "audit_opportunity": "O19", "group": "LATER", "priority": "P3",
        "suitability": "HELP WANTED", "kind": "NEW FEATURE", "safety": "A",
        "title": "Export a local review package for the current Version",
        "labels": ["area: frontend", "area: product-ux", "type: enhancement", "priority: P3", "help wanted"],
        "body": body(
            "Handing a decision to a reviewer currently means several separate downloads (report, project file, optional GIS files) that the reviewer must reassemble and trust.",
            "Report HTML/Markdown and the project file are downloaded separately, with no shared manifest tying them to one Version, dataset and model identity.",
            "**Class A — product-safe.** MVP:\n\n"
            "- **Export review package** produces one local zip for the current saved Version containing the HTML report, Markdown report, project file, a map image and a `manifest.json` (file SHA-256 hashes, dataset/model identity, Version/Run lineage, limitations text).",
            [
                "The package is generated locally from existing artifacts with no RF request (no-hidden-request test).",
                "The manifest's hashes match the contained files; its lineage matches the report source.",
                "Filenames follow the shareable-download naming rule.",
                "Unsaved drafts are refused with guidance to save a Version first.",
            ],
            "No hosted sharing, links or accounts. No cryptographic signing requirement. No new report content.",
            [ln("frontend-react/src/utils/reportExport.js"), ln("frontend-react/src/repository/artifactStore.js"), ln("frontend-react/src/components/WorkspaceChrome.jsx", 233, 248)],
            "Depends on {dep:shareable} (naming and report content).",
            notes("help wanted", "M", "P3", "none — repackages existing provenance"),
        ),
    },
]

DISPOSITIONS = [
    # candidate, disposition, issue key or None, rationale, duplicate_of, folded_into
    ("CI-01", "VALID", "fit", "Map never fits to results; merged with the Interference completion handoff (same 'where is my result' fix).", None, None),
    ("CI-02", "VALID — SPLIT", "interpret", "Interpretation copy needs maintainer review; presentation defects split into a good-first bundle so they are not blocked.", None, None),
    ("CI-03", "VALID", "adopt", "Apply disabled after default draft optimization; the workflow test itself saves a Version first.", None, None),
    ("CI-04", "VALID", "continuity", "Reload shows 'Run needed' / 'Ready · UNAVAILABLE'; needs a binding design (foundation).", None, None),
    ("CI-05", "VALID", "compare", "Compare branches by result type; scenario comparison unreachable with network results.", None, None),
    ("CI-06", "VALID", "candidates", "Tab replaced by Solutions after optimization; prerequisites conflict with area selection.", None, None),
    ("CI-07", "SHOULD MERGE WITH ANOTHER CANDIDATE", "shareable", "Same artifact surface and validation path as report content fixes.", None, None),
    ("CI-08", "VALID", "shareable", "Duplicated sections, inline SVG and lineage contradiction confirmed in report source.", None, None),
    ("CI-09", "VALID", "state-language", "Mode switch invalidates results; hash-first labels; Version wording drift.", None, None),
    ("CI-10", "VALID", "errors", "Raw 'Failed to fetch' / 'internal error'; no aria-invalid; misdirected prompt.", None, None),
    ("CI-11", "VALID", "map-chrome", "Legend swallows drawing clicks; 1280 overlap; tab overflow at all widths.", None, None),
    ("CI-12", "VALID", "a11y", "No Escape handler; label-in-name mismatch; duplicate names.", None, None),
    ("CI-13", "VALID", "measurement", "CSV workflow inside Research disclosure; name collision with campaign tool.", None, None),
    ("CI-14", "VALID", "first-run", "No orientation; sample only via README; depends on #78 fixture for a network result.", None, None),
    ("CI-15", "VALID", "pareto-chart", "25 cards without a chart; promised as a follow-up when closing #76.", None, None),
    ("CI-16", "SHOULD MERGE WITH ANOTHER CANDIDATE", "polish-results-copy", "Copy-only polish sharing surfaces and risk with unit/zero-gap fixes.", None, None),
    ("CI-17", "SHOULD MERGE WITH ANOTHER CANDIDATE", None, "Workflow tests already belong in each issue's acceptance criteria; visual baselines folded into the map-chrome issue and the accessibility smoke check into the keyboard/naming issue.", None, "map-chrome + a11y"),
]
