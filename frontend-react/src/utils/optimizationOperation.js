// This describes the submitted search, never completed work or time remaining.
// An omitted policy selects the backend's unchanged legacy network search.
export function describeOptimizationScope(request) {
  const cellCount = request.towers.length;
  const policy = request.search_policy?.trim() || "legacy_two_pass_coordinate";
  const cells = `${cellCount} ${cellCount === 1 ? "cell" : "cells"}`;
  if (policy === "legacy_two_pass_coordinate") {
    const passes = 2;
    const proposals = passes * 36 * cellCount + 2;
    return { cellCount, passes, proposals, label: `${cells} · ${passes} passes · ${proposals} proposals` };
  }
  const search = {
    deterministic_multistart_coordinate_v1: "multi-start bounded search",
    deterministic_pareto_archive_search_v1: "Pareto archive search",
  }[policy] ?? "network search";
  return { cellCount, label: `${cells} · ${search}` };
}
