# A.T.O.M Product Roadmap After the Capability, UX & Growth Audit

17 October 2026 · Issue curation only · No implementation, no release or date commitments

This roadmap turns the [product capability, UX and growth audit](product-capability-ux-growth-audit.md) (verdict **C — product workflow gaps**) into GitHub issues. It was validated against current main `d076397` (VERSION 0.12.3, latest release v0.12.3). No changes were merged after the audit, so every audit finding still applies. The groups below show order of attention, not release scope.

**Direction:** make the planning loop continuous, make results visible and readable, repair handoffs between tools, expose strong hidden capabilities, improve continuity and sharing, and then add bounded spatial decision features. More RF models, larger network caps, AI, cloud features and 3D are out of scope.

## NOW: workflow repairs and high-value polish

| Issue | Priority | Who | Summary |
|---|---|---|---|
| [#101](https://github.com/Berk-Unsal/atom/issues/101) Allow Pareto alternatives from a working-draft optimization to be applied | P1 | Maintainer | Apply is disabled after the default optimize path, with no recovery step |
| [#97](https://github.com/Berk-Unsal/atom/issues/97) Bring completed results into view after runs, area selection and interference | P2 | Help wanted | The map never fits to results; Interference has no completion handoff |
| [#98](https://github.com/Berk-Unsal/atom/issues/98) Explain what the single-sector RF result shows before its metrics | P2 | Help wanted (maintainer reviews copy) | 99% blocked next to zero gaps reads as a contradiction |
| [#99](https://github.com/Berk-Unsal/atom/issues/99) Fix result unit casing, zero-gap styling and residual tower wording | P2 | Good first issue | "DBm"/"M" units, alarm styling for empty results, leftover "tower" copy |
| [#102](https://github.com/Berk-Unsal/atom/issues/102) Make report and project downloads readable and clearly named outside A.T.O.M | P2 | Help wanted | UUID filenames, duplicated report sections, inline SVG, contradictory lineage |
| [#103](https://github.com/Berk-Unsal/atom/issues/103) Distinguish plan-mode changes from input changes and use readable run labels | P2 | Maintainer | Over-triggered staleness, hash-first labels, Version wording drift |
| [#104](https://github.com/Berk-Unsal/atom/issues/104) Show actionable recovery for unreachable backend, server errors and invalid inputs | P2 | Help wanted | "Failed to fetch", "internal error", a misdirected validation prompt |
| [#105](https://github.com/Berk-Unsal/atom/issues/105) Fix map key, command bar and Results tab collisions at desktop sizes | P2 | Help wanted | Map key swallows drawing clicks, 1280 px overlap, tab overflow; adds screenshot baselines |
| [#100](https://github.com/Berk-Unsal/atom/issues/100) Make the project menu keyboard-dismissible and align Save version and Select cells names | P3 | Good first issue | No Escape, label-in-name mismatch, duplicate names; adds an accessibility smoke check |

## NEXT: continuity, comparison and exposure

| Issue | Priority | Who | Depends on |
|---|---|---|---|
| [#106](https://github.com/Berk-Unsal/atom/issues/106) Restore result context when reopening a working draft or saved Version | P1 | Maintainer (design first) | Binding rule shared with #101 |
| [#107](https://github.com/Berk-Unsal/atom/issues/107) Make plan comparison reachable from Results for every result type | P2 | Maintainer | — |
| [#108](https://github.com/Berk-Unsal/atom/issues/108) Expose candidate Cell recommendation as an explicit network action | P2 | Maintainer | Coordinate Results tabs with #105 |
| [#109](https://github.com/Berk-Unsal/atom/issues/109) Give CSV Measurement Validation a first-class place in Review → Data | P2 | Help wanted | — |
| [#110](https://github.com/Berk-Unsal/atom/issues/110) Offer the bundled sample planning project from the first-run workspace | P2 | Help wanted | Sample fixture from #78 |
| [#111](https://github.com/Berk-Unsal/atom/issues/111) Add a trade-off chart to network Pareto solutions | P3 | Help wanted | Follow-up to closed #76 |

#106 is P1 because, until it is fixed, users read the reload behavior as data loss. It sits in NEXT because the binding and retention rule needs a short design decision first.

## LATER: bounded new capabilities

| Issue | Priority | Class | Boundary |
|---|---|---|---|
| [#112](https://github.com/Berk-Unsal/atom/issues/112) Show where two compatible plans differ with a spatial served-state comparison | P2 | B: bounded API addition | Identical dataset and model fingerprints; served/lost/overlap classes; no new physics or cross-model comparison; depends on #107 |
| [#113](https://github.com/Berk-Unsal/atom/issues/113) Report network KPIs inside one drawn area of interest | P2 | B: aggregation only | One bounded area; no area-of-interest optimization objective; no general GIS features |
| [#114](https://github.com/Berk-Unsal/atom/issues/114) Place and manage co-located multi-sector Cells as one site group | P3 | B: schema grouping | No shared-antenna physics; no cost, ownership or feasibility claim |
| [#115](https://github.com/Berk-Unsal/atom/issues/115) Export a local review package for the current Version | P3 | A: product-safe | Local zip and manifest; no hosted sharing, no signing requirement; depends on #102 |

## RESEARCH / BLOCKED

- **Canonical real-world RF validation and measured confidence:** tracked by existing #87, #88, #89 and #90, which this work did not change. Calibrated or confidence-weighted predictions wait on them.
- **Tilt, power or site-selection optimization:** not filed. It would change optimization semantics and the request budget without validation evidence.

## Deferred without an issue

- **Optimize next to the network result:** revisit after #108 settles where network actions live.
- **Undo/redo for plan edits** and **network-scope experiments:** both need technical foundation work first (state ownership; re-qualifying the RF request budget).

## Rejected or not now

| Idea | Why |
|---|---|
| Onboarding wizard | The command bar already teaches the first action; #110's dismissible card covers orientation |
| Command palette | 14 tools in 4 stages is navigable; earlier navigation audits agreed |
| 3D city view | Decorative, and implies more fidelity than the 2.5D model has |
| Cloud collaboration | Conflicts with the local-first premise |
| Cost, backhaul or equity scoring | No authoritative data; would manufacture certainty |

## Existing issues

- **Closed #76** after verifying that PR #96 meets all of its acceptance criteria.
- **Extended #86** with the `docs/features.md` tool-inventory correction (it lists ten tools; the rail has fourteen), instead of opening a duplicate documentation issue.
- **Related, unchanged:** #78 (walkthrough; #110 depends on its sample), #79, #81 (documentation complement to #102), #82, and #87–#90.

## Suggested starting points

- **First maintainer task:** #101, adopting Pareto alternatives from the draft.
- **First contributor task:** #99, a good first issue.
- **First help-wanted task:** #97, which makes results visible on every run.

The full candidate-to-issue mapping is in `scripts/product-capability-ux-growth-audit/roadmap-materialization.json`.
