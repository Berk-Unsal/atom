# Concept 5A — Optimization Search Quality, Convergence & Robustness Audit

Audit version: concept-5a-audit-v1

This is a diagnostic-only audit. No production optimizer, RF model, objective, Pareto, recommendation, canonical default, or scenario-fingerprint semantics were changed.

## Scope and production contract

The current production entry point is OptimizeNetworkContext. Its search is a deterministic network coordinate sweep over azimuth only:

1. Normalize the request and prepare one invariant optimization domain/context.
2. Evaluate the request azimuth vector once as the baseline.
3. Run exactly two passes in request tower order.
4. For each cell, evaluate absolute candidates 0°, 10°, …, 350° (36 candidates), independent of the current azimuth.
5. Prefer feasible candidates; while all candidates are infeasible, retain the highest composite score.
6. Evaluate the final vector, deduplicate evaluated states for Pareto construction, and sort the feasible frontier by exact score, then stable tower-key tie-break.

The default production path performs 434 candidate evaluations for a six-cell request: baseline + (2 × 6 × 36) candidates + final. It has no optimizer-level memoization; lower-level RF/radio-quality preparation may cache candidate-independent geometry.

## Baseline and invariance

The pre-change baseline artifact records the exact production response, scenario fingerprint, domain metadata, objective status, recommendation, and Pareto IDs. The post-change comparison is an independent repeat under the same source tree. The audit requires exact equality of those snapshots and records the result as production optimizer unchanged.

See concept-5a-pre-change-baseline.json, concept-5a-post-change-comparison.json, and concept-5a-performance.json.

## Search quality findings

- A fixed two-pass run is a fixed-pass search, not a convergence claim.
- Strict greater-than acceptance means exact score ties retain the first candidate in enumeration order; floating-point comparisons use no tolerance.
- Feasibility is lexicographically prior to score: a feasible candidate displaces an infeasible incumbent even when its soft score is lower.
- Candidate-independent preparation is invariant across the hot loop; optimizer-level requested evaluations are not cached in production.
- Cell order, starting azimuths, pass count, step size, and priorities can change the trajectory and recommendation. They are search-policy inputs, not RF semantics.
- The synthetic interaction trap and multiple-local-optima fixtures demonstrate that coordinate descent can miss the exhaustive global best.

## Synthetic fixtures A–F

The fixtures cover separability, an interaction trap, multiple local optima, plateaus/ties, a Pareto trade-off surface, and an infeasible high-soft-score candidate. Fixture F confirms that an infeasible high score is not recommended when a feasible candidate exists.

See concept-5a-exhaustive-fixtures.json.

## Exhaustive RF ground truth and Pareto quality

Small controlled RF cases enumerate every 10° azimuth combination using the production RF evaluator and objective normalization, while using an independent exhaustive Pareto dominance implementation. The artifacts report candidate counts, feasible counts, exact recommendation recovery, score regret, raw-metric differences, Pareto recall, Pareto precision, and missed trade-offs.

The independent oracle is intentionally separate from the production networkParetoFrontier implementation; only production RF semantics and utility definitions are reused.

See concept-5a-pareto-quality.json.

## Sensitivity and robustness

The controlled six-cell matrix varies request order, reverse/rotated order, starts (baseline, ±10°, and staggered perturbation), one/two/three passes, until-stable termination, and 20°/10°/5° candidate steps. The full Ankara pack is used for the bounded key-run robustness set, including default, reverse order, start perturbation, pass-count, step-size, and until-stable checks.

The state trace records accepted coordinate updates, repeated states, fixed points, cycle detection, and termination reason. A repeated state of length one is a plateau/fixed-point observation; a cycle is only reported for a repeated state with length greater than one.

See concept-5a-search-sensitivity.json and concept-5a-six-cell-robustness.json.

## Feasibility, unavailable objectives, radio quality, and numerics

The audit records unavailable positively weighted demand behavior, effective-weight renormalization when a configured objective has no target entities, and the hard-constraint exclusion of infeasible candidates from recommendation and Pareto output. Radio-quality enabled/disabled runs record domain metadata, availability, evaluation count, cache behavior, and result differences; enabling the objective does not silently alter disabled-mode semantics.

Tie and near-tie fixtures preserve exact comparison behavior. No epsilon was introduced.

## Honest metadata and terminology

Every search result carries a scenario fingerprint and a search fingerprint that includes algorithm version, step, pass/termination policy, cell order, starts, objective configuration, RF profile, and memoization mode, while excluding timestamps, runtime, local paths, and UI state. Runtime and performance measurements are reported separately and are never part of a search identity.

The terminology audit reports active uses of optimal, global optimum, and related claims and recommends recommended candidate, best evaluated candidate, or search result under fixed candidate policy unless an exhaustive or otherwise certified method supports a stronger statement.

## Future Concept 5B assessment (not implemented)

Potential methods are ranked for a future gated phase: coordinate descent until stable, deterministic multi-start, coarse-to-fine refinement, neighborhood search, beam search, simulated annealing, evolutionary/NSGA-style exploration, and branch-and-bound. The first practical gate should be deterministic multi-start plus until-stable termination with explicit evaluation budgets and per-start traces; coarse-to-fine is attractive for reducing RF evaluations but requires a proof that coarse angular scores do not hide narrow beam optima. Pareto-preserving methods must report archive policy, dominance tolerance (if any), and recall/precision against the exhaustive fixtures. None of these methods is implemented by Concept 5A.

## Validation record

The harness has fast unit coverage for the six synthetic fixtures, production-vs-diagnostic equivalence on a controlled RF fixture, independent exhaustive RF oracle comparisons, objective availability, radio-quality mode metadata, deterministic fingerprints, JSON generation, documentation validation, and git diff --check. Full repository race/vet/test commands remain the release-level validation gate.

Generated artifacts are rooted at /Users/berkunsal/Desktop/urban-ray-tracer and contain no production optimizer edits.
