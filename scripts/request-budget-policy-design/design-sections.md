## Phase 0 — Baseline and preserved evidence

The study starts on main at `016c9c96579e2a95b14e3641f96bad00050d48d3`, VERSION0.11.0. The previous audit documentation/tooling is uncommitted. `baseline.json` records exact status/diff,1959 preserved file hashes and407 production-file hashes. W1 qualification, the invalid first eight-Cell audit, and the valid clean successor remain unchanged. All466 invalid-run and449 successor raw artifact identities, their archives, and supplemental successor quality logs were verified. No previous evidence is rewritten.

The valid successor is B:837/837 groups, operational PASS, budget mechanics PASS, product fit PRODUCT BLOCKER. Worst request11.418134s; deadline headroom48.581866s; kernel peak1,384,833,024 bytes; headroom67.7568%; zero OOM/kill/max;435 stable scientific input groups;352 six-Cell W1 matches. This design reuses that evidence. It does not run a new eight-Cell RF qualification.

## Phase 1 — Current limiter and ordering

`backend-go/rf_protection.go` owns `expensiveRFRoutes`, `protectExpensiveRFRoutes`, `middlewareFor`, `acquire`, `clientState`, `validAPIKey`. `main.go` constructs defaults and registers middleware. Exact source references are in source-audit.json.

Order: Gin Logger/Recovery → securityHeaders/requireHTTPS →1MiB MaxBytesReader wrapper →CORS →POST/protected-path selector →optional RF API-key authentication →60s request context →Gin ClientIP →lazy anchored-window reset →charge one attempt if below20 →per-client active check1 →nonblocking global channel2 →strict JSON decoding/validation →RF handler →serialization →deferred global/client release and context cancellation. Health/readiness were registered before the RF protection middleware. Other later routes traverse its selector but unlisted paths/non-POST methods bypass RF charging.

Auth failure401 charges0; HTTPS/CORS rejection before admission charges0. Budget exhaustion429 adds no new charge, sets no-store and ceil reset/Retry-After, and never calls the RF handler. Per-client/global busy429 charges1, Retry-After1, no RF handler. Handler400/413/422/500/504 and admitted cancellations retain their charge. Body wrapping happens early, but oversize decoding413 happens after charge and slots. Cancelled RF response writes no synthetic499. Successful and denied limiter responses expose Limit20, Remaining, relative integer ceil Reset; global busy preserves those headers. Window anchors on first charged request; next request at/after60s resets at its own time, not a globally aligned minute. Denials do not extend the anchor.

State is one process-local mutex map of at most4096 entries plus overflow; fields active/requests/windowStart/lastSeen. There is no periodic idle-TTL cleanup. New-key pressure evicts the oldest inactive entry, even if its window is live. If all entries are active, unknown keys share overflow. Eviction/restart/IP rotation defeat a universal retained-key minute guarantee; this study does not claim to repair those existing limitations.

## Phase 2 — Protected-route inventory

All19 protected routes are POST and currently cost1, including cached experiment submission. The complete table below comes from source-audit.json. A route can have multiple roles: `/simulate` is both mandatory network-map follow-up and independently callable; `/analyze-sector` is a propagation root and an Azimuth refresh. Classification follows callers, not the selected policy. Explanation uses retained root data but is an optional independent click, not a mandatory automatic follow-up. Coverage-surface export is another protected POST with recomputation, not a free download.

## Phase 3 — Actual frontend graph

`App.evaluateNetwork`: one Evaluate →N sequential Simulate calls. Map payloads copy current request globals, each selected tower's lon/lat, selected azimuth and indexed RF profile. `App.optimizeNetwork`: one Optimize →N sequential Simulate calls with each winning optimal_azimuth from the root response. `runNetworkSimulationQueue` awaits each call and stops at the first exception. Results are committed after the queue; root200 alone is not a completed network UI action.

`optimizeAzimuth`: Optimize-Azimuth →one Analyze-Sector refresh using returned optimal_azimuth. Single propagation uses Analyze-Sector once and gets rays/gaps together. Interference, Building Entry, Recommendation, Measurements, Path and reference tools issue one independent POST. Building Entry can return locally when current; explanation can use its local cache/no eligible changed Cell, costing0. An uncached eligible explanation costs1 with retained baseline/solution/run/domain; no hidden Optimize rerun.

Re-evaluate is another explicit Evaluate callback, not automatically triggered by Interference. Surface generate costs1; each format export costs another1. Experiment start costs1 POST; status polling GET starts after300ms then600ms and cancellation DELETE cost0 RF units. Job contexts are detached after queueing. History rerun has its own one-request callback and no map queue. Inspect, tool/tab navigation, reports and local persistence cause no automatic protected refresh. RequestCoordinator aborts superseded channels. apiClient has no automatic retry loop; StrictMode mount effects do not start these user callbacks.

## Phase 4 — Six-Cell journeys

Fresh retained bucket, valid sequential calls, no concurrency failure: A Evaluate/maps7 leaves13; B Optimize/maps7 leaves13; C Evaluate/maps→Interference8 leaves12; D full cycle15 leaves5; E Evaluate/maps→Optimize/maps14 leaves6; F cycle→Optimize/maps22 fails at request21, the fifth optimized map; G Optimize/maps→one uncached explanation8 leaves12. For F, request22 is not dispatched after failure. Two tabs each Evaluate/maps14 fit; two full cycles30 do not. Parallel tabs still share per-client concurrency1 and can generate charged busy rejections.

Likely next actions are inspection/explanation, another analysis, optimization or map refresh. Six already exhibits transport fan-out interruption after prior activity. It is not evidence that every indefinite six-Cell chain was promised to fit20.

## Phase 5 — Eight-Cell journeys

Equivalent A/B9 leave11; C10 leaves10; D19 leaves1; E18 leaves2; F28 stops at request21, the first optimized map; G10 leaves10. Two tabs each Evaluate/maps18 fit; two cycles38 do not. Clean successor cycle cases completed in approximately0.717–1.239s, leaving client-anchor estimates58.760502–59.283303s. The real boundary accepts20/denies21 before RF. Its rapid journey C used cycle→single Optimize→Interference, not a complete Optimize/maps action. The saved-response UI boundary test separately observed Optimize20 then map21 denied. F's28 calls are source-derived/offline, not newly measured successful RF work.

## Phase 6 — Product problem

The current budget counts transport attempts, including failures/busy attempts, rather than logical intent. That is a simple abuse bound across all protected entry points. However one network click requiresN+1 attempts, and cannot commit until maps finish. Increasing capacity alone fixes specified fresh chains but never guarantees an admitted root's children at an arbitrary residual balance. The design must separate that failure-atomicity problem from capacity/headroom. User intent is useful authorization context, not a reason to waive arbitrary RF calls.

## Phase 7 — Threat model

Constrain repeated Optimize/Evaluate, independent simulations, scripted API requests, cheap protected calls in volume, late failing expensive requests, cancellations and shared-IP tabs/users. Current20/60 charges these evenly, denies before RF on budget exhaustion, never refunds admitted failures, and2/1 limits simultaneous RF. It does not price CPU work: a720-ray/5000m Simulate can be expensive, while a reference calculation can be cheap. Neither route name nor a low map weight proves cheapness.

Current weaknesses: unlimited denied HTTP packets/access logs are not a network flood limiter; unprotected GET polling/DELETE controls are outside RF accounting; IPs are not users; NAT pools users; IP rotation, bounded-map eviction, restart and replica multiplication bypass a service-wide quota. Window-edge bursts are possible. Twenty experiment submissions can authorize up to1280 runs subject to queue/cache/worker controls, not necessarily execute1280 in one minute. None of these issues authorizes infrastructure/adaptive redesign here.

## Phase 8 — Frozen criteria

Evaluation lock was frozen before simulations/selection, with20 explicit criteria:6C/8C usability, heavy roots, follow-up abuse, NAT, tabs, cancellation, replay, implementation/state complexity, restart, future replicas, API/frontend compatibility, observability, backwards compatibility, tests, atomicity, denials and migration. No composite score hides tradeoffs.

Hard requirements: ordinary independent roots and independent Simulate remain≤20 per retained anchored window; no RF on budget/authorization denial; no concurrency privilege; bounded ephemeral state; no science/persistence/resource pricing changes. RequiredL3 costs28, so preserving a universal20-total ceiling is mathematically impossible. Accept exactly the necessary+8 only through verified dependencies. This is a normative security/product tolerance, not proof of equal deployed abuse resistance. Bounded reservation pressure can temporarily reduce available units; cleanup, cancellation and future abuse tests must address that tradeoff.

## Phase 9 — P0 current

Simple, compatible, bounded4096-client state; ordinary/root/independent-map ceilings20. FreshL1/L2 fit, but F fails for both6/8 and any late root can leave a partial queue. SixD leaves5, eightD leaves1. Keep P0 in production during this study and until a future replacement is validated. It fails the selected product envelope.

## Phase 10 — P1 higher flat budget

Workflow-derived thresholds at8C:9 one map action;10 map action+one explanation;18 Evaluate→Optimize;19 cycle;20 cycle+one explanation;28 cycle→Optimize/maps;29 that extended chain+one explanation;38 two cycles;56 two extended chains. The required minimum is28, not a convenient round30. Six F needs22.

Flat28 admits F from fresh bucket but increases independent Optimize/Evaluate/Simulate20→28 (+40%); conventional boundary ceiling40→56. At any finite flatB, B−1 prior calls followed by a root consumes the last unit and the first map fails. Adding atomic reservations remedies that separately, becoming P5 rather than a pure threshold change. Reject pureP1 under frozen independent ceilings and atomic-action criteria; this is not a claim that28 overloads hardware.

## Phase 11 — P2 fixed route weights

Integer accounting can preserve root20 while permitting F: every non-Simulate POST costs3, Simulate costs2, bucket60 tokens. EightF has4 non-map roots and24 maps:4×3+24×2=60. SixF48. The3:2 ratio is derived from the root ceiling and required chain, not an estimate of CPU ratios. With weightsR/M, B≥4R+24M and B≤20R implyR/M≥1.5; therefore independent Simulate capacity B/M is at least30. No positive same-route weighting can allow24 dependent maps while limiting indistinguishable standalone Simulate to20.

Root ceiling20 is preserved; independent Simulate becomes30 (+50%). Surface/Recommendation/Interference/experiments remain3 tokens per submission and20 such calls, with no claim that they have equal cost. Headers become token units; per-action3/2 charging is less transparent and still needs reservation for guaranteed map completion. Reject as a substitute for verified context.

## Phase 12 — P3 verified allowance

NaiveP3 grantsN free maps for every admitted root:20 eight-Cell workflows can perform180 RF steps, although independent calls remain20. Bounded per-ticket use does not bound the sum across tickets/windows. Reject that variant.

PreferredP3-capped: retain20 ordinary units, add a shared8-unit deterministic-follow-up pool per ClientIP/window, and prebook a root'sN child slots from available extra first then ordinary units. Only the existing network Evaluate/Optimize→Simulate and single Azimuth→Analyze-Sector automatic edges are eligible. Additional roots, explanations, exports, recommendations and experiments get no grant. Extra is shared across all roots/tabs, never8 per root. Exact total admitted RF attempts≤28 per retained window, and unassociated independent calls≤20.

Choose opaque128-bit server-issued IDs. Signed/self-contained tokens still need a consumed-slot ledger and shared counter to resist replay; signing adds complexity without removing state. A public scientific fingerprint alone is not a capability: bind an unpredictable ID to owner, parent and one-time hashes. No authorization implementation exists in this study.

## Phase 13 — Authorization security

No client-supplied cost, Cell count, expiry or expected hash is authoritative. Server validates the root and derives ordered expected child inputs from its complete parsed request and result. For Evaluate copy common globals and each tower's coordinates/azimuth/profile; Optimize replaces per-Cell azimuth with returned winning optimal_azimuth; Azimuth copies its standalone input with returned angle for Analyze-Sector. Include every recognized RF input/default/profile in a versioned authorization digest; retain redundant recognized fields rather than dropping them. This digest is separate from public scientific fingerprints, which remain unchanged. Key order/numeric spelling may normalize; different RF values cannot.

Bind owner to the same Gin ClientIP and configured RF authentication checks; bind model/dataset revision, parent operation and exact endpoint/index. Cell inflation, coordinates/RF changes, another endpoint/solution/client or recursive requests cannot get free RF. Each slot atomically claims once before concurrency/handler entry. Concurrent duplicates cannot both succeed. A known owned slot with a malformed/mismatched body burns that slot's funding and retires unused siblings, returns400, and performs no RF. Unknown/foreign/expired/replayed headers use normal charged denial rules, never paid or free RF fallback. Valid slot validation is bounded by existing1MiB body limit; claiming before expensive body verification prevents unlimited free validation of the same slot.

Tokens are ephemeral bearer capabilities: use deployment TLS and existing authentication; never URLs, persisted project state or logs. Same-IP token theft can consume an exact authorized slot; ClientIP alone does not distinguish NAT users. Rotating IDs and authentication do not make a global shared API key a user identity. Security requires future implementation/race/forgery tests. Go's crypto/rand supplies a CSPRNG; OWASP REST guidance calls for TLS and access control at endpoints. [Go crypto/rand](https://pkg.go.dev/crypto/rand), [OWASP REST security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html).

## Phase 14 — P4 separate buckets

Root20 and map24 are enough for F (four roots/24 maps), but every standalone Simulate can spend24 and total44 RF calls can be admitted; distinct bucket boundaries can compound. Minimal root4/map24 also fits F but cuts ordinary root/tool capacity20→4 and harms six-Cell use. A20/20 split denies required24 maps. A claimed client 'follow-up' flag is forgeable. Splitting only verified follow-ups requires P3's authorization anyway, without removing atomic reservation needs. Reject pure route split.

## Phase 15 — P5 reservations

Reserve N+1 current transport units before root RF. At20 it prevents partial actions but F still fails upfront: six Optimize at attempted16, eight Optimize at20, instead of spending its RF then failing maps. At28 F fits, but independent roots/maps become28 unless context constraints are added. Reserving one 'logical workflow unit' with20 units permits180 RF steps at8C, like naiveP3. Unused reservations must be released, spent root/maps never refunded, with cross-window liabilities retained.

The recommendedP3 uses this narrowly as prebooking its known child obligations. It does not reserve an invented multi-click full-cycle workflow or change all roots into cheap logical units. A standalone P5 adds no advantage; P5 with20 ordinary plus8 verified credits is the same recommended mechanism, not a second policy.

## Phase 16 — P6 aggregation fallback

One request can orchestrate root/maps, but changes API/streaming/progress/cancellation/error atomicity and frontend parsing. Measured Optimize/maps totals60,251,142 bytes exceed the current32MiB JSON guard if simply combined; full cycle113,898,816 bytes is larger. A single60s context differs from per-request deadlines. Recursive guarded HTTP risks slot deadlock; direct internal calls need an explicit child execution budget. Treating each aggregate as cost1 allows180 RF steps at20 roots. P3 solves the accounting issue without aggregation. Reject P6 as unnecessary architectural expansion, not a capacity claim.

## Phase 17 — Rejected directions

Reject CPU/RAM pricing, geometry/cost estimators, resource-dependent tokens and user multipliers: operational qualification already exists, and no calibrated abuse-price model is needed. Reject unbounded trusted exemptions and disabling map limits: one root can mint unchecked work/replay. Reject per-tab primary identity: scripts can create tabs/IDs; NAT identity remains IP. Reject resetting the window after each workflow: permits cycling/rate bypass. No sliding-window implementation, performance preset, RF optimization, Redis or new infrastructure.

## Phase 18 — NAT and tab effects

Local self-hosted one browser often sees one peer IP. Multiple tabs, office/university users, shared NAT and gateway-pooled browsers share ordinary20 and extra8; distinct observed IPs have independent budgets. P1 enlarges all pooled arbitrary capacity; P2 increases map pressure; P3 improves deterministic fan-out while keeping pooled independent ceilings, but outstanding reservations reduce availability for another tab. P4 shifts pressure between two arbitrary buckets; P5 retains pooling and can hoard reservations; P6 hides fan-out but does not identify users. No policy guarantees each of two NAT users its own28-call journey. Two concurrent tabs can hit per-client1 even with budget available. Distinct-IP two clients can each get their envelope, subject to global2.

## Phase 19 — Boundary bursts

For a retained anchored scalar bucketB, conventional upper bound is2B; the tight near-boundary count is2B−1 because an earlier charged request anchored the old window outside the short burst. P0:40 loose/39 tight. P1-28:56/55; P1-29:58/57; P1-38:76/75; P1-56:112/111. P2: standalone maps60 loose/59 tight; roots40 loose/39 tight. P4 root20/map24:88 loose,86 tight when both bucket boundaries align and each anchor is charged.

Recommended combined20+8:56 loose/55 tight total admissions, including carried liabilities. Ordinary roots/maps retain a40 loose ceiling. If the new window is anchored by an extra-funded carried map,20 ordinary units remain, allowing a tight ordinary-only burst40 instead of P0's39; explicitly accept that one-call anchor effect, not an unchanged tight burst claim. Holds survive reset, so delayed old grants cannot be stacked above28 in a later retained window. NaiveP3/logical aggregation:180 fresh RF steps and potentially greater bursts from delayed grants without an execution/held cap. All limits are semantic upper bounds, not RF throughput measurements; slots further constrain execution. Restart/eviction/identity churn exceptions remain.

## Phase 20 — Cancellation

All candidates keep spent root work charged. P0/P1/P2/P4 retain admitted attempts/weights; aggregation retains root charge. P3/P5 release only unspent held children. Root cancel before successful computation emits no capability, releases all child holds; root1 remains spent. Map claim spends its held source (ordinary or extra) before concurrency; cancel/failure retains it and retires unused siblings. No valid slot progress occurs on replay, invalid metadata or cancellation, so these cannot extend idle expiry or mint credits. Abandoned completed roots hold budget only until bounded idle cleanup. Existing handler/global/client release behavior stays unchanged.

## Phase 21 — Root failures

Auth401: no charge/holds/token. Ordinary budget429: no new charge/token. Per-client/global busy429: ordinary1 stays charged, no root authorization; slots released as today. Root400/413/422, deadline504, internal500 or pre-success disconnect: ordinary1 stays, unused holds released, no token. Reservation shortage429 after root attempt charge: no RF, no token, root1 retained if ordinary admission had room. Successful computation with a disconnect during serialization may have exposed a token header; immediately retire unused slots when that failure is observed, and otherwise idle expiry handles lost clients. A racing claimed child keeps its charge; no refund of performed/admitted work. Root success is validated typed complete result/current context, not status alone.

## Phase 22 — Concurrency

Budget reservation is only accounting. Every root/child continues through the same per-client active1 and global channel2, context60s and serialization/release path. No workflow priority, extra slots or whole-workflow lock. Valid child can still receive a charged busy429; burn its claimed unit and retire siblings. Explicit upfront budget guarantees exclude unrelated validation/concurrency/deadline/transport failures. Source-preserving tests must show that allowance cannot skip either slot acquisition.

## Phase 23 — Experiments

POST batch execution still costs one ordinary unit; no extra grants and no child authorization to experiment endpoints. GET job polling and DELETE cancellation stay outside RF budget. Jobs may expand64 runs and execute under worker1/queue16 after POST returns202 (or200 cache hit). Current RF slots protect submission, not background execution; request disconnect does not cancel an accepted job. No experiment admission redesign or dynamic weighting here. Reservations from another accepted action can reduce currently available shared-IP ordinary units; queued/running jobs themselves keep current semantics.

## Phase 24 — Six-Cell compatibility

Every ≤20-call ordinary legacy tape from a fresh bucket without outstanding holds remains admissible, apart from existing concurrency/validation failures. Legacy bodies, response scientific JSON, fingerprints and endpoint caps remain unchanged. Opt-in six-Cell main map actions get bounded credits; all selected L1/L2/L3 improve or remain complete. Single Azimuth's known one Sector refresh is eligible, not arbitrary Sector calls. Header Remaining now subtracts holds for opted-in actions; API documentation must distinguish available units from spent attempts. Pending obligations after reset can temporarily reduce another user's apparent budget; this is an explicit fairness/abandonment tradeoff, bounded by idle60s and progress-linked absolute lifetime, requiring validation. No claim of perfect compatibility for unbounded overlapping or abandoned workflows.

## Phase 25 — Eight-Cell product fit

Required L1/L2 fit today only from sufficient fresh balance; F does not. Recommend that one F should complete uninterrupted: users can analyze/re-evaluate and then compare an optimization in the same UI session, and Optimize's maps are mandatory for committing its result. This is a declared product judgment frozen before selection. After F, another explanation/analysis may wait; guaranteeing arbitrary chains would require unbounded allowance. F+one explanation would require29 raw calls, a separate larger envelope not selected. The detailed simulation table shows every candidate's fresh journey completion and denial stage.

## Phase 26 — Legitimate envelope

L1: one main network Evaluate/maps or Optimize/maps, or single-Cell Azimuth+Sector refresh. L2: Evaluate/maps→Interference; full cycle; Evaluate/maps→Optimize/maps; Optimize/maps→one uncached explanation. L3: one full cycle→Optimize/maps. Guarantees start from fresh retained IP, sequential successful inputs, no unrelated traffic. For each opted-in root, once RF admission with reservation succeeds, other actions cannot consume its children’s budget; finite lease and non-budget failures remain. Two users/tabs do not each acquire separate IP budgets. Repeated chains and inspections beyond F may wait. The categories come from source callbacks, not arbitrary audit labels.

## Phase 27 — Abuse envelopes

P0 roots/independent Simulate20, full map workflows floor(20/(N+1)):two at6/8. P1-28 roots/maps28, four complete6C workflows or three8C. P2 roots20/maps30, four6C/three8C. P4 roots20/maps24, four6C/three8C, total44. NaiveP3 and logical-unitP5/P6 can reach20 workflows/180 eight-Cell steps unless another execution cap exists.

Recommended: ordinary Optimize/Evaluate≤20 and independent Simulate≤20; extra eligible attempts≤8; all retained-window RF admissions≤28. Complete map workflows:four6C, three8C; fresh completed-workflow follow-up maps24. One8C root plus19 independent maps permits27 total map calls (versus20 current), while two6C roots are needed to use all8 extra and can permit26 maps plus two roots. Carried parent records can produce up to28 mapped calls in a later window without new roots in that window; every call still spends held ordinary/extra capacity there. These are deliberate quantified increases, not 'free work'. No estimate of CPU/RAM prices or actual executions/minute.

## Phase 28 — Bounded state

Keep current ClientIP state limit4096 plus its existing overflow fallback. Add ordinaryHeld, extraSpent, extraHeld to each tracked state and active child reservations. A record contains opaque ID, owning state/IP, operation/protocol version, N≤8, expected endpoint, used/funding bitmasks, up to8 fixed32-byte expected hashes, dataset/model/parent fingerprint, phase, timestamps and heap index. Store no full RF payloads, map bodies, results or project data. Temporary root DTOs already used by handlers are released after digest generation.

Invariant ordinarySpent+ordinaryHeld≤20; extraSpent+extraHeld≤8. Every indexed live reservation has≥1 held unit, so at most28 held records/IP. Remove the indexed record/heap entry when its last slot is claimed, copying only the needed claim receipt into that request. Global logical bound114688 held records; expected-hash storage bound29,360,128 bytes (28MiB), plus fixed metadata/indices. Transitional claimed receipts are bounded by4096 tracked per-client active reservations before the global check; only two can actually execute globally. Do not incorrectly bound pre-global receipts by two. Go allocator and ordinary HTTP-request overhead require future measurement. Actual heap must be measured in future saturation tests; no fake exact RSS claim.

Use one indexed min-heap entry/live record; remove it on early retirement, avoiding unbounded tombstones. Timer at next expiry plus lazy due cleanup on admission/control operations. Reset spent counters only; carry holds. Pin client entries with active requests or live records; never evict a live allowance. When no eligible client entry/global record slot exists, issue no workflow authorization; unknown clients can use only current shared ordinary overflow semantics. Overflow has no extra pool/leases. Fail closed on state exhaustion. Removing an inactive unreserved entry retains the current bounded-map/eviction limitation.

## Phase 29 — Future replicas

Current Compose is one app container/process. All candidate limiter counters reset locally; none creates a service-wide multi-replica quota. P0/P1/P2/P4 require shared gateway/store for aggregate multi-replica guarantees. StatefulP3/P5 additionally need sticky ownership plus a shared aggregate budget, or shared consumed/reservation state; signed IDs alone cannot solve replay/counters. P6 keeps one aggregate within its handling process but still needs a service-wide root budget. No Redis, sticky routing or distributed state is introduced now. Eight-Cell single-process qualification does not certify replicas.

## Phase 30 — Headers/API

Future optional request headers: `RF-Workflow: network-maps-v1` on Evaluate/Optimize or `azimuth-sector-v1` on Optimize-Azimuth; `RF-Workflow-ID` plus integer `RF-Workflow-Index` on its children. Both root intent and child ID on the same request are invalid. Endpoints and scientific request/response JSON remain unchanged; bindJSON's strict unknown-field behavior stays. Add headers to CORS allow/expose lists for cross-origin use. Advertise an additive rf_budget_policy capability in existing GET /api/meta; future frontend enables opt-in only when the server declares bounded-followups-v1. With an older server it uses the existing ordinary queue, avoiding a guessed capability. This is non-scientific metadata, not a new RF response shape.

Keep RateLimit-Limit20, Remaining=max(0,20−ordinarySpent−ordinaryHeld), Reset=ceil(seconds until anchored reset). Expose `RF-Followup-Limit:8`, Remaining=8−extraSpent−extraHeld, Reset=same anchor; `RF-Budget-Policy: bounded-followups-v1`. A successful opted-in root additionally returns Workflow-ID, Workflow-Remaining=N and Workflow-Expires=ceil(seconds to its earliest idle/absolute expiry). These are distinct from the RateLimit reset; renewal metadata can be returned after valid child progress. Headers reflect locked snapshots; changes by another tab can make later values lower.

Budget shortage429 gets no-store and Retry-After to next relevant capacity opportunity: ceil(min(anchor reset, earliest releasing lease expiry)) if a normal unit/reservation needs it; this is a retry opportunity, not a guarantee when holds survive reset. Capacity busy stays Retry-After1. Invalid/replay/expiry errors400/409/410 as specified, never automatic RF fallback. Existing clients ignoring new headers still work with ordinary semantics.

## Phase 31 — Observability

Keep keyed client hash/request sequence and denial logging. Add policy version, known root/child classification, hashed workflow ID, funding source, ordinary/extra available and held counts, remaining child slots, seconds to expiry and bounded denial reason. Counter labels only operation/class/reason, not IP/token/high-cardinality IDs. Log issuance/retirement/denial, not payloads, raw IPs or bearer tokens. Distinguish ordinary exhaustion, reservation shortage, slot busy, invalid/stale/expired/replay and state capacity. No machine-price/cost-estimator telemetry.

## Phase 32 — Fail closed

Missing/malformed/foreign ID, expired record, consumed slot, stale model/dataset, unsupported route/version or mixed metadata cannot grant extra or reserved RF work. Unknown/replay/expired attempts consume ordinary1 if available and otherwise return ordinary429; then denial no RF, no fallback. Stale record retires unused holds. A known owned unspent slot is consumed before bounded decoding; malformed/mismatched payload consumes its funding and retires siblings with400/no RF. Server restart invalidates all IDs; client re-runs deliberately under new ordinary policy. Random-ID allocation/system failure emits no usable capability; process restart is handled as state loss. No speculative cached fingerprint can reconstruct authorization.

Exact authorization-denial codes (after ordinary admission where applicable): malformed/mixed metadata, unsupported version or index400; wrong owner/operation403; consumed slot409; stale dataset/model409 with unused holds retired; expired/missing/restarted ID410. Ordinary or reservation budget shortage429; state-allocation exhaustion503 with no grant and Retry-After to earliest bounded cleanup opportunity. Existing authentication401 remains before charging. Ordinary-exhausted invalid attempts get429 rather than bypassing the budget. Known-owned slot malformed JSON/hash mismatch400, oversized body413, and validator rejection use the existing code, burn the claimed funding and retire siblings; no RF. Optional-header stripping/missing grant on an advertised protocol is a client protocol error, not permission to dispatch unrestricted children.

## Phase 33 — Implementation surfaces

P1 LOW: default/env/docs/tests, but does not solve atomicity. P2 MODERATE: token accounting, route table, headers/config/docs. P3 MODERATE: limiter state/reservation lifecycle; typed root result hooks (main.go/network optimization handler); APIclient metadata helper; existing sequential queue and three action callbacks; CORS/OpenAPI optional headers; tests/docs. No engine, payload-builder, persistence or UI layout changes. P4 MODERATE: route-class state/header semantics; meaningful verified split converges on P3. P5 MODERATE: same ownership/expiry/claim machinery; logical multi-click reservation would be HIGH. P6 HIGH: new orchestration/streaming/errors/progress/API/client guards. These are surface estimates, not implemented code or measured LOC.

## Phase 34 — Tradeoff matrix

The matrix below scores through explicit descriptions. P3's main cost is state/lifecycle complexity and held-budget NAT pressure; its benefit is preserving arbitrary-call20 while bounding the necessary extra8 and protecting root completion. P1 is materially simpler, but has weaker arbitrary-root/map ceilings and partial queues. P2/P4 cannot recognize semantic follow-ups from the shared route alone. P5 without a verified bounded increment fails product or abuse criteria. P6 adds architectural change without a unique policy benefit. No average security score masks the differences.

## Phase 35 — Minimality

A simpler flat or route-only policy cannot meet both required24 map dependencies and standalone Simulate ceiling20: the server sees the same route/payload capability until a verified parent is introduced. With raw20 unchanged and eight verified credits,28 is the minimum total necessary for F. Prebooking is required to prevent a root at residual balance from failing its mandatory queue. A public flag/fingerprint fails authorization; stateless signing fails one-time replay; a full aggregate endpoint is unnecessary. P3-capped is the smallest candidate meeting the frozen criteria, although not the smallest code change. Its security judgment is conditional on the future validation gates; no implementation equivalence is claimed.

## Phase 36 — Flat threshold judgment

A flat28 is sufficient for the finite fresh F accounting;29 adds one inspection and38 supports two cycles. It is rejected here because it permits28 arbitrary roots/maps and leaves residual-root partial failure at every finite threshold. If the product intentionally relaxes those frozen independent ceilings/atomicity, another study could select a simpler threshold. This study does not silently relax them. Live production stays20.

## Phase 37 — Workflow-aware judgment

Transport fan-out is the principal blocker identified by source and successor evidence. Verification is necessary to distinguish a dependent map from an arbitrary standalone simulation. Bounded shared credits are more semantically faithful than increasing every endpoint's ceiling. Do not grantN credits to every root indefinitely; add only8 per shared window and prebook the known queue. This partially discounts fan-out, deliberately not converting all workflows to cost1.

## Phase 38 — One recommendation

Recommended policy category **D — VERIFIED ROOT + FOLLOW-UP ALLOWANCE**, specifically P3-capped with20 ordinary units plus8 shared verified follow-up units and mandatory child prebooking. Final design verdict **C — WORKFLOW-AWARE ACCOUNTING IS PREFERRED**. These are different enumerations, not two recommendations. Fallback: retain P0/cap6 if the new protocol fails validation. No policy or cap change occurs in this task.

## Phase 39 — Exact intended semantics

Identity is unchanged Gin ClientIP, with the same optional RF authentication; never per-tab as primary boundary. Both pools use the retained client's existing anchored60s lazy window. On reset, set spentOrdinary/spentExtra to0 and retain held counts. Never reset for workflow completion.

For ordinary calls: charge1 from ordinary pool if available; all normal auth/deadline/2/1 slots/binding/RF rules apply. For opted-in eligible roots, charge ordinary1 and acquire existing slots as today. After strict binding/validation, before RF, derive N (selected unique towers for network;1 for Azimuth) and atomically reserve e=min(N,extraAvailable) extra children plus N−e ordinary children. If insufficient, return429 before RF; root attempt remains charged. Mark reservation pending; no public authorization. RF root runs unchanged. On valid complete success/current dataset+context, derive exact child hashes and issue opaque ID in response headers. Failures retire holds and issue no capability.

Funding is deterministic: earliest e child indices use extra, remaining indices ordinary. Each valid owner/route/index unspent claim transfers one held unit to matching spent atomically; mark used before slot acquisition/binding/RF. A claim's wrong body, busy result, cancellation, deadline or500 stays charged and retires unused siblings. Valid completed child renews idle lifetime; no retry/replay/invalid/cancel renewal. Last child retires the record after in-flight release. No child can issue another allowance. Explanation/Surface/Recommendation/Interference/measurements/experiments and independent Simulate receive no extra except the exact whitelisted child edges.

Pending root holds expire with its existing request context. Issued records have idle expiry60s after successful root or last valid child progress; on a valid in-flight claim, idle expiry may extend to that request's existing deadline. Absolute expiry is root-admission time+(N+1)×60s, never extended. For8 children max540s,6 children420s, Azimuth child120s; idle abandonment frees holds within60s unless a valid request is in flight. Active progress has finiteN slots and the absolute cap. Allowance guarantees budget only while valid; slow/unbounded transport and unrelated failures are not guaranteed.

Explicit cancellation cleanup: future DELETE `/api/rf-workflows`, with ID only in the `RF-Workflow-ID` header, same RF authentication and owner-IP checks, idempotently retires unused holds, never refunds spent or resets windows. This control endpoint performs no RF, mints no credits, and charges0 RF units; fixed-length ID parsing/lookup only. Client sends it on action abort/queue failure when ID known, without reusing the aborted signal. Server-observed failure also cleans up. Browser crash relies on idle expiry. Unknown controls return generic404; unauthorized401; foreign owner403 without state mutation. No persisted project change.

## Phase 40 — Parameter derivation

Ordinary20/window60 retain the existing abuse boundary. Extra8=required eight F calls(3×8+4)−20. Six F needs only2 above20, but one shared target parameter8 supports both and does not create a user tier. N is exact server-validated cardinality≤current product cap; generic internal maximum8 supports only future/audit eight testing, not admission above current6. Single Azimuth'sN1 comes from its existing one refresh.

Idle60 derives from the existing anchored period/request deadline, bounding abandonment to one period; absolute(N+1)×60 gives the root and each finite child one existing deadline interval. This is a lifetime bound, not CPU/RAM pricing or an unconditional network-completion estimate. Explicit future slow-queue/expiry tests are required. ID128 bits is a capability-security parameter, independent of RF cost. Max4096 clients retains current state bound; held records≤4096×28 and bounded4096 transitional receipts is derived from capacities, not a round state allowance.

## Phase 41 — Recommended accounting

Completed from fresh bucket (ordinary/extra):6C Evaluate or Optimize1/6;8C1/8. Six cycle7/8 (15 calls), eight11/8 (19). Six Evaluate→Optimize6/8 (14), eight10/8 (18). Six cycle→Optimize14/8 (22), eight20/8 (28). Six Optimize→explain2/6; eight2/8. Single Azimuth1/1 across two requests. Two sequential same-IP Evaluate tabs:6C6/8,8C10/8; pool shared, not doubled. Two full cycles or two extended chains may deny as table shows. Distinct IPs each have20+8, while global2 remains shared. After eight F ordinary0/extra0: another inspection may wait, explicitly outside the chosen envelope.

## Phase 42 — Recommended abuse simulation

Twenty bare Optimize or Evaluate roots, or twenty standalone maps, still exhaust ordinary units. The21st unassociated attempt is denied outside RF. At most8 extra authorized attempts and28 total admitted attempts occur in a retained window, including failed/busy attempts; outstanding held credits are deducted after reset, preventing delayed-grant hoarding. Three full8C map workflows (27 calls) or four6C (28) fit; this is a deliberate increase over P0's two. A script may obtain legitimate bound credits by performing real valid roots, but cannot turn them into arbitrary endpoints/coordinates/parameters, or recursively grant more.

One8C root+8 matched maps+19 independent maps=28 attempts (27 maps). Bare20 roots plus8 free arbitrary maps is impossible without parents/slot binding, but with eligible matched dependencies the total+8 is intentionally allowed. Forged/replayed attempts perform no RF under intended semantics; implementation security is not tested by this arithmetic. Two NAT users share the same pool; adding tabs does not multiply allowance. Near-boundary total55 tight/56 loose; ordinary-only40 can arise when an extra-funded carried request anchors the period. Current tight ordinary burst39 is therefore not claimed invariant.

## Phase 43 — Promotion dependency

Successful implementation and validation would remove the last currently documented eight-Cell budget blocker for the exact certified Profile A/W1 scope. New full28-call RF workflow, mixed/concurrency/header/forgery/expiry/regression tests must pass first. Separate cap promotion still requires deliberate review of validators, frontend/OpenAPI caps and independent Recommendation/Measurement limits; it is not executed here. No additional blocker is established by this study. Network-only persistence observation stays separate; full eight-Cell ray-bearing export is not promoted into a prerequisite absent an explicit product requirement. No W2/W3/general-domain certification.

## Phase 44 — Future implementation plan

1. Backend: refactor budget admission from slot acquisition without changing ordering/charges; add bounded two-pool holds, expiry heap and owned records; typed hooks for three root families and two child endpoints; authenticated retire control.
2. Frontend: optional metadata-aware API helper, pass ID/index through existing sequential queue and Azimuth refresh; clean up on abort/error; no layout, retries, payload-builder or persistence changes.
3. API: optional headers/CORS exposure and one no-RF cleanup control; scientific JSON unchanged; product cap stays6 during policy patch.
4. Observability: bounded fields/counters and distinct denial reasons.
5. Tests: unit properties, fake-clock expiry/reset, concurrent duplicate/claim/state-limit tests and all failure classes; prove denial invokes no RF.
6. Real E2E: current six and audit-only eight flows, shared tabs/IPs, fullF28; preserve exact science and resource/concurrency gates.
7. Docs: policy units, headers, finite envelopes, NAT/restart/cleanup behavior and rollback. Do not promote cap until policy gates pass.

## Phase 45 — Future validation gates

Require all frozenL1/L2/L3 six/eight chains; arbitrary independent request21 denial; shared-IP sequential tabs and concurrent busy charging; distinct-IP independence; matched-slot one-time use; forged/foreign IDs, inflatedN, changed coords/rays/radius/profiles/azimuth, other route/operation/recursive use; no root authorization from401/400/413/422/429/500/504/cancel; root/spent child never refunded; unused holds released.

Boundary/reset tests must cover extra-funded anchors, carry subtraction, repeated delayed claims, idle expiry, absolute deadline, in-flight completion races, client crash, cleanup DELETE ownership, restart, state-full/overflow and heap/tombstone bounds. Verify both20/8 inequalities after every event, compare headers with locked snapshots, ceil Retry-After, no RF on all denials, and unchanged2/1 slot ownership/release. FullF28 on shipping-equivalent Profile A must preserve45s request/15s headroom/3GiB kernel peak/zero OOM and deterministic science; no higher-tier rescue. Saturate metadata state to measure actual Go heap separately. Tests in this study verify arithmetic/source preservation only, not this future implementation.

## Phase 46 — Rollback

Disable new issuance; invalidate outstanding IDs and retire unspent holds without refunding spent attempts. If reverting in-place, conservatively fold ordinarySpent+extraSpent into min(20,totalSpent) for the existing live anchor, or retain exhausted state until reset; do not gift a fresh window. Let in-flight handlers release their usual slots. Restore middleware20/60, strip optional headers/control/API helper behavior, and use the original queue. Existing RF JSON, scientific fingerprints and saved projects require no migration. A process restart has the same current counter-reset limitation and rejects stale IDs; it is not a silent credit-refund strategy.

## Phase 47 — Production invariance

All407 starting production files must retain their exact hashes: backend/frontend, policy, data, adapter, Docker/Compose, OpenAPI and VERSION. All1959 preserved prior artifacts also remain exact. Current cap6/frontend6/OpenAPI6, budget20,2/1 slots,60s deadline, worker1/queue16, Auto observation-only, RF/search/Pareto/persistence/fingerprints unchanged. Study code only inventories source and evaluates finite arithmetic tapes; it creates no token, HTTP middleware, RF endpoint or live enforcement mechanism.

## Phase 48 — Version

Retain VERSION0.11.0. No release, tag, push or publishing. Add only design Markdown/JSON/HTML, study tooling/tests/lock/manifests and an Unreleased documentation entry/reference-page registration. Prior studies stay untouched.

## Phase 49 — Quality and freeze

Run backend test/race/vet, frontend tests/lint/build, both current real E2Es with ATOM_REAL_E2E=1 and JSON execution guards, study arithmetic/source tests, docs build/validation, version consistency and diff check. Revalidate preservation/source hashes and phase/final-item coverage. Logs stay outside Git with size/SHA index/archive. Keep the criteria/evidence frozen and production P0/cap6. Next action is a separate **Bounded Verified Follow-up Policy Implementation and Validation** task; no implementation or promotion in this study.
