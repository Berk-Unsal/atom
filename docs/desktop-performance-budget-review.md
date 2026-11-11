# Desktop performance budget review proposal

Status: proposed for #158, 2026-11-11. No comparator, workflow outcome, support promise or release gate is changed by this document. The existing commands still fail when the original guidance is missed.

The accepted Electron engine and the complete default dataset exceed the initial unmeasured Wails guidance. The decision is whether to fund further memory/startup work or accept explicit, measured Electron limits. Functional parity alone does not decide that tradeoff. This proposal makes the decision reviewable while preserving all failures and raw measurements.

## Evidence and scope

[The production work record](desktop-production-qualification.md) retains source-specific results. [Hosted run 42891428154](https://github.com/Berk-Unsal/atom/actions/runs/42891428154) has 20 fresh-profile launches, 20 same-profile relaunches and 20 warmed pairs per RF endpoint on each platform; [its raw record](assets/desktop-rf-twenty-ci.json) includes every sample. The Ubuntu VM has four logical EPYC CPUs and about 16 GiB RAM. The hosted Mac is a three-CPU virtual M1 with 7 GiB RAM, below the planned four-core/16 GiB reference. Neither is a clean minimum-supported-OS installation. Fresh profiles do not imply cold filesystem caches.

| Measurement | macOS hosted | Ubuntu hosted | Original comparator |
| --- | ---: | ---: | ---: |
| Fresh-profile launch p95 | 6.950 s | 5.290 s | 10 s |
| Same-profile launch p95 | 5.220 s | 5.216 s | 5 s |
| Same-profile child + data p95 | 4.404 s | 4.662 s | 4 s |
| Full-pack aggregate idle RSS | 889.23 MiB | 1225.09 MiB | 500 MiB |
| Sample-pack aggregate idle RSS | 445.23 MiB | 806.23 MiB | Diagnostic only |
| Short simulate native/standalone median | 65.70 / 52.60 ms | 67.85 / 39.93 ms | Difference at most 5% |
| Evaluate-network relative median difference | 1.84% | 0.65% | At most 5% |
| Optimize-network relative median difference | 1.09% | 0.18% | At most 5% |

RSS includes every descendant host, renderer, GPU, helper and owned Go process and counts shared pages more than once. Ubuntu full-pack PSS is about 804.92 MiB; macOS PSS is unavailable. The full-minus-sample RSS difference is about 444 MiB on macOS and 419 MiB on Ubuntu, an observed whole-tree difference rather than isolated dataset allocation. The loader optimization reduces temporary allocation by 38.59% but leaves retained Go heap near 371 MB, so it does not establish a route to a 500 MiB whole-app limit.

Those hosted RF/map records have smaller content viewports. The [corrected local run](assets/desktop-rf-twenty-macos.json), on an M4/10-CPU/24 GiB host at an asserted 1440×900, completes all 66 exact deterministic pairs and both eight-Cell workflows. Simulate medians are 18.85/13.49 ms: only about 5.36 ms apart, but 39.76% relatively. Evaluation/optimization differ by less than 1%. Later hosted run `43003801102` completes the same functional checks at 1440×900 on both targets; its Mac startup was skipped after a cached-display-verifier failure. The corrected verifier run must be assessed separately before updating the reference dataset for a decision.

## Proposed decision

If the measured cost is acceptable for the declared reference hardware, consider these bounds after repeat measurements on that hardware and the intended installed builds:

| Metric | Proposed bound | Reason and cost |
| --- | --- | --- |
| Fresh-profile launch / child + data p95 | Keep 10 s / 8 s | Existing measurements pass; no relaxation is justified. |
| Same-profile launch / child + data p95 | 7 s / 6 s | Allows roughly one to two seconds beyond observed hosted p95 values, including earlier 6.422 s launch results. It accepts a visibly slower warm start than the initial goal. |
| Full-pack aggregate idle RSS after 60 s | 1.6 GiB | Includes the complete process tree and about 30% headroom over the larger hosted observation. This is over three times the initial guidance and needs an explicit resource-cost decision. Keep Linux PSS and full/sample comparisons as diagnostics. |
| Fixed short simulate fixture | Native median at most 100 ms **and** native-minus-standalone median at most 40 ms | Both absolute bounds apply; a faster native result is allowed. Avoids treating a few milliseconds as an unbounded percentage exception. Applies only to this recorded request/pack fixture, with the same 20 alternating warmed pairs. |
| Network evaluation / optimization | Keep relative median difference at most 5% | Both transports already meet it; no RF scope, precision, rate limit or search-cap change is needed. |
| Eight-Cell map / input | Keep 30 FPS / p95 100 ms requirements | Current animation-frame and second-frame results are explicit proxies. Physical presentation/input acceptance remains open. |

These proposed bounds are engineering tradeoffs, not statistically established guarantees. Twenty samples provide limited tail coverage; shared VM contention and different CPUs prevent pooling targets into one distribution. Compressed package size needs its own Electron-specific measured decision; the Wails 250 MiB guidance is not silently transferred or removed here.

A reviewer can retain the original guidance and request further optimization instead. Before adopting any revision, bind the selected limits to the exact pack, binary, hardware, supported OS and viewport; repeat the measurements on that scope; and record the decision in the qualification/release policy. Signing, clean-machine native surfaces, redistribution/provider approval and scientific RF validation remain separate requirements.
