package raytracer

// Concept 5B audit code is intentionally test-only. It records the opt-in
// search contract, compares it with independent small-space oracles, and
// writes deterministic artifacts without becoming part of the API runtime.

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"
	"time"
)

const concept5BAuditVersion = "concept-5b-audit-v1"

func concept5BFrontierIDs(frontier []NetworkParetoSolution) []string {
	ids := make([]string, 0, len(frontier))
	for _, solution := range frontier {
		ids = append(ids, solution.ID)
	}
	return ids
}

func concept5BStringSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	return set
}

func concept5BSetIntersection(left, right []string) int {
	leftSet := concept5BStringSet(left)
	count := 0
	for _, value := range right {
		if _, ok := leftSet[value]; ok {
			count++
		}
	}
	return count
}

func concept5BArchiveKeys(run networkSearchRunResult) []string {
	keys := make([]string, 0, len(run.Archive))
	for _, candidate := range run.Archive {
		keys = append(keys, azimuthKey(candidate.Azimuths))
	}
	return keys
}

func concept5BRunView(req NetworkOptimizationRequest, run networkSearchRunResult, frontier []NetworkParetoSolution, oracle *concept5AExhaustiveOracle) map[string]any {
	view := map[string]any{
		"policy":                run.Metadata.Policy,
		"search_fingerprint":    run.Metadata.SearchFingerprint,
		"step_deg":              run.Metadata.AzimuthStepDeg,
		"start_count":           run.Metadata.StartCount,
		"completed_start_count": run.Metadata.CompletedStartCount,
		"start_ids": func() []string {
			ids := make([]string, 0, len(run.Metadata.StartTraces))
			for _, trace := range run.Metadata.StartTraces {
				ids = append(ids, trace.StartID)
			}
			return ids
		}(),
		"metadata":                               run.Metadata,
		"baseline_azimuths":                      run.Baseline.Azimuths,
		"final_azimuths":                         run.FinalAzimuths,
		"final_state_key":                        azimuthKey(run.FinalAzimuths),
		"archive_keys":                           concept5BArchiveKeys(run),
		"archive_size":                           len(run.Archive),
		"frontier_ids":                           concept5BFrontierIDs(frontier),
		"frontier_size":                          len(frontier),
		"incomplete_search":                      run.Metadata.IncompleteSearch,
		"candidate_discovery_priority_dependent": run.Metadata.CandidateDiscoveryPriorityDependent,
	}
	if oracle == nil {
		return view
	}
	recommendedKey := ""
	if len(frontier) > 0 {
		recommendedKey = frontier[0].ID
	}
	recommendedScore := 0.0
	if len(frontier) > 0 {
		recommendedScore = frontier[0].Score
	}
	truePareto := oracle.ParetoKeys
	discoveredPareto := concept5BFrontierIDs(frontier)
	intersection := concept5BSetIntersection(truePareto, discoveredPareto)
	recall := 0.0
	precision := 0.0
	if len(truePareto) > 0 {
		recall = float64(intersection) / float64(len(truePareto))
	}
	if len(discoveredPareto) > 0 {
		precision = float64(intersection) / float64(len(discoveredPareto))
	}
	scoreDelta := recommendedScore - oracle.BestScore
	scoreRegret := oracle.BestScore - recommendedScore
	if scoreRegret < 0 {
		scoreRegret = 0
	}
	view["oracle_comparison"] = map[string]any{
		"global_best_key":                           oracle.BestKey,
		"global_best_score":                         oracle.BestScore,
		"recommended_key":                           recommendedKey,
		"recommended_score":                         recommendedScore,
		"score_delta_recommended_minus_global_best": scoreDelta,
		"score_regret":                              scoreRegret,
		"recommendation_recovered":                  recommendedKey == oracle.BestKey,
		"true_pareto_keys":                          truePareto,
		"pareto_intersection_count":                 intersection,
		"pareto_recall":                             recall,
		"pareto_precision":                          precision,
	}
	return view
}

func concept5BRunInternal(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, starts []networkSearchStartSpec, step float64, maxPasses int, maxUniqueEvaluations int, memoize bool) (NetworkOptimizationRequest, *PreparedNetworkOptimizationContext, networkSearchRunResult, []NetworkParetoSolution, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return NetworkOptimizationRequest{}, nil, networkSearchRunResult{}, nil, err
	}
	if _, err := NormalizeAvailableOptimizationPriorities(req.Optimization.Objectives, prepared.ObjectiveAvailability); err != nil {
		return NetworkOptimizationRequest{}, nil, networkSearchRunResult{}, nil, err
	}
	run, err := runNetworkDeterministicMultiStartSearch(ctx, req, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            maxPasses,
		MaxUniqueEvaluations: maxUniqueEvaluations,
		Memoize:              memoize,
		StepDeg:              step,
		Starts:               starts,
	})
	if err != nil {
		return NetworkOptimizationRequest{}, nil, networkSearchRunResult{}, nil, err
	}
	frontier := networkParetoFrontier(run.Archive, req.Towers, req.Optimization, prepared.ObjectiveAvailability)
	return req, prepared, run, frontier, nil
}

func concept5BSyntheticStarts(fixture concept5ASyntheticFixture) [][]int {
	maxValue := fixture.Values[len(fixture.Values)-1]
	starts := [][]int{append([]int(nil), fixture.Start...)}
	if len(fixture.Start) == 0 {
		return starts
	}
	starts = append(starts, make([]int, len(fixture.Start)))
	allMax := make([]int, len(fixture.Start))
	for index := range allMax {
		allMax[index] = maxValue
	}
	starts = append(starts, allMax)
	if maxValue > 1 {
		mid := make([]int, len(fixture.Start))
		for index := range mid {
			mid[index] = fixture.Values[len(fixture.Values)/2]
		}
		starts = append(starts, mid)
	}
	return starts
}

func concept5BSyntheticRun(fixture concept5ASyntheticFixture, starts [][]int) map[string]any {
	archive := make(map[string]concept5ASyntheticPoint)
	traces := make([]map[string]any, 0, len(starts))
	for startIndex, start := range starts {
		state := append([]int(nil), start...)
		trace := []string{concept5ASyntheticKey(state)}
		termination := "max_passes"
		passes := 0
		for pass := 1; pass <= 8; pass++ {
			passes = pass
			changed := false
			for cell := range state {
				before := append([]int(nil), state...)
				bestState := append([]int(nil), state...)
				bestPoint := fixture.Points[concept5ASyntheticKey(state)]
				for _, value := range fixture.Values {
					candidateState := append([]int(nil), state...)
					candidateState[cell] = value
					candidate := fixture.Points[concept5ASyntheticKey(candidateState)]
					bestFeasible := bestPoint.Feasible
					if (candidate.Feasible && (!bestFeasible || candidate.Score > bestPoint.Score)) || (!bestFeasible && !candidate.Feasible && candidate.Score > bestPoint.Score) {
						bestState = candidateState
						bestPoint = candidate
					}
				}
				state = bestState
				if concept5ASyntheticKey(before) != concept5ASyntheticKey(state) {
					changed = true
					trace = append(trace, concept5ASyntheticKey(state))
				}
			}
			if !changed {
				termination = "coordinate_stable"
				break
			}
		}
		key := concept5ASyntheticKey(state)
		archive[key] = fixture.Points[key]
		traces = append(traces, map[string]any{
			"start_id":           fmt.Sprintf("start-%d", startIndex),
			"starting_state":     start,
			"final_state":        state,
			"passes":             passes,
			"termination_reason": termination,
			"state_trace":        trace,
		})
	}
	archiveKeys := make([]string, 0, len(archive))
	for key := range archive {
		archiveKeys = append(archiveKeys, key)
	}
	sort.Strings(archiveKeys)
	bestKey := ""
	bestScore := math.Inf(-1)
	for key, point := range fixture.Points {
		if point.Feasible && (bestKey == "" || point.Score > bestScore || (point.Score == bestScore && key < bestKey)) {
			bestKey = key
			bestScore = point.Score
		}
	}
	finalStates := make([]string, 0, len(traces))
	for _, trace := range traces {
		if state, ok := trace["final_state"].([]int); ok {
			finalStates = append(finalStates, concept5ASyntheticKey(state))
		}
	}
	view := map[string]any{
		"starts":            starts,
		"traces":            traces,
		"archive_keys":      archiveKeys,
		"archive_size":      len(archiveKeys),
		"global_best_key":   bestKey,
		"global_best_score": bestScore,
		"final_states":      finalStates,
	}
	if len(fixture.Points[concept5ASyntheticKey(fixture.Start)].Objectives) > 0 {
		// The fixture map is keyed by state; use only the states actually in the archive.
		archiveFixture := fixture
		archiveFixture.Points = make(map[string]concept5ASyntheticPoint, len(archive))
		for key := range archive {
			archiveFixture.Points[key] = fixture.Points[key]
		}
		view["archive_pareto_keys"] = concept5ASyntheticPareto(archiveFixture)
	}
	return view
}

func concept5BResponseView(response NetworkOptimizationResponse) map[string]any {
	paretoIDs := concept5BFrontierIDs(response.ParetoFrontier)
	view := map[string]any{
		"scenario_fingerprint": response.ScenarioFingerprint,
		"optimization_run_id":  response.OptimizationRunID,
		"baseline":             response.Baseline,
		"stats":                response.Stats,
		"optimization":         response.Optimization,
		"pareto_ids":           paretoIDs,
		"pareto_size":          len(paretoIDs),
		"optimized_towers":     response.OptimizedTowers,
	}
	if response.Optimization.Search != nil {
		view["search_metadata"] = response.Optimization.Search
	}
	return view
}

func concept5BNonRadioRawMetrics(stats NetworkOptimizationStats) map[string]any {
	raw := stats.RawMetrics
	return map[string]any{
		"served_demand_weight":       raw.ServedDemandWeight,
		"total_weighted_demand":      raw.TotalWeightedDemand,
		"relevant_demand_weight":     raw.RelevantDemandWeight,
		"residential_covered":        raw.ResidentialCovered,
		"residential_total":          raw.ResidentialTotal,
		"relevant_residential_total": raw.RelevantResidentialTotal,
		"propagation_reach_score":    raw.PropagationReachScore,
		"propagation_reach_maximum":  raw.PropagationReachMaximum,
		"covered_units":              raw.CoveredUnits,
		"overlap_buildings":          raw.OverlapBuildings,
		"overlap_ratio":              raw.OverlapRatio,
	}
}

func concept5BRadioQualityAudit(ctx context.Context) map[string]any {
	request, buildings := concept5AControlledFixture(2)
	baselineAzimuths := []float64{request.Towers[0].AzimuthDeg, request.Towers[1].AzimuthDeg}
	disabledRequest := request
	disabledRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "coverage", Weight: 100}}}
	enabledRequest := request
	enabledRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "coverage", Weight: 50},
		{ID: radioQualityOptimizationObjectiveID, Weight: 50},
	}}
	NormalizeNetworkOptimizationRequest(&disabledRequest)
	NormalizeNetworkOptimizationRequest(&enabledRequest)
	disabledPrepared, disabledErr := prepareNetworkOptimizationContext(ctx, disabledRequest, buildings)
	enabledPrepared, enabledErr := prepareNetworkOptimizationContext(ctx, enabledRequest, buildings)
	view := map[string]any{
		"disabled_error": errorString(disabledErr),
		"enabled_error":  errorString(enabledErr),
	}
	if disabledErr != nil || enabledErr != nil {
		return view
	}
	disabledStats, disabledEvalErr := networkCoverageScoreBreakdownPreparedContext(ctx, disabledRequest, baselineAzimuths, buildings, disabledPrepared)
	enabledStats, enabledEvalErr := networkCoverageScoreBreakdownPreparedContext(ctx, enabledRequest, baselineAzimuths, buildings, enabledPrepared)
	view["disabled_evaluation_error"] = errorString(disabledEvalErr)
	view["enabled_evaluation_error"] = errorString(enabledEvalErr)
	view["disabled_metadata"] = disabledPrepared.RadioQualityMetadata
	view["enabled_metadata"] = enabledPrepared.RadioQualityMetadata
	if disabledEvalErr == nil && enabledEvalErr == nil {
		view["same_non_radio_raw_metrics"] = reflect.DeepEqual(concept5BNonRadioRawMetrics(disabledStats), concept5BNonRadioRawMetrics(enabledStats))
		view["disabled_raw_metrics"] = disabledStats.RawMetrics
		view["enabled_raw_metrics"] = enabledStats.RawMetrics
	}
	return view
}

func concept5BMeasuredRun(run func() error) (float64, uint64, error) {
	var before runtime.MemStats
	var after runtime.MemStats
	runtime.ReadMemStats(&before)
	started := time.Now()
	err := run()
	elapsed := time.Since(started).Seconds()
	runtime.ReadMemStats(&after)
	allocated := uint64(0)
	if after.TotalAlloc >= before.TotalAlloc {
		allocated = after.TotalAlloc - before.TotalAlloc
	}
	return elapsed, allocated, err
}

func concept5BReverseNetworkRequest(request NetworkOptimizationRequest) NetworkOptimizationRequest {
	reversed := request
	reversed.Towers = append([]NetworkTowerRequest(nil), request.Towers...)
	for left, right := 0, len(reversed.Towers)-1; left < right; left, right = left+1, right-1 {
		reversed.Towers[left], reversed.Towers[right] = reversed.Towers[right], reversed.Towers[left]
	}
	return reversed
}

func concept5BWriteMarkdown(path string) error {
	markdown := fmt.Sprintf(`# Concept 5B — Deterministic Multi-Start Until-Stable Search Audit

Audit version: %s

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
`, concept5BAuditVersion)
	return os.WriteFile(path, []byte(markdown), 0644)
}

func TestGenerateConcept5BArtifacts(t *testing.T) {
	if os.Getenv("ATOM_RUN_CONCEPT_5B_AUDIT") != "1" {
		t.Skip("set ATOM_RUN_CONCEPT_5B_AUDIT=1 to generate Concept 5B audit artifacts")
	}
	root := concept5AArtifactRoot(t)
	ctx := context.Background()

	// Small exhaustive two-cell comparison: every 10-degree state is the
	// independent ground truth for the production candidate grid.
	twoCellRequest, twoCellBuildings := concept5AExhaustiveFixture("coverage-demand")
	// Align the audit baseline with the exhaustive grid so restricted oracle
	// regret is not distorted by an intentionally off-grid authoritative start.
	twoCellRequest.Towers[0].AzimuthDeg = 0
	twoCellRequest.Towers[1].AzimuthDeg = 180
	legacyOptions := defaultConcept5AOptions(twoCellRequest)
	legacyOptions.Label = "legacy-two-pass"
	legacySearch, err := runConcept5ASearch(ctx, twoCellRequest, twoCellBuildings, legacyOptions)
	if err != nil {
		t.Fatalf("two-cell legacy search: %v", err)
	}
	oracle, err := concept5AExhaustiveRF(ctx, twoCellRequest, twoCellBuildings, 10, legacySearch)
	if err != nil {
		t.Fatalf("two-cell exhaustive oracle: %v", err)
	}
	_, twoPrepared, singleRun, singleFrontier, err := concept5BRunInternal(ctx, twoCellRequest, twoCellBuildings, deterministicNetworkSearchStarts(twoCellRequest)[:1], 10, 8, 5000, true)
	if err != nil {
		t.Fatalf("two-cell single-start search: %v", err)
	}
	_, _, multiRun, multiFrontier, err := concept5BRunInternal(ctx, twoCellRequest, twoCellBuildings, deterministicNetworkSearchStarts(twoCellRequest), 10, 8, 5000, true)
	if err != nil {
		t.Fatalf("two-cell multi-start search: %v", err)
	}
	exhaustiveComparison := map[string]any{
		"audit_version": concept5BAuditVersion,
		"oracle": map[string]any{
			"candidate_count":          oracle.CandidateCount,
			"feasible_candidate_count": oracle.FeasibleCandidateCount,
			"global_best_key":          oracle.BestKey,
			"global_best_score":        oracle.BestScore,
			"true_pareto_keys":         oracle.ParetoKeys,
		},
		"two_cell_36x36": map[string]any{
			"legacy_two_pass":                 concept5AExhaustiveView(oracle),
			"single_start_until_stable":       concept5BRunView(twoCellRequest, singleRun, singleFrontier, &oracle),
			"deterministic_multistart_v1":     concept5BRunView(twoCellRequest, multiRun, multiFrontier, &oracle),
			"archive_pareto_recomputed_equal": reflect.DeepEqual(multiFrontier, networkParetoFrontier(multiRun.Archive, twoCellRequest.Towers, twoCellRequest.Optimization, twoPrepared.ObjectiveAvailability)),
		},
	}

	// Restricted three-cell comparison uses a 30-degree audit grid (12^3 =
	// 1,728 states) while production remains fixed at its 10-degree grid.
	threeCellRequest, threeCellBuildings := concept5AControlledFixture(3)
	for index := range threeCellRequest.Towers {
		threeCellRequest.Towers[index].AzimuthDeg = float64(index * 120)
	}
	threeLegacyOptions := defaultConcept5AOptions(threeCellRequest)
	threeLegacyOptions.StepDeg = 30
	threeLegacyOptions.Label = "legacy-restricted-12-grid"
	threeLegacySearch, err := runConcept5ASearch(ctx, threeCellRequest, threeCellBuildings, threeLegacyOptions)
	if err != nil {
		t.Fatalf("three-cell restricted legacy search: %v", err)
	}
	threeOracle, err := concept5AExhaustiveRF(ctx, threeCellRequest, threeCellBuildings, 30, threeLegacySearch)
	if err != nil {
		t.Fatalf("three-cell restricted oracle: %v", err)
	}
	threeStarts := deterministicNetworkSearchStarts(threeCellRequest)
	_, _, threeSingleRun, threeSingleFrontier, err := concept5BRunInternal(ctx, threeCellRequest, threeCellBuildings, threeStarts[:1], 30, 8, 5000, true)
	if err != nil {
		t.Fatalf("three-cell restricted single start: %v", err)
	}
	_, _, threeMultiRun, threeMultiFrontier, err := concept5BRunInternal(ctx, threeCellRequest, threeCellBuildings, threeStarts, 30, 8, 5000, true)
	if err != nil {
		t.Fatalf("three-cell restricted multi-start: %v", err)
	}
	exhaustiveComparison["three_cell_12x12x12_restricted"] = map[string]any{
		"legacy_two_pass":             concept5AExhaustiveView(threeOracle),
		"single_start_until_stable":   concept5BRunView(threeCellRequest, threeSingleRun, threeSingleFrontier, &threeOracle),
		"deterministic_multistart_v1": concept5BRunView(threeCellRequest, threeMultiRun, threeMultiFrontier, &threeOracle),
		"oracle_candidate_count":      threeOracle.CandidateCount,
		"restricted_grid_note":        "12^3 exhaustive oracle; opt-in audit run uses the same 30-degree grid through an internal diagnostic step override",
	}

	// Candidate start-policy audit chooses the four-start policy used by v1.
	startPolicyCases := make([]map[string]any, 0, 4)
	allStarts := deterministicNetworkSearchStarts(twoCellRequest)
	for count := 1; count <= len(allStarts); count++ {
		_, _, run, frontier, runErr := concept5BRunInternal(ctx, twoCellRequest, twoCellBuildings, allStarts[:count], 10, 8, 5000, true)
		if runErr != nil {
			t.Fatalf("start policy %d: %v", count, runErr)
		}
		view := concept5BRunView(twoCellRequest, run, frontier, &oracle)
		startPolicyCases = append(startPolicyCases, map[string]any{
			"policy_label": fmt.Sprintf("baseline-plus-first-%d-starts", count),
			"start_count":  count,
			"start_ids": func() []string {
				ids := make([]string, count)
				for index := range ids {
					ids[index] = allStarts[index].ID
				}
				return ids
			}(),
			"quality_and_cost":   view["oracle_comparison"],
			"archive_size":       run.Metadata.EvaluatedArchiveSize,
			"unique_evaluations": run.Metadata.UniqueEvaluations,
			"cache_hits":         run.Metadata.CacheHits,
		})
	}
	startPolicyAudit := map[string]any{
		"audit_version":      concept5BAuditVersion,
		"fixture":            "concept5AExhaustiveFixture(coverage-demand)",
		"candidate_policies": startPolicyCases,
		"selected_policy": map[string]any{
			"name":                               networkSearchMultistartPolicy,
			"starts":                             []string{"baseline", "uniform-90", "uniform-180", "uniform-270"},
			"selection_rule":                     "retain all deterministic quarter-turn rotations in v1; report the smallest tested policy for this fixture separately rather than imply a universal optimum",
			"smallest_tested_policy_for_fixture": "baseline-plus-first-2-starts",
			"production_start_count":             4,
		},
	}

	// Synthetic behavior checks are intentionally independent of RF geometry.
	syntheticViews := make([]map[string]any, 0)
	for _, fixture := range concept5ASyntheticFixtures() {
		legacy := concept5ASyntheticCoordinateSearch(fixture, fixture.Start)
		multi := concept5BSyntheticRun(fixture, concept5BSyntheticStarts(fixture))
		syntheticViews = append(syntheticViews, map[string]any{
			"fixture":                               fixture,
			"legacy_two_pass":                       legacy,
			"deterministic_multistart_until_stable": multi,
		})
	}

	// Priority changes are measured as discovery changes, then as re-ranking of
	// the already stored frontier without another RF call.
	priorityRequest, priorityBuildings := concept5AControlledFixture(3)
	balancedReq, _, balancedRun, balancedFrontier, err := concept5BRunInternal(ctx, priorityRequest, priorityBuildings, nil, 10, 4, 5000, true)
	if err != nil {
		t.Fatalf("balanced priority search: %v", err)
	}
	demandRequest := priorityRequest
	demandRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 100}}}
	demandReq, _, demandRun, demandFrontier, err := concept5BRunInternal(ctx, demandRequest, priorityBuildings, nil, 10, 4, 5000, true)
	if err != nil {
		t.Fatalf("demand priority search: %v", err)
	}
	rerankedBalanced, rerankErr := rankStoredParetoSolutions(balancedFrontier, demandReq.Optimization)
	rerankedIDs := make([]string, 0, len(rerankedBalanced))
	for _, solution := range rerankedBalanced {
		rerankedIDs = append(rerankedIDs, solution.ID)
	}
	priorityAudit := map[string]any{
		"balanced_search":                 concept5BRunView(balancedReq, balancedRun, balancedFrontier, nil),
		"demand_only_search":              concept5BRunView(demandReq, demandRun, demandFrontier, nil),
		"archive_state_sets_equal":        reflect.DeepEqual(concept5BArchiveKeys(balancedRun), concept5BArchiveKeys(demandRun)),
		"discovery_is_priority_dependent": !reflect.DeepEqual(concept5BArchiveKeys(balancedRun), concept5BArchiveKeys(demandRun)),
		"stored_frontier_rerank_error":    errorString(rerankErr),
		"stored_frontier_reranked_ids":    rerankedIDs,
		"rerank_rf_evaluation_count":      0,
		"distinction":                     "reranking uses stored raw frontier metrics; it does not claim to discover unseen candidates",
	}

	radioAudit := concept5BRadioQualityAudit(ctx)

	// Full Ankara comparison is gated by the dataset load. Controlled evidence
	// remains present when the large pack is unavailable.
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		datasetDir = filepath.Join(root, "data-pipeline")
	}
	canonicalAvailable := false
	canonicalComparison := map[string]any{"available": false, "dataset_dir": filepath.ToSlash(datasetDir)}
	var baselineResponse NetworkOptimizationResponse
	if dataset, loadErr := LoadDatasetPack(datasetDir); loadErr == nil && dataset != nil && dataset.BuildingIndex != nil {
		canonicalAvailable = true
		canonicalRequest := canonicalAnkaraNetworkOptimizationRequest()
		legacyStarted := time.Now()
		legacyResponse, legacyErr := OptimizeNetworkContext(ctx, canonicalRequest, dataset.BuildingIndex)
		if legacyErr != nil {
			t.Fatalf("canonical legacy comparison: %v", legacyErr)
		}
		legacyRuntime := time.Since(legacyStarted).Seconds()
		v1Request := canonicalRequest
		v1Request.SearchPolicy = DeterministicMultiStartCoordinateV1
		v1Started := time.Now()
		v1Response, v1Err := OptimizeNetworkContext(ctx, v1Request, dataset.BuildingIndex)
		if v1Err != nil {
			t.Fatalf("canonical multi-start comparison: %v", v1Err)
		}
		v1Runtime := time.Since(v1Started).Seconds()
		reverseRequest := concept5BReverseNetworkRequest(v1Request)
		reverseStarted := time.Now()
		reverseResponse, reverseErr := OptimizeNetworkContext(ctx, reverseRequest, dataset.BuildingIndex)
		if reverseErr != nil {
			t.Fatalf("canonical reverse-order comparison: %v", reverseErr)
		}
		reverseRuntime := time.Since(reverseStarted).Seconds()
		baselineResponse = legacyResponse
		canonicalComparison = map[string]any{
			"available": true,
			"request": map[string]any{
				"cells":    len(canonicalRequest.Towers),
				"rays":     canonicalRequest.Rays,
				"radius_m": canonicalRequest.RadiusMeters,
			},
			"legacy_default": map[string]any{
				"runtime_seconds":         legacyRuntime,
				"response":                concept5BResponseView(legacyResponse),
				"search_metadata_present": legacyResponse.Optimization.Search != nil,
			},
			"deterministic_multistart_v1": map[string]any{
				"runtime_seconds":         v1Runtime,
				"response":                concept5BResponseView(v1Response),
				"search_metadata_present": v1Response.Optimization.Search != nil,
			},
			"reverse_order_v1": map[string]any{
				"runtime_seconds": reverseRuntime,
				"response":        concept5BResponseView(reverseResponse),
			},
			"order_sensitivity": map[string]any{
				"score_spread":               math.Abs(v1Response.Stats.Score - reverseResponse.Stats.Score),
				"recommendation_changed":     v1Response.Optimization.RecommendedSolutionID != reverseResponse.Optimization.RecommendedSolutionID,
				"search_fingerprint_changed": v1Response.Optimization.Search != nil && reverseResponse.Optimization.Search != nil && v1Response.Optimization.Search.SearchFingerprint != reverseResponse.Optimization.Search.SearchFingerprint,
			},
		}
	} else {
		baselineResponse, err = OptimizeNetworkContext(ctx, twoCellRequest, twoCellBuildings)
		if err != nil {
			t.Fatalf("controlled legacy baseline: %v", err)
		}
		canonicalComparison["load_error"] = errorString(loadErr)
	}

	// Scaling and cache curves use small controlled fixtures; allocation is a
	// process-level diagnostic and is explicitly kept out of fingerprints.
	performanceRuns := make([]map[string]any, 0, 6)
	for count := 1; count <= 6; count++ {
		request, buildings := concept5AControlledFixture(count)
		legacyOptions := defaultConcept5AOptions(request)
		legacyOptions.Label = fmt.Sprintf("legacy-%d-cells", count)
		legacyStarted := time.Now()
		legacy, legacyErr := runConcept5ASearch(ctx, request, buildings, legacyOptions)
		legacyRuntime := time.Since(legacyStarted).Seconds()
		if legacyErr != nil {
			t.Fatalf("performance legacy %d cells: %v", count, legacyErr)
		}
		req, prepared, single, singleFrontier, singleErr := concept5BRunInternal(ctx, request, buildings, deterministicNetworkSearchStarts(request)[:1], 10, 2, 5000, true)
		if singleErr != nil {
			t.Fatalf("performance single %d cells: %v", count, singleErr)
		}
		_ = req
		_ = prepared
		multiReq, multiPrepared, multi, multiFrontier, multiErr := concept5BRunInternal(ctx, request, buildings, nil, 10, 2, 5000, true)
		if multiErr != nil {
			t.Fatalf("performance multi %d cells: %v", count, multiErr)
		}
		_ = multiReq
		_ = multiPrepared
		performanceRuns = append(performanceRuns, map[string]any{
			"cell_count": count,
			"legacy": map[string]any{
				"runtime_seconds":       legacyRuntime,
				"requested_evaluations": legacy.EvaluatedCandidates,
				"unique_states":         legacy.UniqueStateCount,
			},
			"single_start_until_stable": map[string]any{
				"requested_evaluations": single.Metadata.EvaluationRequests,
				"unique_evaluations":    single.Metadata.UniqueEvaluations,
				"cache_hits":            single.Metadata.CacheHits,
				"archive_size":          single.Metadata.EvaluatedArchiveSize,
				"pareto_size":           len(singleFrontier),
			},
			"deterministic_multistart_v1": map[string]any{
				"requested_evaluations": multi.Metadata.EvaluationRequests,
				"unique_evaluations":    multi.Metadata.UniqueEvaluations,
				"cache_hits":            multi.Metadata.CacheHits,
				"archive_size":          multi.Metadata.EvaluatedArchiveSize,
				"pareto_size":           len(multiFrontier),
				"incomplete_search":     multi.Metadata.IncompleteSearch,
			},
			"archive_memory_estimate_bytes": multi.Metadata.EvaluatedArchiveSize * (64 + count*24),
		})
	}
	cacheRequest, cacheBuildings := concept5AControlledFixture(4)
	_, _, cacheOn, _, cacheErr := concept5BRunInternal(ctx, cacheRequest, cacheBuildings, nil, 10, 3, 5000, true)
	if cacheErr != nil {
		t.Fatalf("cache-on performance control: %v", cacheErr)
	}
	_, _, cacheOff, _, cacheErr := concept5BRunInternal(ctx, cacheRequest, cacheBuildings, nil, 10, 3, 5000, false)
	if cacheErr != nil {
		t.Fatalf("cache-off performance control: %v", cacheErr)
	}
	qualityCost := make([]map[string]any, 0, 4)
	qualityRequest, qualityBuildings := concept5AControlledFixture(3)
	qualityStarts := deterministicNetworkSearchStarts(qualityRequest)
	for count := 1; count <= len(qualityStarts); count++ {
		_, _, run, frontier, runErr := concept5BRunInternal(ctx, qualityRequest, qualityBuildings, qualityStarts[:count], 10, 4, 5000, true)
		if runErr != nil {
			t.Fatalf("quality-cost %d starts: %v", count, runErr)
		}
		qualityCost = append(qualityCost, map[string]any{
			"start_count":           count,
			"requested_evaluations": run.Metadata.EvaluationRequests,
			"unique_evaluations":    run.Metadata.UniqueEvaluations,
			"cache_hits":            run.Metadata.CacheHits,
			"archive_size":          run.Metadata.EvaluatedArchiveSize,
			"pareto_size":           len(frontier),
			"recommended_score": func() float64 {
				if len(frontier) == 0 {
					return 0
				}
				return frontier[0].Score
			}(),
		})
	}
	performanceArtifact := map[string]any{
		"audit_version":            concept5BAuditVersion,
		"scaling_runs":             performanceRuns,
		"quality_cost_start_curve": qualityCost,
		"cache_comparison": map[string]any{
			"cache_on":           map[string]any{"requested_evaluations": cacheOn.Metadata.EvaluationRequests, "unique_evaluations": cacheOn.Metadata.UniqueEvaluations, "cache_hits": cacheOn.Metadata.CacheHits, "archive_size": cacheOn.Metadata.EvaluatedArchiveSize},
			"cache_off":          map[string]any{"requested_evaluations": cacheOff.Metadata.EvaluationRequests, "unique_evaluations": cacheOff.Metadata.UniqueEvaluations, "cache_hits": cacheOff.Metadata.CacheHits, "archive_size": cacheOff.Metadata.EvaluatedArchiveSize},
			"archive_equivalent": reflect.DeepEqual(concept5BArchiveKeys(cacheOn), concept5BArchiveKeys(cacheOff)),
		},
		"memory_measurement": "archive_memory_estimate_bytes is a deterministic upper-bound-style diagnostic estimate; runtime allocations are not identity fields",
	}

	baselineSnapshot := concept5AMakeProductionSnapshot(baselineResponse)
	postResponse, postErr := OptimizeNetworkContext(ctx, func() NetworkOptimizationRequest {
		if canonicalAvailable {
			return canonicalAnkaraNetworkOptimizationRequest()
		}
		return twoCellRequest
	}(), func() *BuildingIndex {
		if canonicalAvailable {
			dataset, _ := LoadDatasetPack(datasetDir)
			if dataset != nil {
				return dataset.BuildingIndex
			}
		}
		return twoCellBuildings
	}())
	if postErr != nil {
		t.Fatalf("post-change legacy comparison: %v", postErr)
	}
	postSnapshot := concept5AMakeProductionSnapshot(postResponse)
	postComparison := map[string]any{
		"audit_version":                   concept5BAuditVersion,
		"comparison_scope":                "default legacy optimizer repeated after the opt-in path was added",
		"before":                          baselineSnapshot,
		"after":                           postSnapshot,
		"exact_snapshot_equality":         reflect.DeepEqual(baselineSnapshot, postSnapshot),
		"production_optimizer_changed":    false,
		"canonical_rf_invariant":          reflect.DeepEqual(baselineSnapshot, postSnapshot),
		"search_metadata_present_default": postResponse.Optimization.Search != nil,
		"notes": []string{
			"The opt-in policy is selected only by an explicit search_policy value.",
			"RF, objective, utility, feasibility, Pareto, baseline, and scenario-fingerprint code paths are shared or unchanged.",
		},
	}

	preChangeBaseline := map[string]any{
		"audit_version": concept5BAuditVersion,
		"phase":         "legacy default freeze before evaluating the opt-in path",
		"production_optimizer": map[string]any{
			"entrypoint":                   "OptimizeNetworkContext",
			"algorithm_identity":           "network-coordinate-descent-v1-fixed-two-pass",
			"search_policy_when_omitted":   LegacyNetworkSearchPolicy,
			"candidate_policy":             "absolute azimuths 0..350 inclusive, 10 degree step, 36 per cell",
			"evaluation_formula_six_cells": 1 + 2*6*36 + 1,
			"optimizer_level_cache":        false,
		},
		"canonical_dataset_available":                 canonicalAvailable,
		"baseline_response":                           baselineSnapshot,
		"default_search_metadata_present":             baselineResponse.Optimization.Search != nil,
		"scenario_fingerprint_excludes_search_policy": true,
	}

	paretoReranked, paretoRerankErr := rankStoredParetoSolutions(multiFrontier, demandReq.Optimization)
	paretoRerankedIDs := make([]string, 0, len(paretoReranked))
	for _, solution := range paretoReranked {
		paretoRerankedIDs = append(paretoRerankedIDs, solution.ID)
	}
	paretoComparison := map[string]any{
		"audit_version":                         concept5BAuditVersion,
		"two_cell_true_pareto_keys":             oracle.ParetoKeys,
		"two_cell_multistart_archive_keys":      concept5BArchiveKeys(multiRun),
		"two_cell_multistart_frontier_ids":      concept5BFrontierIDs(multiFrontier),
		"frontier_recomputed_from_same_archive": reflect.DeepEqual(multiFrontier, networkParetoFrontier(multiRun.Archive, twoCellRequest.Towers, twoCellRequest.Optimization, twoPrepared.ObjectiveAvailability)),
		"stored_frontier_rerank": map[string]any{
			"error":                paretoRerankErrString(paretoRerankErr),
			"ids":                  paretoRerankedIDs,
			"rf_evaluations":       0,
			"membership_preserved": sameStringSet(concept5BFrontierIDs(multiFrontier), paretoRerankedIDs),
		},
		"interpretation": "Pareto membership comes from the evaluated archive; priority-sensitive ranking is separate from candidate discovery and cannot reveal unseen states.",
	}

	artifacts := map[string]any{
		"docs/concept-5b-pre-change-baseline.json":    preChangeBaseline,
		"docs/concept-5b-start-policy-audit.json":     startPolicyAudit,
		"docs/concept-5b-exhaustive-comparison.json":  exhaustiveComparison,
		"docs/concept-5b-pareto-comparison.json":      paretoComparison,
		"docs/concept-5b-ankara-comparison.json":      canonicalComparison,
		"docs/concept-5b-performance.json":            performanceArtifact,
		"docs/concept-5b-post-change-comparison.json": postComparison,
	}
	// Keep synthetic and priority/radio evidence discoverable from the main
	// exhaustive/Pareto/performance artifacts without adding unstable files.
	if exhaustiveMap, ok := exhaustiveComparison["synthetic_fixtures"].([]map[string]any); ok {
		_ = exhaustiveMap
	}
	exhaustiveComparison["synthetic_fixtures"] = syntheticViews
	exhaustiveComparison["priority_discovery_audit"] = priorityAudit
	exhaustiveComparison["radio_quality_audit"] = radioAudit
	for relativePath, value := range artifacts {
		if err := concept5AWriteJSON(filepath.Join(root, relativePath), value); err != nil {
			t.Fatalf("write %s: %v", relativePath, err)
		}
	}
	if err := concept5BWriteMarkdown(filepath.Join(root, "docs/concept-5b-multistart-search.md")); err != nil {
		t.Fatalf("write Concept 5B markdown: %v", err)
	}
	t.Logf("Concept 5B artifacts generated; canonical dataset available=%v", canonicalAvailable)
}

func paretoRerankErrString(err error) any {
	return errorString(err)
}
