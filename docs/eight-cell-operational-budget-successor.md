# Eight-Cell Operational + Request-Budget Clean Successor

**CONDITIONAL GO — REQUEST-BUDGET POLICY BLOCKER (B).** Status: complete. Production Cell cap remains **six**. No product promotion or request-policy change is applied.

Exact eight paired W1 domains, frequencies 2.6/28 GHz, shipping Go1.26.6 Linux/arm64 CGO0 cgroupv2 Profile A 2CPU/4GiB; audit-only eight Cells.

This preregistered audit compares paired 6C/8C W1 requests on the minimum certified reference. A positive result applies only to the exact tested layouts/settings/runtime; neither larger tiers nor historical timing can rescue Profile A.

## Baseline and frozen contract

Starting baseline: `016c9c96579e2a95b14e3641f96bad00050d48d3`, branch `main`, VERSION `0.11.0`, prior audit documentation and scripts already uncommitted. The recorded status and diff are in baseline.json. Prior invalid audit reports, locks, manifests, scripts and raw archives remain byte-for-byte preserved.

| Artifact | SHA256 / reference |
|---|---|

Both required baseline E2Es actually executed with ATOM_REAL_E2E=1 before this lock and any successor measurement. The guard validates named Playwright JSON records, passed results and counts; it rejects skipped, zero-test, missing-opt-in and mismatched-test data. The [prior invalid audit](eight-cell-operational-budget-audit.html) remains D unchanged.

|Baseline test|Discovered|Executed|Passed|Failed|Skipped|Completed UTC|
|---|---:|---:|---:|---:|---:|---|
|rf_budget_e2e|1|1|1|0|0|2026-10-07T14:42:20.584635+00:00|
|rf_deadline_e2e|1|1|1|0|0|2026-10-07T14:42:30.321538+00:00|

Lock frozen at 2026-10-07T14:43:30.905586+00:00; chronology machine-verified: True.

| Artifact | SHA256 / reference |
|---|---|
| Audit lock | `8d2423c56b57121f94fc658d670b0d52bbecd87c4c1fff2e0c13a39cd686efb0` |
| Domain manifest | `d7e2a6e4ed46e3b8bc8c8dbf7ffc32f16f4caf0468365e0d7a9c581d4349ef84` |
| Run plan | `f6a01b841061f50ec93c7dedff1f3f5de9b945dcf855bda7b8b9287d3967db2c` |
| Evidence manifest | [Manifest](../scripts/eight-cell-operational-successor/evidence-manifest.json), with final digest in [SHA256 file](../scripts/eight-cell-operational-successor/evidence-manifest.sha256) |

Raw streamed bodies, ledgers, sampler/async traces and logs stay outside Git in `/tmp/atom-eight-cell-operational-successor`. The tracked index identifies every retained raw artifact by path/logical ID, SHA256, byte size, category and group; a local compressed archive retains the indexed evidence. No historical evidence is removed.

## Shipping versus audit binary

The audit uses a disposable source copy and the unchanged production Dockerfile. The only production-source difference is `MaxNetworkTowers = 6` → `8` in that copy. The existing Auto metadata consequently reports eight for the audit binary. Normal source and shipping builds remain six. Recommendation remains five and Measurement Validation remains six. No production override/environment switch is added.

| Build | Image identity | Binary SHA256 |
|---|---|---|
| audit | `sha256:1f08ca39cff21cbc6ab3f51a165354d4d070b1b6e774cfbb615fa152ac0a8bb2` | `538361a73ed83674b5b5b3f66095892d58394477cd32b522ed3906010d032a9b` |
| standard | `sha256:30cb97ef650fb47b1372465789258d2e916ed654e71ba103d2c31a148adc1f81` | `200ea4e7a329e9a4ed32c8e3267232054a940e6434417e7c060ff2fe8e3f30c2` |

Both binaries use Go1.26.6, Linux/arm64, CGO disabled, identical release flags and pinned compiler/runtime bases. [Machine-readable differential](../scripts/eight-cell-operational-successor/binary-differential.json) records source/build metadata. The [complete copied-source comparison](../scripts/eight-cell-operational-successor/source-differential-verification.json) checks 373 copied files across backend/frontend, Dockerfile and VERSION; only the cap constant differs. Host Go quality checks are separate from qualification timing.

Before every batch, existing Auto diagnostics and Docker/cgroup inspection verify effective CPU2, GOMAXPROCS2, hard memory4GiB, workers1, queue16, global/per-client RF slots2/1, deadline60s, budget20/60s and exact dataset hashes/counts. No GOMAXPROCS, GC, memory, worker, admission or limiter tuning is applied.

### Normal shipping cap proof

| Endpoint | Six | Seven | Eight | Exact rejection body |
|---|---:|---:|---:|---|
| `/api/building-entry-analysis` | 200 | 400 | 400 | `{"error":"towers must contain between 1 and 6 selected towers"}` |
| `/api/evaluate-network` | 200 | 400 | 400 | `{"error":"towers must contain between 2 and 6 selected towers"}` |
| `/api/interference` | 200 | 400 | 400 | `{"error":"towers must contain between 2 and 6 selected cells"}` |
| `/api/optimize-network` | 200 | 400 | 400 | `{"error":"towers must contain between 2 and 6 selected towers"}` |
| `/api/explain-network-cell` | 200 | 400 | 400 | `{"error":"baseline must contain between 2 and 6 cell configurations"}` |

## Dataset and paired layouts

Exact `ankara-open-planning` version `2026.07`: 161,784 indexed footprint parts, 936,651 vertices, 451 inventory Cells. Frozen GeoJSON identities:

- `ankara_5g_nodes.geojson`: `c460c254d8748df52305d141b2f5e5147757a00b9d0581d8670084aa29ee3bd8`
- `ankara_buildings.geojson`: `d952a853b1146fe4e4136c2d8bac1b8e2c7152b33d78b0d9f82399350bfd50fc`

All eight paired layouts are copied byte-for-byte from the prior manifest. Every original six ID/order and the same appended two IDs are preserved; no Cell reselection occurs. The [domain manifest](../scripts/eight-cell-operational-successor/domain-manifest.json) freezes coordinates, profiles, relative geometry, enclosing bounds, footprint/vertex counts and inherited geometry bands before RF timing.

| Domain | Original six IDs, ordered | Appended two IDs | Enclosing footprints6→8 | Vertices6→8 |
|---|---|---|---:|---:|
| very-dense-certification-1 | 2526751, 2526744, 2526742, 2526752, 2526743, 2526741 | 5888534, 5888535 | 327→453 | 2427→3126 |
| very-dense-certification-2 | 12123730, 13216083, 12058449, 13216081, 12058451, 12013905 | 12013907, 25292115 | 1828→2478 | 8140→11158 |
| dense-certification-1 | 14197782, 14197792, 3000096, 3000086, 4472598, 4473356 | 21622808, 561696 | 641→843 | 3163→4442 |
| dense-certification-2 | 16442647, 24228888, 5900566, 10339345, 10339596, 10339597 | 313100, 31767 | 7366→19691 | 34972→104581 |
| medium-certification-1 | 13143051, 11976460, 12234056, 11976530, 12234065, 11976531 | 13143113, 12234055 | 1968→2161 | 8526→9893 |
| medium-certification-2 | 3175507, 1700385, 24330529, 24330528, 6867729, 6867749 | 720677, 23890981 | 1838→2032 | 14859→16075 |
| sparse-certification-1 | 4861472, 4861477, 10710289, 4861457, 10710284, 790540 | 790541, 6867729 | 337→674 | 2246→4131 |
| sparse-certification-2 | 5046063, 793627, 5046053, 22319151, 22319128, 22319131 | 22319126, 5046038 | 332→597 | 1849→3603 |

Band labels retain the original certification strata; enlarged eight-Cell envelopes are explicitly measured and are not relabelled or reselected after timing. Real co-location remains in dense-certification-2 (the manifest lists each pair). No fabricated coordinates or duplicate IDs are used.

Historical continuity control: 9664800, 26390, 9664790, 9664795, 9664791, 9664794, 12261147, 9664785. Its exact prior fixture bytes are reused and measured separately with W1 RF settings; it matches none of the eight reused primary paired layouts. Historical RF settings and any W1-normalization differences are recorded in [comparison](../scripts/eight-cell-operational-successor/historical-comparison.json).

## 8C-W1 and methodology

120 rays,400m,30dBm,120° beam,2.6/28GHz, normal20/100MHz interference bandwidths, unchanged legacy two-pass search. Selected-network cardinality is eight for Evaluate, Optimize, Interference, retained network explanation and network Building Entry; maps number eight independent single-Cell Simulate calls. Independent Recommendation, Measurement Validation and experiment contracts are retained.

Real Linux TCP, shipping-equivalent Gin routes, actual middleware/limiter/deadline and uncompressed streamed reads supply primary evidence. The longer monotonic/UTC interval scores requests and groups. A difference over1s invalidates the original observation; no replacement or early stop is allowed. Host `caffeinate -i` prevents automatic idle sleep. HTTP success, complete reads, every request≤45s,≥15s deadline headroom, lifetime cgroup peak≤3GiB, zero oom/oom_kill/max events and all slot/concurrency/background/cancellation/science checks are required.

Plan: 837 groups; observed 837. Evaluate/Interference each have five repeats per domain/frequency/cardinality; Optimize/Explain/Building Entry each have three. Explanation group timing includes its required Optimize prerequisite, and individual HTTP times remain available in the ledgers. No averaging removes failures.

## Paired six-to-eight measurements

Wall and CPU ratios below use medians within exact domain/frequency/operation pairs; maximum individual latency and all failures are scored independently. Memory deltas compare observed sampled group maxima, not incremental reservations. Lifetime kernel peak remains the memory gate. No linear N scaling is assumed.

| Domain | GHz | Operation |6C wall s|8C wall s|Wall ratio|6C CPU s|8C CPU s|CPU ratio|Bytes ratio|Sampled cgroup delta MiB|
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
|dense-certification-1|2.6|building-entry|0.106|0.139|1.314|0.037|0.171|4.642|1.145|31.516|
|dense-certification-1|2.6|evaluate|0.372|0.419|1.127|0.511|0.575|1.124|1.184|0.844|
|dense-certification-1|2.6|evaluate-maps|0.519|0.640|1.233|0.670|0.848|1.265|1.242|-70.383|
|dense-certification-1|2.6|explain|4.570|5.955|1.303|7.054|9.108|1.291|1.100|48.266|
|dense-certification-1|2.6|interference|0.024|0.034|1.445|0.020|0.029|1.439|1.728|-3.984|
|dense-certification-1|2.6|optimize|4.457|5.588|1.254|6.855|8.546|1.247|1.102|89.195|
|dense-certification-1|2.6|optimize-maps|4.459|5.713|1.281|6.789|8.655|1.275|1.312|-16.430|
|dense-certification-1|28|building-entry|0.101|0.111|1.093|0.036|0.041|1.151|1.145|17.816|
|dense-certification-1|28|evaluate|0.386|0.459|1.190|0.528|0.648|1.228|1.184|174.891|
|dense-certification-1|28|evaluate-maps|0.483|0.580|1.200|0.670|0.769|1.148|1.467|95.180|
|dense-certification-1|28|explain|5.110|6.792|1.329|7.695|10.273|1.335|1.099|60.922|
|dense-certification-1|28|interference|0.022|0.031|1.382|0.020|0.027|1.330|1.729|93.727|
|dense-certification-1|28|optimize|4.954|6.711|1.355|7.496|10.196|1.360|1.102|33.254|
|dense-certification-1|28|optimize-maps|4.961|6.565|1.324|7.445|9.825|1.320|1.428|85.512|
|dense-certification-2|2.6|building-entry|0.088|0.161|1.825|0.043|0.045|1.044|2.198|-78.270|
|dense-certification-2|2.6|evaluate|0.338|0.453|1.341|0.467|0.615|1.317|1.184|109.801|
|dense-certification-2|2.6|evaluate-maps|0.480|0.615|1.282|0.613|0.776|1.266|1.323|54.258|
|dense-certification-2|2.6|explain|3.690|6.612|1.792|5.724|10.349|1.808|1.105|89.000|
|dense-certification-2|2.6|interference|0.020|0.039|1.884|0.018|0.033|1.874|2.480|226.141|
|dense-certification-2|2.6|optimize|3.711|6.019|1.622|5.834|9.441|1.618|1.107|93.879|
|dense-certification-2|2.6|optimize-maps|3.663|6.170|1.684|5.609|9.580|1.708|1.330|15.328|
|dense-certification-2|28|building-entry|0.099|0.168|1.691|0.135|0.051|0.377|2.198|-22.238|
|dense-certification-2|28|evaluate|0.373|0.499|1.337|0.524|0.676|1.289|1.184|179.262|
|dense-certification-2|28|evaluate-maps|0.511|0.613|1.200|0.721|0.859|1.192|1.494|-77.082|
|dense-certification-2|28|explain|4.251|6.753|1.589|6.530|10.419|1.596|1.104|46.293|
|dense-certification-2|28|interference|0.018|0.053|2.883|0.016|0.077|4.822|2.478|103.035|
|dense-certification-2|28|optimize|3.975|6.486|1.632|6.119|10.024|1.638|1.107|30.523|
|dense-certification-2|28|optimize-maps|3.908|6.566|1.680|5.962|10.095|1.693|1.434|-45.469|
|medium-certification-1|2.6|building-entry|0.045|0.062|1.376|0.027|0.083|3.092|1.025|119.598|
|medium-certification-1|2.6|evaluate|0.184|0.222|1.205|0.217|0.284|1.311|1.190|-9.902|
|medium-certification-1|2.6|evaluate-maps|0.270|0.290|1.075|0.344|0.307|0.894|1.307|-75.902|
|medium-certification-1|2.6|explain|2.612|3.351|1.283|3.914|4.987|1.274|1.107|55.426|
|medium-certification-1|2.6|interference|0.022|0.044|2.006|0.018|0.062|3.527|1.607|94.391|
|medium-certification-1|2.6|optimize|2.516|4.155|1.652|3.748|6.267|1.672|1.110|62.992|
|medium-certification-1|2.6|optimize-maps|2.542|3.261|1.283|3.805|4.802|1.262|1.334|-19.488|
|medium-certification-1|28|building-entry|0.049|0.049|1.003|0.031|0.032|1.028|1.025|29.504|
|medium-certification-1|28|evaluate|0.220|0.213|0.972|0.248|0.246|0.992|1.190|-155.906|
|medium-certification-1|28|evaluate-maps|0.244|0.297|1.217|0.261|0.324|1.239|1.320|111.352|
|medium-certification-1|28|explain|2.671|3.429|1.284|4.005|5.153|1.287|1.104|41.586|
|medium-certification-1|28|interference|0.021|0.033|1.584|0.016|0.028|1.723|1.611|300.082|
|medium-certification-1|28|optimize|2.604|3.398|1.305|3.845|5.013|1.304|1.107|-96.539|
|medium-certification-1|28|optimize-maps|2.578|3.373|1.308|3.780|5.009|1.325|1.340|44.602|
|medium-certification-2|2.6|building-entry|0.126|0.141|1.124|0.036|0.042|1.159|1.070|67.332|
|medium-certification-2|2.6|evaluate|0.264|0.318|1.205|0.348|0.424|1.218|1.184|53.332|
|medium-certification-2|2.6|evaluate-maps|0.342|0.418|1.221|0.442|0.543|1.227|1.256|48.762|
|medium-certification-2|2.6|explain|3.523|4.316|1.225|5.384|6.469|1.201|1.098|78.789|
|medium-certification-2|2.6|interference|0.038|0.058|1.550|0.033|0.093|2.801|1.604|171.715|
|medium-certification-2|2.6|optimize|3.397|4.387|1.291|5.121|6.684|1.305|1.101|153.035|
|medium-certification-2|2.6|optimize-maps|3.289|4.199|1.277|4.898|6.265|1.279|1.247|-35.645|
|medium-certification-2|28|building-entry|0.128|0.132|1.031|0.038|0.039|1.043|1.070|13.184|
|medium-certification-2|28|evaluate|0.246|0.332|1.350|0.288|0.473|1.639|1.185|-100.230|
|medium-certification-2|28|evaluate-maps|0.312|0.425|1.364|0.350|0.549|1.568|1.316|41.191|
|medium-certification-2|28|explain|4.256|4.818|1.132|6.450|7.278|1.128|1.098|26.578|
|medium-certification-2|28|interference|0.062|0.057|0.920|0.114|0.049|0.425|1.611|-37.574|
|medium-certification-2|28|optimize|3.527|4.624|1.311|5.302|6.936|1.308|1.101|-25.977|
|medium-certification-2|28|optimize-maps|3.587|4.466|1.245|5.357|6.624|1.236|1.316|-62.195|
|sparse-certification-1|2.6|building-entry|0.046|0.070|1.516|0.033|0.033|1.015|2.880|88.215|
|sparse-certification-1|2.6|evaluate|0.194|0.248|1.280|0.212|0.293|1.381|1.190|14.801|
|sparse-certification-1|2.6|evaluate-maps|0.244|0.375|1.535|0.260|0.478|1.837|1.437|-91.605|
|sparse-certification-1|2.6|explain|2.714|3.821|1.408|4.020|5.701|1.418|1.118|45.301|
|sparse-certification-1|2.6|interference|0.020|0.035|1.740|0.016|0.030|1.908|1.595|260.949|
|sparse-certification-1|2.6|optimize|2.585|3.583|1.386|3.833|5.382|1.404|1.121|118.543|
|sparse-certification-1|2.6|optimize-maps|2.665|3.646|1.368|3.973|5.329|1.341|1.515|4.828|
|sparse-certification-1|28|building-entry|0.058|0.069|1.194|0.109|0.040|0.369|2.881|42.668|
|sparse-certification-1|28|evaluate|0.185|0.239|1.292|0.215|0.271|1.261|1.190|217.367|
|sparse-certification-1|28|evaluate-maps|0.285|0.348|1.219|0.376|0.439|1.167|1.350|-27.578|
|sparse-certification-1|28|explain|2.787|3.861|1.386|4.140|5.746|1.388|1.105|205.578|
|sparse-certification-1|28|interference|0.022|0.044|1.993|0.017|0.078|4.531|1.612|77.715|
|sparse-certification-1|28|optimize|2.730|3.769|1.381|4.049|5.601|1.383|1.108|2.016|
|sparse-certification-1|28|optimize-maps|2.761|3.740|1.355|4.108|5.518|1.343|1.353|56.121|
|sparse-certification-2|2.6|building-entry|0.042|0.055|1.322|0.029|0.038|1.290|1.658|-0.840|
|sparse-certification-2|2.6|evaluate|0.176|0.217|1.235|0.205|0.275|1.343|1.188|-1.297|
|sparse-certification-2|2.6|evaluate-maps|0.249|0.292|1.173|0.295|0.326|1.105|1.368|162.035|
|sparse-certification-2|2.6|explain|2.531|3.281|1.296|3.753|4.859|1.295|1.101|-114.078|
|sparse-certification-2|2.6|interference|0.021|0.041|1.956|0.017|0.035|2.098|1.707|138.023|
|sparse-certification-2|2.6|optimize|2.426|3.194|1.317|3.617|4.703|1.300|1.104|19.430|
|sparse-certification-2|2.6|optimize-maps|2.462|3.262|1.325|3.649|4.751|1.302|1.344|69.102|
|sparse-certification-2|28|building-entry|0.048|0.049|1.024|0.035|0.032|0.912|1.658|164.234|
|sparse-certification-2|28|evaluate|0.183|0.226|1.239|0.203|0.252|1.237|1.184|220.539|
|sparse-certification-2|28|evaluate-maps|0.231|0.321|1.386|0.252|0.384|1.525|1.350|133.367|
|sparse-certification-2|28|explain|2.559|3.402|1.329|3.774|5.018|1.330|1.099|139.094|
|sparse-certification-2|28|interference|0.027|0.044|1.646|0.022|0.053|2.412|1.696|92.504|
|sparse-certification-2|28|optimize|2.499|3.328|1.332|3.780|4.992|1.321|1.102|43.285|
|sparse-certification-2|28|optimize-maps|2.468|3.367|1.364|3.638|4.970|1.366|1.325|9.109|
|very-dense-certification-1|2.6|building-entry|0.072|0.090|1.244|0.038|0.043|1.126|1.347|45.426|
|very-dense-certification-1|2.6|evaluate|0.373|0.473|1.271|0.523|0.649|1.241|1.184|192.969|
|very-dense-certification-1|2.6|evaluate-maps|0.511|0.694|1.357|0.678|0.978|1.442|1.376|120.551|
|very-dense-certification-1|2.6|explain|5.337|7.005|1.313|8.253|10.802|1.309|1.494|-7.766|
|very-dense-certification-1|2.6|interference|0.016|0.022|1.324|0.017|0.024|1.354|1.679|155.023|
|very-dense-certification-1|2.6|optimize|5.034|6.826|1.356|7.763|10.477|1.350|1.515|47.664|
|very-dense-certification-1|2.6|optimize-maps|5.101|6.848|1.342|7.862|10.445|1.329|1.315|48.195|
|very-dense-certification-1|28|building-entry|0.092|0.112|1.229|0.052|0.056|1.062|1.348|75.312|
|very-dense-certification-1|28|evaluate|0.414|0.494|1.194|0.568|0.687|1.209|1.185|-8.938|
|very-dense-certification-1|28|evaluate-maps|0.470|0.669|1.424|0.657|0.985|1.498|1.504|42.480|
|very-dense-certification-1|28|explain|5.958|8.236|1.382|9.062|12.603|1.391|1.105|25.805|
|very-dense-certification-1|28|interference|0.018|0.027|1.557|0.016|0.032|1.980|1.673|236.992|
|very-dense-certification-1|28|optimize|5.502|7.564|1.375|8.273|11.538|1.395|1.108|17.453|
|very-dense-certification-1|28|optimize-maps|5.396|7.612|1.411|8.123|11.559|1.423|1.431|151.801|
|very-dense-certification-2|2.6|building-entry|0.158|0.183|1.156|0.039|0.045|1.150|1.152|29.254|
|very-dense-certification-2|2.6|evaluate|0.295|0.351|1.189|0.403|0.502|1.246|1.185|102.875|
|very-dense-certification-2|2.6|evaluate-maps|0.430|0.508|1.184|0.579|0.695|1.200|1.264|63.480|
|very-dense-certification-2|2.6|explain|6.188|8.435|1.363|9.545|13.119|1.374|1.098|59.094|
|very-dense-certification-2|2.6|interference|0.036|0.059|1.669|0.033|0.092|2.774|1.511|-132.910|
|very-dense-certification-2|2.6|optimize|6.042|7.562|1.251|9.382|11.684|1.245|1.101|55.457|
|very-dense-certification-2|2.6|optimize-maps|6.158|7.689|1.249|9.473|11.840|1.250|1.316|-54.254|
|very-dense-certification-2|28|building-entry|0.165|0.212|1.281|0.041|0.188|4.576|1.152|145.664|
|very-dense-certification-2|28|evaluate|0.359|0.406|1.128|0.504|0.551|1.092|1.185|53.578|
|very-dense-certification-2|28|evaluate-maps|0.444|0.545|1.227|0.611|0.788|1.290|1.335|31.457|
|very-dense-certification-2|28|explain|6.677|8.741|1.309|10.210|13.344|1.307|1.096|112.500|
|very-dense-certification-2|28|interference|0.051|0.066|1.300|0.071|0.063|0.877|1.521|40.922|
|very-dense-certification-2|28|optimize|6.496|8.427|1.297|9.932|12.943|1.303|1.099|149.453|
|very-dense-certification-2|28|optimize-maps|6.534|8.271|1.266|9.993|12.576|1.259|1.395|-8.715|

### Operational results

|Operation/scenario|Groups|Worst individual s|Largest single bytes|Largest workflow bytes|
|---|---:|---:|---:|---:|
|evaluate|82|0.689|34457|34457|
|optimize|50|11.231|108308|108308|
|interference|82|0.100|17051014|17051014|
|explain|48|10.149|108308|111332|
|building-entry|48|0.083|3691321|3691321|
|evaluate-maps|16|0.483|7992018|58902269|
|optimize-maps|16|8.096|8264877|60251142|
|cycle-boundary|4|0.447|12226823|121173745|
|two-optimizers|12|10.973|108267|216534|
|optimize-evaluate|12|6.827|108267|142698|
|two-evaluates|12|0.694|34431|68862|
|async-optimize|12|6.717|108267|108267|
|async-evaluate|12|0.586|34431|34431|
|sustained-optimize|12|11.418|108267|529520|
|sustained-evaluate|12|1.014|34431|378741|
|cancel|12|0.105|0|0|

Worst required eight-Cell request: 11.418s; minimum deadline headroom 48.582s. Peak sampled RSS 1236.199MiB; kernel cgroup peak 1.290GiB; hard-limit headroom 67.76%. OOM events: `{'oom': 0, 'oom_kill': 0, 'max': 0}`. The conservative peak includes startup, page cache and the extra pre-RF Auto CLI. Stock GC event heap evidence is retained in JSON; no continuous HeapAlloc maximum is inferred.

True client/native concurrency overlap: True. Normal/sustained background evidence includes uncached native intervals containing every interactive launch, first30s active-worker samples, final-tail overlap and drain barriers. Cancellation cases: 12/12; maximum handler-release observation 0.007s. Same-client follow-up remaining18 proves cancellation attempt charging and slot reuse; other-client probes also succeed.

Scientific determinism: True, 435 exact endpoint/request groups; only Building Entry diagnostics.elapsed_ms excluded. Six-Cell preservation: True; 352 measured responses match frozen W1 evidence.

Largest contention inflation: `{"batch":"A-8C-mixed-2","index":5,"fixture":"dense-certification-1-2.6-8C-W1","operation":"sustained-evaluate","endpoint":"/api/evaluate-network","seconds":1.0140559673309326,"isolated_median_seconds":0.4183371067047119,"inflation_ratio":2.4240163042641965}`.

Search counts use the existing opt-in request-local collector in a separate, non-qualification test executable. No collector is linked/enabled in primary shipping HTTP measurements. Its complete serialized scientific responses must match corresponding real-HTTP results. [Search accounting](../scripts/eight-cell-operational-successor/search-accounting.json) reports proposals, cache hits/misses, RF contribution calculations and spatial counters. Legacy proposals are434 for six and578 for eight; observed cache/geometry counts are recorded per exact fixture.

### Required failures / invalid observations

```json
{
  "capacity_failures": [],
  "methodology_violations": [],
  "interruptions": []
}
```

## Request budget and product fit

The policy remains20 protected attempts per ClientIP in an anchored60s fixed window. Every case starts with a fresh real source-IP key. Slot probes are separate declared evidence and are excluded from logical workflow request counts. Header sequences and real admission denials are retained; successful initial workflows contain no duplicates or retries.

|Workflow|6C attempts|8C attempts|6C remaining|8C remaining|
|---|---:|---:|---:|---:|
|Evaluate+maps|7|9|13|11|
|Optimize+maps|7|9|13|11|
|Full evaluation cycle|15|19|5|1|
|Evaluate/maps then Optimize/maps|14|18|6|2|

|Domain/fixture|Cells|Scenario|Attempts|First429|Remaining after workflow|Actual first→final s|Window remaining estimate s|Mechanical exact pass|
|---|---:|---|---:|---:|---:|---:|---:|---|
|dense-certification-1-28-6C-W1|6|cycle-boundary|17|none|5|1.019|58.981|True|
|dense-certification-1-28-6C-W1|6|journey-A|8|none|12|0.507|59.493|None|
|medium-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.270|59.730|True|
|sparse-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.285|59.715|True|
|very-dense-certification-2-28-6C-W1|6|optimize-maps|7|none|13|6.534|53.466|True|
|dense-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.510|59.490|True|
|sparse-certification-1-28-6C-W1|6|journey-A|8|none|12|0.274|59.726|None|
|medium-certification-2-28-6C-W1|6|optimize-maps|7|none|13|3.586|56.414|True|
|dense-certification-1-28-6C-W1|6|journey-B|14|none|6|5.499|54.501|None|
|dense-certification-1-28-6C-W1|6|shared-ip|17|none|3|6.659|53.341|None|
|sparse-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|2.462|57.538|True|
|sparse-certification-1-2.6-6C-W1|6|journey-B|14|none|6|2.887|57.113|None|
|sparse-certification-1-28-6C-W1|6|journey-D|8|none|12|2.803|57.197|None|
|very-dense-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.429|59.571|True|
|very-dense-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|6.157|53.843|True|
|very-dense-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|5.101|54.899|True|
|very-dense-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.511|59.489|True|
|dense-certification-1-2.6-6C-W1|6|shared-ip|17|none|3|6.091|53.909|None|
|dense-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.479|59.521|True|
|sparse-certification-1-2.6-6C-W1|6|journey-A|8|none|12|0.309|59.691|None|
|sparse-certification-1-2.6-6C-W1|6|journey-D|8|none|12|2.785|57.215|None|
|dense-certification-1-2.6-6C-W1|6|journey-D|8|none|12|4.674|55.326|None|
|sparse-certification-1-28-6C-W1|6|journey-C|24|21|0|3.449|56.551|None|
|very-dense-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.470|59.530|True|
|very-dense-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.444|59.556|True|
|medium-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.244|59.756|True|
|dense-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|3.663|56.337|True|
|sparse-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.244|59.756|True|
|dense-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.519|59.481|True|
|sparse-certification-2-28-6C-W1|6|optimize-maps|7|none|13|2.468|57.532|True|
|dense-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.483|59.517|True|
|sparse-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|2.665|57.335|True|
|dense-certification-1-2.6-6C-W1|6|journey-B|14|none|6|5.298|54.702|None|
|dense-certification-1-28-6C-W1|6|journey-D|8|none|12|5.154|54.846|None|
|sparse-certification-1-28-6C-W1|6|cycle-boundary|17|none|5|0.572|59.428|True|
|very-dense-certification-1-28-6C-W1|6|optimize-maps|7|none|13|5.396|54.604|True|
|dense-certification-2-28-6C-W1|6|optimize-maps|7|none|13|3.908|56.092|True|
|medium-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|2.542|57.458|True|
|sparse-certification-1-28-6C-W1|6|shared-ip|17|none|3|3.597|56.403|None|
|sparse-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.242|59.758|True|
|medium-certification-1-28-6C-W1|6|optimize-maps|7|none|13|2.578|57.422|True|
|sparse-certification-1-28-6C-W1|6|optimize-maps|7|none|13|2.760|57.240|True|
|dense-certification-1-28-6C-W1|6|journey-C|24|21|0|6.307|53.693|None|
|dense-certification-1-28-6C-W1|6|two-workflows|14|none|6|5.398|54.602|True|
|dense-certification-1-2.6-6C-W1|6|two-workflows|14|none|6|5.035|54.965|True|
|sparse-certification-1-2.6-6C-W1|6|two-workflows|14|none|6|2.847|57.153|True|
|medium-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.342|59.658|True|
|medium-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.311|59.689|True|
|sparse-certification-1-28-6C-W1|6|two-workflows|14|none|6|2.957|57.043|True|
|medium-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|3.289|56.711|True|
|sparse-certification-1-2.6-6C-W1|6|cycle-boundary|17|none|5|0.546|59.454|True|
|sparse-certification-1-2.6-6C-W1|6|journey-C|24|21|0|3.294|56.706|None|
|sparse-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.231|59.769|True|
|dense-certification-1-2.6-6C-W1|6|journey-C|24|21|0|5.856|54.144|None|
|dense-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|4.459|55.541|True|
|dense-certification-1-2.6-6C-W1|6|journey-A|8|none|12|0.556|59.444|None|
|sparse-certification-1-28-6C-W1|6|journey-B|14|none|6|2.990|57.010|None|
|dense-certification-1-28-6C-W1|6|optimize-maps|7|none|13|4.960|55.040|True|
|sparse-certification-1-2.6-6C-W1|6|shared-ip|17|none|3|3.496|56.504|None|
|dense-certification-1-2.6-6C-W1|6|cycle-boundary|17|none|5|1.055|58.945|True|
|dense-certification-1-2.6-8C-W1|8|journey-C|30|21|0|6.740|53.260|None|
|medium-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.418|59.582|True|
|dense-certification-2-28-8C-W1|8|optimize-maps|9|none|11|6.560|53.440|True|
|very-dense-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.545|59.455|True|
|dense-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.580|59.420|True|
|sparse-certification-1-2.6-8C-W1|8|journey-D|10|none|10|3.698|56.302|None|
|dense-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|5.712|54.288|True|
|medium-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.297|59.703|True|
|dense-certification-1-2.6-8C-W1|8|cycle-boundary|21|21|1|1.239|58.761|True|
|dense-certification-1-2.6-8C-W1|8|two-workflows|18|none|2|6.242|53.758|True|
|sparse-certification-1-28-8C-W1|8|journey-A|10|none|10|0.381|59.619|None|
|dense-certification-1-28-8C-W1|8|shared-ip|21|21|0|8.034|51.966|None|
|medium-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.425|59.575|True|
|medium-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.290|59.710|True|
|dense-certification-1-28-8C-W1|8|journey-A|10|none|10|0.591|59.409|None|
|sparse-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.348|59.652|True|
|sparse-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|3.262|56.738|True|
|sparse-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.369|59.631|True|
|dense-certification-1-28-8C-W1|8|journey-D|10|none|10|6.735|53.265|None|
|sparse-certification-1-28-8C-W1|8|journey-C|30|21|0|4.367|55.633|None|
|sparse-certification-1-2.6-8C-W1|8|cycle-boundary|21|21|1|0.717|59.283|True|
|medium-certification-2-28-8C-W1|8|optimize-maps|9|none|11|4.466|55.534|True|
|dense-certification-1-2.6-8C-W1|8|journey-B|18|none|2|6.228|53.772|None|
|dense-certification-1-28-8C-W1|8|two-workflows|18|none|2|7.169|52.831|True|
|very-dense-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|7.688|52.312|True|
|dense-certification-1-2.6-8C-W1|8|shared-ip|21|21|0|7.066|52.934|None|
|medium-certification-1-28-8C-W1|8|optimize-maps|9|none|11|3.373|56.627|True|
|dense-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.640|59.360|True|
|very-dense-certification-2-28-8C-W1|8|optimize-maps|9|none|11|8.270|51.730|True|
|medium-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|4.199|55.801|True|
|sparse-certification-1-2.6-8C-W1|8|shared-ip|21|21|0|4.451|55.549|None|
|very-dense-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.508|59.492|True|
|medium-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|3.261|56.739|True|
|sparse-certification-1-2.6-8C-W1|8|journey-C|30|21|0|4.221|55.779|None|
|dense-certification-1-28-8C-W1|8|optimize-maps|9|none|11|6.565|53.435|True|
|sparse-certification-1-2.6-8C-W1|8|journey-A|10|none|10|0.357|59.643|None|
|dense-certification-1-2.6-8C-W1|8|journey-A|10|none|10|0.605|59.395|None|
|very-dense-certification-1-28-8C-W1|8|optimize-maps|9|none|11|7.612|52.388|True|
|sparse-certification-2-28-8C-W1|8|optimize-maps|9|none|11|3.367|56.633|True|
|dense-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.612|59.388|True|
|sparse-certification-1-28-8C-W1|8|journey-D|10|none|10|3.891|56.109|None|
|sparse-certification-1-28-8C-W1|8|journey-B|18|none|2|4.178|55.822|None|
|sparse-certification-1-28-8C-W1|8|two-workflows|18|none|2|4.091|55.909|True|
|sparse-certification-1-28-8C-W1|8|shared-ip|21|21|0|4.625|55.375|None|
|sparse-certification-1-2.6-8C-W1|8|journey-B|18|none|2|3.968|56.032|None|
|sparse-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|3.646|56.354|True|
|sparse-certification-1-28-8C-W1|8|optimize-maps|9|none|11|3.739|56.261|True|
|sparse-certification-1-2.6-8C-W1|8|two-workflows|18|none|2|3.956|56.044|True|
|dense-certification-1-28-8C-W1|8|journey-B|18|none|2|7.069|52.931|None|
|sparse-certification-1-28-8C-W1|8|cycle-boundary|21|21|1|0.745|59.255|True|
|very-dense-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|6.848|53.152|True|
|very-dense-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.669|59.331|True|
|dense-certification-1-28-8C-W1|8|cycle-boundary|21|21|1|1.227|58.773|True|
|dense-certification-1-2.6-8C-W1|8|journey-D|10|none|10|5.870|54.130|None|
|very-dense-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.693|59.307|True|
|sparse-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.320|59.680|True|
|sparse-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.292|59.708|True|
|dense-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.614|59.386|True|
|dense-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|6.170|53.830|True|
|dense-certification-1-28-8C-W1|8|journey-C|30|21|0|7.611|52.389|None|

For cycle-boundary scenarios, workflow attempts are15/19; the total includes the two immediate boundary probes. At eight, attempt20 must succeed and21 must return429 with Retry-After and remaining0. Denied requests cannot enter RF handlers: the unchanged middleware aborts before c.Next/global-slot acquisition; process CPU counters and native completion/denial logs corroborate the short rejection path. Deterministic succeeding probes confirm no scientific-state corruption.

Shared-IP/tab behavior uses separate real TCP connections carrying the same ClientIP, with a distinct-IP probe. The limiter has no tab identity: two nine-call workflows consume18 from the shared bucket, subsequent19/20 succeed and21 denies; the distinct IP retains its independent19 remaining after one request.

Rapid journeys A/B/D are Evaluate/maps→Interference, Evaluate/maps→Optimize/maps, and Optimize/maps→retained explanation. D reuses the existing Optimize result and adds only one explanation request. C measures the full cycle→Optimize and prospectively declared additional Interference/Evaluate follow-ups to locate denial. The full cycle→Optimize costs20 at eight versus16 at six: the next Interference is attempt21 at eight and17 at six. The absolute deny boundary stays21; eight reaches it earlier in the logical journey.

First-request and final-response UTC intervals are measured. The unchanged API exposes integer relative RateLimit-Reset/Retry-After, not an exact internal server-admission epoch. Bucket-expiry and remaining-window estimates use the client first-request start and are explicitly labelled; integer header metadata is preserved independently. No server timestamp precision is invented.

Budget mechanical verdict: **PASS**. Product fit: **PRODUCT BLOCKER**. One residual attempt after the19-call cycle and empirically denied immediate follow-ups are evaluated separately from the arithmetic fact that19 is below20.

## Frontend, persistence and future migration

Production App callbacks issue one network request followed by the sequential runNetworkSimulationQueue, with one single-Cell map per selected Cell. Optimize maps use returned per-Cell azimuths. User-triggered callbacks, rather than mount effects, start RF work; apiClient adds no automatic RF retry loop. [Disposable UI smoke](../scripts/eight-cell-operational-successor/frontend-smoke.json) replays actual saved HTTP bodies and checks exact frontend payloads and9/9 request counts, marker numbering1–8, selected list, Setup, Results, Solutions, Review, scrolling and reports. Its temporary selection clamp is isolated from production. Literal “two to six” Interference copy is a future review item.

```json
{
  "records": [
    {
      "cardinality": 6,
      "domain": "dense-certification-1",
      "frequency_ghz": 2.6,
      "export_bytes": null,
      "schema_version": null,
      "estimated_encoded_file_bytes": 6402381,
      "encoded_nodes": 198267,
      "expanded_project_nodes": 1429136,
      "expanded_project_bytes": 37950825,
      "packed_feature_collections": 0,
      "expansion_error": "Project file ray expansion exceeds the resource budget",
      "export_variants": [
        {
          "composition": "full-network-maps-interference",
          "estimated_encoded_file_bytes": 6402381,
          "encoded_nodes": 198267,
          "expanded_project_nodes": 1429136,
          "expanded_project_bytes": 37950825,
          "exported_bytes": null,
          "export_import_pass": false,
          "error": "Project file ray expansion exceeds the resource budget",
          "scientific_network_result_preserved": false
        },
        {
          "composition": "network-maps",
          "estimated_encoded_file_bytes": 5893042,
          "encoded_nodes": 172328,
          "expanded_project_nodes": 1285253,
          "expanded_project_bytes": 33412508,
          "exported_bytes": null,
          "export_import_pass": false,
          "error": "Project file ray expansion exceeds the resource budget",
          "scientific_network_result_preserved": false
        },
        {
          "composition": "network-result-only",
          "estimated_encoded_file_bytes": 108008,
          "encoded_nodes": 4647,
          "expanded_project_nodes": 4645,
          "expanded_project_bytes": 107978,
          "exported_bytes": 108008,
          "export_import_pass": true,
          "error": null,
          "scientific_network_result_preserved": true
        }
      ],
      "result_import_error": "Project file ray expansion exceeds the resource budget",
      "measured_full_result_import_pass": false,
      "all_ids_in_report": true,
      "scenario_version_order_preserved": true,
      "report_html_bytes": 140825,
      "report_markdown_bytes": 131792,
      "combined_simulation_bytes": 43943325,
      "optimization_bytes": 98176,
      "production_restore_normalization_count": 6,
      "interpretation": "Measured full, maps-only and network-result-only variants; independent v3 guards can reject large W1 ray artifacts even at six. Scientific network-result-only round trips do not certify full eight-Cell ray persistence. Shipping UI selection still clamps to six."
    },
    {
      "cardinality": 8,
      "domain": "dense-certification-1",
      "frequency_ghz": 2.6,
      "export_bytes": null,
      "schema_version": null,
      "estimated_encoded_file_bytes": 8298988,
      "encoded_nodes": 255501,
      "expanded_project_nodes": 1930014,
      "expanded_project_bytes": 51689353,
      "packed_feature_collections": 0,
      "expansion_error": "Project file ray expansion exceeds the resource budget",
      "export_variants": [
        {
          "composition": "full-network-maps-interference",
          "estimated_encoded_file_bytes": 8298988,
          "encoded_nodes": 255501,
          "expanded_project_nodes": 1930014,
          "expanded_project_bytes": 51689353,
          "exported_bytes": null,
          "export_import_pass": false,
          "error": "Project file contains too many nested values",
          "scientific_network_result_preserved": false
        },
        {
          "composition": "network-maps",
          "estimated_encoded_file_bytes": 7667100,
          "encoded_nodes": 221050,
          "expanded_project_nodes": 1684083,
          "expanded_project_bytes": 43849197,
          "exported_bytes": null,
          "export_import_pass": false,
          "error": "Project file ray expansion exceeds the resource budget",
          "scientific_network_result_preserved": false
        },
        {
          "composition": "network-result-only",
          "estimated_encoded_file_bytes": 120690,
          "encoded_nodes": 5219,
          "expanded_project_nodes": 5217,
          "expanded_project_bytes": 120660,
          "exported_bytes": 120690,
          "export_import_pass": true,
          "error": null,
          "scientific_network_result_preserved": true
        }
      ],
      "result_import_error": "Project file contains too many nested values",
      "measured_full_result_import_pass": false,
      "all_ids_in_report": true,
      "scenario_version_order_preserved": true,
      "report_html_bytes": 142645,
      "report_markdown_bytes": 133394,
      "combined_simulation_bytes": 54609413,
      "optimization_bytes": 108232,
      "production_restore_normalization_count": 6,
      "interpretation": "Measured full, maps-only and network-result-only variants; independent v3 guards can reject large W1 ray artifacts even at six. Scientific network-result-only round trips do not certify full eight-Cell ray persistence. Shipping UI selection still clamps to six."
    }
  ],
  "production_changes": false
}
```

V3 network-result-only export/import preserves all eight Cells and scientific optimizer output in the sampled state. Full W1 ray-bearing six/eight samples hit existing expansion/resource guards; full eight with interference also exceeds the encoded-node guard. Rejected variants and sizes/node counts remain reported; no limits are raised. Shipping restore still normalizes eight selected IDs to six. This is not full-ray or general persistence certification.

The [frozen cardinality inventory](../scripts/eight-cell-operational-successor/cardinality-contracts.json) and [future cap-migration manifest](../scripts/eight-cell-operational-successor/future-cap-migration-manifest.json) classify each location as MUST CHANGE6→8, SHOULD REMAIN INDEPENDENT, DOCUMENTATION ONLY, TEST ONLY or NO CHANGE. Future Recommendation eligibility must remain independent from a larger network clamp; its existing five-Cell contract is not automatically widened. No migration changes are applied.

## Decision, validation and freeze

Measured operational gates: **PASS**. Formal qualification: **VALID**; baseline execution and freeze chronology are independently verified. Final direction: **CONDITIONAL GO — REQUEST-BUDGET POLICY BLOCKER**. Recommended next action: **Eight-Cell Request-Budget / Workflow Policy Design in a separate task**.

Keep the product cap at six for now. Auto remains observation-only and estimator-driven adaptive admission stays paused. Do not add request weights/reservations, change20/60s, promoteW2/W3, raise deployment tiers to rescue A, modify RF/search/Pareto/persistence semantics, or release a new version. VERSION remains0.11.0.

Baseline and final quality checks:

|Stage|Check|Exit|Required E2E executed|
|---|---|---:|---|
|baseline_checks|backend_tests|0|True|
|baseline_checks|backend_race|0|True|
|baseline_checks|backend_vet|0|True|
|baseline_checks|frontend_tests|0|True|
|baseline_checks|frontend_lint|0|True|
|baseline_checks|frontend_build|0|True|
|baseline_checks|rf_budget_e2e|0|1|
|baseline_checks|rf_deadline_e2e|0|1|
|baseline_checks|auto_resource_profile_tests|0|True|
|baseline_checks|w1_preservation_tests|0|True|
|final_checks|backend_tests|0|True|
|final_checks|backend_race|0|True|
|final_checks|backend_vet|0|True|
|final_checks|frontend_tests|0|True|
|final_checks|frontend_lint|0|True|
|final_checks|frontend_build|0|True|
|final_checks|rf_budget_e2e|0|1|
|final_checks|rf_deadline_e2e|0|1|
|final_checks|auto_resource_profile_tests|0|True|
|final_checks|w1_preservation_tests|0|True|
|final_checks|audit_protocol_tests|0|True|
|final_checks|docs_build|0|True|
|final_checks|docs_validation|0|True|
|final_checks|version_consistency|0|True|
|final_checks|diff_check|0|True|

Additional protocol coverage includes audit-only cardinality, standard max-six, exact paired layouts, real request construction/counts, missing-reference rejection, native/sustained overlap and final tail, cancellation/slot release, deterministic science and evidence-manifest hashes. [Completion audit](../scripts/eight-cell-operational-successor/completion-audit.json) verifies phases, counts, hashes, preservation and quality. Reproduction tooling and instructions live in [audit directory README](../scripts/eight-cell-operational-successor/README.md).

Limits: exact frozen scope and finite repeats; shared development VM CPU quotas are not dedicated physical cores; loopback streaming is not a WAN/browser SLO; GC logs sample heap at events; raw local evidence needs separate release-asset/object-storage/LFS archival for permanent publication.

## Required 83-item assessment

1. **Starting baseline:** main @ 016c9c96579e2a95b14e3641f96bad00050d48d3; VERSION 0.11.0; prior uncommitted audit retained; exact status/diff in baseline.json
2. **Prior invalid-audit preservation result:** PASS; prior report/script/lock hashes and all 466 raw artifact hashes verified; prior D unchanged
3. **Baseline RF budget E2E command:** ATOM_REAL_E2E=1 npx playwright test e2e/rf-budget.spec.js --project=desktop-1440 --workers=1 --reporter=json
4. **Baseline RF budget E2E executed/pass/skip counts:** 1 discovered / 1 executed / 1 passed / 0 failed / 0 skipped; opt-in=True
5. **Baseline RF deadline E2E command:** ATOM_REAL_E2E=1 npx playwright test e2e/network-deadline.spec.js --project=desktop-1440 --workers=1 --reporter=json
6. **Baseline RF deadline E2E executed/pass/skip counts:** 1 discovered / 1 executed / 1 passed / 0 failed / 0 skipped; opt-in=True
7. **Execution-guard result:** PASS; named JSON test records and opt-in verified; skipped/zero-test/missing-opt-in regressions rejected; pre-freeze chronology verified
8. **Successor audit-lock SHA256:** 8d2423c56b57121f94fc658d670b0d52bbecd87c4c1fff2e0c13a39cd686efb0
9. **Domain-manifest SHA256:** d7e2a6e4ed46e3b8bc8c8dbf7ffc32f16f4caf0468365e0d7a9c581d4349ef84
10. **Run-plan SHA256:** f6a01b841061f50ec93c7dedff1f3f5de9b945dcf855bda7b8b9287d3967db2c
11. **Evidence-manifest SHA256:** f788b7a5bd60362daba43559c3ccc767de1367992f3b54858078ed9be2bdcce1
12. **Standard binary/image identity:** binary 200ea4e7a329e9a4ed32c8e3267232054a940e6434417e7c060ff2fe8e3f30c2; image sha256:30cb97ef650fb47b1372465789258d2e916ed654e71ba103d2c31a148adc1f81
13. **Audit binary/image identity:** binary 538361a73ed83674b5b5b3f66095892d58394477cd32b522ed3906010d032a9b; image sha256:1f08ca39cff21cbc6ab3f51a165354d4d070b1b6e774cfbb615fa152ac0a8bb2
14. **Standard-vs-audit differential:** Only MaxNetworkTowers 6→8 in disposable source; unchanged Dockerfile and shipping build flags
15. **Confirmation production cap remains 6:** Confirmed six
16. **7/8 normal rejection result:** HTTP 400 for seven/eight on all five network endpoints; six succeeds
17. **Runtime identity:** Go1.26.6 / Linux arm64 / CGO0 / cgroup v2
18. **Profile A verification:** All 15 primary batches verify CPU2, GOMAXPROCS2, RAM4GiB, worker1, queue16, slots2/1, deadline60s, budget20/60s
19. **Dataset verification:** ankara-open-planning 2026.07; 161,784 footprint parts / 936,651 vertices / 451 inventory Cells; exact GeoJSON hashes verified
20. **Eight-layout identity comparison with prior audit:** Exact prior domain/run-plan bytes and all 36 fixture hashes; same six IDs/order and appended two IDs
21. **8C-W1 confirmation:** 120 rays / 400m / 30dBm / 120° / 2.6 and28GHz / 20 and100MHz; legacy two-pass search; eight sequential single-Cell maps
22. **Planned/observed group count:** 837 planned / 837 observed
23. **Evaluate result:** PASS; 82 groups; worst individual 0.689s
24. **Optimize result:** PASS; 50 groups; worst individual 11.231s
25. **Interference result:** PASS; 82 groups; worst individual 0.100s
26. **Explanation result:** PASS; 48 groups; worst individual 10.149s
27. **Building Entry result:** PASS; 48 groups; worst individual 0.083s
28. **Evaluate+maps result:** PASS; 16 groups; worst individual 0.483s
29. **Optimize+maps result:** PASS; 16 groups; worst individual 8.096s
30. **Evaluation-cycle result:** PASS; 4 groups; worst individual 0.447s
31. **Worst required latency:** 11.418134s
32. **Minimum deadline headroom:** 48.581866s
33. **Peak RSS:** 1296248832 bytes
34. **Peak cgroup memory:** 1384833024 bytes (1.289726GiB)
35. **Memory headroom:** 67.7568% of hard limit remains
36. **OOM events:** {"oom": 0, "oom_kill": 0, "max": 0}
37. **Two-optimizer result:** PASS; 12 groups; worst individual 10.973s
38. **Optimize+Evaluate result:** PASS; 12 groups; worst individual 6.827s
39. **Evaluate+Evaluate result:** PASS; 12 groups; worst individual 0.694s
40. **Normal async result:** 24/24 PASS; actual uncached native overlap
41. **Sustained async result:** 24/24 PASS; first30s activity and drain verified
42. **Final-tail result:** 24/24 sustained tails overlap native background execution
43. **Largest contention inflation:** {"batch":"A-8C-mixed-2","index":5,"fixture":"dense-certification-1-2.6-8C-W1","operation":"sustained-evaluate","endpoint":"/api/evaluate-network","seconds":1.0140559673309326,"isolated_median_seconds":0.4183371067047119,"inflation_ratio":2.4240163042641965}
44. **Cancellation result:** 12/12 PASS; cancel100ms; max release observation 0.007077s
45. **Slot-release result:** PASS
46. **Scientific determinism:** PASS; 435 exact input groups; only Building Entry diagnostics.elapsed_ms excluded
47. **Six-Cell preservation:** PASS; 352 exact frozen W1 response matches
48. **Evaluate/maps budget count:** 9 accepted; remaining11
49. **Optimize/maps budget count:** 9 accepted; remaining11
50. **Full-cycle budget count:** 19 accepted; remaining1
51. **Attempt-20 result:** HTTP200, remaining0 in all four cycle boundary cases
52. **Attempt-21 result:** HTTP429, remaining0, Retry-After/reset; before RF handler
53. **Two-workflow result:** 18 accepted; remaining2
54. **Shared-IP result:** PASS; separate connections share same ClientIP bucket
55. **Distinct-IP result:** PASS; fresh independent bucket, remaining19 after one request
56. **Rapid-follow-up journey result:** A/B/D succeed in both cardinalities; C first429 is absolute attempt21 in both, reached at the immediate Interference after 8C cycle+single Optimize (19+1+1), versus later follow-ups at6C (15+1+1 succeeds). {"6":{"A":["none"],"B":["none"],"C":[21],"D":["none"]},"8":{"A":["none"],"B":["none"],"C":[21],"D":["none"]}}
57. **Remaining time after 19-attempt cycle:** 58.760502–59.283303s client-anchor estimate; integer shipping reset headers retained
58. **Budget mechanical verdict:** PASS
59. **Budget product-fit classification:** PRODUCT BLOCKER
60. **Largest response:** 17051014 bytes
61. **Largest workflow response:** Evaluate/maps 58902269; Optimize/maps 60251142; logical cycle 113898816 bytes
62. **Frontend request-shape result:** PASS; one network + eight sequential map calls, no duplicate/retry/StrictMode amplification
63. **Presentation smoke result:** PASS; numbering1–8, selection, Setup, Results, Solutions, Review, scroll, report
64. **Persistence observation:** Network-result-only8 round-trip=True; 120690 bytes; full ray variants hit existing guards; no new gate
65. **Operational verdict:** PASS
66. **Methodology violations:** []
67. **Missing evidence:** None
68. **Final A/B/C/D classification:** B — CONDITIONAL GO — REQUEST-BUDGET POLICY BLOCKER
69. **Whether eight Cells are operationally qualified on Profile A:** Yes, exact frozen Profile A scope
70. **Whether request budget blocks promotion:** Yes
71. **Whether cap remains six:** Yes
72. **Whether a promotion task is justified:** Promotion blocked; policy design first
73. **Whether budget-policy design is required:** Yes; separate task
74. **Estimator-admission status:** Paused; estimator/adaptive admission not reopened
75. **Auto status:** Observation-only
76. **Production invariance:** PASS; production source/build/policy/persistence/fingerprints unchanged
77. **Final real-E2E execution/pass confirmation:** Budget: 1 discovered / 1 executed / 1 passed / 0 failed / 0 skipped; opt-in=True; Deadline: 1 discovered / 1 executed / 1 passed / 0 failed / 0 skipped; opt-in=True
78. **Version recommendation:** Keep VERSION0.11.0; no release/tag/publish
79. **Files created/changed:** New successor report MD/JSON/HTML and scripts; CHANGELOG.md, docs build reference, generated changelog/search index updated; prior audit unchanged
80. **Raw evidence storage:** /tmp/atom-eight-cell-operational-successor; SHA256/size/category/group index and separate hashed archive outside Git
81. **Tests/checks:** Ten baseline and fifteen final quality commands; protocol/guard tests; real cardinality, overlap, cancellation, science, evidence controls
82. **Freeze decision:** Keep immutable audit inputs and evidence; production cap six, fixed policy unchanged, adaptive admission paused, Auto observation-only
83. **Single recommended next action:** Eight-Cell Request-Budget / Workflow Policy Design in a separate task
