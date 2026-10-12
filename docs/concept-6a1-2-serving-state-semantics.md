# Concept 6A.1.2 — Serving-State Semantics Reconciliation

**Decision: A — semantics unresolved.** The 37 explicit serving-change events are an exact and repeatable match for the registered LTE candidate transitions, and all 37 nearby cell-list transitions agree using masked identifiers. The source still contains a direct Android semantic conflict: all 83 `registered=true` candidate rows report `CONNECTION_NONE`, which Android defines as not serving. The LTE packet-switched registration identities add a second conflict: their PCI is 0, a valid LTE PCI, while every registered candidate has PCI 202, 276, or 296. The importer remains unchanged and canonical observations remain at zero.

This was a source-state audit only. It did not use signal strength, map position, transmitter proximity, or propagation output to establish identity. No RF or optimizer work, residuals, calibration, or Concept 6B work occurred.

## Inputs and baseline

The two local recordings were rehashed before analysis and matched Concept 6A.1.1 exactly. Neither recording nor its coordinates are tracked. The tracked JSON uses `CANDIDATE-NN` aliases for exact source identities, omits Cell IDs and partial Android Cell ID tokens, and reports callback times relative to the first mobile-network record in each file. It contains no coordinates or wall-clock timestamps.

| Session | Raw file | Bytes | SHA-256 | Full-file rows |
|---|---|---:|---|---:|
| Stationary | `data-stationary-test.txt` | 3,642,965 | `ae4c62426eb02e6de158220fbb43a5eb978fdfa72b5550483b5cf25d12680fc7` | 7,374 |
| Walking | `data-walking-test.txt` | 22,175,305 | `9d7aa4830391304a1a255c059c4c15dcb1b48c6f0de623dad4d934f7966c8f2f` | 45,631 |
| **Combined** |  | **25,818,270** |  | **53,005** |

The starting checkout was clean on `main` at `6ab445e8ff4eb091a678c7c66990d67c6cd04838`, version `0.9.2`, with an empty `git diff --stat`. Before editing, backend tests, race tests, vet, and targeted Concept 6A tests passed; see the [pre-change baseline](concept-6a1-2-pre-change-baseline.json).

The repository parser recomputed all 53,005 rows. It reported no malformed or dropped rows, no timestamp epoch decreases, no sequence gaps, and no duplicate sequence numbers. Its 1,858 elapsed-realtime nonmonotonic warnings (237 stationary, 1,621 walking) are retained as parser warnings; they do not change the file's epoch/sequence order used for this audit.

## Current importer contract

In `backend-go/raytracer/concept_6a1_campaign_tooling.go:1030`, a source cell qualifies only when its registered flag is known and true **and** its connection status is exactly `PRIMARY_SERVING` or `SECONDARY_SERVING`. The promotion loop uses that predicate. The two native statuses are accepted through the same predicate; the importer does not infer one from the other or promote a row based on `registered=true` alone. Consequently, `registered=true` plus `NONE` fails the predicate.

The sanitized real-source regression test, `TestConcept6A1SanitizedRealV6ServingConflictIsNotPromoted`, continues to assert that the conflict is not promoted. No source predicate, parser, promotion path, fixture, or production behavior was changed.

## Recomputed source inventory

| Measure | Stationary | Walking | Combined |
|---|---:|---:|---:|
| Full-file parsed rows | 7,374 | 45,631 | 53,005 |
| LTE CellInfo rows | 36 | 188 | 224 |
| `registered=true` | 11 | 72 | 83 |
| `registered=false` | 25 | 116 | 141 |
| `connection_status=NONE` | 36 | 188 | 224 |
| Raw Android `mCellConnectionStatus=0` | 36 | 188 | 224 |
| `PRIMARY_SERVING` / `SECONDARY_SERVING` / `UNKNOWN` / other | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| CellInfo timestamp groups | 10 | 71 | 81 |
| Groups with 0 registered rows | 0 | 0 | 0 |
| Groups with exactly 1 registered row | 9 | 70 | 79 |
| Groups with >1 registered rows | 1 | 1 | 2 |
| Groups with >1 distinct registered identity | 0 | 0 | 0 |
| `SERVING_CELL_CHANGED` | 7 | 30 | 37 |
| `SERVICE_STATE_CHANGED` | 14 | 65 | 79 |
| `CELL_LIST_CHANGED` | 11 | 72 | 83 |
| Signal-strength records | 103 | 699 | 802 |

The two groups with more than one registered row each contain two duplicate rows for the **same** exact identity. No snapshot has competing distinct registered LTE identities. Eight distinct registered identities occur across both sessions. All 224 cell rows are LTE. The 83 registered rows are LTE, PLMN `28603`, subscription 1 / slot 1, and have `active_data_subscription=true`; the 141 neighbor rows have `active_data_subscription=false`.

All 83 candidate rows are preserved chronologically in the [source-state audit](concept-6a1-2-source-state-audit.json), including subscription, slot, RAT, PLMN, candidate alias, PCI, EARFCN, band, frequency, source sequence, relative source time, and relative CellInfo snapshot time. The four observed channel contexts are EARFCN 451 / B1 / 2155.1 MHz, 1306 / B3 / 1815.6 MHz, 3200 / B7 / 2665.0 MHz, and 6200 / B20 / 796.0 MHz. These values are copied from the source; they do not assign transmitter truth or bandwidth.

## Serving-event and cell-list reconciliation

Every one of the 37 `SERVING_CELL_CHANGED` events has a complete before/after identity tuple in the source: subscription, technology, Cell ID, and PCI. Under exact source order and timestamp ordering, the immediately preceding registered snapshot has the exact event-before identity for 37/37 events, and the first following registered snapshot has the exact event-after identity for 37/37. This yields 37/37 exact transitions, zero partial or masked event-to-candidate comparisons, zero mismatches, and zero missing or ambiguous contexts. The same 37 candidate identity changes occur between consecutive CellInfo groups: seven stationary and 30 walking, with no unpaired or inconsistent identity transition.

The serving event itself does not carry EARFCN, band, or frequency. The audit keeps that information as context from the adjacent registered CellInfo row rather than filling missing event fields. A sanitized example is stationary event sequence 18: `CANDIDATE-01` (LTE, PCI 276, B3 / EARFCN 1306) is the exact before identity, followed by `CANDIDATE-02` (LTE, PCI 276, B1 / EARFCN 451). The old candidate's last source row is 12 ms before the event; the new candidate's first source row is 1 ms after it.

Across the 37 transitions, the old candidate's latest row is 12–20,940 ms old at the event in the stationary session (median 17,005 ms) and 11–21,008 ms old in the walking session (median 10,598.5 ms). The following candidate row appears 1–2 ms later for stationary and 1–4 ms later for walking. This is consistent with CellInfo refreshes around every 20 seconds and a serving callback arriving just before its new snapshot; it does not establish that `NONE` means serving.

Of 83 `CELL_LIST_CHANGED` callbacks, 39 change the registered-list state: 37 have one registered identity before and after, and two are initial 0-to-1 registrations. All 37 transition callbacks occur exactly one source sequence before their matching serving event. Their times range from 12 ms before to the same millisecond as the serving event. In every pair, the before/after masked Cell IDs are compatible with the exact event identities, and RAT, PCI, EARFCN, subscription, and slot match the adjacent candidate context. Thus the cell-list transition is internally consistent with the event, but its Cell IDs are masked and it does not reconcile the Android connection-status value.

The complete event and paired cell-list ledger is in [transition consistency](concept-6a1-2-transition-consistency.json). It includes all sanitized event identities and the deterministic bracketing groups.

## ServiceState, identity, and SIM audit

The 79 ServiceState callbacks contain 79 after-state snapshots and 77 before-state snapshots: the first callback in each file has an empty before state. Those 156 states each contain one CS and one PS `NetworkRegistrationInfo` record, for 312 NRI contexts.

All 156 states report outer data and voice registration `0 (IN_SERVICE)` and data RAT LTE. Every PS NRI reports HOME registration, LTE, DATA service, WWAN, registered PLMN `28603`, and an EARFCN equal to the outer ServiceState channel. Its `CellIdentityLte` Cell ID is partially redacted and omitted from tracked artifacts. Its `mPci` is 0 in all 156 states. Android documents LTE PCI values as 0–503, so 0 is valid rather than the unavailable sentinel. The registered CellInfo candidates have only PCIs 202, 276, and 296; consequently, no PS NRI has a full identity match. In 64 states, the masked Cell ID token plus EARFCN, PLMN, RAT, and subscription is compatible with at least one registered candidate before considering PCI; the other 92 have no such candidate. The valid PCI value contradicts candidates in all 156 states, including those 64 partial matches.

All 156 CS NRI records report HOME/LTE with VOICE, SMS, and VIDEO available; their PCI uses Android's `UNAVAILABLE` sentinel and therefore cannot independently identify a candidate. The `nrState` text is redacted in all 156 states. The visible PS data-specific fields report `isNrAvailable=false` and `isEnDcAvailable=false` in all 156 contexts; this does not supply a serving identity or change the all-LTE candidate inventory. Raw ServiceState bandwidth-vector counts are recorded in the service audit solely as source context and were not interpreted as measured cell bandwidth.

All cell candidates, all serving events, all cell-list events, and all ServiceState callbacks are on subscription 1 / slot 1. Registered candidate rows carry the active-data-subscription boolean; all 83 are true. No cross-SIM ambiguity was found. The source contains no separate numeric active-data-subscription ID with which to make an additional independent comparison.

The [ServiceState consistency audit](concept-6a1-2-service-state-consistency.json) records every CS/PS context, the exposed identity fields, redaction flags, relative callback order, and before/after candidate groups. Its identity comparison keeps exact, partial, and contradictory fields separate.

## Source semantics and conflict matrix

Android's [CellInfo API](https://developer.android.com/reference/android/telephony/CellInfo) says `isRegistered()` is true when the phone is registered to a network providing service on the cell and the cell is or would be used for network signaling. It defines `CONNECTION_NONE` (integer 0) as not serving and neither camped nor serving; primary serving (1) is connected for signaling and possibly data, secondary serving (2) is connected for data, and unknown is the unavailable integer sentinel. The recordings retain both `registered=true` and raw `mCellConnectionStatus=0` on all 83 candidate rows. Android's definitions therefore directly conflict for these rows.

Android's [NetworkRegistrationInfo API](https://developer.android.com/reference/android/telephony/NetworkRegistrationInfo) defines CS/PS domains and exposes access technology, available services, registered PLMN, and cell identity. The [CellIdentityLte API](https://developer.android.com/reference/android/telephony/CellIdentityLte) confirms PCI 0 is valid and defines the unavailable value separately. These APIs explain why the PS PCI cannot be dismissed as missing.

Signal Collector's [TXT data dictionary](https://signalcollector.app/format) lists `registered`, the four `connection_status` enum values, SIM subscription and slot, and `cell_timestamp_ms` for mobile-network records. It describes `SERVING_CELL_CHANGED` before/after identity fields as a serving-cell handover. It does not explain how that event is derived or how to reconcile it with `CONNECTION_NONE`. The page currently describes an export overview checked against app 2.0.1 build 54, while its detailed TXT V6 dictionary is based on 1.5.2 with later additions. The recording header identifies TXT V6 but not the app build, so the exact implementation version is not established. Documentation was reviewed on 2026-10-03.

| Evidence source | Observed meaning | Available | Consistent with adjacent event/candidate transition | Establishes serving despite `NONE`? |
|---|---|---:|---:|---:|
| Android `registered` | Registered network cell used or eligible for signaling | 83 true rows | Yes: exact event identities | No: conflicts with connection status and PS PCI |
| Android `connection_status` | `NONE` means not serving; raw value 0 | 224/224 | No for 83 registered candidates | No; it is a direct negative serving indication |
| `SERVING_CELL_CHANGED` | Complete before/after identity transition | 37/37; exact against adjacent candidates | Yes, exact both sides | Not alone: derivation and authority against Android status are undocumented |
| `CELL_LIST_CHANGED` | One registered-list identity changes around each event | 37/37, masked Cell ID | Yes, masked-compatible | No; partial Cell ID does not settle Android semantics |
| PS `NetworkRegistrationInfo` | LTE data service is in service; channel/PLMN available | 156 contexts | Channel/PLMN fit in some cases; PCI conflicts in all | No; zero exact identity matches |
| Active data subscription | Candidate rows and callbacks use subscription 1 / slot 1 | All checked rows/callbacks | Yes | No; removes SIM ambiguity but not identity conflict |

Signal strength was counted only. No RSRP, RSSI, RSRQ, SINR, geographic location, map position, inventory proximity, model output, or residual was used to select an identity.

## Decision and effect on readiness

The event-to-candidate state machine is deterministic at the identity level: all 37 before/after edges agree, and all 37 cell-list transitions corroborate them with masked identifiers. The combined evidence still cannot establish a serving-state contract because Android explicitly says `CONNECTION_NONE` is not serving while `isRegistered()` describes a cell used or eligible for signaling, and PS NRI PCI 0 is a valid but conflicting identity field. Callback order explains why a CellInfo candidate can be older than the serving event; it does not remove either semantic conflict. Thus event names alone, `registered=true` alone, and their combination are insufficient to override Android's explicit status semantics safely.

**Decision A — SEMANTICS UNRESOLVED.** No fallback rule or applicability scope is proposed. No provenance class was added. The existing predicate remains the contradiction guard and rejects `NONE`. The pre-existing result of zero canonical observations remains zero; no production re-import was run because no adapter change is justified. The prior exact PLMN + Cell ID transmitter mapping count remains zero.

Current Concept 6A.1 readiness is now `real_data_ingested_serving_semantics_blocked`, decision `A_SEMANTICS_UNRESOLVED`. Concept 6A remains `no_measurement_data`. B7 measurement bandwidth remains unavailable; no bandwidth heuristic was applied. Absolute RSRP validation, calibration, and production-candidate readiness remain false. Outdoor state, LOS/NLOS, transmitter identity/truth, and TX power remain unresolved independent blockers.

The only next blocker is version-specific source clarification. The prepared [vendor questions](concept-6a1-2-vendor-questions.md) ask how `registered=true` plus `CONNECTION_NONE` should be interpreted, how the serving event is derived, and whether registered state can be used as serving evidence on devices that never populate a serving connection status. Nothing was sent.

## Invariance and validation boundary

Production adapter code and the sanitized fixture are unchanged. RF equations, canonical propagation, link budget, antenna behavior, optimizer, request builders, scenario and optimization fingerprints, persistence, and frontend files are unchanged. The change is documentation and generated reference material only. No fallback dry run, canonical re-import, signal-quantity promotion, residual, calibration, or Concept 6B work was run.

The test evidence and file comparison are in [test evidence](concept-6a1-2-test-evidence.json) and [post-change comparison](concept-6a1-2-post-change-comparison.json). The baseline, source, transition, ServiceState, and decision artifacts are linked above or below:

- [Pre-change baseline](concept-6a1-2-pre-change-baseline.json)
- [Source-state audit](concept-6a1-2-source-state-audit.json)
- [Transition consistency](concept-6a1-2-transition-consistency.json)
- [ServiceState consistency](concept-6a1-2-service-state-consistency.json)
- [Decision](concept-6a1-2-decision.json)
- [Test evidence](concept-6a1-2-test-evidence.json)
- [Post-change comparison](concept-6a1-2-post-change-comparison.json)
- [Vendor clarification questions](concept-6a1-2-vendor-questions.md)
