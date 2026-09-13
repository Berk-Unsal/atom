package raytracer

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

const defaultOptimizationPriority = 50.0

var optimizationObjectiveIDs = []string{"demand", "residential", "coverage", "overlap"}

type networkOptimizationCandidate struct {
	Azimuths []float64
	Stats    NetworkOptimizationStats
}

// OptimizationObjectiveAvailability records whether an objective has a meaningful
// target in the fixed optimization domain.
type OptimizationObjectiveAvailability struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"`
}

// OptimizationObjectiveStatus separates configured priorities from the weights
// actually used after unavailable objectives are removed from scoring.
type OptimizationObjectiveStatus struct {
	Available          bool     `json:"available"`
	Reason             string   `json:"reason,omitempty"`
	ConfiguredPriority float64  `json:"configured_priority"`
	EffectiveWeight    float64  `json:"effective_weight"`
	Utility            *float64 `json:"utility"`
	Contribution       *float64 `json:"contribution"`
}

type OptimizationObjectiveStatusMap map[string]OptimizationObjectiveStatus

// OptimizationRawMetrics keeps domain measurements alongside normalized utilities.
// The legacy fields remain serialized for compatibility; the relevant_* aliases
// make the fixed optimization-domain meaning explicit to new consumers.
type OptimizationRawMetrics struct {
	ServedWeightedDemand     float64 `json:"served_weighted_demand"`
	ServedDemandWeight       float64 `json:"served_demand_weight,omitempty"`
	TotalWeightedDemand      float64 `json:"total_weighted_demand"`
	RelevantDemandWeight     float64 `json:"relevant_demand_weight,omitempty"`
	ResidentialCovered       int     `json:"residential_covered"`
	ResidentialTotal         int     `json:"residential_total"`
	RelevantResidentialTotal int     `json:"relevant_residential_total,omitempty"`
	CoverageReachScore       float64 `json:"coverage_reach_score"`
	CoverageReachMaximum     float64 `json:"coverage_reach_maximum"`
	PropagationReachScore    float64 `json:"propagation_reach_score,omitempty"`
	PropagationReachMaximum  float64 `json:"propagation_reach_maximum,omitempty"`
	CoveredUnits             int     `json:"covered_units"`
	OverlapBuildings         int     `json:"overlap_buildings"`
	OverlapRatio             float64 `json:"overlap_ratio"`
}

type OptimizationUtilities struct {
	Demand      float64 `json:"demand"`
	Residential float64 `json:"residential"`
	Coverage    float64 `json:"coverage"`
	Overlap     float64 `json:"overlap"`
}

type OptimizationContribution struct {
	Utility      float64 `json:"utility"`
	Weight       float64 `json:"weight"`
	Contribution float64 `json:"contribution"`
}

type OptimizationObjectiveBreakdown struct {
	Demand      OptimizationContribution `json:"demand"`
	Residential OptimizationContribution `json:"residential"`
	Coverage    OptimizationContribution `json:"coverage"`
	Overlap     OptimizationContribution `json:"overlap"`
}

func DefaultOptimizationConfig() OptimizationConfig {
	return OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: defaultOptimizationPriority},
		{ID: "residential", Weight: defaultOptimizationPriority},
		{ID: "coverage", Weight: defaultOptimizationPriority},
		{ID: "overlap", Weight: defaultOptimizationPriority},
	}}
}

func NormalizeOptimizationConfig(config *OptimizationConfig) OptimizationConfig {
	if config == nil || len(config.Objectives) == 0 {
		defaults := DefaultOptimizationConfig()
		if config != nil {
			defaults.Constraints = config.Constraints
		}
		return defaults
	}
	normalized := *config
	normalized.Objectives = append([]OptimizationObjective(nil), config.Objectives...)
	for index := range normalized.Objectives {
		normalized.Objectives[index].ID = strings.ToLower(strings.TrimSpace(normalized.Objectives[index].ID))
	}
	return normalized
}

func ValidateOptimizationConfig(config OptimizationConfig) string {
	if len(config.Objectives) < 1 || len(config.Objectives) > 4 {
		return "optimization.objectives must contain between 1 and 4 objectives"
	}
	seen := make(map[string]struct{}, len(config.Objectives))
	priorityTotal := 0.0
	for _, objective := range config.Objectives {
		if !oneOf(objective.ID, optimizationObjectiveIDs...) {
			return "optimization objective id must be demand, residential, coverage, or overlap"
		}
		if _, exists := seen[objective.ID]; exists {
			return "optimization objective ids must be unique"
		}
		seen[objective.ID] = struct{}{}
		if math.IsNaN(objective.Weight) || math.IsInf(objective.Weight, 0) || objective.Weight < 0 || objective.Weight > 100 {
			return "optimization objective priorities must be between 0 and 100"
		}
		priorityTotal += objective.Weight
	}
	if priorityTotal <= 0 {
		return "at least one optimization priority must be greater than 0"
	}
	constraints := config.Constraints
	if constraints.MinCoverageScore != nil && (!finiteInRange(*constraints.MinCoverageScore, 0, math.MaxFloat64)) {
		return "optimization.constraints.min_coverage_score must be finite and non-negative"
	}
	for label, value := range map[string]*int{
		"min_unique_demand_buildings":      constraints.MinUniqueDemandBuildings,
		"min_unique_residential_buildings": constraints.MinUniqueResidentialBuildings,
		"max_overlap_buildings":            constraints.MaxOverlapBuildings,
	} {
		if value != nil && *value < 0 {
			return "optimization.constraints." + label + " must be non-negative"
		}
	}
	return ""
}

// NormalizeOptimizationPriorities converts user-facing priorities into weights
// that sum to one. Missing objective IDs have zero influence.
func NormalizeOptimizationPriorities(objectives []OptimizationObjective) (map[string]float64, error) {
	if validationError := ValidateOptimizationConfig(OptimizationConfig{Objectives: objectives}); validationError != "" {
		return nil, fmt.Errorf("%s", validationError)
	}
	weights := make(map[string]float64, len(optimizationObjectiveIDs))
	priorityTotal := 0.0
	for _, objective := range objectives {
		priorityTotal += objective.Weight
	}
	for _, id := range optimizationObjectiveIDs {
		weights[id] = 0
	}
	for _, objective := range objectives {
		weights[objective.ID] = objective.Weight / priorityTotal
	}
	return weights, nil
}

// NormalizeAvailableOptimizationPriorities preserves configured priorities but
// excludes unavailable objectives from the effective scoring denominator.
func NormalizeAvailableOptimizationPriorities(objectives []OptimizationObjective, availability map[string]OptimizationObjectiveAvailability) (map[string]float64, error) {
	if validationError := ValidateOptimizationConfig(OptimizationConfig{Objectives: objectives}); validationError != "" {
		return nil, fmt.Errorf("%s", validationError)
	}
	weights := make(map[string]float64, len(optimizationObjectiveIDs))
	for _, id := range optimizationObjectiveIDs {
		weights[id] = 0
	}
	priorityTotal := 0.0
	for _, objective := range objectives {
		status, exists := availability[objective.ID]
		if (!exists || status.Available) && objective.Weight > 0 {
			priorityTotal += objective.Weight
		}
	}
	if priorityTotal <= 0 {
		return nil, fmt.Errorf("optimization has no available positively weighted objectives in the target domain")
	}
	for _, objective := range objectives {
		status, exists := availability[objective.ID]
		if exists && !status.Available {
			continue
		}
		weights[objective.ID] = objective.Weight / priorityTotal
	}
	return weights, nil
}

// NormalizeOptimizationObjectives maps raw domain metrics to stable utilities.
// It never uses the candidate set, so a utility keeps the same meaning across runs.
func NormalizeOptimizationObjectives(stats NetworkOptimizationStats) OptimizationUtilities {
	raw := stats.RawMetrics
	coverageScore := raw.CoverageReachScore
	if coverageScore == 0 {
		coverageScore = raw.PropagationReachScore
	}
	if coverageScore == 0 {
		coverageScore = stats.CoverageScore
	}
	coveredResidential := raw.ResidentialCovered
	if coveredResidential == 0 {
		coveredResidential = stats.UniqueResidentialBuildings
	}
	coveredUnits := raw.CoveredUnits
	overlapBuildings := raw.OverlapBuildings
	if overlapBuildings == 0 {
		overlapBuildings = stats.OverlapBuildings
	}

	totalDemand := raw.TotalWeightedDemand
	if totalDemand == 0 {
		totalDemand = raw.RelevantDemandWeight
	}
	totalResidential := raw.ResidentialTotal
	if totalResidential == 0 {
		totalResidential = raw.RelevantResidentialTotal
	}
	coverageMaximum := raw.CoverageReachMaximum
	if coverageMaximum == 0 {
		coverageMaximum = raw.PropagationReachMaximum
	}
	servedDemand := raw.ServedWeightedDemand
	if servedDemand == 0 {
		servedDemand = raw.ServedDemandWeight
	}
	demandUtility := ratio01(servedDemand, totalDemand)
	residentialUtility := ratio01(float64(coveredResidential), float64(totalResidential))
	coverageUtility := ratio01(coverageScore, coverageMaximum)
	overlapRatio := ratio01(float64(overlapBuildings), float64(coveredUnits))

	return OptimizationUtilities{
		Demand:      demandUtility,
		Residential: residentialUtility,
		Coverage:    coverageUtility,
		Overlap:     clamp01(1 - overlapRatio),
	}
}

// CalculateCompositeScore returns the weighted score in [0, 1].
func CalculateCompositeScore(utilities OptimizationUtilities, weights map[string]float64) float64 {
	value :=
		weights["demand"]*utilities.Demand +
			weights["residential"]*utilities.Residential +
			weights["coverage"]*utilities.Coverage +
			weights["overlap"]*utilities.Overlap
	return clamp01(value)
}

func calculateObjectiveBreakdown(utilities OptimizationUtilities, weights map[string]float64) OptimizationObjectiveBreakdown {
	return OptimizationObjectiveBreakdown{
		Demand:      contribution(utilities.Demand, weights["demand"]),
		Residential: contribution(utilities.Residential, weights["residential"]),
		Coverage:    contribution(utilities.Coverage, weights["coverage"]),
		Overlap:     contribution(utilities.Overlap, weights["overlap"]),
	}
}

func contribution(utility float64, weight float64) OptimizationContribution {
	return OptimizationContribution{
		Utility:      clamp01(utility),
		Weight:       clamp01(weight),
		Contribution: clamp01(utility) * clamp01(weight),
	}
}

func roundObjectiveBreakdown(breakdown OptimizationObjectiveBreakdown) OptimizationObjectiveBreakdown {
	return OptimizationObjectiveBreakdown{
		Demand:      roundContribution(breakdown.Demand),
		Residential: roundContribution(breakdown.Residential),
		Coverage:    roundContribution(breakdown.Coverage),
		Overlap:     roundContribution(breakdown.Overlap),
	}
}

func roundContribution(value OptimizationContribution) OptimizationContribution {
	value.Utility = roundFloat(value.Utility, 6)
	value.Weight = roundFloat(value.Weight, 6)
	value.Contribution = roundFloat(value.Contribution, 6)
	return value
}

func roundObjectiveStatus(status OptimizationObjectiveStatusMap) OptimizationObjectiveStatusMap {
	if len(status) == 0 {
		return status
	}
	rounded := make(OptimizationObjectiveStatusMap, len(status))
	for id, value := range status {
		value.ConfiguredPriority = roundFloat(value.ConfiguredPriority, 4)
		value.EffectiveWeight = roundFloat(value.EffectiveWeight, 6)
		if value.Utility != nil {
			utility := roundFloat(*value.Utility, 6)
			value.Utility = &utility
		}
		if value.Contribution != nil {
			contributionValue := roundFloat(*value.Contribution, 6)
			value.Contribution = &contributionValue
		}
		rounded[id] = value
	}
	return rounded
}

func scoreNetworkOptimization(stats NetworkOptimizationStats, config OptimizationConfig, availability ...map[string]OptimizationObjectiveAvailability) (NetworkOptimizationStats, error) {
	if validationError := ValidateOptimizationConfig(config); validationError != "" {
		return NetworkOptimizationStats{}, fmt.Errorf("%s", validationError)
	}
	objectiveAvailability := optimizationAvailabilityForStats(stats)
	if len(availability) > 0 && availability[0] != nil {
		objectiveAvailability = availability[0]
	}
	weights, err := NormalizeAvailableOptimizationPriorities(config.Objectives, objectiveAvailability)
	if err != nil {
		return NetworkOptimizationStats{}, err
	}
	utilities := NormalizeOptimizationObjectives(stats)
	stats.Objectives = utilities
	stats.CompositeScore = CalculateCompositeScore(utilities, weights)
	stats.Score = stats.CompositeScore * 100
	stats.ObjectiveBreakdown = calculateObjectiveBreakdown(utilities, weights)
	stats.ObjectiveStatus = buildObjectiveStatus(config.Objectives, objectiveAvailability, weights, utilities)
	return stats, nil
}

// OptimizationObjectiveScore is retained as the normalized composite score for
// callers that previously used this helper as the optimizer's ranking function.
func OptimizationObjectiveScore(stats NetworkOptimizationStats, config OptimizationConfig) float64 {
	scored, err := scoreNetworkOptimization(stats, config)
	if err != nil {
		return 0
	}
	return scored.CompositeScore
}

func optimizationObjectiveScoreWithAvailability(stats NetworkOptimizationStats, config OptimizationConfig, availability map[string]OptimizationObjectiveAvailability) float64 {
	scored, err := scoreNetworkOptimization(stats, config, availability)
	if err != nil {
		return 0
	}
	return scored.CompositeScore
}

func optimizationAvailabilityForStats(stats NetworkOptimizationStats) map[string]OptimizationObjectiveAvailability {
	if len(stats.ObjectiveStatus) > 0 {
		availability := make(map[string]OptimizationObjectiveAvailability, len(stats.ObjectiveStatus))
		for id, status := range stats.ObjectiveStatus {
			availability[id] = OptimizationObjectiveAvailability{Available: status.Available, Reason: status.Reason}
		}
		return availability
	}
	raw := stats.RawMetrics
	totalDemand := raw.TotalWeightedDemand
	if totalDemand == 0 {
		totalDemand = raw.RelevantDemandWeight
	}
	totalResidential := raw.ResidentialTotal
	if totalResidential == 0 {
		totalResidential = raw.RelevantResidentialTotal
	}
	coverageMaximum := raw.CoverageReachMaximum
	if coverageMaximum == 0 {
		coverageMaximum = raw.PropagationReachMaximum
	}
	return map[string]OptimizationObjectiveAvailability{
		"demand":      {Available: totalDemand > 0, Reason: objectiveAvailabilityReason(totalDemand > 0, "no_relevant_entities")},
		"residential": {Available: totalResidential > 0, Reason: objectiveAvailabilityReason(totalResidential > 0, "no_relevant_entities")},
		"coverage":    {Available: coverageMaximum > 0, Reason: objectiveAvailabilityReason(coverageMaximum > 0, "no_reachable_rays")},
		"overlap":     {Available: raw.CoveredUnits > 0, Reason: objectiveAvailabilityReason(raw.CoveredUnits > 0, "no_relevant_entities")},
	}
}

func buildObjectiveStatus(objectives []OptimizationObjective, availability map[string]OptimizationObjectiveAvailability, weights map[string]float64, utilities OptimizationUtilities) OptimizationObjectiveStatusMap {
	configured := make(map[string]float64, len(objectives))
	for _, objective := range objectives {
		configured[objective.ID] = objective.Weight
	}
	status := make(OptimizationObjectiveStatusMap, len(optimizationObjectiveIDs))
	for _, id := range optimizationObjectiveIDs {
		availabilityStatus, exists := availability[id]
		if !exists {
			availabilityStatus = OptimizationObjectiveAvailability{Available: true}
		}
		entry := OptimizationObjectiveStatus{
			Available:          availabilityStatus.Available,
			Reason:             availabilityStatus.Reason,
			ConfiguredPriority: configured[id],
			EffectiveWeight:    weights[id],
		}
		if availabilityStatus.Available {
			utility := objectiveUtility(utilities, id)
			contributionValue := utility * weights[id]
			entry.Utility = &utility
			entry.Contribution = &contributionValue
		}
		status[id] = entry
	}
	return status
}

func configuredOptimizationPriorities(objectives []OptimizationObjective) map[string]float64 {
	priorities := make(map[string]float64, len(optimizationObjectiveIDs))
	for _, id := range optimizationObjectiveIDs {
		priorities[id] = 0
	}
	for _, objective := range objectives {
		priorities[objective.ID] = objective.Weight
	}
	return priorities
}

// LegacyOptimizationObjectiveScore preserves the pre-Concept-1 raw score for
// compatibility fields and migrations. It is not a user-facing recommendation score.
func LegacyOptimizationObjectiveScore(stats NetworkOptimizationStats, config OptimizationConfig) float64 {
	score := 0.0
	for _, objective := range config.Objectives {
		value := 0.0
		switch objective.ID {
		case "demand":
			value = stats.DemandScore
		case "residential":
			value = stats.ResidentialScore
		case "coverage":
			value = stats.CoverageScore
		case "overlap":
			value = -stats.OverlapPenalty
		}
		score += objective.Weight * value
	}
	return score
}

func OptimizationConstraintViolations(stats NetworkOptimizationStats, constraints OptimizationConstraints) []string {
	violations := []string{}
	if constraints.MinCoverageScore != nil && stats.CoverageScore < *constraints.MinCoverageScore {
		violations = append(violations, fmt.Sprintf("propagation reach score %.1f is below %.1f", stats.CoverageScore, *constraints.MinCoverageScore))
	}
	if constraints.MinUniqueDemandBuildings != nil && stats.UniqueDemandBuildings < *constraints.MinUniqueDemandBuildings {
		violations = append(violations, fmt.Sprintf("%d demand buildings is below %d", stats.UniqueDemandBuildings, *constraints.MinUniqueDemandBuildings))
	}
	if constraints.MinUniqueResidentialBuildings != nil && stats.UniqueResidentialBuildings < *constraints.MinUniqueResidentialBuildings {
		violations = append(violations, fmt.Sprintf("%d residential buildings is below %d", stats.UniqueResidentialBuildings, *constraints.MinUniqueResidentialBuildings))
	}
	if constraints.MaxOverlapBuildings != nil && stats.OverlapBuildings > *constraints.MaxOverlapBuildings {
		violations = append(violations, fmt.Sprintf("%d overlap buildings exceeds %d", stats.OverlapBuildings, *constraints.MaxOverlapBuildings))
	}
	return violations
}

func networkParetoFrontier(candidates []networkOptimizationCandidate, towers []NetworkTowerRequest, config OptimizationConfig, availability ...map[string]OptimizationObjectiveAvailability) []NetworkParetoSolution {
	deduplicated := make([]networkOptimizationCandidate, 0, len(candidates))
	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		if len(OptimizationConstraintViolations(candidate.Stats, config.Constraints)) > 0 {
			continue
		}
		key := azimuthKey(candidate.Azimuths)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		deduplicated = append(deduplicated, candidate)
	}

	type scoredCandidate struct {
		candidate networkOptimizationCandidate
		stats     NetworkOptimizationStats
	}
	scored := make([]scoredCandidate, 0, len(deduplicated))
	for _, candidate := range deduplicated {
		stats, err := scoreNetworkOptimization(candidate.Stats, config, availability...)
		if err != nil {
			continue
		}
		scored = append(scored, scoredCandidate{candidate: candidate, stats: stats})
	}

	frontier := make([]NetworkParetoSolution, 0, len(scored))
	for index, candidate := range scored {
		dominated := false
		for competitorIndex, competitor := range scored {
			if index != competitorIndex && optimizationDominates(competitor.stats, candidate.stats) {
				dominated = true
				break
			}
		}
		if dominated {
			continue
		}
		settings := make([]ParetoTowerSetting, 0, len(towers))
		for towerIndex, tower := range towers {
			if towerIndex < len(candidate.candidate.Azimuths) {
				settings = append(settings, ParetoTowerSetting{ID: tower.ID, AzimuthDeg: normalizeDegrees(candidate.candidate.Azimuths[towerIndex])})
			}
		}
		solution := NetworkParetoSolution{
			ID:             azimuthKey(candidate.candidate.Azimuths),
			Towers:         settings,
			Stats:          candidate.stats.rounded(),
			ObjectiveScore: math.Round(LegacyOptimizationObjectiveScore(candidate.stats, config)*10) / 10,
			CompositeScore: roundFloat(candidate.stats.CompositeScore, 6),
			Score:          roundFloat(candidate.stats.Score, 4),
			Explanation:    "Feasible non-dominated solution: no evaluated feasible azimuth set improves every normalized objective and strictly improves at least one.",
		}
		frontier = append(frontier, solution)
	}
	sort.SliceStable(frontier, func(i, j int) bool {
		if frontier[i].Score == frontier[j].Score {
			return paretoTowerKey(frontier[i]) < paretoTowerKey(frontier[j])
		}
		return frontier[i].Score > frontier[j].Score
	})
	if len(frontier) > 25 {
		frontier = frontier[:25]
	}
	if frontier == nil {
		frontier = []NetworkParetoSolution{}
	}
	return frontier
}

func optimizationDominates(left, right NetworkOptimizationStats, selectedObjectives ...[]OptimizationObjective) bool {
	leftUtilities := NormalizeOptimizationObjectives(left)
	rightUtilities := NormalizeOptimizationObjectives(right)
	leftAvailability := optimizationAvailabilityForStats(left)
	rightAvailability := optimizationAvailabilityForStats(right)
	betterOrEqual, strictlyBetter := true, false
	objectiveIDs := optimizationObjectiveIDs
	if len(selectedObjectives) > 0 && len(selectedObjectives[0]) > 0 {
		objectiveIDs = make([]string, 0, len(selectedObjectives[0]))
		for _, objective := range selectedObjectives[0] {
			objectiveIDs = append(objectiveIDs, objective.ID)
		}
	}
	for _, id := range objectiveIDs {
		if !leftAvailability[id].Available || !rightAvailability[id].Available {
			continue
		}
		leftValue := objectiveUtility(leftUtilities, id)
		rightValue := objectiveUtility(rightUtilities, id)
		if leftValue < rightValue {
			betterOrEqual = false
			break
		}
		if leftValue > rightValue {
			strictlyBetter = true
		}
	}
	return betterOrEqual && strictlyBetter
}

func objectiveUtility(utilities OptimizationUtilities, id string) float64 {
	switch id {
	case "demand":
		return utilities.Demand
	case "residential":
		return utilities.Residential
	case "coverage":
		return utilities.Coverage
	case "overlap":
		return utilities.Overlap
	default:
		return 0
	}
}

func paretoTowerKey(solution NetworkParetoSolution) string {
	parts := make([]string, 0, len(solution.Towers))
	for _, tower := range solution.Towers {
		parts = append(parts, fmt.Sprintf("%s:%.1f", tower.ID, tower.AzimuthDeg))
	}
	return strings.Join(parts, ",")
}

func azimuthKey(azimuths []float64) string {
	parts := make([]string, len(azimuths))
	for index, value := range azimuths {
		parts[index] = fmt.Sprintf("%.1f", normalizeDegrees(value))
	}
	return strings.Join(parts, ",")
}

func ratio01(numerator float64, denominator float64) float64 {
	if denominator <= 0 || math.IsNaN(numerator) || math.IsInf(numerator, 0) {
		return 0
	}
	return clamp01(numerator / denominator)
}

func clamp01(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Max(0, math.Min(1, value))
}

func roundFloat(value float64, digits int) float64 {
	power := math.Pow10(digits)
	return math.Round(value*power) / power
}
