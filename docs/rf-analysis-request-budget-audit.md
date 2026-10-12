# RF analysis request-budget audit

Completed 2026-10-03. Scope: request admission, retry timing, and diagnostics. No RF equations, payload builders, fingerprints, result freshness, interference semantics, or optimizer behavior changed.

## Finding and resolution

**Classification G — rate limiting is working as designed**, with **H — premature advertised retry timing** as a confirmed independent defect. The user confirmed the observed error occurred **after earlier RF runs**. Each six-cell network evaluation costs seven protected HTTP requests. Evaluate → Interference → Re-evaluate costs **15**, leaving five of the default 20 units. A prior six-cell evaluation/optimization plus that sequence requires **22** within one window: admission stops at attempted request 21. This explains exhaustion without duplicate dispatch or an incorrectly low fresh-workflow budget.

Keep the limit, bucket structure, attempt accounting, and visible error. Fix the demonstrated timing defect by rounding relative reset/retry seconds **up**, and add structured admission-denial diagnostics. Raising capacity, consolidating unlike scientific responses into a new API, or splitting expensive workloads is unsupported by this evidence. Exhaustion after earlier activity remains an intentional 429 requiring a user-triggered retry after expiry.

## Starting baseline and budget owner

- Repository `/Users/berkunsal/Desktop/urban-ray-tracer`, branch `main`, HEAD `9617f37dd74de1843731cbefefd3c00a83c07f13`, VERSION `0.10.0`.
- `git status --short` and `git diff --stat` were empty. No pre-existing changes.
- Baseline: `go test ./... -run 'TestRF|TestInterference|TestCombinedSector' -count=1` passed; targeted frontend workflow/API tests passed **32 tests**.
- Owner: `backend-go/rf_protection.go`, `rfRequestLimiter.acquire`, `middlewareFor`, and `protectExpensiveRFRoutes`; installed globally in `backend-go/main.go`. No frontend budget owner or reverse-proxy RF limiter was found.
- Defaults: `RF_REQUESTS_PER_MINUTE=20`, 60-second client-anchored fixed window; `MAX_CONCURRENT_RF_REQUESTS=2` globally, `MAX_CONCURRENT_RF_REQUESTS_PER_CLIENT=1`, `RF_REQUEST_TIMEOUT_SECONDS=60`. Defaults are in Go, Dockerfile, Compose, API/deployment documentation. Missing, malformed, zero, or negative environment values use the default through `envInt`; the low-level limiter constructor clamps values below one to one. The live `atom-app` container inspection confirmed 20/2/1 and unset `TRUSTED_PROXIES`; it was not rebuilt by this audit.
- Key: Gin `ClientIP()`, shared across endpoints, browser tabs, projects, users, and sessions at the same peer IP, local to one limiter/process. Forwarding headers are trusted only for configured `TRUSTED_PROXIES`; the production router explicitly disables proxy trust by default. Vite proxies `/api` to `localhost:8080`, which can pool browsers behind its peer address. Existing container logs show the socket peer `192.168.117.1`; there is no session-specific bucket. IPv4 and IPv6 loopback are separate IP identities; mapped IPv4 addresses are normalized by Gin's IP parsing.
- A client's first attempt anchors the window; the next request at/after 60 seconds resets the counter. Denials do not extend expiry. Process restart discards state. The bounded 4096-client state table evicts an inactive oldest entry; all-active overflow shares fallback state. These existing exceptional behaviors are unchanged.

Exact existing message: **RF analysis request budget exceeded; retry after the current rate-limit window**. Production emission is the resource-prefixed message in `rfRequestLimiter.acquire`. `frontend-react/src/utils/apiClient.js` (`requestJSON`) throws the server JSON `error`, and App callers store its message; `frontend-react/src/components/WorkspaceChrome.jsx` displays it in the CommandBar global alert or ToolDrawer alert. The literal also appears in the existing mocked browser regression in `frontend-react/e2e/workspace.spec.js`; the new audit tests preserve it. It is a real backend 429, not a different error mislabeled by the UI.

Budget denial returns `429`, `{"error":"RF analysis request budget exceeded; retry after the current rate-limit window"}`, `Cache-Control: no-store`, and `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`. Budget denial uses relative seconds until expiry; concurrency and global-capacity denials use `Retry-After: 1` and distinct messages. Timeout is a separate 504. No protocol or UI message changes were needed.

## Complete request-cost inventory

Each protected POST attempt costs **one HTTP budget unit**, independent of how many internal cells, samples, candidates, or rays are computed. There are 19 protected paths. The table covers every path and the browser operation cost, with N selected cells (maximum six). All RF operations below require explicit user actions; the per-cell ray phase is a deliberate continuation of that action.

| Operation | Endpoint(s) | Frontend caller | HTTP requests / units | Overlap |
| --- | --- | --- | --- | --- |
| Single-cell propagation + gaps | `/api/analyze-sector` | App `runSimulation` → `simulateForSettings` | 1 / 1 | RF channel supersedes older work |
| Legacy standalone rays / gaps | `/api/simulate`, `/api/coverage-gaps` | rays via App `simulateRaysForSettings`; standalone gaps API remains supported | 1 / 1 each | HTTP guard applies |
| Evaluate Network | `/api/evaluate-network`, then N `/api/simulate` | App `evaluateNetwork`, `runNetworkSimulationQueue` | N+1 / N+1; **7 for six cells** | Sequential phases/cells |
| Network optimization | `/api/optimize-network`, then N `/api/simulate` | App `optimizeNetwork` | N+1 / N+1; **7 for six cells** | Sequential phases/cells |
| Single-cell optimization | `/api/optimize-azimuth`, then `/api/analyze-sector` | App `optimizeAzimuth` | 2 / 2 | Sequential |
| Analyze Interference | `/api/interference` | App `analyzeInterference` | **1 / 1 for six cells** | RF channel |
| Path diagnostic | `/api/path-profile` | App `analyzePathProfile` | 1 / 1 | Separate request channel |
| Atmospheric reference | `/api/sub-thz-reference` | App `analyzeSubTHZReference` | 1 / 1 | Separate request channel |
| P.1411 reference | `/api/sub-thz-p1411-reference` | App `analyzeP1411Reference` | 1 / 1 | Separate request channel |
| Measurement reference validation | `/api/sub-thz-validation` | App `analyzeMeasurementValidation` | 1 / 1 | Separate request channel |
| Material reference | `/api/sub-thz-material-reference` | App `analyzeMaterialReference` | 1 / 1 | Separate request channel |
| Reflection reference | `/api/sub-thz-reflection-reference` | App `analyzeSpecularReflectionReference` | 1 / 1 | Separate request channel |
| Signal surface / export | `/api/coverage-surface` (including format query) | App `analyzeCoverageSurface`, `exportCoverageSurface` | 1 / 1 per generation or export | Export can overlap; no reuse on export |
| Batch experiment submission | `/api/processes/batch-experiment/execution` | ExperimentPanel `start` | 1 / 1; internal runs cost zero HTTP units | Separate bounded worker queue |
| Building entry | `/api/building-entry-analysis` | App `analyzeBuildingEntry` | 1 / 1, or 0 if current cached result | Separate channel |
| Cell explanation | `/api/explain-network-cell` | App `explainNetworkCell` | 1 / 1 on cache miss, 0 on hit | RF channel |
| Site recommendation | `/api/recommend-sites` | App `recommendSites` | 1 / 1 | RF channel |
| Canonical measurement evaluation | `/api/measurements/evaluate` | App `evaluateMeasurements` | 1 / 1 | RF channel |
| Load, tool/drawer switching, result inspection, review/report refresh, priority/Pareto inspection | GET metadata/inventory/core APIs or local state | App effects, retained results, report/history hooks | **0 protected RF requests / 0 units** | GETs may overlap |
| Explicit historical rerun | `/api/analyze-sector` or `/api/optimize-network` or `/api/optimize-azimuth` | App historical rerun handler | 1 / 1 per explicit rerun | User initiated |

Network evaluation's backend response provides network score/coverage metadata, not the per-cell GeoJSON ray responses required by the map. The existing network endpoint therefore does not replace the N ray calls while preserving current outputs. Their ordering and profile indices are deliberate and tested, not duplicate evaluations of the same endpoint/payload.

Interference sends one whole-network payload. `AnalyzeInterferenceContext` recomputes propagation/link quantities at interference grid and demand samples; it does not reuse ray responses, call the propagation HTTP routes, or acquire N client budget units. Existing network results supply configuration/azimuth context, not an extra dispatch. Optimizer candidate simulations and experimental worker runs invoke raytracer functions directly and do not reenter HTTP middleware. No per-internal-evaluation misclassification was found.

## Duplicate, failure, and cancellation audit

- React StrictMode, render/effect dependencies, tool changes, drawer open/close, and result inspection do not initiate RF POSTs. Initial load can repeat unprotected GETs in development StrictMode. The six-cell StrictMode regression records exactly 7 → 8 → 15 protected calls and identical repeat payloads.
- The primary actions disable while running; handlers invoke one execution path. `useRequestCoordinator.begin` aborts the previous channel before creating the new request; it does not retry. Network requests await each cell sequentially. Already-aborted later fetches never reaching the server cannot consume its budget.
- `apiClient` has no retry loop or frontend rate throttle. Existing core refresh and experiment status polling are GETs outside the RF budget. Reports, local persistence, fingerprints, and stale-state effects do not schedule scientific refreshes.
- Attempts are charged **before** handler JSON validation/computation and **before** checking per-client concurrency/global slots. Consequently validation failures, 422s, backend 500s, 504s, in-flight duplicates rejected as busy, and global-capacity denials count. This is the existing anti-abuse attempt policy, not success-only accounting.
- Admitted cancellations/disconnects retain the charge and release active/global slots on handler return; cancelled `writeRFResponse` does not write a status/body. A test's synthetic cancelled context therefore need not present a transport-level 499; the test labels that case separately from HTTP failure statuses.
- Exhausted-budget denials cost zero additional units. API-key failures and CORS/HTTPS rejections before RF admission cost zero. Oversized JSON bodies **do count**: `limitRequestBody` wraps the reader early, but decoding detects the limit inside the handler after admission and returns 413. No cancellation refunds were introduced; refunds would enable repeated expensive abort/restart abuse.

## Measured normal-workflow trace

Isolated real Go backend, full Ankara dataset (161784 footprints), six controlled NR cell selection records, real RF handlers, production frontend. RF responses were **not mocked**; only inventory selection and external basemap traffic were controlled. Start with a fresh process/bucket. The browser test records request events, response headers, completion, payloads, and response SHA-256; budget before/after is derived from the real `RateLimit-Remaining` headers. `audit-N` IDs are deterministic test correlation IDs, not server-supplied IDs. Production denial ID 21 matches the isolated sequence.

Trace on 2026-10-03, timestamps in Europe/Istanbul (UTC+03). E = first Evaluate, I = Analyze Interference, R = deliberate re-evaluate, A = deliberate rapid third evaluation. All responses below completed; **zero cancellations**. Load, select six cells, inspect Results, open Analyze, review Results, close/open drawer, and return to Propagation each added **zero** requests.

| ID | Timestamp | Owner | Endpoint | Status | Counter before → after |
| --- | --- | --- | --- | --- | --- |
| audit-1 | 18:48:25.373 | E | `/api/evaluate-network` | 200 | 0 → 1 |
| audit-2 | 18:48:26.149 | E | `/api/simulate` cell 1 | 200 | 1 → 2 |
| audit-3 | 18:48:26.180 | E | `/api/simulate` cell 2 | 200 | 2 → 3 |
| audit-4 | 18:48:26.212 | E | `/api/simulate` cell 3 | 200 | 3 → 4 |
| audit-5 | 18:48:26.234 | E | `/api/simulate` cell 4 | 200 | 4 → 5 |
| audit-6 | 18:48:26.251 | E | `/api/simulate` cell 5 | 200 | 5 → 6 |
| audit-7 | 18:48:26.282 | E | `/api/simulate` cell 6 | 200 | 6 → 7 |
| audit-8 | 18:48:27.329 | I | `/api/interference` | 200 | 7 → 8 |
| audit-9 | 18:48:28.057 | R | `/api/evaluate-network` | 200 | 8 → 9 |
| audit-10 | 18:48:28.895 | R | `/api/simulate` cell 1 | 200 | 9 → 10 |
| audit-11 | 18:48:28.922 | R | `/api/simulate` cell 2 | 200 | 10 → 11 |
| audit-12 | 18:48:28.950 | R | `/api/simulate` cell 3 | 200 | 11 → 12 |
| audit-13 | 18:48:28.974 | R | `/api/simulate` cell 4 | 200 | 12 → 13 |
| audit-14 | 18:48:28.991 | R | `/api/simulate` cell 5 | 200 | 13 → 14 |
| audit-15 | 18:48:29.019 | R | `/api/simulate` cell 6 | 200 | 14 → 15 |
| audit-16 | 18:48:29.457 | A | `/api/evaluate-network` | 200 | 15 → 16 |
| audit-17 | 18:48:30.337 | A | `/api/simulate` cell 1 | 200 | 16 → 17 |
| audit-18 | 18:48:30.378 | A | `/api/simulate` cell 2 | 200 | 17 → 18 |
| audit-19 | 18:48:30.418 | A | `/api/simulate` cell 3 | 200 | 18 → 19 |
| audit-20 | 18:48:30.440 | A | `/api/simulate` cell 4 | 200 | 19 → 20 |
| audit-21 | 18:48:30.453 | A | `/api/simulate` cell 5 | 429 | 20 → 20 |

Request 21 returned the exact existing error, remaining 0, and `Retry-After: 55`. Cell 6 was not dispatched after the error; tool switching afterwards caused no automatic retry. The normal sequence passed before and after the fix with the same **15 HTTP requests / 15 units**. Its seven re-evaluation payloads and full response body hashes match the original seven.

## Smallest fix and abuse boundary

The old conversion truncated fractional reset seconds: at elapsed 1 ns, a full bucket advertised 59 seconds despite nearly 60 seconds remaining; at 1.5 s it advertised 58 despite 58.5 remaining. A deterministic test fails on the original implementation. Integer ceiling division fixes both `RateLimit-Reset` and budget `Retry-After` without changing the actual window. The test follows the advertised delay exactly and verifies admission after expiry. Budget 20 → 20, window 60 s → 60 s, bucket structure one shared RF bucket → one shared RF bucket; separate building transfer/feature buckets remain separate.

Denials now log `rate_limit_class`, `operation`, limiter-local atomic `request_id`, process-local keyed `client_key_hash`, `allowed=false`, `remaining`, `retry_after_seconds`, and `reason` through `slog`. No request payload or peer IP is logged by this addition; successful admissions do not add limiter logs. IDs/hashes are local to a limiter/process and are not new response headers. Existing Gin access logging is unchanged.

History commit `a6234d8` introduced per-client attempts, global/per-client concurrency, API-key checks, and cancellation deadlines to protect expensive CPU work and preserve capacity for other clients. Keeping all expensive RF entry points under the same aggregate budget respects that purpose. Internal computational limits remain separate from the HTTP budget. Normal capacity is still two six-cell evaluations plus one interference (15 units), with five additional protected attempts; three six-cell evaluations alone would require 21 units. Burst exhaustion is expected, including across tabs behind the same IP. Request count and admitted RF compute are unchanged. The middleware adds one atomic increment per request and hashing/logging only on denial; no separate performance benchmark was run.

## Regression and validation evidence

- `backend-go/rf_budget_audit_test.go`: environment defaults/overrides and all 19 route classifications; fresh 15-unit workflow; repeated denial at unit 21; exact JSON/429/cache/retry headers; fixed-window reset; fractional retry rounding; failure/cancel accounting; actual authentication/JSON/body-size admission ordering; concurrency attempts and global-capacity denial accounting; idempotent release; trusted/untrusted proxy and IPv4/IPv6 identity; denial log fields and raw-IP absence.
- Scientific equivalence tests execute actual simulation, network evaluation, optimizer, and interference functions with and without protection. Complete response bodies (including scientific values and available fingerprints) are byte-identical, and each outer HTTP operation costs exactly one unit even with internal optimizer simulations.
- `frontend-react/src/App.workflow.test.jsx`: StrictMode, initial render, six-cell Evaluate, Interference, inspection, tool switching, drawer close/reopen, and deliberate re-evaluation; exact 15-call sequence and request payload equivalence.
- `frontend-react/e2e/rf-budget.spec.js`: isolated real-backend normal/abuse acceptance and complete trace attachment. Repeated actual RF response body hashes and payloads are identical. No UI implementation changed.
- Frontend lint, all **357 unit/workflow tests across 65 files**, and production build passed. Existing bundle-size warning remains.
- Responsive request/freshness/error E2E selection: **14 passed, 6 intentionally skipped** by existing desktop-only tests across four viewport projects; real budget E2E **1 passed**.
- Backend `go vet ./... && go test -race ./... -count=1` passed (including the full raytracer suite); the additional IPv4/IPv6 admission test passed under `go test -race . -run 'TestRFBudget' -count=1`. Core Lab adapter `go vet ./... && go test -race ./...` passed.
- `sh docs/build-reference-pages.sh`, `/tmp/atom-rf-budget-docs-venv/bin/python docs/validate_docs.py`, `python3 scripts/versioning.py check`, and `git diff --check` passed. The isolated Python environment installs the pinned, hashed `docs/requirements.txt` because the default Python lacks PyYAML. Existing Pandoc MathML deprecation warnings remain.

## Remaining limits and next action

The precise old error event is not reconstructable: retained live-container logs contain no 429 for that event. The user-confirmed preceding activity, code accounting, isolated measured trace, and deterministic exhaustion test establish the mechanism without inventing earlier requests. This resolves the investigation and premature retry defect; it intentionally does not eliminate legitimate rate-limit responses after earlier runs. Large batch jobs use existing worker/queue controls; multi-replica deployments still require a shared gateway budget. Native IP pooling behind proxies/NAT remains intentional unless operators explicitly configure trusted proxies.

Changes are in the working tree; the existing local container remains on its previous build. Review the change and rebuild/restart the local container when ready. After a legitimate budget hit, wait for the advertised expiry and retry deliberately. No further UI, RF-model, or measurement research work is part of this resolution.
