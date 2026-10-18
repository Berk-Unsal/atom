// Network-wide versus inside-area KPIs. Both columns come from the same per-building response; nothing is derived.

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function share(part, whole) {
  const numerator = finite(part);
  const denominator = finite(whole);
  if (numerator === null || denominator === null) return "—";
  if (denominator <= 0) return "No relevant demand";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function countOf(part, whole) {
  const covered = finite(part);
  const total = finite(whole);
  return covered === null || total === null ? "—" : `${covered} of ${total}`;
}

function overlap(count, ratio) {
  const buildings = finite(count);
  if (buildings === null) return "—";
  const fraction = finite(ratio);
  return fraction === null ? String(buildings) : `${buildings} (${(fraction * 100).toFixed(1)}% of covered)`;
}

/** Rows of [label, network-wide, inside area], or [] when the result has no area-of-interest stats. */
export function areaOfInterestRows(stats) {
  const area = stats?.area_of_interest;
  if (!area) return [];
  const raw = stats?.raw_metrics ?? {};
  // Zero-valued network fields are omitted from the response, so a missing value here means 0.
  return [
    ["Demand served", share(raw.served_demand_weight ?? 0, raw.relevant_demand_weight ?? 0), share(area.served_demand_weight, area.relevant_demand_weight)],
    ["Residential buildings served", countOf(raw.residential_covered ?? 0, raw.relevant_residential_total ?? 0), countOf(area.residential_covered, area.relevant_residential_total)],
    ["Overlap buildings", overlap(raw.overlap_buildings, raw.overlap_ratio), overlap(area.overlap_buildings, area.overlap_ratio)],
    ["Relevant buildings", finite(raw.covered_units) === null ? "—" : `${raw.covered_units} covered`, `${area.covered_units ?? 0} covered of ${area.relevant_buildings ?? 0}`],
  ];
}
