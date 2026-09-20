# Concept 5B — Deterministic Multi-Start Until-Stable Search Audit

Audit version: concept-5b-audit-v1

## Decision

Concept 5B is implemented as an explicit opt-in policy, "deterministic_multistart_coordinate_v1". The legacy two-pass coordinate search remains the default and is not promoted. The new path is useful for bounded, auditable discovery, but it is still a heuristic local search: it is neither exhaustive nor globally optimal, and its discovered candidate set is priority-dependent.

## Production contract

The opt-in policy starts from the authoritative normalized request azimuths and three deterministic uniform global rotations (90°, 180°, and 270°). Each start follows request cell order and evaluates the existing absolute 10° candidate grid. A coordinate move is accepted only under the existing feasible-first, strict composite-score comparison. A start stops on a full stable pass, repeated state, its pass bound, or the request-scoped candidate-state RF-evaluation budget. The archive is the ordered union of unique evaluated states, deduplicated by a stable cell-ID/azimuth state key; the existing Pareto implementation is applied to that archive.

Response metadata is present only for the opt-in policy. It reports algorithm/version, start traces, requested versus unique evaluations, cache hits, archive and feasible counts, Pareto size, search fingerprint, and explicit heuristic/incomplete-search flags. Priority changes are discovery-sensitive; re-ranking the stored frontier is distinct from exploring unseen states.

## Evidence

The JSON artifacts in this directory contain the pre-change legacy freeze, deterministic start-policy audit, 36×36 exhaustive two-cell comparison, restricted 12³ three-cell comparison, synthetic interaction/local-optima/plateau/feasibility/Pareto fixtures, Pareto archive checks, controlled performance/cost curves, canonical Ankara runs when the dataset is available, radio-quality disabled/enabled checks, and post-change default invariance.

The stopping gate is: legacy default exactness, memoization equivalence, deterministic repeated execution, archive-based Pareto construction, honest budget/termination metadata, practical bounded runtime, and no RF/objective/utility/feasibility semantic tuning. The audit records each result explicitly; unavailable canonical runs are marked unavailable rather than inferred.

## Recommendation

Keep "deterministic_multistart_coordinate_v1" opt-in for diagnostics and controlled experiments. Do not make it the default until a product decision accepts its extra evaluation cost and the exhaustive/regret evidence justifies a broader quality claim. Do not use “optimal”, “global optimum”, or “guaranteed best” for this policy; use “recommended candidate”, “best evaluated candidate”, or “Pareto candidate under the fixed search policy”.

Artifacts are rooted in the repository docs directory. Runtime and allocation measurements are evidence fields only and are excluded from scenario and search fingerprints.
