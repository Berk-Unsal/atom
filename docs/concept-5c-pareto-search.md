# Concept 5C — Priority-Independent Pareto Archive Search

Audit version: concept-5c-audit-v1

## Decision

Concept 5C is implemented as an explicit opt-in policy, deterministic_pareto_archive_search_v1. The legacy two-pass coordinate search and Concept 5B multi-start coordinate search remain available and unchanged. 5C is a bounded heuristic: it is not exhaustive, globally optimal, or a complete Pareto frontier.

## Search architecture

The policy evaluates the same canonical RF candidate requests and stores a request-scoped evaluated-state archive keyed by the existing deterministic cell/azimuth identity. Four deterministic starts are seeded: the authoritative request state and uniform 90°, 180°, and 270° rotations. Each expanded state generates every legal absolute azimuth candidate for every cell at the existing 10° grid.

Discovery uses only feasibility, objective availability, and the exact normalized objective utilities. It never uses user priority weights for queue ordering, acceptance, archive survival, or expansion eligibility. The active archive contains feasible evaluated states that are exactly non-dominated under the currently available objective set; dominated states are removed from the active archive but retained in the complete evaluated archive. Newly admitted archive states are expanded FIFO by round and admission order. All configured deterministic starts are expanded even if one is already dominated, which is the explicit bounded stepping-stone policy.

## Ranking and identity

After discovery, the existing available-weight normalization, composite score, feasibility, and stable tower-key tie-break rank the fixed discovered frontier. discovery_fingerprint excludes user weights and includes RF inputs, objective availability, objective set, starts, grid, queue/archive policies, cell order, and bounds. ranking_fingerprint adds the priority vector and ranking policy. The public 25-solution view is selected by stable state ID before ranking, so priority changes may reorder or recommend a solution but cannot change the bounded view membership.

## Limitations and gate

The archive is deliberately bounded by unique RF evaluations, expanded states, and rounds. A budget-limited run reports budget_complete=false. Pareto-only expansion cannot cross a dominated stepping stone unless a deterministic start or a future explicitly audited novelty rule admits it. Infeasible states are retained as evidence and deterministic starts may expand them, but newly discovered infeasible states do not enter the active archive or become expansion candidates. These are search-traversal semantics only; production feasibility and recommendation semantics are unchanged.

The generated JSON artifacts record two-cell 36×36 and restricted three-cell 12³ exhaustive comparisons, interaction and infeasible-barrier fixtures, priority invariance, multi-priority recovery, radio-quality objective-set behavior, order and budget sensitivity, archive growth, performance/memory estimates, and bounded Ankara behavior when the dataset is available. Keep 5C opt-in pending a product decision based on those measurements.
