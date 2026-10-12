# Concept 7F — A.T.O.M Workspace, Information Architecture & Product UX Audit

Date: 2026-09-22
Scope: documentation-only product and UX audit of the Concept 7E working tree
Decision: select exactly one evidence-supported Concept 7G; do not implement it here

## Executive verdict

A.T.O.M is still a map-first RF planning workspace. The map is visually dominant at 1440px and 1280px, the primary action remains a visible Run Sector control, and the rail/drawer pattern keeps planning tools adjacent to spatial evidence. The product does not yet need a project dashboard or a wholesale shell rewrite.

The product has, however, crossed the point where feature inventory alone is a sufficient information architecture. The most consequential gap is state lineage: the application stores Project → Scenario → Version → Run → Report relationships, but the active Scenario and Version are not persistently visible in the header, and a current result, a stale result, and a historical result do not share a single explicit vocabulary. A user can usually find the right object, but must remember where to look and infer which context owns it.

The second gap is density. Setup, Propagation, RF Diagnostics, and Data each combine a primary planning job with specialized or research-level material. This preserves capability but makes the normal planning path compete with 140 GHz reference inputs, measurement campaigns, material slabs, facade diagnostics, dataset-pack QA, and model assumptions.

Concept 7G should therefore be **Results, Lineage & Stale-State UX**: make the current working draft, current Run, historical Run, source Version, and stale state explicit in the existing shell, without changing RF, optimization, persistence, or API semantics. This is the highest-value next phase because it reduces the risk of inspecting, applying, or reporting the wrong state across the entire plan → simulate → optimize → review loop.

## Audit method and evidence boundary

The audit combined:

- source inspection of frontend-react/src/App.jsx, WorkspaceChrome.jsx, workspaceTools.js, major panels, hooks, and styles.css;
- a production build and bundle inspection;
- rendered UI inspection at 1440×900, 1280×800, 1024×768, and 640×900;
- accessibility-tree inspection of the live local app at http://localhost:8080;
- repository and runtime evidence from the existing dirty Concept 7E working tree.

The 640px observation used DOM geometry because the browser preview was visually scaled. At that width the map stage was 640px wide, the bottom-sheet drawer was 620px high, the toolbar occupied roughly 582px, and the layer menu extended about 114px beyond the viewport. These are observations, not user telemetry. Interaction counts below are task-model estimates, not instrumented analytics.

The audit deliberately does not modify application code, RF behavior, optimization behavior, Project/Scenario semantics, Run History, Report Artifact storage, IndexedDB schemas, or API contracts. The complete frozen snapshot is in [concept-7f-pre-change-baseline.json](concept-7f-pre-change-baseline.json).

## 1. Current application shell

The shell is a single-page route at /. #planning-map is an accessibility anchor; stage, tool, results view, map layer, scenario, and run selection are application state rather than URL routes.

| Region | What it contains | Scope |
| --- | --- | --- |
| Command bar | A.T.O.M brand, Project menu, compact cell/RF context, modeling-limits link, run status, save state, Run Sector, global errors | Global plus project/run context |
| Workflow rail | Plan, Simulate, Analyze, Review; Analyze may carry an unavailable/attention badge | Global navigation |
| Tool drawer | Tool title/subtitle, subnav, long scrollable contextual panels, drawer errors, undo toast | Stage/tool scoped |
| Map stage | Leaflet map, cell markers, buildings, signal/rays/coverage/interference/measurement layers, feature inspectors | Map and result scoped |
| Map toolbar | Selection, RF display, scope, focus, layers | Map scoped |
| Map legend | Cells, received power, surface, gaps, radio-quality scales | Map scoped |
| Project menu | Project CRUD/import/export plus Scenarios / Versions and Save version | Project and Scenario scoped |
| Review tools | Results, Run history, Data, Report | Run, dataset, and report scoped |

The hierarchy is directionally sound: global controls stay in the header, spatial controls stay over the map, and detail stays in the drawer. The mismatch is that Scenario/Version identity is treated as a drawer/menu detail even though it changes the meaning of every Run, result, and Report.

There is no persistent footer in the observed shell. Run/save status, global errors, panel alerts, and the undo toast serve as the status area. The Project menu is an in-flow dialog/popover, while the tool drawer is a modeless dialog-shaped surface; both need one consistent keyboard/focus contract in a later accessibility pass.

## 2. Primary user journey

The current intended journey is:

1. Open A.T.O.M and let the local dataset load.
2. Open the Project menu or continue in the active project.
3. In Plan → Setup, choose Single or Network mode, technology/profile, propagation model, and TX power.
4. In Plan → Inventory, search/select cells, place or import cells, and edit a per-cell RF profile.
5. Configure normal propagation inputs in Simulate → Propagation.
6. Run Sector or evaluate the network.
7. Inspect cells, rays, signal, gaps, and radio-quality layers on the map; use Results for tabbed metrics.
8. If needed, configure objectives and constraints, choose a search policy, optimize, inspect a recommendation or Pareto solution, and apply it as a new Version or branch.
9. Return to Project/Setup to save a Version and compare or reopen it later.
10. Review Run history and generate a Report, then revisit the source Version or Run.

The shortest single-cell path has roughly ten major intent changes and four to six context switches. A complete network/optimization/report path commonly expands to approximately 20–30 discrete control actions. The count is not the problem by itself: the problem is that several actions require the user to cross from the map to a drawer, from a result to a versioning menu, or from a historical Run back to a source Scenario without a persistent lineage cue.

### Ambiguous moments and hidden dependencies

- The active Project is visible in the header, but the active Scenario and Version are not.
- Setup contains both RF configuration and a Scenario workspace, so a user can read “Save a Version” as a planning action or a persistence action without a stable context label.
- “Plan changed” correctly signals invalidated current results, but does not name the Version or Run that became stale.
- Results, Run history, Report, and Scenario revision detail each provide part of the source-linking story. The pieces are accurate but distributed.
- Interference is visibly unavailable in some states, but the prerequisite relationship is easier to infer from the badge and empty copy than from a consistent readiness model.
- A user can select a historical Run and apply a solution as a new Version or branch, but the target Scenario is not continuously visible while making that choice.
- The first-run empty states generally name a next action; a few later-detail empty states describe what will happen after selection even when nothing can be selected yet.

## 3. Navigation assessment

The four-stage rail is still understandable and matches the broad workflow:

~~~text
Plan      → Simulate      → Analyze      → Review
Setup       Propagation     Interference   Results
Inventory   Experiments     RF Diagnostics Run history
            Signal surface  Building entry Data
                            5G Core        Report
~~~

It is not a page hierarchy in the traditional routing sense. It is a lens over one map workspace. That is a good fit for spatial planning, but it means the rail must communicate scope and state exceptionally well because the browser cannot restore a deep stage/tool URL.

### Stage assessment

- **Plan** is accurate for Setup and Inventory.
- **Simulate** is accurate for Propagation, Experiments, and Signal surface, but it also contains research/reference computations that are not ordinary simulation setup.
- **Analyze** accurately contains Interference, diagnostics, Building entry, and Core Lab, but “Analyze” mixes operational radio analysis, validation evidence, and a core-network lab.
- **Review** correctly owns Results, Run history, Data, and Report. Data is the outlier: it is both project/dataset context and a long technical assumptions/validation reference.

Users frequently need to move backwards: after Results they return to Inventory, Propagation, Setup, or Scenario/Version actions. The rail supports this, but the current result/source context does not travel with the user.

**Assessment:** keep the current stage model for the next phase. It is a usable product map; it needs clearer context and progressive disclosure before it needs replacement.

## 4. Project / Scenario / Version hierarchy

Concept 7E made the hierarchy real and durable:

~~~text
Project
  → Scenario
    → Version
      → Run
        → Report / retained artifact
~~~

The hierarchy is understandable after a short explanation, but not yet self-explanatory at the point of action.

- Project actions live in the header menu: rename, new, duplicate, delete, import, export.
- Scenario switching, rename, duplicate, delete, Version history, branch, continue, and comparison live in the Setup Scenario panel.
- Save Version is present in both the Project menu and Scenario panel.
- Run History and Reports live under Review, with linked source actions in their detail views.

Scenario/Version state belongs at **header level for identity**, **Setup for editing**, and **Review for lineage inspection**. The current product has the latter two but not the first. Moving all management into the header would consume too much primary workspace; hiding identity entirely in Setup is the more serious problem.

## 5. Map density and visual hierarchy

The map is not a decorative background. At desktop widths it is the largest continuous surface, carries the cell inventory, and receives the result layers. That is the strongest evidence for retaining MAP-FIRST.

### Map controls by necessity

| Control | Classification | Finding |
| --- | --- | --- |
| Draw selection area | Always necessary for network planning | Correctly grouped with map selection |
| Clear selected cells | Contextual | Should remain near selection tools |
| Fit selected cells | Contextual | Useful, but not a first-run control |
| Signal / Rays | Always necessary after a Run | Clear toggles; current-result dependency matters |
| Scope | Contextual | Powerful and understandable when a result exists |
| Focus selector | Contextual | Useful for large inventories, but competes for toolbar width |
| Layers | Contextual/advanced | Correctly grouped, but its menu can overflow at narrow widths |
| Legend | Always useful when a layer is visible | Good map-side explanation; should reflect stale/current state |
| Buildings / gaps / paths / residuals | Contextual to diagnostic | A layer-priority rule is needed as simultaneous overlays accumulate |

The desktop toolbar is dense but not yet visually chaotic. The main failure is responsive: at 1024px right-edge controls crowd or clip, and at 640px the toolbar and layer menu exceed the available width. A future layer-priority rule should preserve selected/focused cell identity above decorative or secondary diagnostic layers, then surface a single active result legend before comparison overlays.

## 6. Panel and drawer density

The long drawer is the main productization debt:

- **Setup:** ControlPanel and ScenarioPanel combine “how should RF run?” with “how should this work be saved?”
- **Inventory:** a 451-cell list and a long per-cell editor share one scroll context. Editing one cell is possible, but bulk actions and provenance are not prominent.
- **Propagation:** common ray/coverage settings are immediately followed by vertical path profile, Sub-THz atmospheric reference, and ITU-R P.1411 candidate reference panels.
- **RF Diagnostics:** evidence campaign loading is followed by measurement validation, material reference, and specular reflection inputs.
- **Data:** Demand Surface, Installed Dataset Packs, propagation assumptions, field measurement validation, and calibration are all in one Review tool.
- **Results:** five result views are compact at wide desktop but wrap at 1024px.

These panels are not individually incorrect. They are trying to serve multiple personas and states in one primary scroll context. The evidence supports progressive disclosure and a research boundary; it does not yet support a broad shell rewrite or moving every advanced tool into a new top-level stage.

## 7. Inventory and planning UX

Inventory is discoverable under Plan and its purpose is clear: place, import, search, select, and edit cells. The selected-cell editor exposes the RF profile, receiver sensitivity, validation, and provenance source. A technical user can understand which cell is active.

Friction remains:

- only the first 250 matching cells are rendered, which is reasonable for scale but needs stronger count/virtualization language;
- list selection and map selection are related but not always represented as one explicit “active cell” state;
- the editor is optimized for one-cell precision, not bulk planning;
- scenario overrides and dataset/inventory values are technically distinguished in the model, but the editor does not make that distinction equally visible for every field;
- provenance is summarized by source labels rather than presented as a lightweight per-field or per-profile lineage cue;
- import/place/duplicate/delete are all present, but their safety and scope are not equally obvious.

Bulk editing is a legitimate future need for a regular planner, but it is a larger product decision than a quick polish. It should follow the selected 7G state/lineage work rather than precede it.

## 8. RF configuration UX

The common planning inputs are recognizable:

- planning mode;
- 4G LTE, 5G mmWave, or 6G research profile;
- propagation model;
- TX power;
- sector geometry and beam controls;
- receiver and antenna profile.

The advanced physical inputs are also scientifically meaningful: path profile, loss budget, link budget, atmospheric components, material reflection/transmission, and facade references. The problem is not accuracy. The problem is that a normal planning user encounters reference-level controls in the same vertical flow as ordinary propagation configuration.

The evidence supports a conceptual three-level boundary:

1. **Planning:** common mode, technology, profile, power, radius, azimuth, beam, and explicit Run.
2. **Advanced analysis:** path profile, link budget, interference, building entry, and explainability.
3. **Research / validation:** 140 GHz references, P.1411 candidate studies, campaigns, material slabs, specular reflection, and Core Lab.

This audit does not implement the disclosure.

## 9. Simulation UX

The configure → run → loading → result → map inspection loop is present. runState includes explicit states such as Loading surface, Evaluating, Simulating, Optimizing, Analyzing, Validating, Plan changed, and Ready. Result summaries and map prompts provide multiple cues, and several result-dependent panels use status/alert roles.

The weak point is identity, not activity. The UI communicates that work is running, but it does not always communicate the exact Version/Run identity of the result in the same place. A user can see a current RF result, then open a historical Run or a Report, and must use detail panels to reconcile the source.

Simulation should keep its explicit primary action and local progress/status. Concept 7G should add lineage around the result rather than alter compute semantics.

## 10. Stale-result communication

RF-affecting edits call invalidatePlanResults, clear rendered result artifacts, set planDirty, and expose “Plan changed” / “Run sector…” guidance. This is a sound behavior boundary. It prevents a stale map result from silently appearing current.

The communication is incomplete:

- the stale cue is a general status, not an explicit “current result was Run X for Version Y” comparison;
- “Saved locally” and “Plan changed” can both be true, but their relationship is not expressed as “saved draft, no current result”;
- historical results are available through Run History, but historical identity is mostly inside the Review detail;
- report generation can be bound to an exact saved revision/source Run, but this is not a persistent header-level fact;
- a user applying a historical optimization solution sees an action path, but the destination Scenario/Version needs stronger confirmation.

The required conceptual state vocabulary is **Current**, **Stale / out of date**, **Historical**, **Unavailable**, and **Unsupported**. The implementation already has pieces of this vocabulary; the next phase should make it coherent and non-color-dependent.

## 11. Optimization and Pareto UX

The optimization flow is scientifically and operationally credible:

~~~text
Objectives / priorities
  → Feasibility constraints
    → Search policy
      → Optimize
        → Recommendation
          → Pareto alternatives
            → Inspect solution
              → Apply as new Version or branch
~~~

Strengths:

- priorities and feasibility constraints are presented as different concepts;
- the Feasibility constraints disclosure is a useful progressive-disclosure pattern;
- baseline, optimized, recommended, selected, and Pareto states exist as meaningful domain concepts;
- application is explicit: apply as a new Version or branch;
- Run History and Scenario revision detail preserve source context.

Friction:

- search-policy terminology is specialist and can appear before the user has a mental model of objective trade-offs;
- Pareto Explorer can present objectives, scores, raw metrics, feasibility, ranking, and priority reranking in one dense view;
- recommended versus selected versus Pareto alternatives needs a compact status legend;
- applying a solution is discoverable once a user reaches the solution detail, but not necessarily from the primary optimization affordance;
- comparisons are available, but the user must understand both Scenario and Version to interpret them.

Do not simplify the scoring or merge terms that are scientifically deliberate. Prefer expandable metric detail and persistent solution/source identity in a future phase.

## 12. Run History UX

Run History is discoverable under Review and is correctly described as durable local simulation and optimization records. It distinguishes succeeded, failed, cancelled, running, and interrupted records; it can open the source Version, rerun, generate a report, and apply a retained optimization solution.

It does not duplicate the Results view exactly: Results is a current-operation inspection surface, while Run History is a durable record surface. The distinction is good, but the names and empty state could do more work for a non-developer:

- “compact execution records” and “retained identity” are implementation-aware terms;
- the empty state says “Select a run to inspect…” when no Run exists;
- the Run detail makes provenance secondary but still available, which is appropriate;
- historical data-unavailable messaging is honest and useful.

Run History should remain primarily under Review, with contextual links from Results and Scenario Version detail.

## 13. Reports UX

Reports feel like outputs of planning work: the Report panel describes the selected tower, beam direction, RF KPIs, demand hits, gap summary, and portable map preview. The report can be exported as PDF/Print or Markdown and is bound to an exact saved revision/source Run when available.

The main friction is terminology leakage:

- ordinary users see “retained report artifacts,” artifact counts, generator metadata, hashes, and evidence status;
- this is valuable for a reviewer or technical evaluator but too implementation-shaped for the default report task;
- the generation entry point under Review is sensible, and Run History/Scenario detail links are useful;
- the distinction between a live current report and a retained historical report is accurate but should be named in user language.

Keep artifact metadata available on demand. Lead with Reports, source Version, source Run, generated time, and download actions.

## 14. Research-feature boundary

The following are primarily diagnostic, scientific, experimental, reference-only, 140 GHz research, validation, or lab features:

- vertical path profile and diffraction ledger;
- Sub-THz atmospheric reference with P.676/P.838/P.840 inputs;
- ITU-R P.1411 candidate reference;
- measurement-validation campaign loading and residual analysis;
- material and facade reference;
- specular reflection reference;
- Core Lab Xn/N2/N3/session scenarios;
- installed dataset-pack QA and hashed-file inspection;
- field measurement validation and calibration;
- experiment matrix/Pareto exploration beyond ordinary single-run planning.

These features are not hidden, but their placement in Propagation, RF Diagnostics, and Data means they interfere with the core planning flow. A Planning / Analysis / Research boundary is justified by actual density, but it should be introduced as progressive disclosure or a clearly marked research context, not as a new architecture or domain model in this audit.

## 15. Terminology audit

The terminology file [concept-7f-terminology-audit.json](concept-7f-terminology-audit.json) records the full inventory. The important decisions are:

- Preserve **coverage**, **propagation reach**, **signal surface**, and **serviceability** as different concepts. Add short explanations rather than flattening them.
- Keep **Project → Scenario → Version** as the durable hierarchy; do not rename Version to “snapshot” in ordinary user flows.
- Keep **Run** for an executed simulation/optimization record, but explain it as “a saved computation record” at first exposure.
- Prefer **Reports** in primary navigation; reserve “artifact” for the retained-output detail.
- Use **cell** for the radio inventory entity and **tower/site** only when the UI is specifically describing the physical placement or site context.
- Distinguish **baseline**, **optimized**, **recommended**, and **selected**. These are not interchangeable states.
- Rename or explain “Planning estimate” as a model-limitations or model-confidence affordance; the current text is ambiguous.

## 16. Empty and error states

### Strong states

- No current RF result tells the user to run the selected sector or evaluate the network.
- Signal surface available/loading/error states explain the dependency and retry path.
- No durable Runs explains that records stay local.
- Dataset-unavailable historical messaging explains that inspection remains possible while rerun is disabled.
- Invalid inventory profiles state how many fields must be fixed before RF analysis.
- Measurement validation states use status/alert roles and describe campaign or synthetic-control paths.

### Gaps

- No saved Version says to save the current plan to create a comparison baseline, but does not explain whether the user should save a Scenario first or where the active Version will appear.
- Run History’s no-record view includes “Select a run to inspect…” although no selection exists.
- Report’s no-artifact view is honest but leads with retained artifact language.
- A project/no-cells path should keep a single obvious map-to-Inventory action visible when the dataset is present.
- Unsupported 6G/research and unavailable diagnostics need consistent text labels in addition to rail badges.

Technical errors are generally visible and honest, but raw error messages may still feel like implementation output when they surface directly in the global banner. The future standard should be: what happened, what is safe to do, and whether the current data remains valid.

## 17. Status communication

The current status vocabulary is richer than the visual hierarchy:

| State | Current evidence | Assessment |
| --- | --- | --- |
| Saved | “Saved locally” in header and status roles | Clear, but does not identify Scenario/Version |
| Unsaved | Scenario panel “Unsaved changes” | Clear only inside Setup |
| Running | Simulating/Optimizing/Evaluating/etc. | Strong activity language |
| Failed | Error banners and panel alerts | Useful, but global messages can be technical |
| Interrupted | Run History label | Correct but historical-only |
| Historical | Run/Report source detail | Available on demand, not persistent |
| Stale | “Plan changed” and cleared results | Behavior is safe; label should be more explicit |
| Unavailable | rail !, disabled actions, copy | Often clear, sometimes symbol-heavy |
| Unsupported | model/profile notes and disabled actions | Needs a consistent plain-language label |
| Research only | 6G note and reference panel copy | Present, but not a product-wide status concept |

Do not rely on color. Text, scope, source, and action should travel with the state. Rail badges should supplement, not carry, readiness meaning.

## 18. Visual hierarchy

The visual language is restrained and appropriate for a technical command center: a pale map/workspace background, white panels, teal/blue action accents, explicit warning/error colors, restrained shadows, and visible focus rings. The map remains the strongest continuous surface.

Recurring problems:

- panel headers and all-caps micro-labels create a dense scan pattern;
- nested cards are frequent in Setup, Data, Reports, and Diagnostics;
- many borders separate information that could be grouped by hierarchy;
- the two-pixel teal scenario-diff stripe is a small side-stripe anti-pattern in an otherwise restrained system;
- header density drops abruptly at 1024px as several context items disappear;
- icon-only map actions rely on tooltip/aria context and need consistent visible grouping;
- no dark-mode system or theme variant was found, so the token layer is useful but not yet a full theming system.

These are audit findings, not a styling change request.

## 19. Map visual hierarchy and layer rules

At one time the map may contain cells, selected/focused cells, buildings, demand, signal surface, rays, gaps, interference, measurement residuals, and comparison overlays. The current legend helps, but simultaneous layers can become unreadable because the map is the only persistent spatial canvas.

Proposed rules for later implementation:

1. selected and focused cells always outrank all other markers;
2. the active current-result layer outranks secondary diagnostic layers;
3. historical/comparison overlays must be explicitly labeled and visually subordinate to current state;
4. buildings and demand remain quiet context layers unless a tool makes them primary;
5. the legend should state the result identity and stale/historical status when a result layer is shown;
6. research overlays should never silently replace the canonical RF layer.

## 20. Desktop widths

| Width | Evidence | Product judgment |
| --- | --- | --- |
| 1440px | Full header context, 88px rail, roughly 360px drawer, map remains dominant; Setup is readable | Supported primary workspace |
| 1280px | Header and drawer remain usable; map is still central | Supported primary workspace |
| 1024px | Header hides context, toolbar crowds/clips, result tabs wrap, advanced drawers feel dense | Minimum desktop inspection width, not comfortable full planning |

Charts and result ledgers are readable at wide desktop. At 1024px, tab wrapping and drawer density compete with chart/detail space.

## 21. Tablet and narrow boundary

At <=640px the product intentionally becomes a map plus bottom rail and bottom-sheet drawer. That is a reasonable inspection fallback, not evidence that the full desktop planning workflow is mobile-ready.

Realistic boundary:

- **>=1280px:** full planning, analysis, optimization, and review workflows;
- **1024px:** usable desktop with reduced context; expect crowding in advanced tools;
- **640–1023px:** map inspection and focused edits are possible, but full inventory and research workflows are high-friction;
- **<640px:** best-effort map inspection, selection, and small focused actions; do not promise full planning or report authoring.

The layer menu overflow at 640px and toolbar crowding at 1024px are concrete responsive defects worth addressing in a later shell-quality pass.

## 22. Accessibility findings

Positive evidence includes a skip link, visible :focus-visible styles, labelled controls, status and alert regions, listbox/options for inventory, tabs for result views, graphic labels for several charts, and 44px narrow-layout control sizing.

Concrete risks:

- ToolDrawer uses a native dialog element with aria-modal=false as a modeless drawer. Focus containment, initial focus, and return-to-trigger behavior were not evident from the inspected implementation.
- The project menu uses a dialog role but is opened as an in-flow popover; keyboard escape, outside-click, and focus restoration should be tested as one pattern.
- Map markers and visual layers do not provide a complete keyboard-equivalent list of spatial evidence.
- Rail badges and icon-first controls can communicate state through symbol/color before text; state text must remain available to assistive technology and sighted users.
- Because state is not URL-addressable, refresh/back/deep-link recovery is weak for all users, including keyboard and assistive-technology users.

Technical health score (0–4 per category, where 4 means healthy): Accessibility 2/4, Performance 2/4, Responsive 2/4, Theming 2/4, Anti-pattern risk 3/4; total **11/20, acceptable with clear product debt**. This score is a supporting engineering health signal, not a replacement for the product findings.

## 23. Performance perception

The map/dataset experience is likely to feel heavier than a conventional CRUD app because 451 cells, a large building dataset, Leaflet rendering, and optional result overlays are all part of the workspace. The app does provide useful run/status language, result-dependent loading/error states, and local persistence feedback.

Perceived-performance gaps:

- initial load pays for the entire feature surface, including reference and research modules;
- map load and dataset changes do not share one visible progress model;
- Scenario switching can restore a snapshot and may require rerun to restore uncached map layers; this is explained after the switch but not as a persistent lifecycle;
- Run History and Reports are local stores and should feel fast, but opening their detail can expose large metadata surfaces without a skeleton or compact summary;
- optimization has explicit activity states but its result/recommendation/Pareto transition is dense.

Measure first in a later phase. Do not optimize solely to silence the Vite warning.

## 24. Bundle warning and code-splitting opportunities

The production build reports:

- JavaScript: 921.62 kB raw, 252.89 kB gzip, one main chunk, above Vite’s 500 kB warning threshold;
- CSS: 137.77 kB raw, 26.63 kB gzip;
- the generated JS is a single eager application chunk.

App.jsx eagerly imports MapCanvas, experiments, path profile, Sub-THz, P.1411, measurement validation, material reference, specular reflection, Core Lab, report export, artifact handling, and the rest of the workspace. Leaflet/react-leaflet and the rich research surface are plausible contributors, but a module-level attribution report was not generated, so the audit does not claim an exact largest-module ranking.

Classification: **worth code splitting and measurable for startup, not an emergency and not the primary Concept 7G.**

Safe future candidates, in priority order:

1. research/reference panels loaded only when the relevant tool is opened;
2. report generation/export code loaded only when Report is opened or export is requested;
3. experiment/Pareto explorer loaded only when Experiments is opened;
4. Core Lab and measurement-validation tooling loaded only in their specialized contexts.

Lazy loading should preserve local state and explicit loading/error copy. It should not be introduced as a drive-by change during the lineage phase.

## 25. User task matrix

The complete structured matrix is in [concept-7f-task-matrix.json](concept-7f-task-matrix.json). The high-level pattern is:

| Task | Current entry point | Main friction |
| --- | --- | --- |
| Create network | Plan → Setup → Network, then Inventory | Project/Scenario identity and cell readiness are split |
| Import cells | Plan → Inventory → Import | Good discoverability; provenance and bulk follow-up are weaker |
| Modify RF | Setup/Inventory/Propagation | Common and research controls share a drawer |
| Compare scenarios | Setup Scenario workspace or Project menu versions | Requires learning Version terminology |
| Simulate | Header Run Sector or network evaluation | Run is explicit; source Version is not persistent |
| Diagnose poor service | Map layers/Results, then Analyze tools | Diagnostic boundary is broad and dense |
| Optimize | Propagation/optimization controls | Search policy and priorities require specialist context |
| Explore Pareto | Simulate → Experiments / Results | Rich but dense; ranking and selection are easy to conflate |
| Produce report | Review → Report or Run History | Artifact terminology and source selection need clarification |
| Revisit previous Run | Review → Run history | Discoverable; opening the exact source context requires several steps |

## 26. Persona boundary without marketing personas

This audit uses actual complexity bands:

- **First-time technical user:** needs a visible next action, current Project/Scenario/Version identity, a short planning path, and a reason when a tool is unavailable.
- **Regular planner:** needs fast inventory editing, repeatable Run → inspect → revise loops, bulk actions eventually, and trustworthy stale/current labeling.
- **Advanced/research user:** needs full ledgers, evidence campaigns, reference clauses, 140 GHz inputs, and provenance detail without losing access to the canonical planning workflow.

Progressive disclosure is the right boundary because all three groups are real users of the same product; separate dashboards or separate products are not yet justified by the observed shell.

## 27. Workspace concept assessment

A persistent workspace shell is already present in practice:

~~~text
Header: project identity and global run/save state
Left: workflow stages and contextual drawer
Center: map workspace
Map overlay: selection, layers, legend, inspectors
Review: current results, durable Runs, data confidence, Reports
~~~

The missing element is not a new shell. It is a persistent lineage strip or compact context block that answers: “Which Project, Scenario, Version, and Run does this result belong to?” Concept 7G can add that understanding within the current architecture.

## 28. Dashboard question

A project dashboard is not justified yet. The map workspace already provides the most meaningful first action: inspect or edit the planning area. Project-level actions are available in the menu and Scenario panel, while Runs and Reports are available under Review. A dashboard would add a pre-map decision surface before the current product has solved the more important identity/stale-state issue.

Revisit a dashboard only if projects routinely contain enough independent Scenarios, recent Runs, Reports, and dataset choices that users need a project-level triage view before opening a map.

## 29. Command palette and quick actions

A command palette is not a first-order need. The product has a limited set of high-frequency actions—Run, save Version, open Results, open Run history, generate Report—but their problem is scope and context, not command discovery. Keyboard shortcuts for Run, save Version, and open current Results could become useful after the state vocabulary is stabilized. Do not add a palette before actions have explicit current/stale/historical targets.

## 30. Consistency and redundant UI

### Consistency findings

- Save appears as Save project name, Save a Version, Save version, and Save a new Version. The distinctions are technically valid but need scope labels.
- Delete uses confirmations in some project/scenario flows and icon-only affordances in others.
- Run appears as Run Sector, Analyze Interference, Run RF diagnostics, Run, Run again, and Generate report. Action verbs are meaningful but cross-tool consistency is low.
- Open details, Open source Version, Open source, and Continue from Version represent related lineage jumps with different wording.
- Apply optimization has a clear new Version/branch choice, but the target context needs confirmation.

### UI that may be redundant or legacy-shaped

- Save Version in both Project menu and Setup ScenarioPanel.
- Result summary access in the header plus Review → Results.
- Report generation from Report plus Run History detail plus Scenario revision detail.
- Scenario/version source actions in both Project menu and Setup revision inspector.
- The old-looking distinction between current compatibility/draft paths and domain-backed Scenario paths can surface as different wording, even though the storage layer is additive.

These are candidates for consolidation, not removals in Concept 7F.

## 31. Highest-risk workflows

Qualitative severity:

1. **High — report or apply from the wrong lineage.** A historical Run, current draft, and Version are available through different panels; the action is valuable but a wrong target would create misleading evidence or a new Version from unintended inputs.
2. **High — stale result interpreted as current.** Compute invalidation is safe, but “Plan changed” does not carry the old Run/Version identity into the user’s next decision.
3. **Medium-high — losing or misplacing unsaved edits.** Scenario switching and saving are durable, but active Scenario/Version visibility is limited to Setup/menu context.
4. **Medium — research controls overwhelm ordinary RF setup.** This slows normal planning and increases the chance of configuring a reference model when the user intended canonical propagation.
5. **Medium — deleting evidence unintentionally.** Delete and cleanup actions exist for projects, scenarios, Runs, and artifacts; the durable/local implications should be consistently stated.
6. **Medium — unavailable diagnostic or Core Lab state misunderstood.** Badges and disabled controls are honest but not a unified prerequisite explanation.

## 32. Product debt summary

The structured debt register is in [concept-7f-product-debt.json](concept-7f-product-debt.json). The separation matters:

- **UX debt:** lineage is distributed; drawers are overloaded; bulk inventory work is absent; empty states are uneven.
- **Architecture debt:** App.jsx is a large orchestrator; feature imports are eager; app state is not route-addressable; persistence concepts are spread across menu, panel, hooks, and detail components.
- **Performance debt:** one large JS chunk; map/data/research surface competes for initial load.
- **Accessibility debt:** modeless dialog focus behavior, map-equivalent access, and state communication need end-to-end testing.
- **Terminology debt:** artifact/retained/compact language leaks into normal workflows; current, historical, and stale are not one shared vocabulary.

## 33. Quick wins for a later phase

These are intentionally not implemented:

1. Add a compact persistent Project / Scenario / Version identity to the header.
2. Replace generic “Plan changed” with explicit “Result out of date — last Run … from Version …”.
3. Add Current / Historical / Stale labels to Results, Run History, and Report source summaries.
4. Remove the misleading “Select a run…” sentence from the empty Run History state.
5. Lead with “Reports” and move hash/generator/artifact metadata behind details.
6. Mark 140 GHz, reference, validation, and Core Lab cards as Research or Reference before their controls.
7. Surface cell count and active/override/provenance state in Inventory.
8. Fix map-toolbar/layer-menu overflow at 1024px and 640px.
9. Standardize Run, Save Version, Open source, and Apply wording by scope.
10. Add a compact layer-priority explanation when multiple RF overlays are enabled.

## 34. Structural opportunities (maximum three)

1. **Selected — Results, Lineage & Stale-State UX.** Add a coherent current-result/source context around the existing Results, Run History, Scenario Version, and Report flows.
2. **RF progressive disclosure and research boundary.** Keep canonical planning controls short; reveal advanced analysis and research/reference tools on demand with explicit scope labels.
3. **Review and workspace IA refinement.** Clarify the relationship among Results, Run history, Data, Report, and Scenario revision detail, while keeping the map as the primary workspace.

Bundle code splitting is a worthwhile engineering follow-up, but it is a safe implementation tactic rather than one of the three product-structure changes.

## 35. Current workflow diagram

~~~mermaid
flowchart LR
  Launch["Open A.T.O.M / map"] --> Dataset["Dataset loaded"]
  Dataset --> Plan["Plan: Setup + Inventory"]
  Plan --> RF["Simulate: Propagation / Signal surface"]
  RF --> Inspect["Results: map layers / inspector"]
  Inspect --> Optimize["Analyze / optimize: priorities + policy"]
  Optimize --> Pareto["Review: Pareto / compare"]
  Pareto --> Apply["Apply to new Version or branch"]
  Apply --> Save["Project / Scenario / Version save"]
  Save --> Report["Review: Report / Run History"]
  Report --> Revisit["Open source Version / Run again"]
~~~

## 36. Proposed Concept 7G workflow

This is the only proposed workflow because the audit selects one 7G phase:

~~~mermaid
flowchart LR
  Draft["Working draft<br/>Project / Scenario / Version visible"] --> Run["Run explicit RF / optimization"]
  Run --> Current["Current result<br/>bound to draft + Run"]
  Current --> Stale["Plan edit marks result stale"]
  Stale --> Rerun["Rerun or inspect historical Run"]
  Current --> Save["Save Version"]
  Save --> Report["Report from exact Version + Run"]
  Report --> Source["Reopen source Version"]
~~~

## 37. Product principles for future UI work

1. **Map remains the primary workspace.** Supporting tools should clarify the spatial decision, not replace it.
2. **Lineage is part of the result.** A result without Project, Scenario, Version, and Run identity is incomplete.
3. **Historical evidence never looks current.** Use text and source context, not color alone.
4. **Advanced RF complexity is progressively disclosed.** Scientific detail stays available without blocking normal planning.
5. **Expensive computation is always explicit.** Show what is running, what it targets, and what can be inspected while it runs.
6. **Preserve deliberate scientific distinctions.** Coverage, propagation reach, serviceability, baseline, recommendation, and Pareto are not interchangeable.
7. **Evidence remains local and inspectable.** Reports and Runs should be easy to revisit without hiding provenance.
8. **Responsive behavior should state its promise.** Narrow layouts may support inspection without pretending to support every planning workflow.

## 38. Concept 7G options and selection

The full option record is in [concept-7f-next-phase.json](concept-7f-next-phase.json). Four plausible options are supported by the evidence:

| Option | Scope | Evidence | Decision |
| --- | --- | --- | --- |
| A. Results, Lineage & Stale-State UX | Current/stale/historical result identity, source Version/Run context, safer review/apply/report flow | Highest-risk workflow spans every stage and is already supported by existing state/domain links | **Selected** |
| B. RF Configuration Progressive Disclosure | Separate planning, advanced, and research controls | Drawer overload is real, but it is narrower than lineage risk | Candidate after A |
| C. Review / Workspace IA Refinement | Clarify Results, Run history, Data, Report and revision detail | Useful, but should be informed by a stable lineage vocabulary | Candidate after A |
| D. Safe Feature Lazy Loading | Split research, report, experiments, and Core Lab chunks | Bundle warning is measurable, but it is an engineering/performance phase rather than the highest-value workflow fix | Candidate follow-up |

### Selected Concept 7G: Results, Lineage & Stale-State UX

It improves the most important real workflow—configure, run, inspect, revise, save, report, revisit—while preserving the existing map shell and domain/persistence architecture. It directly addresses the two high-severity risks: acting on the wrong lineage and misreading stale/current state. It can be implemented as a focused product pass using existing Scenario, Version, Run, and Report data; it does not require a database, authentication, new route model, RF changes, or optimizer changes.

## 39. Invariance and completion

Concept 7F changed documentation only. No application behavior, RF math, optimizer behavior, domain model, persistence semantics, IndexedDB schema, API contract, or design system was changed. Validation results are recorded in [concept-7f-post-change-comparison.json](concept-7f-post-change-comparison.json).

## Artifact index

- [Pre-change baseline](concept-7f-pre-change-baseline.json)
- [Screen inventory](concept-7f-screen-inventory.json)
- [Navigation map](concept-7f-navigation-map.json)
- [Task matrix](concept-7f-task-matrix.json)
- [Terminology audit](concept-7f-terminology-audit.json)
- [State communication](concept-7f-state-communication.json)
- [Bundle audit](concept-7f-bundle-audit.json)
- [Product debt register](concept-7f-product-debt.json)
- [Next-phase decision](concept-7f-next-phase.json)
- [Post-change comparison](concept-7f-post-change-comparison.json)
