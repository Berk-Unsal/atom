package raytracer

import "context"

// The legacy search changes one azimuth at a time, but used to retrace every
// unchanged cell for every proposed network. Cache only independent per-cell RF
// contributions; network aggregation, interference, constraints, ordering and
// Pareto processing still run for every original proposal.
//
// This map belongs to one synchronous search and one immutable building index.
// Its exact, comparable request key includes coordinates, rays, calibration and
// the full resolved profile. No rounding/hash collisions or cross-request reuse.
// For the legacy 10-degree grid it holds at most 37 entries per selected cell
// (36 grid angles plus a possible off-grid baseline), retaining no ray geometry.
type networkCellContribution struct {
	Reach            float64
	BuildingCoverage map[string]float64
}

type networkCellContributionCache map[StaticSimulationRequest]networkCellContribution

func networkCellRFContribution(ctx context.Context, req StaticSimulationRequest, buildings *BuildingIndex, cache networkCellContributionCache) (networkCellContribution, error) {
	if err := ctx.Err(); err != nil {
		return networkCellContribution{}, err
	}
	lookupDone := timeOptimizationPhase(ctx, "cell_memo_lookup")
	contribution, hit := cache[req]
	lookupDone()
	if timing := optimizationTiming(ctx); timing != nil {
		if hit {
			timing.CellMemoHits++
		} else {
			timing.CellMemoMisses++
		}
	}
	if hit {
		return contribution, nil
	}
	origin := Point{Lon: req.TowerLon, Lat: req.TowerLat}
	reachDone := timeOptimizationPhase(ctx, "rf_reach")
	breakdown, err := CoverageAreaScoreBreakdownContext(ctx, origin, req, buildings)
	reachDone()
	if err != nil {
		return networkCellContribution{}, err
	}
	coverageDone := timeOptimizationPhase(ctx, "rf_building_coverage")
	coverage, err := BuildingCoverageMapContext(ctx, origin, req, buildings)
	coverageDone()
	if err != nil {
		return networkCellContribution{}, err
	}
	contribution = networkCellContribution{Reach: breakdown.CoverageScore, BuildingCoverage: coverage}
	if cache != nil {
		cache[req] = contribution
	}
	return contribution, nil
}
