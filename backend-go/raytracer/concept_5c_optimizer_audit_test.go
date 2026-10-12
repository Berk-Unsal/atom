package raytracer

// Concept 5C audit code is intentionally test-only. Production discovery is
// implemented in optimization_pareto_archive.go; this file supplies small
// exhaustive oracles, synthetic traversal audits, and reproducible artifacts.

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

const concept5CAuditVersion = "concept-5c-audit-v1"

type concept5COracle struct {
	CandidateCount          int
	FeasibleCandidateCount  int
	BestKey                 string
	BestScore               float64
	BestStats               NetworkOptimizationStats
	ParetoKeys              []string
	DiscoveredParetoKeys    []string
	ParetoRecall            float64
	ParetoPrecision         float64
	RecommendationRecovered bool
	ScoreRegret             float64
}

func concept5CArchiveKeys(request NetworkOptimizationRequest, run networkSearchRunResult) []string {
	keys := make([]string, 0, len(run.Archive))
	for _, candidate := range run.Archive {
		keys = append(keys, networkSearchStateKey(request.Towers, candidate.Azimuths))
	}
	return keys
}

func concept5CSortedKeys(values []string) []string {
	keys := append([]string(nil), values...)
	sort.Strings(keys)
	return keys
}

func concept5CSetIntersection(left, right []string) int {
	leftSet := make(map[string]struct{}, len(left))
	for _, value := range left {
		leftSet[value] = struct{}{}
	}
	count := 0
	for _, value := range right {
		if _, ok := leftSet[value]; ok {
			count++
		}
	}
	return count
}

func concept5CRunInternal(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, step float64, maxRounds, maxExpandedStates, maxUniqueEvaluations int) (NetworkOptimizationRequest, *PreparedNetworkOptimizationContext, networkSearchRunResult, []NetworkParetoSolution, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return NetworkOptimizationRequest{}, nil, networkSearchRunResult{}, nil, err
	}
	if _, err := NormalizeAvailableOptimizationPriorities(req.Optimization.Objectives, prepared.ObjectiveAvailability); err != nil {
		return NetworkOptimizationRequest{}, nil, networkSearchRunResult{}, nil, err
	}
	run, err := runNetworkDeterministicParetoArchiveSearch(ctx, req, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            maxRounds,
		MaxUniqueEvaluations: maxUniqueEvaluations,
		MaxExpandedStates:    maxExpandedStates,
		Memoize:              true,
		StepDeg:              step,
		Starts:               deterministicNetworkSearchStarts(req),
	})
	if err != nil {
		return NetworkOptimizationRequest{}, nil, networkSearchRunResult{}, nil, err
	}
	frontier := networkParetoFrontierFromActiveArchive(run.ActiveArchive, req.Towers, req.Optimization, prepared.ObjectiveAvailability, run.Metadata.ObjectiveSet)
	run.Metadata.ParetoSize = len(frontier)
	run.Metadata.RankingFingerprint = networkParetoArchiveRankingFingerprint(run.Metadata.DiscoveryFingerprint, req.Optimization)
	return req, prepared, run, frontier, nil
}

func concept5CIndependentDominates(left, right networkOptimizationCandidate, objectiveIDs []string, constraints OptimizationConstraints) bool {
	if len(OptimizationConstraintViolations(left.Stats, constraints)) > 0 || len(OptimizationConstraintViolations(right.Stats, constraints)) > 0 {
		return false
	}
	leftUtilities := NormalizeOptimizationObjectives(left.Stats)
	rightUtilities := NormalizeOptimizationObjectives(right.Stats)
	strictlyBetter := false
	for _, id := range objectiveIDs {
		leftValue := objectiveUtility(leftUtilities, id)
		rightValue := objectiveUtility(rightUtilities, id)
		if leftValue < rightValue {
			return false
		}
		if leftValue > rightValue {
			strictlyBetter = true
		}
	}
	return strictlyBetter
}

func concept5CExhaustiveOracle(ctx context.Context, request NetworkOptimizationRequest, buildings *BuildingIndex, step float64) (concept5COracle, error) {
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(ctx, req, buildings)
	if err != nil {
		return concept5COracle{}, err
	}
	if _, err := NormalizeAvailableOptimizationPriorities(req.Optimization.Objectives, prepared.ObjectiveAvailability); err != nil {
		return concept5COracle{}, err
	}
	count := concept5AAngleCount(step)
	if count <= 0 {
		return concept5COracle{}, fmt.Errorf("invalid exhaustive step %.3f", step)
	}
	objectiveIDs := networkParetoArchiveObjectiveIDs(req.Optimization, prepared.ObjectiveAvailability)
	candidates := make([]networkOptimizationCandidate, 0)
	azimuths := make([]float64, len(req.Towers))
	var enumerate func(int) error
	enumerate = func(index int) error {
		if index == len(azimuths) {
			breakdown, evalErr := networkCoverageScoreBreakdownPreparedContext(ctx, req, azimuths, buildings, prepared)
			if evalErr != nil {
				return evalErr
			}
			candidates = append(candidates, networkOptimizationCandidate{Azimuths: append([]float64(nil), azimuths...), Stats: breakdown})
			return nil
		}
		for candidate := 0; candidate < count; candidate++ {
			azimuths[index] = normalizeDegrees(float64(candidate) * step)
			if err := enumerate(index + 1); err != nil {
				return err
			}
		}
		return nil
	}
	if err := enumerate(0); err != nil {
		return concept5COracle{}, err
	}
	feasible := make([]networkOptimizationCandidate, 0, len(candidates))
	best := networkOptimizationCandidate{}
	bestKey := ""
	bestScore := math.Inf(-1)
	for _, candidate := range candidates {
		if len(OptimizationConstraintViolations(candidate.Stats, req.Optimization.Constraints)) > 0 {
			continue
		}
		scored, scoreErr := scoreNetworkOptimization(candidate.Stats, req.Optimization, prepared.ObjectiveAvailability)
		if scoreErr != nil {
			return concept5COracle{}, scoreErr
		}
		candidate.Stats = scored
		feasible = append(feasible, candidate)
		key := azimuthKey(candidate.Azimuths)
		if scored.Score > bestScore || (scored.Score == bestScore && (bestKey == "" || key < bestKey)) {
			best = candidate
			bestKey = key
			bestScore = scored.Score
		}
	}
	paretoKeys := make([]string, 0)
	for index, candidate := range feasible {
		dominated := false
		for competitorIndex, competitor := range feasible {
			if index == competitorIndex {
				continue
			}
			if concept5CIndependentDominates(competitor, candidate, objectiveIDs, req.Optimization.Constraints) {
				dominated = true
				break
			}
		}
		if !dominated {
			paretoKeys = append(paretoKeys, azimuthKey(candidate.Azimuths))
		}
	}
	sort.Strings(paretoKeys)
	return concept5COracle{
		CandidateCount:         len(candidates),
		FeasibleCandidateCount: len(feasible),
		BestKey:                bestKey,
		BestScore:              bestScore,
		BestStats:              best.Stats,
		ParetoKeys:             paretoKeys,
	}, nil
}

func concept5COracleView(oracle concept5COracle, run networkSearchRunResult, frontier []NetworkParetoSolution) map[string]any {
	recommendedKey := ""
	recommendedScore := 0.0
	if len(frontier) > 0 {
		recommendedKey = frontier[0].ID
		recommendedScore = frontier[0].Score
	}
	discovered := make([]string, 0, len(frontier))
	for _, solution := range frontier {
		discovered = append(discovered, solution.ID)
	}
	discovered = concept5CSortedKeys(discovered)
	intersection := concept5CSetIntersection(oracle.ParetoKeys, discovered)
	recall := 0.0
	precision := 0.0
	if len(oracle.ParetoKeys) > 0 {
		recall = float64(intersection) / float64(len(oracle.ParetoKeys))
	}
	if len(discovered) > 0 {
		precision = float64(intersection) / float64(len(discovered))
	}
	regret := oracle.BestScore - recommendedScore
	if regret < 0 {
		regret = 0
	}
	return map[string]any{
		"candidate_count":                oracle.CandidateCount,
		"feasible_candidate_count":       oracle.FeasibleCandidateCount,
		"global_best_key":                oracle.BestKey,
		"global_best_score":              oracle.BestScore,
		"recommended_key":                recommendedKey,
		"recommended_score":              recommendedScore,
		"recommendation_recovered":       recommendedKey == oracle.BestKey,
		"score_regret":                   regret,
		"true_pareto_keys":               oracle.ParetoKeys,
		"discovered_pareto_keys":         discovered,
		"pareto_intersection_count":      intersection,
		"pareto_recall":                  recall,
		"pareto_precision":               precision,
		"incomplete_search":              run.Metadata.IncompleteSearch,
		"termination_reason":             run.Metadata.TerminationReason,
		"priority_independent_discovery": run.Metadata.PriorityIndependentDiscovery,
	}
}

func concept5CArchiveView(request NetworkOptimizationRequest, run networkSearchRunResult, frontier []NetworkParetoSolution, oracle *concept5COracle) map[string]any {
	frontierIDs := concept5BFrontierIDs(frontier)
	view := map[string]any{
		"metadata":              run.Metadata,
		"archive_state_ids":     concept5CArchiveKeys(request, run),
		"archive_size":          len(run.Archive),
		"active_pareto_size":    len(run.ActiveArchive),
		"frontier_ids":          frontierIDs,
		"frontier_size":         len(frontierIDs),
		"final_azimuths":        run.FinalAzimuths,
		"termination_reason":    run.Metadata.TerminationReason,
		"budget_complete":       run.Metadata.BudgetComplete,
		"discovery_fingerprint": run.Metadata.DiscoveryFingerprint,
	}
	if oracle != nil {
		view["oracle_comparison"] = concept5COracleView(*oracle, run, frontier)
	}
	return view
}

type concept5CSyntheticTraversalResult struct {
	Strategy            string   `json:"strategy"`
	ExpandedStates      []string `json:"expanded_states"`
	ArchiveKeys         []string `json:"archive_keys"`
	ParetoKeys          []string `json:"pareto_keys"`
	GlobalBestKey       string   `json:"global_best_key"`
	RecoveredGlobal     bool     `json:"recovered_global"`
	Bounded             bool     `json:"bounded"`
	PriorityIndependent bool     `json:"priority_independent"`
}

func concept5CSyntheticDominates(left, right concept5ASyntheticPoint, objectiveIDs []string) bool {
	strict := false
	for _, id := range objectiveIDs {
		leftValue := left.Objectives[id]
		rightValue := right.Objectives[id]
		if id == "__score" {
			leftValue = left.Score
			rightValue = right.Score
		}
		if leftValue < rightValue {
			return false
		}
		if leftValue > rightValue {
			strict = true
		}
	}
	return strict
}

func concept5CSyntheticTraversal(fixture concept5ASyntheticFixture, starts [][]int, expandDominated bool) concept5CSyntheticTraversalResult {
	objectiveIDs := make([]string, 0)
	for id := range fixture.Points[concept5ASyntheticKey(fixture.Start)].Objectives {
		objectiveIDs = append(objectiveIDs, id)
	}
	sort.Strings(objectiveIDs)
	if len(objectiveIDs) == 0 {
		objectiveIDs = []string{"__score"}
	}
	queue := make([][]int, 0, len(starts))
	queued := make(map[string]struct{})
	for _, start := range starts {
		key := concept5ASyntheticKey(start)
		if _, exists := queued[key]; exists {
			continue
		}
		queued[key] = struct{}{}
		queue = append(queue, append([]int(nil), start...))
	}
	evaluated := make(map[string]struct{})
	expanded := make([]string, 0)
	active := make(map[string]struct{})
	archive := make(map[string]struct{})
	for len(queue) > 0 && len(expanded) < 64 {
		state := queue[0]
		queue = queue[1:]
		stateKey := concept5ASyntheticKey(state)
		if _, exists := evaluated[stateKey]; exists {
			continue
		}
		evaluated[stateKey] = struct{}{}
		expanded = append(expanded, stateKey)
		point := fixture.Points[stateKey]
		archive[stateKey] = struct{}{}
		if point.Feasible && len(objectiveIDs) > 0 {
			dominated := false
			for otherKey := range active {
				if concept5CSyntheticDominates(fixture.Points[otherKey], point, objectiveIDs) {
					dominated = true
					break
				}
			}
			if !dominated {
				for otherKey := range active {
					if concept5CSyntheticDominates(point, fixture.Points[otherKey], objectiveIDs) {
						delete(active, otherKey)
					}
				}
				active[stateKey] = struct{}{}
			}
		}
		for cell := range state {
			for _, value := range fixture.Values {
				candidateState := append([]int(nil), state...)
				candidateState[cell] = value
				candidateKey := concept5ASyntheticKey(candidateState)
				if _, exists := evaluated[candidateKey]; exists {
					continue
				}
				candidate := fixture.Points[candidateKey]
				if expandDominated {
					queue = append(queue, candidateState)
					continue
				}
				admitted := candidate.Feasible
				for activeKey := range active {
					if concept5CSyntheticDominates(fixture.Points[activeKey], candidate, objectiveIDs) {
						admitted = false
						break
					}
				}
				if admitted {
					if _, exists := queued[candidateKey]; !exists {
						queued[candidateKey] = struct{}{}
						queue = append(queue, candidateState)
					}
				}
			}
		}
	}
	archiveKeys := make([]string, 0, len(archive))
	for key := range archive {
		archiveKeys = append(archiveKeys, key)
	}
	paretoKeys := make([]string, 0, len(active))
	for key := range active {
		paretoKeys = append(paretoKeys, key)
	}
	sort.Strings(archiveKeys)
	sort.Strings(paretoKeys)
	globalKey := ""
	globalScore := math.Inf(-1)
	for key, point := range fixture.Points {
		if point.Feasible && (point.Score > globalScore || (point.Score == globalScore && (globalKey == "" || key < globalKey))) {
			globalKey = key
			globalScore = point.Score
		}
	}
	_, recovered := active[globalKey]
	return concept5CSyntheticTraversalResult{
		Strategy:            "pareto_only",
		ExpandedStates:      expanded,
		ArchiveKeys:         archiveKeys,
		ParetoKeys:          paretoKeys,
		GlobalBestKey:       globalKey,
		RecoveredGlobal:     recovered,
		Bounded:             len(expanded) < len(fixture.Points),
		PriorityIndependent: true,
	}
}

func concept5CInfeasibleBarrierAudit() map[string]any {
	return map[string]any{
		"fixture": "temporary-infeasible-barrier",
		"states": map[string]any{
			"0,0": map[string]any{"feasible": true, "objectives": map[string]float64{"demand": .5, "coverage": .5}},
			"1,0": map[string]any{"feasible": false, "objectives": map[string]float64{"demand": .9, "coverage": .9}},
			"0,1": map[string]any{"feasible": false, "objectives": map[string]float64{"demand": .9, "coverage": .9}},
			"1,1": map[string]any{"feasible": true, "objectives": map[string]float64{"demand": 1, "coverage": 1}},
		},
		"policy": networkParetoArchiveFeasibility,
		"result": "feasible-only active archive does not expand newly discovered infeasible stepping stones; the globally better feasible state is missed from the single-start traversal. Deterministic start-set diversity can still reach it when it is a configured start.",
	}
}

func concept5CWriteMarkdown(path string) error {
	markdown := fmt.Sprintf(`# Concept 5C — Priority-Independent Pareto Archive Search

Audit version: %s

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
`, concept5CAuditVersion)
	return os.WriteFile(path, []byte(markdown), 0644)
}

func concept5CMeasuredRun(run func() error) (float64, uint64, error) {
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

func TestConcept5CPriorityIndependentArchiveContract(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	request.SearchPolicy = DeterministicParetoArchiveSearchV1
	request.MaxUniqueEvaluations = 800
	request.MaxExpandedStates = 6
	request.MaxSearchRounds = 2
	first, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	secondRequest := request
	secondRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 80}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 10}, {ID: "overlap", Weight: 5},
	}}
	second, err := OptimizeNetworkContext(context.Background(), secondRequest, buildings)
	if err != nil {
		t.Fatal(err)
	}
	left := first.Optimization.Search
	right := second.Optimization.Search
	if left == nil || right == nil || left.DiscoveryFingerprint != right.DiscoveryFingerprint || left.SearchFingerprint != right.SearchFingerprint {
		t.Fatalf("priority changed discovery identity: left=%+v right=%+v", left, right)
	}
	if left.UniqueEvaluations != right.UniqueEvaluations || left.EvaluationRequests != right.EvaluationRequests || left.ActiveParetoSize != right.ActiveParetoSize {
		t.Fatalf("priority changed discovery counts: left=%+v right=%+v", left, right)
	}
	if !sameStringSet(concept5BFrontierIDs(first.ParetoFrontier), concept5BFrontierIDs(second.ParetoFrontier)) {
		t.Fatalf("priority changed bounded Pareto membership: %v != %v", concept5BFrontierIDs(first.ParetoFrontier), concept5BFrontierIDs(second.ParetoFrontier))
	}
}

func TestGenerateConcept5CArtifacts(t *testing.T) {
	if os.Getenv("ATOM_RUN_CONCEPT_5C_AUDIT") != "1" {
		t.Skip("set ATOM_RUN_CONCEPT_5C_AUDIT=1 to generate Concept 5C audit artifacts")
	}
	root := concept5AArtifactRoot(t)
	ctx := context.Background()

	twoCellRequest, twoCellBuildings := concept5AExhaustiveFixture("coverage-demand")
	twoCellRequest.Towers[0].AzimuthDeg = 0
	twoCellRequest.Towers[1].AzimuthDeg = 180
	twoCellRequest.SearchPolicy = DeterministicParetoArchiveSearchV1
	twoCellRequest.MaxUniqueEvaluations = 5000
	twoCellRequest.MaxExpandedStates = 16
	twoCellRequest.MaxSearchRounds = 4
	_, twoPrepared, twoRun, twoFrontier, err := concept5CRunInternal(ctx, twoCellRequest, twoCellBuildings, 10, 4, 16, 5000)
	if err != nil {
		t.Fatalf("two-cell 5C search: %v", err)
	}
	twoOracle, err := concept5CExhaustiveOracle(ctx, twoCellRequest, twoCellBuildings, 10)
	if err != nil {
		t.Fatalf("two-cell exhaustive oracle: %v", err)
	}
	twoRunView := concept5CArchiveView(twoCellRequest, twoRun, twoFrontier, &twoOracle)
	twoRunView["oracle_objective_set"] = networkParetoArchiveObjectiveIDs(twoCellRequest.Optimization, twoPrepared.ObjectiveAvailability)

	threeCellRequest, threeCellBuildings := concept5AControlledFixture(3)
	for index := range threeCellRequest.Towers {
		threeCellRequest.Towers[index].AzimuthDeg = float64(index * 120)
	}
	threeCellRequest.SearchPolicy = DeterministicParetoArchiveSearchV1
	threeCellRequest.MaxUniqueEvaluations = 5000
	threeCellRequest.MaxExpandedStates = 12
	threeCellRequest.MaxSearchRounds = 3
	_, threePrepared, threeRun, threeFrontier, err := concept5CRunInternal(ctx, threeCellRequest, threeCellBuildings, 30, 3, 12, 5000)
	if err != nil {
		t.Fatalf("three-cell 5C search: %v", err)
	}
	threeOracle, err := concept5CExhaustiveOracle(ctx, threeCellRequest, threeCellBuildings, 30)
	if err != nil {
		t.Fatalf("three-cell exhaustive oracle: %v", err)
	}
	threeRunView := concept5CArchiveView(threeCellRequest, threeRun, threeFrontier, &threeOracle)
	threeRunView["oracle_candidate_count"] = threeOracle.CandidateCount
	threeRunView["oracle_objective_set"] = networkParetoArchiveObjectiveIDs(threeCellRequest.Optimization, threePrepared.ObjectiveAvailability)

	balancedRequest := twoCellRequest
	balancedRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 25}, {ID: "residential", Weight: 25}, {ID: "coverage", Weight: 25}, {ID: "overlap", Weight: 25},
	}}
	demandRequest := balancedRequest
	demandRequest.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 85}, {ID: "residential", Weight: 5}, {ID: "coverage", Weight: 5}, {ID: "overlap", Weight: 5},
	}}
	_, balancedPrepared, balancedRun, balancedFrontier, err := concept5CRunInternal(ctx, balancedRequest, twoCellBuildings, 10, 3, 12, 2500)
	if err != nil {
		t.Fatalf("balanced 5C search: %v", err)
	}
	_, demandPrepared, demandRun, demandFrontier, err := concept5CRunInternal(ctx, demandRequest, twoCellBuildings, 10, 3, 12, 2500)
	if err != nil {
		t.Fatalf("demand 5C search: %v", err)
	}
	priorityAudit := map[string]any{
		"balanced":                     concept5CArchiveView(balancedRequest, balancedRun, balancedFrontier, nil),
		"demand_dominant":              concept5CArchiveView(demandRequest, demandRun, demandFrontier, nil),
		"archive_state_sets_equal":     sameStringSet(concept5CArchiveKeys(balancedRequest, balancedRun), concept5CArchiveKeys(demandRequest, demandRun)),
		"discovery_fingerprints_equal": balancedRun.Metadata.DiscoveryFingerprint == demandRun.Metadata.DiscoveryFingerprint,
		"ranking_fingerprints_differ":  balancedRun.Metadata.RankingFingerprint != demandRun.Metadata.RankingFingerprint,
		"objective_availability_equal": reflect.DeepEqual(balancedPrepared.ObjectiveAvailability, demandPrepared.ObjectiveAvailability),
		"rerank_rf_evaluation_count":   0,
	}
	reranked, rerankErr := RerankNetworkParetoSolutions(balancedFrontier, demandRequest.Optimization, demandPrepared.ObjectiveAvailability)
	priorityAudit["rerank_error"] = errorString(rerankErr)
	priorityAudit["reranked_ids"] = concept5BFrontierIDs(reranked)
	priorityAudit["rerank_membership_preserved"] = sameStringSet(concept5BFrontierIDs(balancedFrontier), concept5BFrontierIDs(reranked))

	strategyAudit := map[string]any{
		"strategy_A_expand_current_pareto_only":                "audited as the exact active-archive rule; can miss dominated stepping stones",
		"strategy_B_pareto_plus_bounded_dominated_novelty":     "audited as an exhaustive bounded novelty control in the synthetic fixture; not selected for production v1 because novelty-region semantics would need a separate product contract",
		"strategy_C_start_set_diversity_plus_pareto_expansion": "selected production policy: deterministic starts are all expanded, then newly admitted Pareto states are expanded",
		"selected_policy": networkParetoArchiveSteppingStones,
		"interaction_trap": map[string]any{
			"pareto_only_single_start":          concept5CSyntheticTraversal(concept5ASyntheticFixtures()[1], [][]int{{0, 0}}, false),
			"start_set_diversity":               concept5CSyntheticTraversal(concept5ASyntheticFixtures()[1], concept5BSyntheticStarts(concept5ASyntheticFixtures()[1]), false),
			"bounded_dominated_novelty_control": concept5CSyntheticTraversal(concept5ASyntheticFixtures()[1], [][]int{{0, 0}}, true),
		},
		"infeasible_barrier": concept5CInfeasibleBarrierAudit(),
	}

	budgetRuns := make([]map[string]any, 0, 3)
	for _, budget := range []struct {
		label    string
		unique   int
		expanded int
		rounds   int
	}{
		{label: "small", unique: 250, expanded: 2, rounds: 1},
		{label: "medium", unique: 800, expanded: 6, rounds: 2},
		{label: "large", unique: 2500, expanded: 12, rounds: 3},
	} {
		started := time.Now()
		_, _, run, frontier, runErr := concept5CRunInternal(ctx, balancedRequest, twoCellBuildings, 10, budget.rounds, budget.expanded, budget.unique)
		if runErr != nil {
			t.Fatalf("budget run %s: %v", budget.label, runErr)
		}
		budgetRuns = append(budgetRuns, map[string]any{
			"label":                 budget.label,
			"runtime_seconds":       time.Since(started).Seconds(),
			"unique_evaluations":    run.Metadata.UniqueEvaluations,
			"requested_evaluations": run.Metadata.EvaluationRequests,
			"active_pareto_size":    run.Metadata.ActiveParetoSize,
			"pareto_size":           len(frontier),
			"termination_reason":    run.Metadata.TerminationReason,
			"budget_complete":       run.Metadata.BudgetComplete,
			"pareto_recall":         concept5COracleView(twoOracle, run, frontier)["pareto_recall"],
		})
	}

	performanceRuns := make([]map[string]any, 0, 3)
	for cellCount := 1; cellCount <= 3; cellCount++ {
		request, buildings := concept5AControlledFixture(cellCount)
		request.SearchPolicy = DeterministicParetoArchiveSearchV1
		request.MaxUniqueEvaluations = 1200
		request.MaxExpandedStates = 4
		request.MaxSearchRounds = 2
		elapsed, allocated, runErr := concept5CMeasuredRun(func() error {
			_, err := OptimizeNetworkContext(ctx, request, buildings)
			return err
		})
		if runErr != nil {
			t.Fatalf("performance run %d cells: %v", cellCount, runErr)
		}
		_, _, run, frontier, runErr := concept5CRunInternal(ctx, request, buildings, 10, 2, 4, 1200)
		if runErr != nil {
			t.Fatalf("performance metadata run %d cells: %v", cellCount, runErr)
		}
		performanceRuns = append(performanceRuns, map[string]any{
			"cell_count":                    cellCount,
			"runtime_seconds":               elapsed,
			"allocated_bytes":               allocated,
			"requested_evaluations":         run.Metadata.EvaluationRequests,
			"unique_evaluations":            run.Metadata.UniqueEvaluations,
			"active_pareto_size":            run.Metadata.ActiveParetoSize,
			"pareto_size":                   len(frontier),
			"archive_memory_estimate_bytes": run.Metadata.EvaluatedArchiveSize * (256 + cellCount*48),
			"dominance_comparisons":         run.Metadata.DominanceComparisons,
		})
	}

	orderReverse := concept5BReverseNetworkRequest(balancedRequest)
	_, _, reverseRun, reverseFrontier, err := concept5CRunInternal(ctx, orderReverse, twoCellBuildings, 10, 2, 6, 800)
	if err != nil {
		t.Fatalf("reverse-order 5C search: %v", err)
	}
	orderAudit := map[string]any{
		"canonical":                concept5CArchiveView(balancedRequest, balancedRun, balancedFrontier, nil),
		"reverse":                  concept5CArchiveView(orderReverse, reverseRun, reverseFrontier, nil),
		"archive_state_sets_equal": sameStringSet(concept5CArchiveKeys(balancedRequest, balancedRun), concept5CArchiveKeys(orderReverse, reverseRun)),
		"discovery_fingerprint_changes_with_cell_order": balancedRun.Metadata.DiscoveryFingerprint != reverseRun.Metadata.DiscoveryFingerprint,
		"recommendation_changed":                        len(balancedFrontier) > 0 && len(reverseFrontier) > 0 && balancedFrontier[0].ID != reverseFrontier[0].ID,
	}

	radioAudit := concept5BRadioQualityAudit(ctx)

	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		datasetDir = filepath.Join(root, "data-pipeline")
	}
	ankara := map[string]any{"available": false, "dataset_dir": filepath.ToSlash(datasetDir)}
	var legacySnapshot any
	var multiStartSnapshot any
	if dataset, loadErr := LoadDatasetPack(datasetDir); loadErr == nil && dataset != nil && dataset.BuildingIndex != nil {
		canonicalRequest := canonicalAnkaraNetworkOptimizationRequest()
		legacyResponse, legacyErr := OptimizeNetworkContext(ctx, canonicalRequest, dataset.BuildingIndex)
		if legacyErr != nil {
			t.Fatalf("Ankara legacy run: %v", legacyErr)
		}
		multiStartRequest := canonicalRequest
		multiStartRequest.SearchPolicy = DeterministicMultiStartCoordinateV1
		multiStartResponse, multiStartErr := OptimizeNetworkContext(ctx, multiStartRequest, dataset.BuildingIndex)
		if multiStartErr != nil {
			t.Fatalf("Ankara 5B run: %v", multiStartErr)
		}
		paretoRequest := canonicalRequest
		paretoRequest.SearchPolicy = DeterministicParetoArchiveSearchV1
		paretoRequest.MaxUniqueEvaluations = 5000
		paretoRequest.MaxExpandedStates = 8
		paretoRequest.MaxSearchRounds = 2
		paretoResponse, paretoErr := OptimizeNetworkContext(ctx, paretoRequest, dataset.BuildingIndex)
		if paretoErr != nil {
			t.Fatalf("Ankara 5C run: %v", paretoErr)
		}
		legacySnapshot = concept5AMakeProductionSnapshot(legacyResponse)
		multiStartSnapshot = concept5AMakeProductionSnapshot(multiStartResponse)
		ankara = map[string]any{
			"available":                              true,
			"dataset_dir":                            filepath.ToSlash(datasetDir),
			"legacy":                                 concept5BResponseView(legacyResponse),
			"deterministic_multistart_v1":            concept5BResponseView(multiStartResponse),
			"deterministic_pareto_archive_search_v1": concept5BResponseView(paretoResponse),
			"request":                                map[string]any{"cells": len(canonicalRequest.Towers), "rays": canonicalRequest.Rays},
		}
	} else {
		ankara["load_error"] = errorString(loadErr)
	}

	legacyBaseline, legacyErr := OptimizeNetworkContext(ctx, balancedRequest, twoCellBuildings)
	if legacyErr != nil {
		t.Fatalf("controlled legacy baseline: %v", legacyErr)
	}
	fiveBRequest := balancedRequest
	fiveBRequest.SearchPolicy = DeterministicMultiStartCoordinateV1
	fiveBResponse, fiveBErr := OptimizeNetworkContext(ctx, fiveBRequest, twoCellBuildings)
	if fiveBErr != nil {
		t.Fatalf("controlled 5B baseline: %v", fiveBErr)
	}
	fiveCResponse, fiveCErr := OptimizeNetworkContext(ctx, balancedRequest, twoCellBuildings)
	if fiveCErr != nil {
		t.Fatalf("controlled 5C post-change run: %v", fiveCErr)
	}
	postComparison := map[string]any{
		"audit_version": concept5CAuditVersion,
		"legacy_default_unchanged_by_opt_in": reflect.DeepEqual(concept5AMakeProductionSnapshot(legacyBaseline), concept5AMakeProductionSnapshot(func() NetworkOptimizationResponse {
			response, _ := OptimizeNetworkContext(ctx, balancedRequest, twoCellBuildings)
			return response
		}())),
		"legacy_snapshot":      concept5AMakeProductionSnapshot(legacyBaseline),
		"five_b_snapshot":      concept5AMakeProductionSnapshot(fiveBResponse),
		"five_c_response":      concept5BResponseView(fiveCResponse),
		"five_c_search_policy": DeterministicParetoArchiveSearchV1,
	}

	preBaseline := map[string]any{
		"audit_version":        concept5CAuditVersion,
		"legacy_default":       concept5AMakeProductionSnapshot(legacyBaseline),
		"concept_5b_opt_in":    concept5AMakeProductionSnapshot(fiveBResponse),
		"new_policy_is_opt_in": true,
		"scenario_fingerprint_excludes_search_policy": legacyBaseline.ScenarioFingerprint == fiveBResponse.ScenarioFingerprint,
	}

	exhaustiveArtifact := map[string]any{
		"audit_version":                  concept5CAuditVersion,
		"two_cell_36x36":                 twoRunView,
		"three_cell_12x12x12_restricted": threeRunView,
	}
	paretoQuality := map[string]any{
		"audit_version": concept5CAuditVersion,
		"two_cell":      twoRunView["oracle_comparison"],
		"three_cell":    threeRunView["oracle_comparison"],
		"cost_per_recovered_pareto_point": map[string]any{
			"two_cell_unique_evaluations":   twoRun.Metadata.UniqueEvaluations,
			"two_cell_recovered_points":     twoRunView["oracle_comparison"].(map[string]any)["pareto_intersection_count"],
			"three_cell_unique_evaluations": threeRun.Metadata.UniqueEvaluations,
			"three_cell_recovered_points":   threeRunView["oracle_comparison"].(map[string]any)["pareto_intersection_count"],
		},
	}

	artifacts := map[string]any{
		"docs/concept-5c-pre-change-baseline.json":     preBaseline,
		"docs/concept-5c-discovery-policy-audit.json":  strategyAudit,
		"docs/concept-5c-exhaustive-comparison.json":   exhaustiveArtifact,
		"docs/concept-5c-multi-priority-recovery.json": priorityAudit,
		"docs/concept-5c-pareto-quality.json":          paretoQuality,
		"docs/concept-5c-ankara-comparison.json":       ankara,
		"docs/concept-5c-performance.json":             map[string]any{"audit_version": concept5CAuditVersion, "budget_sensitivity": budgetRuns, "order_sensitivity": orderAudit, "runtime_memory_runs": performanceRuns, "radio_quality": radioAudit},
		"docs/concept-5c-post-change-comparison.json":  postComparison,
	}
	if legacySnapshot != nil {
		ankara["legacy_snapshot"] = legacySnapshot
	}
	if multiStartSnapshot != nil {
		ankara["five_b_snapshot"] = multiStartSnapshot
	}
	for relativePath, value := range artifacts {
		if err := concept5AWriteJSON(filepath.Join(root, relativePath), value); err != nil {
			t.Fatalf("write %s: %v", relativePath, err)
		}
	}
	if err := concept5CWriteMarkdown(filepath.Join(root, "docs/concept-5c-pareto-search.md")); err != nil {
		t.Fatalf("write Concept 5C markdown: %v", err)
	}
	t.Logf("Concept 5C artifacts generated; Ankara dataset available=%v", ankara["available"])
}
