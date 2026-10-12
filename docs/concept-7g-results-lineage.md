# Concept 7G — Results, Lineage & Stale-State UX

Captured 2026-09-22. Concept 7G adds a shared user-facing state model to the existing map-first workspace. It keeps the current four-stage shell, RF requests, optimizer, domain records, local repositories, and Report source bindings intact.

## State vocabulary

The shared result labels are **CURRENT**, **STALE**, **HISTORICAL**, **UNAVAILABLE**, and **UNSUPPORTED**. Operation-specific progress labels remain (for example, Simulating and Optimizing). Research/reference panels carry a visible Research / reference label. Draft persistence is separate: the header shows a saved Version or Unsaved changes, even when the local draft has autosaved.

`resolveRunFreshness` and `buildResultContext` derive one UI context from the existing Run, active workspace identities, existing invalidation state, and comparable fingerprints. They never use timestamps as freshness evidence. A Run with no retained source ScenarioRevision stays draft-sourced; the active Version is not substituted as its source. Restored result data without an unambiguous retained Run is UNAVAILABLE.

## Workspace and result context

The compact header carries Project, Scenario, Version, draft state, and the short current/stale Run cue. At narrow widths it keeps the state text and the primary workspace identity visible and exposes full workspace context from a focusable disclosure. The same result component is used in Results, Run History, Reports, and the map legend when result-derived layers are visible.

Current results identify result type, source Scenario/Version or draft source, and Run. Stale results retain the original Run context after safe invalidation clears result overlays. The stale action reruns the current working plan only after an explicit user action; the historical Run action replays its exact retained request as a new Run. Opening Run History does not switch the current plan. “Open source Version” inspects the exact retained Version while leaving the active Version plan in place; “Continue from Version” remains the separate draft-changing action. Scenario navigation is blocked while it would discard an unsaved draft, and the user is told to save that draft as a Version first. Switching the active Scenario clears its active result association.

## Reports, optimization, and source safety

Reports lead with Scenario, Version, Runs, and date. Artifact ID, source kind, SHA-256, generator version, evidence status, and byte size stay under Details / Provenance. A live compatibility Report is described as generated from the **Current unsaved plan** and says it was not tied to a saved Version. A persisted live Report remains visibly historical when reopened; if it was not based on a Run, it says **No Run** rather than implying that the Report itself is unavailable.

Generating a Report from Run History first confirms the exact source Scenario/Version/Run and shows the current workspace. It does not rerun RF. The action is unavailable if the exact source Version is not retained. Applying an optimization solution confirms its source Scenario/Version/Run/public solution and its destination (new Version or branch). Historical Apply uses the selected historical Run and solution, not current priorities or result state.

The Pareto legend explains Recommended (highest-ranked feasible under current priorities), Selected (currently inspected), and Pareto (non-dominated alternatives). These roles stay independent from result freshness.

## Unavailable, unsupported, and research/reference

UNAVAILABLE names the missing retained detail, exact input, source Version, or dataset and blocks unsafe actions. UNSUPPORTED describes a feature or quantity not defined for the selected model/profile. Research / reference distinguishes 140 GHz/Sub-THz, P.1411 candidate, material, reflection, measurement validation, and Core Lab outputs from canonical planning output.

## Validation record

The responsive browser suite exercises the workspace at 1440, 1024, 768, and 390 CSS pixels. The lineage summary must remain visible and within the viewport, the app must have no horizontal page overflow, and the mobile rail must keep all stages/tools reachable. Unit coverage checks freshness, source identity, missing historic inputs, exact source Version action guards, dialog focus/cancel, Report provenance disclosure, header labels, and map legend context.

The implementation does not add persistence fields or schemas, routes, databases, API contracts, RF/optimizer calculations, result payload fields, public solution IDs, Report source bindings, or new stale map layers. Exact command outcomes are recorded in [Concept 7G test evidence](concept-7g-test-evidence.json).

## Concept 7H recommendation

Choose **RF Configuration Progressive Disclosure** next. The post-7G app now has a shared lineage/state vocabulary and clear research/reference labels, while the Concept 7F audit still identifies mixed ordinary-planning and reference content in Propagation, plus high task effort for modifying RF configuration. The next phase should separate Planning, Advanced, and Research boundaries and collapse reference detail by default, preserving each tool and every scientific term. Keep the map-first shell and current RF behavior. Recheck at 1024 and 640 pixels because the existing map toolbar/layer-menu density remains a separate responsive concern.

This recommendation is a product-priority proposal only; Concept 7H is not implemented here.
