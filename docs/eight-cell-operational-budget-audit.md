# Eight-Cell Operational + Request-Budget Re-audit

**INVALID / INSUFFICIENT (D).** Status: complete. Production Cell cap remains **six**. No product promotion or request-policy change is applied.

Initial RF budget/deadline E2E commands exited zero but skipped both required tests because ATOM_REAL_E2E=1 was missing. Required pre-measurement validation did not occur. Final real-E2E success cannot repair preregistration retrospectively: formal direction stays D. All 837 groups and original locks/logs remain without replacements. [Methodology defect](../scripts/eight-cell-operational-audit/methodology-defect.json) records the evidence.

Exact eight paired W1 domains, frequencies 2.6/28 GHz, shipping Go1.26.6 Linux/arm64 CGO0 cgroupv2 Profile A 2CPU/4GiB; audit-only eight Cells.

This preregistered audit compares paired 6C/8C W1 requests on the minimum certified reference. A positive result applies only to the exact tested layouts/settings/runtime; neither larger tiers nor historical timing can rescue Profile A.

## Baseline and frozen contract

Starting baseline: `016c9c96579e2a95b14e3641f96bad00050d48d3`, branch `main`, VERSION `0.11.0`, clean status and empty diff stat. Prior qualification and capacity artifacts remain byte-for-byte preserved.

| Artifact | SHA256 / reference |
|---|---|
| Audit lock | `f4505ed97f80a9ab9261962007027ddedf10859f13c7b00aa07a164bb3867874` |
| Domain manifest | `d7e2a6e4ed46e3b8bc8c8dbf7ffc32f16f4caf0468365e0d7a9c581d4349ef84` |
| Run plan | `f6a01b841061f50ec93c7dedff1f3f5de9b945dcf855bda7b8b9287d3967db2c` |
| Evidence manifest | [Manifest](../scripts/eight-cell-operational-audit/evidence-manifest.json), with final digest in [SHA256 file](../scripts/eight-cell-operational-audit/evidence-manifest.sha256) |

Raw streamed bodies, ledgers, sampler/async traces and logs stay outside Git in `/tmp/atom-eight-cell-operational-audit`. The tracked index identifies every retained raw artifact by path/logical ID, SHA256, byte size, category and group; a local compressed archive retains the indexed evidence. No historical evidence is removed.

## Shipping versus audit binary

The audit uses a disposable source copy and the unchanged production Dockerfile. The only production-source difference is `MaxNetworkTowers = 6` → `8` in that copy. The existing Auto metadata consequently reports eight for the audit binary. Normal source and shipping builds remain six. Recommendation remains five and Measurement Validation remains six. No production override/environment switch is added.

| Build | Image identity | Binary SHA256 |
|---|---|---|
| audit | `sha256:1f08ca39cff21cbc6ab3f51a165354d4d070b1b6e774cfbb615fa152ac0a8bb2` | `538361a73ed83674b5b5b3f66095892d58394477cd32b522ed3906010d032a9b` |
| standard | `sha256:30cb97ef650fb47b1372465789258d2e916ed654e71ba103d2c31a148adc1f81` | `200ea4e7a329e9a4ed32c8e3267232054a940e6434417e7c060ff2fe8e3f30c2` |

Both binaries use Go1.26.6, Linux/arm64, CGO disabled, identical release flags and pinned compiler/runtime bases. [Machine-readable differential](../scripts/eight-cell-operational-audit/binary-differential.json) records source/build metadata. Host Go quality checks are separate from qualification timing.

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

Every original six ID and its order is preserved. Exactly two additional distinct real inventory IDs are appended using original-anchor cosine-adjusted squared distance and numeric ID tie-break. The [domain manifest](../scripts/eight-cell-operational-audit/domain-manifest.json) freezes coordinates, profiles, relative geometry, enclosing bounds, footprint/vertex counts and inherited geometry bands before RF timing.

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

Historical continuity control: 9664800, 26390, 9664790, 9664795, 9664791, 9664794, 12261147, 9664785. Its deterministic inventory selection is reproduced and measured separately with W1 RF settings; it matches none of the eight new primary paired layouts. Historical RF settings and any W1-normalization differences are recorded in [comparison](../scripts/eight-cell-operational-audit/historical-comparison.json).

## 8C-W1 and methodology

120 rays,400m,30dBm,120° beam,2.6/28GHz, normal20/100MHz interference bandwidths, unchanged legacy two-pass search. Selected-network cardinality is eight for Evaluate, Optimize, Interference, retained network explanation and network Building Entry; maps number eight independent single-Cell Simulate calls. Independent Recommendation, Measurement Validation and experiment contracts are retained.

Real Linux TCP, shipping-equivalent Gin routes, actual middleware/limiter/deadline and uncompressed streamed reads supply primary evidence. The longer monotonic/UTC interval scores requests and groups. A difference over1s invalidates the original observation; no replacement or early stop is allowed. Host `caffeinate -i` prevents automatic idle sleep. HTTP success, complete reads, every request≤45s,≥15s deadline headroom, lifetime cgroup peak≤3GiB, zero oom/oom_kill/max events and all slot/concurrency/background/cancellation/science checks are required.

Plan: 837 groups; observed 837. Evaluate/Interference each have five repeats per domain/frequency/cardinality; Optimize/Explain/Building Entry each have three. Explanation group timing includes its required Optimize prerequisite, and individual HTTP times remain available in the ledgers. No averaging removes failures.

## Paired six-to-eight measurements

Wall and CPU ratios below use medians within exact domain/frequency/operation pairs; maximum individual latency and all failures are scored independently. Memory deltas compare observed sampled group maxima, not incremental reservations. Lifetime kernel peak remains the memory gate. No linear N scaling is assumed.

| Domain | GHz | Operation |6C wall s|8C wall s|Wall ratio|6C CPU s|8C CPU s|CPU ratio|Bytes ratio|Sampled cgroup delta MiB|
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
|dense-certification-1|2.6|building-entry|0.170|0.130|0.765|0.083|0.071|0.857|1.145|-115.676|
|dense-certification-1|2.6|evaluate|0.381|0.423|1.109|0.523|0.581|1.111|1.184|-93.707|
|dense-certification-1|2.6|evaluate-maps|0.663|0.688|1.039|0.831|0.891|1.071|1.242|-44.605|
|dense-certification-1|2.6|explain|14.622|5.748|0.393|23.003|8.789|0.382|1.100|-0.723|
|dense-certification-1|2.6|interference|0.041|0.051|1.246|0.064|0.075|1.173|1.728|110.727|
|dense-certification-1|2.6|optimize|6.195|7.811|1.261|9.719|12.064|1.241|1.102|-19.309|
|dense-certification-1|2.6|optimize-maps|6.296|6.106|0.970|9.782|9.197|0.940|1.312|-83.328|
|dense-certification-1|28|building-entry|0.273|0.122|0.446|0.090|0.129|1.432|1.145|7.500|
|dense-certification-1|28|evaluate|0.387|0.451|1.165|0.542|0.614|1.131|1.184|56.812|
|dense-certification-1|28|evaluate-maps|0.648|1.188|1.833|0.933|1.724|1.848|1.467|166.406|
|dense-certification-1|28|explain|12.945|16.155|1.248|20.057|25.024|1.248|1.099|-65.734|
|dense-certification-1|28|interference|0.031|0.041|1.332|0.054|0.038|0.713|1.729|12.824|
|dense-certification-1|28|optimize|6.661|9.696|1.456|10.389|15.056|1.449|1.102|-57.277|
|dense-certification-1|28|optimize-maps|7.918|8.901|1.124|12.115|13.406|1.107|1.428|-51.707|
|dense-certification-2|2.6|building-entry|0.231|0.163|0.709|0.086|0.044|0.511|2.198|-110.688|
|dense-certification-2|2.6|evaluate|0.343|0.424|1.234|0.478|0.573|1.199|1.184|-25.250|
|dense-certification-2|2.6|evaluate-maps|0.489|0.608|1.245|0.664|0.805|1.212|1.323|-45.551|
|dense-certification-2|2.6|explain|8.524|13.074|1.534|13.661|21.055|1.541|1.105|-8.977|
|dense-certification-2|2.6|interference|0.031|0.040|1.288|0.060|0.042|0.690|2.480|24.230|
|dense-certification-2|2.6|optimize|4.863|6.602|1.358|7.820|10.367|1.326|1.107|-4.066|
|dense-certification-2|2.6|optimize-maps|4.207|6.326|1.504|6.643|9.923|1.494|1.330|-68.801|
|dense-certification-2|28|building-entry|0.246|0.229|0.929|0.188|0.071|0.377|2.198|-114.496|
|dense-certification-2|28|evaluate|0.387|0.485|1.255|0.538|0.667|1.239|1.184|75.234|
|dense-certification-2|28|evaluate-maps|0.792|0.627|0.792|1.145|0.864|0.755|1.494|-68.223|
|dense-certification-2|28|explain|5.496|14.035|2.554|8.695|22.047|2.535|1.104|-15.422|
|dense-certification-2|28|interference|0.020|0.049|2.407|0.029|0.086|2.969|2.478|15.891|
|dense-certification-2|28|optimize|10.494|6.508|0.620|16.320|9.963|0.610|1.107|-17.293|
|dense-certification-2|28|optimize-maps|4.795|14.211|2.964|7.499|22.324|2.977|1.434|85.891|
|medium-certification-1|2.6|building-entry|0.095|0.082|0.865|0.088|0.104|1.182|1.025|71.102|
|medium-certification-1|2.6|evaluate|0.220|0.202|0.917|0.329|0.226|0.688|1.190|206.805|
|medium-certification-1|2.6|evaluate-maps|0.245|0.310|1.267|0.254|0.340|1.340|1.307|-19.855|
|medium-certification-1|2.6|explain|6.522|6.672|1.023|10.017|10.271|1.025|1.107|-2.383|
|medium-certification-1|2.6|interference|0.025|0.042|1.675|0.021|0.062|2.985|1.607|87.340|
|medium-certification-1|2.6|optimize|5.540|3.191|0.576|8.395|4.738|0.564|1.110|-39.070|
|medium-certification-1|2.6|optimize-maps|3.100|7.395|2.386|4.728|10.786|2.281|1.334|-47.895|
|medium-certification-1|28|building-entry|0.096|0.049|0.508|0.059|0.039|0.660|1.025|97.473|
|medium-certification-1|28|evaluate|0.255|0.224|0.879|0.290|0.304|1.049|1.190|-13.094|
|medium-certification-1|28|evaluate-maps|0.372|0.325|0.873|0.550|0.371|0.675|1.320|-15.410|
|medium-certification-1|28|explain|3.463|9.428|2.722|5.236|14.522|2.773|1.104|16.707|
|medium-certification-1|28|interference|0.023|0.045|1.944|0.023|0.080|3.571|1.611|46.691|
|medium-certification-1|28|optimize|6.408|3.290|0.513|9.834|4.889|0.497|1.107|-163.996|
|medium-certification-1|28|optimize-maps|3.246|3.580|1.103|4.908|5.342|1.088|1.340|81.656|
|medium-certification-2|2.6|building-entry|0.328|0.598|1.824|0.090|0.159|1.765|1.070|-118.254|
|medium-certification-2|2.6|evaluate|0.263|0.309|1.175|0.369|0.438|1.188|1.184|-123.648|
|medium-certification-2|2.6|evaluate-maps|0.412|0.934|2.269|0.447|1.275|2.854|1.256|153.102|
|medium-certification-2|2.6|explain|5.167|4.284|0.829|8.078|6.449|0.798|1.098|9.738|
|medium-certification-2|2.6|interference|0.060|0.077|1.283|0.111|0.147|1.320|1.604|104.723|
|medium-certification-2|2.6|optimize|4.357|5.594|1.284|6.644|8.547|1.286|1.101|147.320|
|medium-certification-2|2.6|optimize-maps|4.260|6.236|1.464|6.570|9.426|1.435|1.247|19.836|
|medium-certification-2|28|building-entry|0.425|0.147|0.345|0.150|0.040|0.265|1.070|-13.219|
|medium-certification-2|28|evaluate|0.292|0.273|0.935|0.424|0.312|0.735|1.185|-84.449|
|medium-certification-2|28|evaluate-maps|0.448|0.456|1.019|0.625|0.559|0.893|1.316|63.469|
|medium-certification-2|28|explain|7.851|4.552|0.580|12.213|6.825|0.559|1.098|-18.043|
|medium-certification-2|28|interference|0.053|0.056|1.043|0.077|0.047|0.608|1.611|-72.191|
|medium-certification-2|28|optimize|10.502|5.806|0.553|15.910|8.939|0.562|1.101|-61.590|
|medium-certification-2|28|optimize-maps|4.241|4.532|1.069|6.414|6.727|1.049|1.316|-25.312|
|sparse-certification-1|2.6|building-entry|0.152|0.111|0.728|0.099|0.058|0.586|2.880|43.453|
|sparse-certification-1|2.6|evaluate|0.236|0.264|1.115|0.362|0.392|1.083|1.190|116.695|
|sparse-certification-1|2.6|evaluate-maps|0.350|0.353|1.008|0.508|0.448|0.884|1.437|-163.062|
|sparse-certification-1|2.6|explain|7.429|5.174|0.696|11.441|7.892|0.690|1.118|49.449|
|sparse-certification-1|2.6|interference|0.022|0.050|2.298|0.017|0.094|5.437|1.595|119.695|
|sparse-certification-1|2.6|optimize|6.251|5.508|0.881|9.393|8.448|0.899|1.121|78.879|
|sparse-certification-1|2.6|optimize-maps|3.424|3.716|1.085|5.155|5.515|1.070|1.515|-135.406|
|sparse-certification-1|28|building-entry|0.153|0.107|0.702|0.099|0.057|0.577|2.881|-11.711|
|sparse-certification-1|28|evaluate|0.262|0.237|0.906|0.341|0.291|0.852|1.190|213.375|
|sparse-certification-1|28|evaluate-maps|0.252|0.432|1.713|0.265|0.612|2.308|1.350|6.059|
|sparse-certification-1|28|explain|5.904|3.849|0.652|9.017|5.730|0.635|1.105|93.016|
|sparse-certification-1|28|interference|0.032|0.053|1.659|0.038|0.054|1.441|1.612|6.074|
|sparse-certification-1|28|optimize|7.618|3.668|0.481|11.314|5.428|0.480|1.108|-25.492|
|sparse-certification-1|28|optimize-maps|3.514|3.854|1.097|5.241|5.673|1.082|1.353|-49.559|
|sparse-certification-2|2.6|building-entry|0.060|0.068|1.125|0.055|0.129|2.350|1.658|94.859|
|sparse-certification-2|2.6|evaluate|0.249|0.226|0.907|0.369|0.295|0.799|1.188|84.461|
|sparse-certification-2|2.6|evaluate-maps|0.277|0.306|1.106|0.292|0.325|1.115|1.368|129.930|
|sparse-certification-2|2.6|explain|5.603|3.293|0.588|8.421|4.870|0.578|1.101|-111.230|
|sparse-certification-2|2.6|interference|0.022|0.046|2.108|0.018|0.049|2.750|1.707|76.703|
|sparse-certification-2|2.6|optimize|5.341|4.292|0.804|8.322|6.468|0.777|1.104|-10.262|
|sparse-certification-2|2.6|optimize-maps|2.652|3.462|1.306|3.935|5.110|1.298|1.344|-33.879|
|sparse-certification-2|28|building-entry|0.058|0.046|0.798|0.044|0.033|0.752|1.658|-13.496|
|sparse-certification-2|28|evaluate|0.215|0.209|0.973|0.233|0.241|1.037|1.184|145.430|
|sparse-certification-2|28|evaluate-maps|0.352|0.322|0.915|0.379|0.392|1.035|1.350|118.777|
|sparse-certification-2|28|explain|6.655|3.343|0.502|9.997|4.932|0.493|1.099|46.867|
|sparse-certification-2|28|interference|0.031|0.037|1.189|0.062|0.046|0.739|1.696|32.504|
|sparse-certification-2|28|optimize|8.652|3.257|0.376|12.874|4.804|0.373|1.102|48.277|
|sparse-certification-2|28|optimize-maps|3.784|3.439|0.909|5.791|5.040|0.870|1.325|-80.234|
|very-dense-certification-1|2.6|building-entry|0.315|0.125|0.396|0.141|0.070|0.495|1.347|109.641|
|very-dense-certification-1|2.6|evaluate|0.377|0.463|1.226|0.518|0.661|1.277|1.184|158.738|
|very-dense-certification-1|2.6|evaluate-maps|0.518|0.711|1.372|0.713|0.999|1.402|1.376|52.570|
|very-dense-certification-1|2.6|explain|7.099|6.946|0.979|11.232|10.702|0.953|1.494|-22.070|
|very-dense-certification-1|2.6|interference|0.026|0.032|1.227|0.043|0.036|0.836|1.679|92.238|
|very-dense-certification-1|2.6|optimize|6.728|10.175|1.512|10.504|16.068|1.530|1.515|5.320|
|very-dense-certification-1|2.6|optimize-maps|5.370|6.888|1.283|8.295|10.533|1.270|1.315|-79.949|
|very-dense-certification-1|28|building-entry|0.116|0.162|1.392|0.131|0.130|0.990|1.348|12.562|
|very-dense-certification-1|28|evaluate|0.394|0.503|1.275|0.544|0.748|1.376|1.185|-30.594|
|very-dense-certification-1|28|evaluate-maps|0.650|0.594|0.914|0.891|0.837|0.939|1.504|24.828|
|very-dense-certification-1|28|explain|15.013|10.351|0.690|22.969|16.164|0.704|1.105|-33.484|
|very-dense-certification-1|28|interference|0.032|0.033|1.034|0.058|0.063|1.084|1.673|101.312|
|very-dense-certification-1|28|optimize|12.478|10.824|0.867|19.360|16.917|0.874|1.108|58.402|
|very-dense-certification-1|28|optimize-maps|6.693|8.112|1.212|10.347|12.407|1.199|1.431|56.172|
|very-dense-certification-2|2.6|building-entry|0.420|0.182|0.434|0.160|0.047|0.296|1.152|-99.426|
|very-dense-certification-2|2.6|evaluate|0.330|0.394|1.195|0.470|0.540|1.149|1.185|71.910|
|very-dense-certification-2|2.6|evaluate-maps|0.462|0.628|1.360|0.639|0.889|1.393|1.264|63.422|
|very-dense-certification-2|2.6|explain|9.385|15.061|1.605|14.985|23.803|1.588|1.098|-55.102|
|very-dense-certification-2|2.6|interference|0.062|0.057|0.915|0.118|0.056|0.476|1.511|-83.906|
|very-dense-certification-2|2.6|optimize|14.109|11.914|0.844|22.488|18.876|0.839|1.101|-59.660|
|very-dense-certification-2|2.6|optimize-maps|6.504|7.927|1.219|10.110|12.176|1.204|1.316|21.848|
|very-dense-certification-2|28|building-entry|0.493|0.259|0.524|0.174|0.115|0.665|1.152|38.492|
|very-dense-certification-2|28|evaluate|0.353|0.370|1.049|0.498|0.462|0.929|1.185|-0.301|
|very-dense-certification-2|28|evaluate-maps|0.487|1.099|2.254|0.581|1.545|2.661|1.335|3.832|
|very-dense-certification-2|28|explain|15.059|14.858|0.987|23.616|23.342|0.988|1.096|16.977|
|very-dense-certification-2|28|interference|0.037|0.085|2.295|0.032|0.148|4.623|1.521|66.426|
|very-dense-certification-2|28|optimize|23.937|12.032|0.503|37.290|18.954|0.508|1.099|75.492|
|very-dense-certification-2|28|optimize-maps|7.940|9.048|1.139|12.124|13.906|1.147|1.395|-107.305|

### Operational results

|Operation/scenario|Groups|Worst individual s|Largest single bytes|Largest workflow bytes|
|---|---:|---:|---:|---:|
|evaluate|82|2.523|34457|34457|
|optimize|50|23.418|108308|108308|
|interference|82|0.223|17051014|17051014|
|explain|48|17.896|108308|111332|
|building-entry|48|0.222|3691322|3691322|
|evaluate-maps|16|0.929|7992018|58902269|
|optimize-maps|16|13.968|8264877|60251142|
|cycle-boundary|4|0.450|12226823|121173745|
|two-optimizers|12|11.937|108267|216534|
|optimize-evaluate|12|6.754|108267|142698|
|two-evaluates|12|0.663|34431|68862|
|async-optimize|12|6.626|108267|108267|
|async-evaluate|12|0.608|34431|34431|
|sustained-optimize|12|10.623|108267|529520|
|sustained-evaluate|12|1.136|34431|378741|
|cancel|12|0.105|0|0|

Worst required eight-Cell request: 23.418s; minimum deadline headroom 36.582s. Peak RSS 1225.020MiB; kernel cgroup peak 1.284GiB; hard-limit headroom 67.90%. OOM events: `{'oom': 0, 'oom_kill': 0, 'max': 0}`. The conservative peak includes startup, page cache and the extra pre-RF Auto CLI. Stock GC event heap evidence is retained in JSON; no continuous HeapAlloc maximum is inferred.

True client/native concurrency overlap: True. Normal/sustained background evidence includes uncached native intervals containing every interactive launch, first30s active-worker samples, final-tail overlap and drain barriers. Cancellation cases: 12/12; maximum handler-release observation 0.013s. Same-client follow-up remaining18 proves cancellation attempt charging and slot reuse; other-client probes also succeed.

Scientific determinism: True, 435 exact endpoint/request groups; only Building Entry diagnostics.elapsed_ms excluded. Six-Cell preservation: True; 352 measured responses match frozen W1 evidence.

Largest contention inflation: `{"batch":"A-8C-mixed-2","index":14,"fixture":"sparse-certification-1-28-8C-W1","operation":"two-evaluates","endpoint":"/api/evaluate-network","seconds":0.6626088619232178,"isolated_median_seconds":0.23654389381408691,"inflation_ratio":2.8012089056249287}`.

Search counts use the existing opt-in request-local collector in a separate, non-qualification test executable. No collector is linked/enabled in primary shipping HTTP measurements. Its complete serialized scientific responses must match corresponding real-HTTP results. [Search accounting](../scripts/eight-cell-operational-audit/search-accounting.json) reports proposals, cache hits/misses, RF contribution calculations and spatial counters. Legacy proposals are434 for six and578 for eight; observed cache/geometry counts are recorded per exact fixture.

### Required failures / invalid observations

```json
{
  "capacity_failures": [],
  "methodology_violations": [
    "baseline-real-e2e-skipped: Baseline RF budget/deadline Playwright commands exited zero but both gated tests skipped because ATOM_REAL_E2E=1 was absent. The lock incorrectly treated exit zero as executed validation."
  ],
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
|dense-certification-1-28-6C-W1|6|cycle-boundary|17|none|5|0.979|59.021|True|
|dense-certification-1-28-6C-W1|6|journey-A|8|none|12|0.534|59.466|None|
|medium-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.245|59.755|True|
|sparse-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.252|59.748|True|
|very-dense-certification-2-28-6C-W1|6|optimize-maps|7|none|13|7.939|52.061|True|
|dense-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.791|59.209|True|
|sparse-certification-1-28-6C-W1|6|journey-A|8|none|12|0.338|59.662|None|
|medium-certification-2-28-6C-W1|6|optimize-maps|7|none|13|4.240|55.760|True|
|dense-certification-1-28-6C-W1|6|journey-B|14|none|6|5.855|54.145|None|
|dense-certification-1-28-6C-W1|6|shared-ip|17|none|3|7.144|52.856|None|
|sparse-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|2.651|57.349|True|
|sparse-certification-1-2.6-6C-W1|6|journey-B|14|none|6|3.177|56.823|None|
|sparse-certification-1-28-6C-W1|6|journey-D|8|none|12|3.029|56.971|None|
|very-dense-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.461|59.539|True|
|very-dense-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|6.504|53.496|True|
|very-dense-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|5.364|54.636|True|
|very-dense-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.518|59.482|True|
|dense-certification-1-2.6-6C-W1|6|shared-ip|17|none|3|6.500|53.500|None|
|dense-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.488|59.512|True|
|sparse-certification-1-2.6-6C-W1|6|journey-A|8|none|12|0.343|59.657|None|
|sparse-certification-1-2.6-6C-W1|6|journey-D|8|none|12|2.889|57.111|None|
|dense-certification-1-2.6-6C-W1|6|journey-D|8|none|12|5.276|54.724|None|
|sparse-certification-1-28-6C-W1|6|journey-C|24|21|0|4.491|55.509|None|
|very-dense-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.649|59.351|True|
|very-dense-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.487|59.513|True|
|medium-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.372|59.628|True|
|dense-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|4.207|55.793|True|
|sparse-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.350|59.650|True|
|dense-certification-1-2.6-6C-W1|6|evaluate-maps|7|none|13|0.662|59.338|True|
|sparse-certification-2-28-6C-W1|6|optimize-maps|7|none|13|3.784|56.216|True|
|dense-certification-1-28-6C-W1|6|evaluate-maps|7|none|13|0.647|59.353|True|
|sparse-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|3.424|56.576|True|
|dense-certification-1-2.6-6C-W1|6|journey-B|14|none|6|6.394|53.606|None|
|dense-certification-1-28-6C-W1|6|journey-D|8|none|12|6.874|53.126|None|
|sparse-certification-1-28-6C-W1|6|cycle-boundary|17|none|5|0.713|59.287|True|
|very-dense-certification-1-28-6C-W1|6|optimize-maps|7|none|13|6.693|53.307|True|
|dense-certification-2-28-6C-W1|6|optimize-maps|7|none|13|4.795|55.205|True|
|medium-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|3.099|56.901|True|
|sparse-certification-1-28-6C-W1|6|shared-ip|17|none|3|4.317|55.683|None|
|sparse-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.276|59.724|True|
|medium-certification-1-28-6C-W1|6|optimize-maps|7|none|13|3.246|56.754|True|
|sparse-certification-1-28-6C-W1|6|optimize-maps|7|none|13|3.508|56.492|True|
|dense-certification-1-28-6C-W1|6|journey-C|24|21|0|7.822|52.178|None|
|dense-certification-1-28-6C-W1|6|two-workflows|14|none|6|6.712|53.288|True|
|dense-certification-1-2.6-6C-W1|6|two-workflows|14|none|6|6.142|53.858|True|
|sparse-certification-1-2.6-6C-W1|6|two-workflows|14|none|6|3.415|56.585|True|
|medium-certification-2-2.6-6C-W1|6|evaluate-maps|7|none|13|0.411|59.589|True|
|medium-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.447|59.553|True|
|sparse-certification-1-28-6C-W1|6|two-workflows|14|none|6|3.776|56.224|True|
|medium-certification-2-2.6-6C-W1|6|optimize-maps|7|none|13|4.259|55.741|True|
|sparse-certification-1-2.6-6C-W1|6|cycle-boundary|17|none|5|0.679|59.321|True|
|sparse-certification-1-2.6-6C-W1|6|journey-C|24|21|0|4.598|55.402|None|
|sparse-certification-2-28-6C-W1|6|evaluate-maps|7|none|13|0.351|59.649|True|
|dense-certification-1-2.6-6C-W1|6|journey-C|24|21|0|8.812|51.188|None|
|dense-certification-1-2.6-6C-W1|6|optimize-maps|7|none|13|6.296|53.704|True|
|dense-certification-1-2.6-6C-W1|6|journey-A|8|none|12|0.779|59.221|None|
|sparse-certification-1-28-6C-W1|6|journey-B|14|none|6|3.955|56.045|None|
|dense-certification-1-28-6C-W1|6|optimize-maps|7|none|13|7.918|52.082|True|
|sparse-certification-1-2.6-6C-W1|6|shared-ip|17|none|3|7.343|52.657|None|
|dense-certification-1-2.6-6C-W1|6|cycle-boundary|17|none|5|1.610|58.390|True|
|dense-certification-1-2.6-8C-W1|8|journey-C|30|21|0|16.051|43.949|None|
|medium-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.933|59.067|True|
|dense-certification-2-28-8C-W1|8|optimize-maps|9|none|11|14.211|45.789|True|
|very-dense-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|1.098|58.902|True|
|dense-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|1.188|58.812|True|
|sparse-certification-1-2.6-8C-W1|8|journey-D|10|none|10|4.822|55.178|None|
|dense-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|6.105|53.895|True|
|medium-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.324|59.676|True|
|dense-certification-1-2.6-8C-W1|8|cycle-boundary|21|21|1|1.280|58.720|True|
|dense-certification-1-2.6-8C-W1|8|two-workflows|18|none|2|6.630|53.370|True|
|sparse-certification-1-28-8C-W1|8|journey-A|10|none|10|0.360|59.640|None|
|dense-certification-1-28-8C-W1|8|shared-ip|21|21|0|8.168|51.832|None|
|medium-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.456|59.544|True|
|medium-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.305|59.695|True|
|dense-certification-1-28-8C-W1|8|journey-A|10|none|10|0.632|59.368|None|
|sparse-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.432|59.568|True|
|sparse-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|3.462|56.538|True|
|sparse-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.353|59.647|True|
|dense-certification-1-28-8C-W1|8|journey-D|10|none|10|6.898|53.102|None|
|sparse-certification-1-28-8C-W1|8|journey-C|30|21|0|4.473|55.527|None|
|sparse-certification-1-2.6-8C-W1|8|cycle-boundary|21|21|1|0.791|59.209|True|
|medium-certification-2-28-8C-W1|8|optimize-maps|9|none|11|4.531|55.469|True|
|dense-certification-1-2.6-8C-W1|8|journey-B|18|none|2|6.425|53.575|None|
|dense-certification-1-28-8C-W1|8|two-workflows|18|none|2|7.372|52.628|True|
|very-dense-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|7.927|52.073|True|
|dense-certification-1-2.6-8C-W1|8|shared-ip|21|21|0|7.484|52.516|None|
|medium-certification-1-28-8C-W1|8|optimize-maps|9|none|11|3.580|56.420|True|
|dense-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.688|59.312|True|
|very-dense-certification-2-28-8C-W1|8|optimize-maps|9|none|11|9.047|50.953|True|
|medium-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|6.235|53.765|True|
|sparse-certification-1-2.6-8C-W1|8|shared-ip|21|21|0|7.614|52.386|None|
|very-dense-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.627|59.373|True|
|medium-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|7.395|52.605|True|
|sparse-certification-1-2.6-8C-W1|8|journey-C|30|21|0|13.665|46.335|None|
|dense-certification-1-28-8C-W1|8|optimize-maps|9|none|11|8.901|51.099|True|
|sparse-certification-1-2.6-8C-W1|8|journey-A|10|none|10|0.389|59.611|None|
|dense-certification-1-2.6-8C-W1|8|journey-A|10|none|10|0.648|59.352|None|
|very-dense-certification-1-28-8C-W1|8|optimize-maps|9|none|11|8.111|51.889|True|
|sparse-certification-2-28-8C-W1|8|optimize-maps|9|none|11|3.439|56.561|True|
|dense-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.627|59.373|True|
|sparse-certification-1-28-8C-W1|8|journey-D|10|none|10|3.983|56.017|None|
|sparse-certification-1-28-8C-W1|8|journey-B|18|none|2|4.166|55.834|None|
|sparse-certification-1-28-8C-W1|8|two-workflows|18|none|2|4.184|55.816|True|
|sparse-certification-1-28-8C-W1|8|shared-ip|21|21|0|4.734|55.266|None|
|sparse-certification-1-2.6-8C-W1|8|journey-B|18|none|2|4.069|55.931|None|
|sparse-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|3.715|56.285|True|
|sparse-certification-1-28-8C-W1|8|optimize-maps|9|none|11|3.853|56.147|True|
|sparse-certification-1-2.6-8C-W1|8|two-workflows|18|none|2|4.055|55.945|True|
|dense-certification-1-28-8C-W1|8|journey-B|18|none|2|7.191|52.809|None|
|sparse-certification-1-28-8C-W1|8|cycle-boundary|21|21|1|0.746|59.254|True|
|very-dense-certification-1-2.6-8C-W1|8|optimize-maps|9|none|11|6.888|53.112|True|
|very-dense-certification-1-28-8C-W1|8|evaluate-maps|9|none|11|0.594|59.406|True|
|dense-certification-1-28-8C-W1|8|cycle-boundary|21|21|1|1.245|58.755|True|
|dense-certification-1-2.6-8C-W1|8|journey-D|10|none|10|5.976|54.024|None|
|very-dense-certification-1-2.6-8C-W1|8|evaluate-maps|9|none|11|0.711|59.289|True|
|sparse-certification-2-28-8C-W1|8|evaluate-maps|9|none|11|0.322|59.678|True|
|sparse-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.306|59.694|True|
|dense-certification-2-2.6-8C-W1|8|evaluate-maps|9|none|11|0.608|59.392|True|
|dense-certification-2-2.6-8C-W1|8|optimize-maps|9|none|11|6.325|53.675|True|
|dense-certification-1-28-8C-W1|8|journey-C|30|21|0|8.137|51.863|None|

For cycle-boundary scenarios, workflow attempts are15/19; the total includes the two immediate boundary probes. At eight, attempt20 must succeed and21 must return429 with Retry-After and remaining0. Denied requests cannot enter RF handlers: the unchanged middleware aborts before c.Next/global-slot acquisition; process CPU counters and native completion/denial logs corroborate the short rejection path. Deterministic succeeding probes confirm no scientific-state corruption.

Shared-IP/tab behavior uses separate real TCP connections carrying the same ClientIP, with a distinct-IP probe. The limiter has no tab identity: two nine-call workflows consume18 from the shared bucket, subsequent19/20 succeed and21 denies; the distinct IP retains its independent19 remaining after one request.

Rapid journeys A/B/D are Evaluate/maps→Interference, Evaluate/maps→Optimize/maps, and Optimize/maps→retained explanation. D reuses the existing Optimize result and adds only one explanation request. C measures the full cycle→Optimize and prospectively declared additional Interference/Evaluate follow-ups to locate denial. The full cycle→Optimize costs20 at eight versus16 at six: the next Interference is attempt21 at eight and17 at six. The absolute deny boundary stays21; eight reaches it earlier in the logical journey.

First-request and final-response UTC intervals are measured. The unchanged API exposes integer relative RateLimit-Reset/Retry-After, not an exact internal server-admission epoch. Bucket-expiry and remaining-window estimates use the client first-request start and are explicitly labelled; integer header metadata is preserved independently. No server timestamp precision is invented.

Budget mechanical verdict: **PASS**. Product fit: **PRODUCT BLOCKER**. One residual attempt after the19-call cycle and empirically denied immediate follow-ups are evaluated separately from the arithmetic fact that19 is below20.

## Frontend, persistence and future migration

Production App callbacks issue one network request followed by the sequential runNetworkSimulationQueue, with one single-Cell map per selected Cell. Optimize maps use returned per-Cell azimuths. User-triggered callbacks, rather than mount effects, start RF work; apiClient adds no automatic RF retry loop. [Disposable UI smoke](../scripts/eight-cell-operational-audit/frontend-smoke.json) replays actual saved HTTP bodies and checks exact frontend payloads and9/9 request counts, marker numbering1–8, selected list, Setup, Results, Solutions, Review, scrolling and reports. Its temporary selection clamp is isolated from production. Literal “two to six” Interference copy is a future review item.

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

The [frozen cardinality inventory](../scripts/eight-cell-operational-audit/cardinality-contracts.json) and [future cap-migration manifest](../scripts/eight-cell-operational-audit/future-cap-migration-manifest.json) classify each location as MUST CHANGE6→8, SHOULD REMAIN INDEPENDENT, DOCUMENTATION ONLY, TEST ONLY or NO CHANGE. Future Recommendation eligibility must remain independent from a larger network clamp; its existing five-Cell contract is not automatically widened. No migration changes are applied.

## Decision, validation and freeze

Measured operational gates: **PASS**. Formal qualification: **INVALID / INSUFFICIENT** because required pre-measurement real E2Es skipped. Final direction: **INVALID / INSUFFICIENT**. Recommended next action: **Resolve documented evidence/protocol insufficiency before a new prospective audit**.

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
|baseline_checks|rf_budget_e2e|0|False|
|baseline_checks|rf_deadline_e2e|0|False|
|baseline_checks|auto_resource_profile_tests|0|True|
|baseline_checks|w1_preservation_tests|0|True|
|final_checks|backend_tests|0|True|
|final_checks|backend_race|0|True|
|final_checks|backend_vet|0|True|
|final_checks|frontend_tests|0|True|
|final_checks|frontend_lint|0|True|
|final_checks|frontend_build|0|True|
|final_checks|rf_budget_e2e|0|True|
|final_checks|rf_deadline_e2e|0|True|
|final_checks|auto_resource_profile_tests|0|True|
|final_checks|w1_preservation_tests|0|True|
|final_checks|audit_protocol_tests|0|True|
|final_checks|docs_build|0|True|
|final_checks|docs_validation|0|True|
|final_checks|version_consistency|0|True|
|final_checks|diff_check|0|True|

Additional protocol coverage includes audit-only cardinality, standard max-six, exact paired layouts, real request construction/counts, missing-reference rejection, native/sustained overlap and final tail, cancellation/slot release, deterministic science and evidence-manifest hashes. [Completion audit](../scripts/eight-cell-operational-audit/completion-audit.json) verifies phases, counts, hashes, preservation and quality. Reproduction tooling and instructions live in [audit directory README](../scripts/eight-cell-operational-audit/README.md).

Limits: exact frozen scope and finite repeats; shared development VM CPU quotas are not dedicated physical cores; loopback streaming is not a WAN/browser SLO; GC logs sample heap at events; raw local evidence needs separate release-asset/object-storage/LFS archival for permanent publication.
