package raytracer

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

type networkOptimizationCandidate struct {
	Azimuths []float64
	Stats    NetworkOptimizationStats
}

func DefaultOptimizationConfig() OptimizationConfig {
	return OptimizationConfig{Objectives: []OptimizationObjective{
		{ID: "demand", Weight: 1},
		{ID: "residential", Weight: 1},
		{ID: "coverage", Weight: 1},
		{ID: "overlap", Weight: 1},
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
	for _, objective := range config.Objectives {
		if !oneOf(objective.ID, "demand", "residential", "coverage", "overlap") {
			return "optimization objective id must be demand, residential, coverage, or overlap"
		}
		if _, exists := seen[objective.ID]; exists {
			return "optimization objective ids must be unique"
		}
		seen[objective.ID] = struct{}{}
		if math.IsNaN(objective.Weight) || math.IsInf(objective.Weight, 0) || objective.Weight <= 0 || objective.Weight > 100 {
			return "optimization objective weights must be greater than 0 and no more than 100"
		}
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

func OptimizationObjectiveScore(stats NetworkOptimizationStats, config OptimizationConfig) float64 {
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
		violations = append(violations, fmt.Sprintf("coverage score %.1f is below %.1f", stats.CoverageScore, *constraints.MinCoverageScore))
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

func networkParetoFrontier(candidates []networkOptimizationCandidate, towers []NetworkTowerRequest, config OptimizationConfig) []NetworkParetoSolution {
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
	frontier := make([]NetworkParetoSolution, 0)
	for index, candidate := range deduplicated {
		dominated := false
		for competitorIndex, competitor := range deduplicated {
			if index != competitorIndex && optimizationDominates(competitor.Stats, candidate.Stats, config.Objectives) {
				dominated = true
				break
			}
		}
		if dominated {
			continue
		}
		settings := make([]ParetoTowerSetting, 0, len(towers))
		for towerIndex, tower := range towers {
			if towerIndex < len(candidate.Azimuths) {
				settings = append(settings, ParetoTowerSetting{ID: tower.ID, AzimuthDeg: normalizeDegrees(candidate.Azimuths[towerIndex])})
			}
		}
		frontier = append(frontier, NetworkParetoSolution{
			Towers: settings, Stats: candidate.Stats.rounded(),
			ObjectiveScore: math.Round(OptimizationObjectiveScore(candidate.Stats, config)*10) / 10,
			Explanation:    "Non-dominated: no feasible evaluated azimuth set improves every selected objective and strictly improves at least one.",
		})
	}
	sort.SliceStable(frontier, func(i, j int) bool { return frontier[i].ObjectiveScore > frontier[j].ObjectiveScore })
	if len(frontier) > 25 {
		frontier = frontier[:25]
	}
	if frontier == nil {
		frontier = []NetworkParetoSolution{}
	}
	return frontier
}

func optimizationDominates(left, right NetworkOptimizationStats, objectives []OptimizationObjective) bool {
	betterOrEqual, strictlyBetter := true, false
	for _, objective := range objectives {
		leftValue, rightValue := objectiveValue(left, objective.ID), objectiveValue(right, objective.ID)
		if objective.ID == "overlap" {
			if leftValue > rightValue {
				betterOrEqual = false
			}
			if leftValue < rightValue {
				strictlyBetter = true
			}
		} else {
			if leftValue < rightValue {
				betterOrEqual = false
			}
			if leftValue > rightValue {
				strictlyBetter = true
			}
		}
	}
	return betterOrEqual && strictlyBetter
}

func objectiveValue(stats NetworkOptimizationStats, id string) float64 {
	switch id {
	case "demand":
		return stats.DemandScore
	case "residential":
		return stats.ResidentialScore
	case "coverage":
		return stats.CoverageScore
	case "overlap":
		return float64(stats.OverlapBuildings)
	default:
		return 0
	}
}

func azimuthKey(azimuths []float64) string {
	parts := make([]string, len(azimuths))
	for index, value := range azimuths {
		parts[index] = fmt.Sprintf("%.1f", normalizeDegrees(value))
	}
	return strings.Join(parts, ",")
}
