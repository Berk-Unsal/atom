# Network optimization operation feedback

Network optimization now provides calm, truthful local feedback while its synchronous request is pending. The previous network action displayed “Optimizing...” and animated its Sparkles icon with the shared `.spin` class. That class ultimately reused the drawer entrance animation. The new network action reads **Optimizing network…**, keeps a static decorative icon, and stays disabled with `aria-busy="true"`. Its full width and height remain stable; the inherited one-pixel hover movement is suppressed for this action.

## Ownership and initial implementation baseline

- Starting branch: `main`; HEAD: `0e78d6f60f3233c28ef259d4d1ccf84b85275ca9`; VERSION: `0.10.1`.
- Starting `git status --short` and `git diff --stat`: empty. There was no uncommitted work to preserve.
- Baseline: 65 frontend test files / 357 tests passed; lint and production build passed; the complete optimization/apply/Version/Report journey and retained Pareto workflow passed at desktop size.
- `App.jsx` owns optimization dispatch, request coordination, and existing busy/result/error behavior. It now keeps an ephemeral operation snapshot containing the local start time, request-derived scope, and existing abort signal. This snapshot is never persisted or added to a request, fingerprint, Run, or Scenario.
- `ControlPanel.jsx` owns the network action and reserved inline feedback slot. `OptimizationOperationFeedback.jsx` owns display timing. `optimizationOperation.js` describes the submitted search scope. The feedback remains optimization-specific.

## Known scope, unknown progress

The active request is built by the unchanged `buildNetworkOptimizationPayload`. It currently omits `search_policy`; the backend selects `legacy_two_pass_coordinate` when that field is omitted. Scope comes from the request's actual `towers.length`, rather than a live selection that could change during execution.

Legacy search has one start, two passes, and 36 absolute azimuth proposals per selected coordinate. Its exact proposal scope is **2 × 36 × N + 2 = 72N + 2**.

| Selected cells | Passes | Proposals |
| --- | --- | --- |
| 2 | 2 | 146 |
| 5 | 2 | 362 |
| 6 | 2 | 434 |

These are search proposals/evaluation calls, not equal-duration work units. Memo hits and full RF evaluations have different costs. The UI knows neither completed proposals nor remaining RF work, so it shows no percentage, completed-candidate counter, phase, ETA, or “almost done” claim.

Explicit `deterministic_multistart_coordinate_v1` requests are described as “N cells · multi-start bounded search”; `deterministic_pareto_archive_search_v1` uses “N cells · Pareto archive search”. Unknown policies use “N cells · network search”. None receives a proposal or pass total. These paths are unit-tested; the current production builder continues submitting the legacy request unchanged.

## Timing and layout

- For the first **500 ms**, only the busy action is visible.
- After disclosure, the inline area shows the operation title, scope, and **x.x s elapsed**.
- Elapsed time uses local monotonic `performance.now()` and a restrained **250 ms** interval. Browser scheduling may delay a refresh; the next sample measures actual elapsed time rather than accumulating ticks.
- At **10 seconds**: “Taking longer than usual” / “Optimization is still running.”
- At **30 seconds**: “Still optimizing” / “Complex geometry or search settings can require more time.”
- Thresholds change explanatory copy only. They neither claim backend phases nor alter execution, result handling, the request budget, or the existing 60-second deadline.
- The final polish reduces the previous **126 px** reserve to **approximately 104 px** (103.44 px measured). The minimum height derives from one title line, four metadata/body lines, three 2 px gaps, 4 px padding at each end, and the 1 px separator. This accommodates the longest English copy with two supporting lines at the narrowest supported drawer; the minimum scales with typography and permits natural growth. No copy or line-height changes are needed.
- The narrow drawer remains scrollable. The action and its reserved feedback footprint can be brought into view together before execution. Scope and supporting copy wrap normally, with no horizontal overflow or automatic scroll on disclosure.

The operation snapshot is cleared immediately when the optimization request resolves or throws, and immediately on its existing abort signal. The component clears its interval on abort and unmount. The abort listener is removed in the request's `finally` block; cleanup uses snapshot identity so an older request cannot remove newer feedback. Returning to the tool while a request is alive derives elapsed time from its original timestamp.

Existing follow-up simulations, result application, recommendation, Pareto ordering, freshness, and durable Run handling remain authoritative. The button retains the original busy gate through that whole workflow; the optimization-specific scope/timer disappear when the optimization response arrives. Existing deadline, budget, and validation errors retain their exact message in the existing error surface.

## Accessibility and themes

The native disabled button prevents repeated dispatch and exposes `aria-busy`. A visually hidden polite `role="status"` announces “Optimizing network” when the feedback component mounts. The decorative icon is hidden from assistive technology. Elapsed time and delayed supporting copy live outside that region with `aria-live="off"`; ticks never repeatedly announce progress. Existing header status and error alerts handle completion/error states. No new cancellation control is introduced.

Light, Dark, and System-resolved light/dark use the existing semantic tokens and theme architecture. Previously, the running action inherited 0.68 opacity in Light and the generic muted disabled surface/text/border in Dark. It now uses the normal `--panel-strong` surface, `--ui-accent-strong` text/icon, and `--ui-accent` border (existing light fallbacks), with full opacity and a wait cursor. It remains quieter than the enabled primary action, has no hover change, and is distinct from unavailable controls, warning, and error states. No colors or theme tokens are added. Measured text/icon contrast is **9.42:1 Light** and **8.00:1 Dark**; System resolves to identical styles. The action retains its original dimensions, position, static icon, native disabled state, and accessibility ownership.

A mechanical design scan reported only an existing unrelated `border-left: 3px` rule in `styles.css`; this pass has no detector findings.

## Validation and evidence

Regression tests cover exact 2/5/6-cell legacy scope, non-legacy policies without fake totals, payload immutability, delayed disclosure, increasing elapsed time, both long thresholds, return-to-tool timing, abort/unmount cleanup, disabled duplicate-click protection, and actual App success/error/cancellation/supersession timer cleanup. A cancelled request settling after a replacement starts cannot clear its feedback. Existing request-equivalence, RF payload, recommendation, Pareto, fingerprint, Scenario, and Run workflow suites remain in the full frontend test run.

The focused browser checks run at **1440×900, 1024×768, 768×1024, and 390×844**. They verify exact button, slot, Advanced section bounds and scroll position through idle, pre-disclosure, active, 10-second, 30-second, success, and fast success states. They also check no horizontal overflow, a fully viewable feedback footprint, static icon animation, Light/Dark/System styles, readable text/icon contrast, suppressed busy hover, true unavailable controls, preserved deadline/budget errors, cancellation, and one optimization request after repeated clicks. The accepted error alert still inserts above Planning and moves that whole section; error checks verify unchanged action/slot/Advanced geometry relative to Planning. Cancellation via a ray-count edit checks that same relative geometry because interacting with the slider can intentionally scroll it into view. This polish does not alter those existing behaviors. Long screenshots use a held mock response and controlled browser clock; production optimization is never artificially delayed.

Measured longest-copy fit:

| Viewport width | Feedback width | Previous reserve | New reserve | 30-second content height |
| --- | --- | --- | --- | --- |
| 1440 | 335 px | 126 px | 103.44 px | 103.41 px (two supporting lines) |
| 1024 | 295 px | 126 px | 103.44 px | 103.41 px (two supporting lines) |
| 768 | 295 px | 126 px | 103.44 px | 103.41 px (two supporting lines) |
| 390 | 366 px | 126 px | 103.44 px | 86.02 px (one supporting line) |

Content height includes the bottom padding; the text has 4 px of breathing room before the slot ends. The supporting sentence fits on one line in the 390 px bottom drawer, which is wider than the desktop side drawer. All viewports pass containment and stable-geometry checks without clipping, separator/Advanced overlap, horizontal overflow, or disclosure scroll jumps.

Each viewport has Light/Dark idle and unavailable, pre-disclosure, active Light/Dark, active System light/dark, 10-second, 30-second, success, deadline-error, and budget-error evidence in `assets/optimization-operation-feedback/` (56 captures, reusing identical System/resolved-theme images). Mobile capture setup scrolls the reserved footprint into view clear of the existing map attribution before execution; checks confirm disclosure never changes that scroll position and the longest copy remains unobscured. Basemap tile requests are deliberately blocked by the existing E2E fixture; these captures assess operation feedback, not basemap availability.

Representative evidence:

- [Idle action](assets/optimization-operation-feedback/desktop-1440-idle-light.png)
- [Before disclosure](assets/optimization-operation-feedback/desktop-1440-busy-before-disclosure.png)
- [Active light](assets/optimization-operation-feedback/desktop-1440-active-light.png)
- [Active dark](assets/optimization-operation-feedback/desktop-1440-active-dark.png)
- [Unavailable dark](assets/optimization-operation-feedback/desktop-1440-unavailable-dark.png)
- [System light](assets/optimization-operation-feedback/desktop-1440-active-system-light.png)
- [System dark](assets/optimization-operation-feedback/desktop-1440-active-system-dark.png)
- [Long-running](assets/optimization-operation-feedback/desktop-1440-long-dark.png)
- [Very long](assets/optimization-operation-feedback/desktop-1440-very-long-dark.png)
- [Deadline error](assets/optimization-operation-feedback/desktop-1440-error-deadline.png)
- [Mobile active](assets/optimization-operation-feedback/mobile-390-active-light.png)
- [Mobile very long](assets/optimization-operation-feedback/mobile-390-very-long-dark.png)

Validation commands:

```sh
cd frontend-react
npm test
npm run lint
npm run build
ATOM_OPERATION_CAPTURE=1 npm run test:e2e -- --grep 'optimization operation feedback' --workers 4
npm run test:e2e -- --grep 'completes the Run, optimization|explores a retained Pareto|theme persistence and system changes' --workers 4
cd ..
python3 scripts/versioning.py check
python3 docs/validate_docs.py
git diff --check
```

No production backend, API response, request builder, search, persistence, fingerprint, or scientific-output code is changed. Backend tests are intentionally outside this UI-only task. Remaining limits are the synchronous request's lack of live backend progress and the fact that local elapsed timing cannot predict completion. No additional progress transport is needed to freeze this UX.

Final polish results: **67 test files / 377 tests passed**, lint and build passed, and **24 operation-feedback E2E checks passed** across all four viewports. Version metadata, documentation validation (45 HTML pages / 41 API paths), and `git diff --check` passed. The production build retains its existing large-chunk advisory. Documentation validation uses the existing isolated `/tmp/atom-optimization-feedback-docs` Python environment for PyYAML; no repository dependency files changed. The initial implementation's broader focused run passed 29 tests with three planned desktop-only journey skips.

Final polish changes only `styles.css`, `theme.css`, `ControlPanel.test.jsx`, `e2e/workspace.spec.js`, `CHANGELOG.md`, this document, and screenshot assets. The accepted implementation already present in the working tree (`App.jsx`, `App.workflow.test.jsx`, `ControlPanel.jsx`, `OptimizationOperationFeedback.jsx` and its tests, `optimizationOperation.js` and its tests) is preserved. Timing, copy, request handling, optimization, accessibility ownership, and backend behavior remain frozen. Optimization Operation Feedback can now be frozen with this final visual treatment.
