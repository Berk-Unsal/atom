function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

function formatDbm(value) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} dBm`;
}

/**
 * One deterministic sentence pair for a single-sector RF result, built only from returned fields.
 * Ray blockage (obstruction at sampled ray end points) and coverage gaps (demand buildings not above the
 * building-service threshold) are different measures; the text keeps them apart.
 */
export function describeSectorResult(simulation, gapStats) {
  const blockedPct = finite(simulation?.stats?.blocked_pct);
  if (blockedPct === null) return null;
  const sensitivity = finite(simulation?.receiver_threshold?.sensitivity_dbm);
  const radius = finite(simulation?.rf_profile?.radius_m);
  const stops = [
    sensitivity === null ? null : `the ${formatDbm(sensitivity)} receiver sensitivity`,
    radius === null ? null : `the ${Math.round(radius)} m planning radius`,
  ].filter(Boolean);
  const rays = `${blockedPct.toFixed(1)}% of sampled rays end at a building-obstructed point`
    + (stops.length ? ` (rays stop at ${stops.join(" or ")})` : "")
    + ".";

  const candidates = finite(gapStats?.candidate_buildings);
  const gaps = finite(gapStats?.gap_buildings);
  const threshold = finite(gapStats?.building_service_threshold_dbm ?? gapStats?.threshold_dbm);
  const thresholdText = threshold === null ? "the building-service threshold" : `the ${formatDbm(threshold)} building-service threshold`;
  let demand;
  if (candidates === null || gaps === null) {
    demand = "Coverage-gap counts are unavailable for this result.";
  } else if (candidates === 0) {
    demand = "No demand buildings fall inside this sector, so there are no coverage gaps to count.";
  } else if (gaps === 0) {
    demand = `All ${candidates.toLocaleString()} demand buildings in the sector are above ${thresholdText}, so there are no coverage gaps.`;
  } else {
    demand = `${gaps.toLocaleString()} of ${candidates.toLocaleString()} demand buildings in the sector are not above ${thresholdText}.`;
  }
  return `${rays} ${demand}`;
}
