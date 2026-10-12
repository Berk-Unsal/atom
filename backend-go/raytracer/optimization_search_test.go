package raytracer

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestNetworkSearchStateKeyIsStableAcrossTowerOrder(t *testing.T) {
	towers := []NetworkTowerRequest{
		{ID: "cell-b"},
		{ID: "cell-a"},
	}
	reordered := []NetworkTowerRequest{
		towers[1],
		towers[0],
	}
	if first, second := networkSearchStateKey(towers, []float64{20, 70}), networkSearchStateKey(reordered, []float64{70, 20}); first != second {
		t.Fatalf("state key changed with tower order: %q != %q", first, second)
	}
	if networkSearchStateKey(towers, []float64{20, 70}) == networkSearchStateKey(towers, []float64{20, 80}) {
		t.Fatal("state key ignored an azimuth change")
	}
	if networkSearchStateKey(towers, []float64{0, 360}) != networkSearchStateKey(towers, []float64{0, 0}) {
		t.Fatal("state key did not normalize 360 degrees")
	}
}

func TestNetworkSearchOptionsValidatePolicyAndBudgets(t *testing.T) {
	tests := []struct {
		name string
		req  NetworkOptimizationRequest
		want string
	}{
		{name: "omitted policy", req: NetworkOptimizationRequest{}},
		{name: "legacy policy", req: NetworkOptimizationRequest{SearchPolicy: LegacyNetworkSearchPolicy}},
		{name: "multi-start policy", req: NetworkOptimizationRequest{SearchPolicy: DeterministicMultiStartCoordinateV1}},
		{name: "Pareto archive policy", req: NetworkOptimizationRequest{SearchPolicy: DeterministicParetoArchiveSearchV1}},
		{name: "unknown policy", req: NetworkOptimizationRequest{SearchPolicy: "random"}, want: "search_policy"},
		{name: "negative passes", req: NetworkOptimizationRequest{MaxSearchPasses: -1}, want: "max_search_passes"},
		{name: "too many passes", req: NetworkOptimizationRequest{MaxSearchPasses: MaxNetworkSearchMaxPasses + 1}, want: "max_search_passes"},
		{name: "negative evaluations", req: NetworkOptimizationRequest{MaxUniqueEvaluations: -1}, want: "max_unique_evaluations"},
		{name: "too many evaluations", req: NetworkOptimizationRequest{MaxUniqueEvaluations: MaxNetworkSearchMaxUniqueEvaluations + 1}, want: "max_unique_evaluations"},
		{name: "negative expanded states", req: NetworkOptimizationRequest{MaxExpandedStates: -1}, want: "max_expanded_states"},
		{name: "too many expanded states", req: NetworkOptimizationRequest{MaxExpandedStates: MaxNetworkSearchMaxExpandedStates + 1}, want: "max_expanded_states"},
		{name: "negative rounds", req: NetworkOptimizationRequest{MaxSearchRounds: -1}, want: "max_search_rounds"},
		{name: "too many rounds", req: NetworkOptimizationRequest{MaxSearchRounds: MaxNetworkSearchMaxRounds + 1}, want: "max_search_rounds"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := ValidateNetworkOptimizationSearchOptions(test.req)
			if test.want == "" && got != "" {
				t.Fatalf("validation = %q, want success", got)
			}
			if test.want != "" && !bytes.Contains([]byte(got), []byte(test.want)) {
				t.Fatalf("validation = %q, want substring %q", got, test.want)
			}
		})
	}
}

func TestNetworkOptimizationDefaultSearchMatchesExplicitLegacyPolicy(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	defaultResponse, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	explicitLegacy := request
	explicitLegacy.SearchPolicy = LegacyNetworkSearchPolicy
	legacyResponse, err := OptimizeNetworkContext(context.Background(), explicitLegacy, buildings)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(defaultResponse, legacyResponse) {
		t.Fatalf("omitted search policy changed legacy response\ndefault=%+v\nlegacy=%+v", defaultResponse, legacyResponse)
	}
	if defaultResponse.Optimization.Search != nil {
		t.Fatal("legacy response unexpectedly contains search metadata")
	}
	serialized, err := json.Marshal(defaultResponse)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(serialized, []byte(`"search"`)) {
		t.Fatalf("legacy response serialized opt-in search metadata: %s", serialized)
	}
}

func TestDeterministicMultiStartSearchReportsArchiveAndStarts(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	request.SearchPolicy = DeterministicMultiStartCoordinateV1
	request.MaxSearchPasses = 4
	request.MaxUniqueEvaluations = 5000
	response, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	search := response.Optimization.Search
	if search == nil {
		t.Fatal("multi-start response omitted search metadata")
	}
	if search.Policy != DeterministicMultiStartCoordinateV1 || search.SearchGuarantee != "heuristic_local_search" {
		t.Fatalf("unexpected search identity: %+v", search)
	}
	if search.StartCount != 4 || search.CompletedStartCount != 4 || len(search.StartTraces) != 4 {
		t.Fatalf("unexpected start accounting: %+v", search)
	}
	if search.EvaluatedArchiveSize <= 0 || search.UniqueEvaluations <= 0 || search.EvaluationRequests < search.UniqueEvaluations {
		t.Fatalf("unexpected evaluation accounting: %+v", search)
	}
	if search.CacheHits <= 0 {
		t.Fatalf("expected cross-start cache hits: %+v", search)
	}
	if search.ParetoSize != len(response.ParetoFrontier) {
		t.Fatalf("metadata Pareto size = %d, response has %d", search.ParetoSize, len(response.ParetoFrontier))
	}
	if search.SearchFingerprint == "" || search.StateKeyVersion != networkSearchStateKeyVersion {
		t.Fatalf("missing deterministic search fingerprint metadata: %+v", search)
	}
	for _, trace := range search.StartTraces {
		if trace.TerminationReason == "" || len(trace.FinalAzimuths) != len(request.Towers) {
			t.Fatalf("incomplete start trace: %+v", trace)
		}
	}
}

func TestDeterministicSearchUntilStableAndBudgetTermination(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	req := request
	NormalizeNetworkOptimizationRequest(&req)
	prepared, err := prepareNetworkOptimizationContext(context.Background(), req, buildings)
	if err != nil {
		t.Fatal(err)
	}
	starts := []networkSearchStartSpec{{ID: "baseline", Azimuths: []float64{req.Towers[0].AzimuthDeg, req.Towers[1].AzimuthDeg}}}
	stable, err := runNetworkDeterministicMultiStartSearch(context.Background(), req, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            8,
		MaxUniqueEvaluations: 5000,
		Memoize:              true,
		Starts:               starts,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(stable.Metadata.StartTraces) != 1 {
		t.Fatalf("got %d traces, want one", len(stable.Metadata.StartTraces))
	}
	trace := stable.Metadata.StartTraces[0]
	if trace.TerminationReason != "coordinate_stable" {
		t.Fatalf("termination = %q, want coordinate_stable; trace=%+v", trace.TerminationReason, trace)
	}
	for _, update := range trace.AcceptedUpdates {
		if update.Pass == trace.Passes {
			t.Fatalf("stable pass contained an accepted update: %+v", update)
		}
	}

	budgeted, err := runNetworkDeterministicMultiStartSearch(context.Background(), req, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            8,
		MaxUniqueEvaluations: 1,
		Memoize:              true,
		Starts:               starts,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := budgeted.Metadata.StartTraces[0].TerminationReason; got != "evaluation_budget" {
		t.Fatalf("budget termination = %q, want evaluation_budget", got)
	}
	if !budgeted.Metadata.IncompleteSearch {
		t.Fatal("budget-limited search was not marked incomplete")
	}
}

func TestDeterministicSearchCacheMatchesNoCacheArchive(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	NormalizeNetworkOptimizationRequest(&request)
	prepared, err := prepareNetworkOptimizationContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	starts := deterministicNetworkSearchStarts(request)
	withCache, err := runNetworkDeterministicMultiStartSearch(context.Background(), request, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            2,
		MaxUniqueEvaluations: 5000,
		Memoize:              true,
		Starts:               starts,
	})
	if err != nil {
		t.Fatal(err)
	}
	withoutCache, err := runNetworkDeterministicMultiStartSearch(context.Background(), request, buildings, prepared, networkSearchRunOptions{
		MaxPasses:            2,
		MaxUniqueEvaluations: 5000,
		Memoize:              false,
		Starts:               starts,
	})
	if err != nil {
		t.Fatal(err)
	}
	if withCache.Metadata.CacheHits == 0 || withoutCache.Metadata.CacheHits != 0 {
		t.Fatalf("cache accounting = %d / %d", withCache.Metadata.CacheHits, withoutCache.Metadata.CacheHits)
	}
	if len(withCache.Archive) != len(withoutCache.Archive) {
		t.Fatalf("archive sizes differ: %d != %d", len(withCache.Archive), len(withoutCache.Archive))
	}
	for index := range withCache.Archive {
		left := withCache.Archive[index]
		right := withoutCache.Archive[index]
		if networkSearchStateKey(request.Towers, left.Azimuths) != networkSearchStateKey(request.Towers, right.Azimuths) {
			t.Fatalf("archive state %d differs: %+v != %+v", index, left.Azimuths, right.Azimuths)
		}
		if !reflect.DeepEqual(left.Stats, right.Stats) {
			t.Fatalf("archive stats %d differ", index)
		}
	}
	leftPareto := networkParetoFrontier(withCache.Archive, request.Towers, request.Optimization, prepared.ObjectiveAvailability)
	rightPareto := networkParetoFrontier(withoutCache.Archive, request.Towers, request.Optimization, prepared.ObjectiveAvailability)
	if !reflect.DeepEqual(leftPareto, rightPareto) {
		t.Fatalf("cache changed Pareto frontier")
	}
}

func TestNetworkSearchPolicyDoesNotChangeScenarioIdentity(t *testing.T) {
	request, _ := concept5AControlledFixture(2)
	legacy := request
	multiStart := request
	multiStart.SearchPolicy = DeterministicMultiStartCoordinateV1
	if NetworkScenarioFingerprint(legacy) != NetworkScenarioFingerprint(multiStart) {
		t.Fatal("search policy changed scenario fingerprint")
	}
	if NetworkOptimizationRunID(legacy) != NetworkOptimizationRunID(multiStart) {
		t.Fatal("search policy changed optimization run ID")
	}
}

func TestDeterministicMultiStartRepeatIsByteStable(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	request.SearchPolicy = DeterministicMultiStartCoordinateV1
	request.MaxSearchPasses = 3
	request.MaxUniqueEvaluations = 2000
	first, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("repeated deterministic multi-start response changed")
	}
	firstJSON, err := json.Marshal(first)
	if err != nil {
		t.Fatal(err)
	}
	secondJSON, err := json.Marshal(second)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(firstJSON, secondJSON) {
		t.Fatal("repeated deterministic multi-start JSON changed")
	}
}

func TestDeterministicSearchPreservesLegacyBaselineRFState(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	legacy, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	multiStartRequest := request
	multiStartRequest.SearchPolicy = DeterministicMultiStartCoordinateV1
	multiStart, err := OptimizeNetworkContext(context.Background(), multiStartRequest, buildings)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.ScenarioFingerprint != multiStart.ScenarioFingerprint || legacy.OptimizationRunID != multiStart.OptimizationRunID {
		t.Fatal("opt-in search changed RF/scenario identity")
	}
	if legacy.Baseline == nil || multiStart.Baseline == nil || !reflect.DeepEqual(legacy.Baseline.Stats.RawMetrics, multiStart.Baseline.Stats.RawMetrics) {
		t.Fatal("opt-in search changed the authoritative baseline RF metrics")
	}
}

func TestDeterministicParetoArchiveSearchIsPriorityIndependent(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	request.SearchPolicy = DeterministicParetoArchiveSearchV1
	request.MaxUniqueEvaluations = 900
	request.MaxExpandedStates = 8
	request.MaxSearchRounds = 2

	balanced := request
	balanced.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 25}, {ID: "residential", Weight: 25}, {ID: "coverage", Weight: 25}, {ID: "overlap", Weight: 25},
	}}
	demand := request
	demand.Optimization = OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 90}, {ID: "residential", Weight: 3}, {ID: "coverage", Weight: 4}, {ID: "overlap", Weight: 3},
	}}
	first, err := OptimizeNetworkContext(context.Background(), balanced, buildings)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OptimizeNetworkContext(context.Background(), demand, buildings)
	if err != nil {
		t.Fatal(err)
	}
	left := first.Optimization.Search
	right := second.Optimization.Search
	if left == nil || right == nil {
		t.Fatal("Pareto archive response omitted search metadata")
	}
	if !left.PriorityIndependentDiscovery || !right.PriorityIndependentDiscovery || left.CandidateDiscoveryPriorityDependent || right.CandidateDiscoveryPriorityDependent {
		t.Fatalf("priority-independence metadata is incorrect: left=%+v right=%+v", left, right)
	}
	if left.DiscoveryFingerprint == "" || left.DiscoveryFingerprint != right.DiscoveryFingerprint || left.SearchFingerprint != right.SearchFingerprint {
		t.Fatalf("discovery fingerprint changed with ranking weights: %q != %q", left.DiscoveryFingerprint, right.DiscoveryFingerprint)
	}
	if left.RankingFingerprint == "" || left.RankingFingerprint == right.RankingFingerprint {
		t.Fatal("ranking fingerprint did not capture changed priorities")
	}
	if left.UniqueEvaluations != right.UniqueEvaluations || left.EvaluationRequests != right.EvaluationRequests || left.ActiveParetoSize != right.ActiveParetoSize {
		t.Fatalf("discovery counts changed with ranking weights: left=%+v right=%+v", left, right)
	}
	leftIDs := concept5BFrontierIDs(first.ParetoFrontier)
	rightIDs := concept5BFrontierIDs(second.ParetoFrontier)
	if !sameStringSet(leftIDs, rightIDs) {
		t.Fatalf("Pareto membership changed with ranking weights: left=%v right=%v", leftIDs, rightIDs)
	}
	if first.Optimization.RecommendedSolutionID == second.Optimization.RecommendedSolutionID && len(leftIDs) > 1 {
		t.Logf("this fixture did not change the top recommendation; archive membership and ranking fingerprints still differ as required")
	}
}

func TestDeterministicParetoArchiveSearchIsDeterministicAndBounded(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	request.SearchPolicy = DeterministicParetoArchiveSearchV1
	request.MaxUniqueEvaluations = 1
	request.MaxExpandedStates = 1
	request.MaxSearchRounds = 1
	first, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	second, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first, second) {
		t.Fatal("repeated Pareto archive response changed")
	}
	search := first.Optimization.Search
	if search == nil || search.TerminationReason != "evaluation_budget" || search.BudgetComplete || !search.IncompleteSearch {
		t.Fatalf("budget termination metadata is not honest: %+v", search)
	}
	if search.UniqueEvaluations != 1 || search.EvaluatedArchiveSize != 1 || search.EvaluationRequests < search.UniqueEvaluations {
		t.Fatalf("unexpected bounded evaluation accounting: %+v", search)
	}
	if search.ObjectiveSet == nil || search.StartPolicy == "" || search.NeighborhoodPolicy == "" || search.QueuePolicy == "" || search.SteppingStonePolicy == "" {
		t.Fatalf("missing archive policy metadata: %+v", search)
	}
	encoded, err := json.Marshal(search)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(encoded, []byte(`"budget_complete":false`)) {
		t.Fatalf("incomplete 5C metadata omitted explicit budget_complete=false: %s", encoded)
	}
	legacyMetadata, err := json.Marshal(NetworkOptimizationSearchMetadata{SearchPolicy: DeterministicMultiStartCoordinateV1})
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(legacyMetadata, []byte("budget_complete")) {
		t.Fatalf("5B metadata gained a 5C-only budget field: %s", legacyMetadata)
	}
}

func TestDeterministicParetoArchiveUsesExactFeasibleDominance(t *testing.T) {
	config := OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 50}, {ID: "coverage", Weight: 50}}}
	availability := map[string]OptimizationObjectiveAvailability{
		"demand":   {Available: true},
		"coverage": {Available: true},
	}
	makeCandidate := func(key string, demand, coverage float64, feasible bool) networkParetoArchiveEntry {
		stats := NetworkOptimizationStats{RawMetrics: OptimizationRawMetrics{
			ServedWeightedDemand: demand, TotalWeightedDemand: 1,
			CoverageReachScore: coverage, CoverageReachMaximum: 1,
		}}
		if !feasible {
			limit := 1
			stats.UniqueDemandBuildings = 0
			stats.RawMetrics.TotalWeightedDemand = 0
			stats.RawMetrics.ServedWeightedDemand = 0
			stats.RawMetrics.CoverageReachMaximum = 1
			stats.CoverageScore = 0
			_ = limit
		}
		candidate := networkOptimizationCandidate{Azimuths: []float64{float64(len(key))}, Stats: stats}
		entry := networkParetoArchiveEntryForCandidate(candidate, config, availability, 0)
		entry.stateKey = key
		entry.feasible = feasible
		entry.utilities = OptimizationUtilities{Demand: demand, Coverage: coverage}
		return entry
	}
	archive := newNetworkParetoArchiveController([]string{"demand", "coverage"})
	if !archive.consider(makeCandidate("a", .5, .5, true)) {
		t.Fatal("first feasible point was not admitted")
	}
	if archive.consider(makeCandidate("dominated", .4, .4, true)) {
		t.Fatal("dominated point was admitted")
	}
	if archive.consider(makeCandidate("infeasible", .9, .9, false)) {
		t.Fatal("infeasible point was admitted to active Pareto archive")
	}
	if !archive.consider(makeCandidate("tradeoff", .9, .4, true)) {
		t.Fatal("non-dominated trade-off was rejected")
	}
	if len(archive.candidates()) != 2 || archive.removed != 0 {
		t.Fatalf("unexpected exact archive state: active=%d removed=%d", len(archive.candidates()), archive.removed)
	}
}

func TestRerankNetworkParetoSolutionsDoesNotChangeMembership(t *testing.T) {
	request, buildings := concept5AControlledFixture(2)
	request.SearchPolicy = DeterministicParetoArchiveSearchV1
	request.MaxUniqueEvaluations = 400
	request.MaxExpandedStates = 4
	request.MaxSearchRounds = 1
	response, err := OptimizeNetworkContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	if len(response.ParetoFrontier) == 0 {
		t.Fatal("expected a discovered Pareto frontier")
	}
	prepared, err := prepareNetworkOptimizationContext(context.Background(), request, buildings)
	if err != nil {
		t.Fatal(err)
	}
	config := OptimizationConfig{Objectives: []OptimizationObjective{{ID: "demand", Weight: 90}, {ID: "residential", Weight: 3}, {ID: "coverage", Weight: 4}, {ID: "overlap", Weight: 3}}}
	ranked, err := RerankNetworkParetoSolutions(response.ParetoFrontier, config, prepared.ObjectiveAvailability)
	if err != nil {
		t.Fatal(err)
	}
	if !sameStringSet(concept5BFrontierIDs(response.ParetoFrontier), concept5BFrontierIDs(ranked)) {
		t.Fatalf("pure rerank changed membership: before=%v after=%v", concept5BFrontierIDs(response.ParetoFrontier), concept5BFrontierIDs(ranked))
	}
}
