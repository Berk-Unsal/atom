# Bounded Verified Follow-up RF Budget Policy Implementation

**A — VALIDATED — READY FOR NORMAL RELEASE**

Normal product cap remains **six**. The policy retains20 ordinary units and adds8 shared, server-verified deterministic child units per ClientIP/anchored60s window. No scientific JSON, equations, fingerprints, search, Pareto, persistence, estimator admission or Auto behavior changed.

## Authority and freeze

Implementation lock SHA256: `f949ec5bc406e0941e9e01392d75a88920ff6da8ddf97a23eaf9e1d2143b3baf`. Frozen before implementation tests. Authoritative design: [policy study](eight-cell-request-budget-policy-design.md). Starting branch/main HEAD `a10284a708661795b1e31bd1f40c614acf55e8f4`, VERSION0.11.0. Historical tracked evidence and scientific sources remain hash-identical; see invariance.json.

## Architecture and security

Authentication and request context precede budget admission. Ordinary calls spend one before unchanged concurrency2/1. Eligible opted-in roots bind/validate first, then atomically reserve their exact child obligations before RF. Server-derived typed children are bound by separate versioned SHA256 digests;128-bit random opaque IDs select owned one-time slots. No public fingerprint grants access. Header metadata never enters scientific responses or project data.

Root/protocol strings are shared whitelisted literals and client keys own bounded copies, avoiding retention of oversized URI/header backing buffers. Records store eight fixed digests, masks, identity hashes and timestamps; no RF payloads/results. The indexed heap removes records at last claim/retirement; request-local active receipts bridge completion.

Valid children claim funding before concurrency/body validation. Any admitted failure stays spent and retires unused siblings. Invalid claims are ordinary-charged denials without RF. Live replay409; after retirement/missing410, since no tombstone ledger is retained. Authentication401 and exhausted-budget429 add no new units. Failed roots grant nothing usable.

## Accounting and lifecycle

| Journey | Six ordinary/extra | Audit-eight ordinary/extra |
|---|---:|---:|
| Evaluate/maps |1/6|1/8|
| Optimize/maps |1/6|1/8|
| Full cycle |7/8|11/8|
| Evaluate→Optimize/maps |6/8|10/8|
| Cycle→Optimize/maps |14/8|20/8|

At every transition: ordinarySpent+ordinaryHeld≤20; extraSpent+extraHeld≤8. Reset clears spent only. Held liabilities carry. Earliest indices use extra first. Ordinary capacity cannot be stolen from an already reserved child queue. Reservations do not grant concurrency priority and finite/non-budget failures remain possible.

Idle expiry60s renews only on valid progress; absolute root-admission+(N+1)×60s never renews. Pending holds are tied to request cancellation/deadline. Authenticated owner DELETE /api/rf-workflows retires unused units without refund/reset; unknown or repeated retirement404 is idempotent in effect. Browser cleanup uses a separate bounded signal; server timers provide correctness.

Same-IP tabs/NAT users share counters, holds and active1; distinct socket IPs share only global2. Restart loses counters as before and invalidates old capabilities. Future multi-instance aggregate enforcement would need additional infrastructure; none is introduced.

## Operational metadata and compatibility

Only Evaluate/Optimize Network and Optimize Azimuth opt in. Network maps and Azimuth Sector refresh receive exact ID/index headers. Other tools, exports, explanation, measurements, recommendations and experiments remain ordinary. Experiments retain worker1/queue16/max64 and detached accepted jobs.

GET /api/meta advertises bounded-followups-v1. The frontend preserves legacy calls when absent and fails closed if an advertised root omits/mangles its grant. Existing queue order, returned-angle mapping and result commit semantics remain. No automatic RF retries, visual redesign or performance controls. CORS permits/exposes only necessary new operational headers.

RateLimit-Remaining subtracts spent and held units. Follow-up headers expose shared8 availability; Reset is the anchored window, distinct from workflow expiry. Budget Retry-After is a rounded next opportunity, not a promise. Headers are locked snapshots and peer activity/later terminal cleanup can change availability. New policy logs hash peer/workflow identity and omit raw token/IP/payload; existing framework access logging is unchanged.

## Validation and resource evidence

Six shipping:16/16 cases,640 scientific matches. Audit-eight:16/16 cases,800 scientific matches,448 successful required F28 calls. F28 worst `9.178460884s`; minimum deadline headroom `50.821539116s`; process-lifetime kernel peak `1203433472` bytes covers all F28/ordinary comparison/critical cases. All below frozen45s/15s/3GiB gates; OOM/kill/max0.

The exact frozen Go1.26.6 Linux/arm64 CGO-disabled images run on2 CPU/4GiB/cgroupv2 with Ankara2026.07. The audit source copy changes only MaxNetworkTowers6→8; normal frontend/OpenAPI stay6. Process executable hashes were verified. Golden responses were regenerated from the immutable preserved shipping binaries in separate containers and additionally matched2153 preserved historical response hashes; historical traces were never rewritten.

Metadata-only synthetic worst logical state:114688 records/heap entries across4096 clients. Live heap `81954248` bytes; sampled peak heap `96358064`; peak incremental heap `95190896`. RSS `112177152`, delta `99217408`; cgroup peak `104890368`. Frozen gates256MiB incremental live heap,384MiB RSS delta,768MiB kernel peak passed. This fixture stores all eight digest slots without unsafe RF volume; it is separate from operational RF qualification.

Real browser L3 completed22 calls at cap6 and verified shared-tab residual prebooking rejection. Existing budget/deadline and new bounded-follow-up suites each discovered/executed/passed one named test with skipped0. Additional real API tests covered standalone20/21, distinct/shared IP, replay/forgery/mutation, cancellation, root/child concurrency and normal6-accept/7-8-reject caps. White-box RF counters prove denied requests never enter RF.

Backend fake-clock/property/race suites verify carry, expiry, heap reconciliation, failures, allocation exhaustion, pinning/overflow and rollback.434 frontend tests pass. Development failures were preserved and corrected; incomplete/no-test attempts were never qualification evidence.

## Rollback and release

The in-process disable method stops issuance, retires holds and invalidates IDs, conservatively folds ordinary+extra spent into the existing ordinary20 window and removes advertised capability. It does not create a fresh refund window or require project/science migration. Process restart retains the pre-existing scalar-reset limitation. Legacy client behavior is restored through capability refresh/reverted frontend plumbing.

Repository policy records implemented changes under Unreleased and updates canonical VERSION when releasing. VERSION/package references remain0.11.0; next minor release recommendation0.12.0. No tag, release, push or publishing. A separate6→8 product promotion is the single next action after final completion verification, confined to the frozen W1/ProfileA scope.

## Required final report

1. **Starting baseline:** main @ a10284a708661795b1e31bd1f40c614acf55e8f4; initial checkout clean; VERSION0.11.0. Freeze capture includes the newly created study directory only.
2. **Implementation-lock SHA256:** f949ec5bc406e0941e9e01392d75a88920ff6da8ddf97a23eaf9e1d2143b3baf
3. **Production files changed:** Backend main.go, rf_protection.go, network_optimization_route.go plus new rf_workflows.go; frontend App.jsx/apiClient.js plus new rfWorkflow.js.
4. **Limiter architecture before/after:** Scalar ordinary attempts become ordinarySpent/Held and extraSpent/Held, with bounded opaque grants; accounting precedes unchanged slot acquisition.
5. **Middleware ordering after implementation:** Security/body/CORS → protected selector → auth → deadline → ClientIP/context snapshot → admission/claim → per-client/global slots → strict binding/validation → prebooking or digest verification → RF → issuance/serialization → cleanup/release.
6. **Ordinary accounting implementation:** Every ordinary admitted attempt spends1 before concurrency; exhausted-budget/auth denial does not spend; errors/cancellation retain charges.
7. **Extra accounting implementation:** Shared extra8 per tracked ClientIP/window, usable only through one-time exact verified child slots.
8. **Window/reset semantics:** First admitted request anchors60s; lazy reset clears spent counters only.
9. **Held-unit carry semantics:** Both held counters carry through reset and subtract new-window availability; no workflow-triggered reset.
10. **Workflow record structure:** Fixed eight SHA256 slots, masks/count, owner/auth/context/parent hashes, fixed root/protocol/endpoint, timestamps, pending flag and heap index; no RF bodies/results.
11. **Workflow ID generation:** crypto/rand16bytes → lowercase32-character hex,128 random bits; entropy/collision failure fails closed.
12. **State bounds:** 4096 clients plus ordinary overflow; at most28 indexed held records/IP,114688 global; pre-global active receipts bounded4096; busy-client receipts dropped.
13. **Expiry data structure:** Indexed min-heap, one entry/live record, immediate removal, generation-safe next-expiry timer and lazy cleanup; no tombstones.
14. **Eligible roots:** Evaluate Network, Optimize Network, Optimize Azimuth only.
15. **Eligible children:** N ordered Simulates after network roots; one Analyze-Sector after Azimuth.
16. **Ineligible route preservation:** Standalone Simulate/Sector and all other tools/experiments remain ordinary-only; no recursive child grant.
17. **Root opt-in protocol:** Optional RF-Workflow network-maps-v1 or azimuth-sector-v1 on compatible root; malformed/mixed/unsupported intent400.
18. **Root prebooking semantics:** After strict validated root input and normal slots, reserve exact server-derived N before RF; earliest indices extra first, then ordinary.
19. **Root insufficient-budget behavior:** 429 before root RF; root ordinary1 remains; no ID or residual holds; no-store/ceil opportunity Retry-After.
20. **Pending-root failure cleanup:** Pending context cancellation/deadline, errors, panic/serialization failure retire unspent holds; no usable failed-root grant.
21. **Evaluate child derivation:** Validated globals and ordered selected towers/profile; selected azimuth; every recognized/default and redundant legacy field bound.
22. **Optimize child derivation:** Same input structure, replacing each corresponding azimuth with the winning returned optimal_azimuth.
23. **Azimuth child derivation:** Exact parsed standalone input with returned winning angle; index0 Sector.
24. **Authorization canonicalization/digest:** Versioned SHA256 of decoded effective/legacy requests plus raw recognized profile fields, endpoint and index; key order/numeric float spelling normalized; meaningful root order retained; public fingerprints untouched.
25. **Capability issuance:** Only complete successful current-context roots activate records and return header metadata; no scientific JSON additions.
26. **Child claim ordering:** Known owned unspent slot atomically claims before per-client/global concurrency and binding/RF.
27. **Atomic claim result:** At most one claim wins. Known live consumed slot409; after record retirement/missing410. No RF for either denial.
28. **Funding conversion:** Held--/spent++ in the same funding pool under mutex; availability unchanged; no refund.
29. **Child body verification:** Strict bounded decoding/validation, then exact digest equality before RF; wrong body burns funding and retires siblings.
30. **Replay behavior:** Live replay409, retired/missing410; ordinary-charged invalid denial unless ordinary exhaustion429; no RF fallback.
31. **Forgery behavior:** Random/altered IDs, unsupported versions/indexes and mixed metadata perform no RF.
32. **Wrong-owner behavior:** Wrong ClientIP/auth context/operation403 after ordinary invalid-attempt charge; authentication401 before charging.
33. **Stale-context behavior:** Changed dataset/model409, unused holds retired, no RF; each request uses captured immutable building index.
34. **Expired behavior:** Idle/absolute expiry removes record/holds; subsequent claim410, or429 if ordinary denied.
35. **Error/status mapping:** 400 malformed/version/index/body;401 auth;403 owner/operation;409 live replay/stale;410 missing/retired/expired;429 budget/busy;503 safe-state allocation; existing RF errors retained.
36. **Cancellation behavior:** Canceled admitted roots/children stay charged; pending context callback, server failure cleanup and independent client DELETE assist; finite timer fallback.
37. **Root failure behavior:** Failed root retains ordinary1, releases unused holds, exposes no usable authorization.
38. **Child failure behavior:** Claimed child failure/busy/body error/cancel/deadline/500 retains funding and retires siblings.
39. **Idle expiry:** 60s from successful issuance or valid completed progress; valid in-flight claim may bridge existing request deadline; invalid/replay/cancel never renew.
40. **Absolute expiry:** Root admission+(N+1)×60s, immutable:120s Azimuth,420s six,540s audit-eight.
41. **Window carry/reset result:** Fake-clock extra and ordinary carry tests pass; spent clears, held remains, no capacity stacking.
42. **Cleanup endpoint:** DELETE /api/rf-workflows, ID header only, same auth/IP;204 retirement, repeated/unknown404, foreign403, auth401; zero RF units/refunds/resets.
43. **Restart behavior:** Process-local state loss invalidates old IDs;410/no RF; counters retain existing restart-reset limitation.
44. **Client-state eviction behavior:** Active/live-held clients pinned; inactive unreserved eviction preserved; client keys copied without retaining forwarded-header buffers.
45. **Overflow behavior:** Ordinary shared overflow preserved; no grant/extra hold; state shortage503 and extra remaining0.
46. **API meta capability:** Optional rf_budget_policy=bounded-followups-v1 in /api/meta; disappears when in-process policy disabled.
47. **Request headers:** RF-Workflow root intent; paired RF-Workflow-ID/Index children; ID-only cleanup; no token URL/body/persistence.
48. **Response headers:** Ordinary Limit/Remaining/Reset; RF-Budget-Policy; follow-up Limit/Remaining/Reset; successful root ID/Remaining/Expires.
49. **CORS changes:** Allow three request headers and expose operational/limiter headers; original origins/methods/credentials preserved; real preflight passes.
50. **Retry-After behavior:** Ceil min(anchor reset, owner lease release) for budget; earliest safe expiry for state allocation; busy1. Opportunity, not guaranteed admission.
51. **Observability:** Bounded known-operation/class/event logs, keyed client hash and hashed workflow ID, funding/available/held/expiry/reasons; new policy logs contain no raw token/IP/body.
52. **Frontend capability detection:** Opt-in only for exact advertised capability; absent/legacy server uses ordinary flow.
53. **Evaluate frontend integration:** Existing selected-order sequential queue carries corresponding ID/index and current chosen azimuth.
54. **Optimize frontend integration:** Existing queue preserves returned winning ID→azimuth mapping and result commit after all maps.
55. **Azimuth frontend integration:** Azimuth intent followed by Sector index0; no RF JSON change.
56. **Abort/error cleanup:** Action-local closure handles abort/error cleanup once, independent bounded signal; no cross-action ID sharing or RF retries.
57. **Legacy-server compatibility:** Old server capability absent: same four-argument postJSON call and ordinary queue; regression tests pass.
58. **Legacy-client compatibility:** No intent/child headers retains ordinary20/60, same science/status/deadline/concurrency.
59. **Standalone Simulate 20/21 result:** Real shipping6/8 API probes:20 standalone Simulates200,21st429; unit RF counter proves20 executions.
60. **Six-Cell Evaluate/maps accounting:** Ordinary1/extra6; no holds after completion.
61. **Six-Cell Optimize/maps accounting:** Ordinary1/extra6; no holds after completion.
62. **Six-Cell full-cycle accounting:** Ordinary7/extra8.
63. **Six-Cell L3 accounting:** Ordinary14/extra8;22 successful RF calls; real browser and all16 shipping cases pass.
64. **Eight-Cell Evaluate/maps accounting:** Ordinary1/extra8 in isolated audit build.
65. **Eight-Cell Optimize/maps accounting:** Ordinary1/extra8 in isolated audit build.
66. **Eight-Cell full-cycle accounting:** Ordinary11/extra8.
67. **Eight-Cell F28 accounting:** Ordinary20/extra8/held0; all28 calls complete for16 frozen eight-Cell layout/band cases.
68. **Post-F28 denial result:** Unrelated29th ordinary Interference429 for every F28 case; denial precedes handler work.
69. **Residual-balance prebooking result:** Residual shortage charged root1,429/no root RF/no ID/no holds; two-tab browser proof and RF-counter unit regression.
70. **Shared-IP result:** Shared20+8/holds; two sequential Eval tabs six6/8, eight10/8; no multiplier; NAT peer pressure documented.
71. **Distinct-IP result:** Distinct real Linux socket peers get separate20+8 while sharing global2; tested.
72. **Concurrent claim result:** Concurrent duplicate live slot has one winner;409 loser; retired receipt410. Race and real slow-body/replay tests pass.
73. **Concurrency2/1 result:** Real two-valid-child and same-IP busy tests, additional root/root global2/body-disconnect release and existing unit tests pass; no allowance exemption.
74. **Forgery test matrix:** Random/altered/foreign/wrong endpoint/negative/out-of-N/mixed/missing/unsupported cases deny before RF; actual shipping probes plus white-box counters.
75. **Payload mutation matrix:** Coordinates/frequency/rays/radius/power/beam/azimuth/calibration/model/profile; every recognized profile field and redundant gain aliases changes private digest; formatting equivalence passes.
76. **Root failure matrix:** Auth,malformed,oversized,validation,budget,busy,500,deadline,cancel tested; no usable grant/hold leak.
77. **Child failure matrix:** Malformed/oversized/validation/mismatch/busy/cancel/deadline/500 tested; spent retained/siblings retired.
78. **Expiry test matrix:** Idle,valid progress,no invalid/replay renewal,absolute/in-flight cleanup and terminal races pass.
79. **Reset/carry test matrix:** Spent reset, held carry, ordinary and extra delayed claims, old/new pressure and reconciliation pass.
80. **Boundary-burst result:** Combined loose56/tight55; current ordinary39 tight and accepted extra-anchor ordinary40 case explicitly tested.
81. **Cleanup test matrix:** Owner204,repeated/unknown404,foreign403,auth401,active/final/expired/restart lifecycle/races verified; no refund or RF.
82. **State-capacity result:** 4096 pinning/eviction/overflow fail-closed and maximum114688 held-record synthetic saturation pass.
83. **Expiry-heap result:** Indexed heap membership/positions/holds reconcile through1500 randomized operations, concurrent lifecycle tests and full saturation expiry; no tombstones/leaks.
84. **Saturation Go heap:** Live HeapAlloc 81954248bytes; peak sampled 96358064bytes; incremental peak 95190896bytes, below frozen256MiB.
85. **Saturation RSS:** RSS 112177152bytes; delta 99217408bytes, below frozen384MiB.
86. **Saturation cgroup memory:** Kernel peak 104890368bytes, below frozen768MiB; isolated metadata-only Profile A; events allzero.
87. **Full F28 worst request latency:** 9.178460884s across448 required F28 calls.
88. **Full F28 minimum deadline headroom:** 50.821539116s under60s; gate at least15s.
89. **Full F28 peak cgroup memory:** 1203433472bytes process-lifetime kernel peak covering F28, ordinary science comparisons and critical cases; below3GiB.
90. **F28 OOM events:** oom0/oom_kill0/max0; no Profile B/C rescue.
91. **Scientific invariance:** 640 six and800 eight successful JSON hashes match frozen shipping-binary baselines for Evaluate/Optimize/Simulate/Azimuth/Sector and Interference;2153 historical trace hashes match; no scientific-source change.
92. **Six-Cell regression:** All16 frozen six-Cell layout/band cases plus browser L3/legacy/science regressions pass.
93. **Existing RF budget E2E:** ATOM_REAL_E2E=1; named budget test discovered1/executed1/pass1/skipped0, legacy capability hidden solely to exercise ordinary behavior.
94. **Existing RF deadline E2E:** ATOM_REAL_E2E=1; named deadline test discovered1/executed1/pass1/skipped0; exact frozen scientific hash retained.
95. **New six-Cell real E2E:** ATOM_REAL_E2E=1; bounded six browser test discovered1/executed1/pass1/skipped0; full L3 and shared-tab prebooking.
96. **New eight-Cell audit E2E:** 16 discovered/executed/passed, skipped0 on shipping Go1.26.6/Linux-arm64/CGO0/ProfileA; actual API workflows from frozen frontend payload builders, frontend cap remains6.
97. **Standard 7/8 rejection proof:** Normal Evaluate/Optimize/Interference/BuildingEntry plus Explanation/Measurements:6 accepted;7/8 rejected. Independent Recommendation cap5 and frontend/OpenAPI cap6 preserved.
98. **Audit binary differential:** Disposable audit source differs only MaxNetworkTowers6→8; exact executable hashes verified from /proc/1/exe; no environment cap override.
99. **Race-detector result:** Full go test -race ./... and focused claims/cleanup/expiry/reset/eviction/root-finalization/cancel stress pass.
100. **Property/invariant test result:** Deterministic1500-step state-machine and concurrent lifecycle invariants pass; no negative/over-cap holds, duplicate claims or orphan indexes.
101. **Rollback result:** In-process disable retires grants, invalidates old IDs and folds spentOrd+spentExtra conservatively into existing20 bucket without fresh reset; no project/science migration.
102. **Product Cell cap status:** Normal product cap remains6 throughout. Eight only in disposable audit copy.
103. **Estimator-admission status:** Paused; no estimator/adaptive admission reopened.
104. **Auto status:** Observation-only; unchanged.
105. **VERSION result:** VERSION/package-visible references remain0.11.0 under repository policy to update canonical version when releasing; implementation recorded under Unreleased.
106. **Release recommendation:** Recommend next MINOR0.12.0 after validated A; no release/tag/push/publishing performed.
107. **Files created/changed:** Focused backend/frontend policy and tests; OpenAPI/Unreleased/generated docs; implementation report/JSON/HTML and validation locks/manifests/tools.
108. **Raw evidence storage:** 208 hashed raw artifacts outside Git; archive /tmp/atom-bounded-followup-policy-raw.tar.gz, 32675309bytes, SHA256 bb7a6c1dc3e427200d1b559ced7d06840cc5ae6aabb0e0e15e3144d6b4d5293f. Reproducible build contexts excluded.
109. **Full tests/checks:** Backend test/race/vet;434 frontend tests/lint/build; three real named E2Es; fake clock/security/property/state saturation;16 six/16 eight shipping workflows; science/cap/differential; docs/version/diff checks.
110. **Methodology violations:** No final qualification methodology violations. Development attempts with wrong cwd, UI selector assumptions, broad fixture glob and missing observer permission were rejected, preserved and corrected; never counted as passing evidence.
111. **Missing evidence:** No required evidence missing after final checks. Metadata saturation is synthetic worst logical state, not RF throughput qualification; eight audit is API-equivalent because normal frontend stays6.
112. **Final A/B/C/D/E implementation verdict:** A — VALIDATED — READY FOR NORMAL RELEASE.
113. **Whether the eight-Cell budget blocker is removed:** Yes in exact frozen W1/ProfileA scope after this validated implementation; no cap promotion here.
114. **Remaining blockers to 6→8:** Separate cap-promotion review required; no additional known blocker in frozen scope. W2/W3 and broader deployment are not qualified; no full-ray persistence blocker introduced.
115. **Freeze decision:** Freeze implementation lock, final source/binary/evidence identities and measurements; preserve historical studies and cap6.
116. **Single recommended next action:** A separate Product Cell Cap Promotion6→8 task, constrained to the already-qualified scope.
