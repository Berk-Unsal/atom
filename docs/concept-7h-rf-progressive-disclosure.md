# Concept 7H — RF Configuration Progressive Disclosure

Implemented 2026-09-23. Concept 7H reorganizes the existing A.T.O.M controls into Planning, Advanced, and Research / reference tiers. It keeps the four-stage Plan / Simulate / Analyze / Review shell and all existing RF, optimizer, persistence, and result workflows.

## Outcome

Planning controls open on first load. Specialist configuration and reference panels start collapsed, remain mounted while hidden, and keep their values. The disclosure state is ordinary React UI state: it is not added to a ScenarioRevision, RF fingerprint, API payload, Run snapshot, Report binding, or local project schema.

The machine-readable [control inventory](concept-7h-control-inventory.json) contains 190 individual visible controls, grouped into 93 rows for readability. The [classification contract](concept-7h-classification.json) assigns every inventory member exactly one presentation tier: 33 Planning, 46 Advanced, and 111 Research / reference. Classification is documentation and presentation metadata only; runtime code does not import it.

## Tiers and navigation

| Tier | Purpose | Main paths |
| --- | --- | --- |
| Planning | Inputs and actions used in normal RF planning | Plan → Setup → Planning; Plan → Inventory → Planning; Simulate → Propagation → Planning |
| Advanced | Specialist canonical configuration and diagnostic analysis | Plan → Setup → Advanced model details; Plan → Inventory → Advanced; Simulate → Propagation → Advanced analysis; Analyze → Interference; Analyze → Building entry |
| Research / reference | Isolated experimental, reference, campaign-validation, and research-profile controls | Simulate → Propagation → Research / reference; Analyze → RF Diagnostics → Research / reference; Review → Data → Research / reference; Analyze → 5G Core |

The [navigation map](concept-7h-navigation-map.json) records the destination and default disclosure state for each existing tool. Tool names remain recognizable; no rail stage, route, shell, or search system was added.

### Planning

Setup keeps planning mode, technology/profile, propagation model, conducted TX power, cell/network selection, and the global Run action easy to reach. Propagation shows ray count, radius, azimuth, beam width, and the existing relevant network optimization action. The primary Run action remains in the global command bar rather than being duplicated inside the drawer.

The Inventory editor opens its identity/location and common profile group. Its common profile fields include technology, frequency, bandwidth, conducted power, radius, beam width, antenna height, orientation, receiver height, receiver threshold mode, and manual RX sensitivity. Ordinary planning does not require editing every link-budget term.

### Advanced

Advanced Setup details expose model applicability and link-budget assumptions. Inventory Advanced exposes carrier identifiers, TX/RX gain, system and polarization loss, downtilt, antenna patterns, cell load, reuse, PCI, and derived receiver-noise/sensitivity inputs. Manual sensitivity, derived sensitivity, building-service threshold, and radio-quality thresholds remain separate concepts.

Propagation Advanced contains network optimization objectives/constraints and the vertical path-profile diagnostic. The P.526 path profile remains an isolated diagnostic; opening or running it does not add diffraction loss to canonical UMa. Interference stays under Analyze and its radio-quality output is distinct from propagation coverage. Building entry stays under Analyze as a specialist action and requires no facade inputs in ordinary planning.

The Advanced indicator reports configured optimizer priorities/constraints; a completed diagnostic path alone does not imply an active plan configuration. Inventory reports explicit per-cell Advanced overrides. An advanced value is a valid configuration, not an error. If an advanced field blocks an operation, its parent section opens, labels the attention state, and focuses the invalid field.

### Research / reference

Propagation Research / reference contains Sub-THz atmospheric evaluation and P.1411 candidate evaluation. RF Diagnostics leads with canonical result/path actions; its Research / reference disclosure contains measurement campaigns, material/facade reference, and specular reflection. Review → Data separates planning data, dataset details, advanced model details, and validation/calibration evidence.

The 140 GHz profile is explicitly marked Research / reference, not canonical validation, and not production-calibrated. Radio quality is **UNSUPPORTED** for that profile; the unsupported optimizer priority remains configured and is not applied. P.1411 remains an alternative/reference candidate, never automatically additive propagation loss. Material remains a slab/component reference, reflection remains an isolated single-bounce reference, and measurement validation does not promote a model automatically. Existing Research / reference result badges and CURRENT / STALE / HISTORICAL / UNAVAILABLE / UNSUPPORTED vocabulary are preserved; CURRENT is not a claim of canonical status.

## Profile visibility and state preservation

The [profile visibility record](concept-7h-profile-visibility.json) describes the 2.6 GHz LTE, 28 GHz 5G, legacy, and 140 GHz research contexts. Selecting a different profile does not clear a hidden Advanced or Research value merely because its disclosure is closed. Unsupported radio quality is labeled and disabled for the 140 GHz research profile while its stored optimizer priority remains intact.

Opening/closing a disclosure does not dirty the plan or start RF work. Editing an RF value inside a collapsed section still follows the existing invalidation behavior. A research input edit updates only the Research activity indicator; it does not create a canonical RF result or request. “Open source Version” navigation opens the Scenario workspace disclosure so the selected exact Version is visible without activating its inputs.

The inventory marks reference-panel inputs as `persisted: false`: collapse/reopen preserves their component-local values, but saved Versions do not contain those inputs and a full page reload restores their established panel defaults. 7H keeps that existing persistence boundary. In contrast, per-cell Advanced RF overrides already belong to the saved plan and the responsive browser suite verifies an override through Version save and reload.

## Interaction and responsive evidence

At 1440 × 960, the baseline Propagation drawer showed four sections together and 38 controls across them (5 propagation, 13 path-profile, 10 Sub-THz, 10 P.1411); two research sections were open. After 7H, the same drawer has one Planning section open, five common Propagation controls visible, and Advanced and Research / reference collapsed. Research controls visible by default fall from 20 to zero. Its measured scroll height falls from 2,451 px to 791 px, a 67.7% reduction.

RF Diagnostics changes from three fully visible sections (59 controls, including material and reflection references) to canonical diagnostic actions plus a collapsed Research / reference group. Its measured scroll height falls from 2,657 px to 791 px (70.2%). Review → Data changes from measurement validation mixed into the visible dataset/model content to one open Planning data group and three collapsed detail groups. Its measured scroll height falls from 1,838 px to 852 px (53.6%). These are content-density measurements, not speed claims. Full details are in [interaction evidence](concept-7h-interaction-evidence.json).

Responsive evidence covers 1440, 1280, 1024, 640, and 390 CSS-pixel widths. Disclosure headers and the global Run action remain reachable, hidden details stay scrollable when opened, and the drawer/document show no horizontal overflow at those sizes. The map remains the dominant surface at desktop sizes. The unrelated map-toolbar layout was not changed. Exact measured dimensions and checks are in [responsive evidence](concept-7h-responsive-evidence.json).

## Compatibility and validation

Concept 7H changes presentation boundaries only. It does not change RF formulas, defaults, request fields, optimizer behavior, model applicability, scores, Pareto IDs, ScenarioRevision contents, `atom-scenario-v1`, Run snapshots, report-source bindings, datasets, or results. Request payload builders and backend RF code were not changed for this concept. The 2.6 GHz workflow test runs the same 4G profile after collapsing/reopening Planning; existing request-equivalence tests cover 2.6/28 GHz, interference, and optimization, while request-builder tests cover building entry and the isolated reference payloads. Existing Concept 7G domain and artifact tests cover exact Version, Run snapshot, report binding, and UI-only-state boundaries.

Targeted accessibility behavior includes semantic disclosure buttons, `aria-expanded`, descriptive accessible names, Enter/Space activation, focus guidance on automatic open, and validation attention that opens and focuses the invalid field. The control inventory/classification test ensures every concrete control remains represented exactly once.

Recorded commands and outcomes are in [test evidence](concept-7h-test-evidence.json). The production build remains near the prior size and still emits Vite's existing >500 kB chunk warning; no broad code splitting was part of 7H. The measured bundle comparison is in [post-change comparison](concept-7h-post-change-comparison.json).

## Concept 7I recommendation

Proceed with **Safe Feature Lazy Loading / bundle splitting** as the next investigation. The Planning path is materially shorter, while the production JavaScript chunk remains 957.70 kB minified and triggers Vite's large-chunk warning. Profile dormant research/reference panels, report tools, experiments, and Core Lab as candidate boundaries, then validate request/result state continuity and quantify initial-load behavior before adopting splits. Concept 7H did not implement lazy imports.
