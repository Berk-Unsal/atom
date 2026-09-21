package raytracer

import (
	"fmt"
	"math"
	"sort"
	"strings"
)

func canonicalRFResultCoordinate(result CanonicalRFValidationObservationResult) (Point, bool) {
	if result.Lat == nil || result.Lon == nil || !finiteCoordinate(*result.Lon, *result.Lat) {
		return Point{}, false
	}
	return Point{Lon: *result.Lon, Lat: *result.Lat}, true
}

func canonicalRFSpatialCell(result CanonicalRFValidationObservationResult, cellSizeM float64) string {
	point, ok := canonicalRFResultCoordinate(result)
	if !ok {
		return "missing-coordinate|" + result.SiteID + "|" + result.CampaignID
	}
	if cellSizeM <= 0 {
		cellSizeM = CanonicalRFValidationDefaultCellM
	}
	latM := point.Lat * 111_320
	lonM := point.Lon * 111_320 * math.Cos(point.Lat*math.Pi/180)
	return fmt.Sprintf("%.0f:%.0f", math.Floor(latM/cellSizeM), math.Floor(lonM/cellSizeM))
}

func canonicalRFResultGroups(results []CanonicalRFValidationObservationResult, method string, cellSizeM float64) map[string][]CanonicalRFValidationObservationResult {
	groups := map[string][]CanonicalRFValidationObservationResult{}
	for _, result := range canonicalRFApplicableResults(results) {
		key := ""
		switch method {
		case "leave_one_site_out":
			key = result.SiteID
		case "leave_one_campaign_out":
			key = result.CampaignID
		default:
			key = canonicalRFSpatialCell(result, cellSizeM)
		}
		groups[key] = append(groups[key], result)
	}
	for key := range groups {
		sort.SliceStable(groups[key], func(i, j int) bool { return groups[key][i].ObservationID < groups[key][j].ObservationID })
	}
	return groups
}

func canonicalRFGroupKeys(groups map[string][]CanonicalRFValidationObservationResult) []string {
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func canonicalRFSeparatedFromValidation(candidate CanonicalRFValidationObservationResult, validation []CanonicalRFValidationObservationResult, minimumSeparationM float64) bool {
	if minimumSeparationM <= 0 {
		return true
	}
	candidatePoint, candidateOK := canonicalRFResultCoordinate(candidate)
	if !candidateOK {
		return false
	}
	for _, validationResult := range validation {
		validationPoint, validationOK := canonicalRFResultCoordinate(validationResult)
		if !validationOK || ApproxDistanceMeters(candidatePoint, validationPoint) < minimumSeparationM {
			return false
		}
	}
	return true
}

func canonicalRFSortedResultIDs(results []CanonicalRFValidationObservationResult) []string {
	ids := make([]string, 0, len(results))
	for _, result := range results {
		ids = append(ids, result.ObservationID)
	}
	sort.Strings(ids)
	return ids
}

func canonicalRFUniqueSorted(values []string) []string {
	seen := map[string]struct{}{}
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			seen[value] = struct{}{}
		}
	}
	result := make([]string, 0, len(seen))
	for value := range seen {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

// CanonicalRFBuildHoldout builds deterministic spatial/site/campaign folds.
// Spatial folds exclude calibration rows inside the requested separation
// radius, so the no-leak claim is stronger than a random row split.
func CanonicalRFBuildHoldout(results []CanonicalRFValidationObservationResult, strategy CanonicalRFValidationStrategy) *CanonicalRFHoldoutResult {
	method := strings.ToLower(strings.TrimSpace(strategy.Method))
	if method == "" {
		method = "spatial_blocks"
	}
	if method != "spatial_blocks" && method != "leave_one_site_out" && method != "leave_one_campaign_out" {
		method = "spatial_blocks"
	}
	cellSize := strategy.SpatialCellSizeM
	if cellSize <= 0 {
		cellSize = CanonicalRFValidationDefaultCellM
	}
	separation := strategy.MinimumSeparationM
	if separation < 0 {
		separation = CanonicalRFValidationDefaultSeparationM
	}
	groups := canonicalRFResultGroups(results, method, cellSize)
	keys := canonicalRFGroupKeys(groups)
	holdout := &CanonicalRFHoldoutResult{Method: method, Primary: strategy.PrimaryHoldout || method == "spatial_blocks", SpatialCellSizeM: cellSize, MinimumSeparationM: separation}
	if method != "spatial_blocks" {
		holdout.SpatialCellSizeM = 0
	}
	for foldIndex, key := range keys {
		validation := groups[key]
		calibration := make([]CanonicalRFValidationObservationResult, 0)
		for otherKey, otherResults := range groups {
			if otherKey == key {
				continue
			}
			for _, candidate := range otherResults {
				if canonicalRFSeparatedFromValidation(candidate, validation, separation) {
					calibration = append(calibration, candidate)
				}
			}
		}
		sort.SliceStable(calibration, func(i, j int) bool { return calibration[i].ObservationID < calibration[j].ObservationID })
		calibrationSites, validationSites := make([]string, 0), make([]string, 0)
		calibrationCampaigns, validationCampaigns := make([]string, 0), make([]string, 0)
		for _, value := range calibration {
			calibrationSites = append(calibrationSites, value.SiteID)
			calibrationCampaigns = append(calibrationCampaigns, value.CampaignID)
		}
		for _, value := range validation {
			validationSites = append(validationSites, value.SiteID)
			validationCampaigns = append(validationCampaigns, value.CampaignID)
		}
		fold := CanonicalRFHoldoutFold{
			FoldID: fmt.Sprintf("fold-%03d-%s", foldIndex+1, key), Method: method,
			CalibrationIDs: canonicalRFSortedResultIDs(calibration), ValidationIDs: canonicalRFSortedResultIDs(validation),
			CalibrationSites: canonicalRFUniqueSorted(calibrationSites), ValidationSites: canonicalRFUniqueSorted(validationSites),
			CalibrationCampaigns: canonicalRFUniqueSorted(calibrationCampaigns), ValidationCampaigns: canonicalRFUniqueSorted(validationCampaigns),
			CalibrationCount: len(calibration), ValidationCount: len(validation), MinimumSeparationM: separation,
			NoLeakEvidence: fmt.Sprintf("deterministic %s groups are disjoint; calibration observations within %.1f m of validation observations are excluded; no random row split is used", method, separation),
		}
		holdout.Folds = append(holdout.Folds, fold)
	}
	if len(holdout.Folds) == 0 {
		holdout.Notes = append(holdout.Notes, "No applicable observations were available for a holdout fold.")
	}
	return holdout
}

func canonicalRFResultByID(results []CanonicalRFValidationObservationResult) map[string]CanonicalRFValidationObservationResult {
	byID := make(map[string]CanonicalRFValidationObservationResult, len(results))
	for _, result := range results {
		byID[result.ObservationID] = result
	}
	return byID
}

func canonicalRFResidualsForIDs(byID map[string]CanonicalRFValidationObservationResult, ids []string, quantity string, frequency float64) []float64 {
	residuals := make([]float64, 0, len(ids))
	for _, id := range ids {
		result, ok := byID[id]
		if !ok || result.Quantity != quantity || result.ResidualDB == nil || !canonicalRFFrequencyEqual(result.FrequencyGHz, frequency) {
			continue
		}
		residuals = append(residuals, *result.ResidualDB)
	}
	return residuals
}

func canonicalRFQuantityFrequencyKeys(results []CanonicalRFValidationObservationResult) []string {
	keys := map[string]struct{}{}
	for _, result := range canonicalRFApplicableResults(results) {
		keys[fmt.Sprintf("%s|%.9f", result.Quantity, result.FrequencyGHz)] = struct{}{}
	}
	ordered := make([]string, 0, len(keys))
	for key := range keys {
		ordered = append(ordered, key)
	}
	sort.Strings(ordered)
	return ordered
}

func canonicalRFParseQuantityFrequencyKey(key string) (string, float64, bool) {
	parts := strings.Split(key, "|")
	if len(parts) != 2 {
		return "", 0, false
	}
	var frequency float64
	if _, err := fmt.Sscanf(parts[1], "%f", &frequency); err != nil {
		return "", 0, false
	}
	return parts[0], frequency, true
}

func canonicalRFMean(values []float64) (float64, bool) {
	if len(values) == 0 {
		return 0, false
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values)), true
}

// CanonicalRFCalibrate reports a frequency-specific constant-bias diagnostic.
// It never applies the bias to the evaluator and never sets Promoted=true.
func CanonicalRFCalibrate(results []CanonicalRFValidationObservationResult, holdout CanonicalRFHoldoutResult) *CanonicalRFCalibrationResult {
	byID := canonicalRFResultByID(results)
	calibration := &CanonicalRFCalibrationResult{
		Policy:            "constant_bias_from_calibration_groups_applied_only_to_heldout_diagnostics",
		FrequencySpecific: true, LOSStratified: false, Promoted: false,
	}
	keys := canonicalRFQuantityFrequencyKeys(results)
	allStable := true
	validFoldCount := 0
	biasesByKey := map[string][]float64{}
	for _, fold := range holdout.Folds {
		for _, key := range keys {
			quantity, frequency, ok := canonicalRFParseQuantityFrequencyKey(key)
			if !ok {
				continue
			}
			calibrationResiduals := canonicalRFResidualsForIDs(byID, fold.CalibrationIDs, quantity, frequency)
			validationResiduals := canonicalRFResidualsForIDs(byID, fold.ValidationIDs, quantity, frequency)
			bias, hasBias := canonicalRFMean(calibrationResiduals)
			if !hasBias || len(validationResiduals) == 0 {
				continue
			}
			validFoldCount++
			baselineMetric := canonicalRFMetric(validationResiduals, 0)
			correctedMetric := canonicalRFMetric(validationResiduals, bias)
			stable := len(calibrationResiduals) >= CanonicalRFValidationMinimumGroupN && len(validationResiduals) >= CanonicalRFValidationMinimumGroupN
			// A constant bias is only a candidate when the held-out residual
			// structure is materially reduced. This conservative diagnostic
			// gate catches distance trends and LOS/NLOS differentials without
			// fitting a second model.
			if correctedMetric.RMSEDB != nil && *correctedMetric.RMSEDB > 1.0 {
				stable = false
			}
			if !stable {
				allStable = false
			}
			biasesByKey[key] = append(biasesByKey[key], bias)
			calibration.Folds = append(calibration.Folds, CanonicalRFCalibrationFold{
				FoldID: fold.FoldID, Quantity: quantity, FrequencyGHz: frequency,
				CalibrationCount: len(calibrationResiduals), ValidationCount: len(validationResiduals), BiasDB: canonicalRFPointerFloat(bias),
				Baseline: baselineMetric, Corrected: correctedMetric, Stable: stable,
			})
		}
	}
	for _, biases := range biasesByKey {
		if len(biases) < 2 {
			allStable = false
			continue
		}
		minValue, maxValue := biases[0], biases[0]
		for _, bias := range biases[1:] {
			minValue, maxValue = math.Min(minValue, bias), math.Max(maxValue, bias)
		}
		if maxValue-minValue > 2 {
			allStable = false
		}
	}
	sort.SliceStable(calibration.Folds, func(i, j int) bool {
		if calibration.Folds[i].FoldID == calibration.Folds[j].FoldID {
			return calibration.Folds[i].Quantity < calibration.Folds[j].Quantity
		}
		return calibration.Folds[i].FoldID < calibration.Folds[j].FoldID
	})
	if validFoldCount == 0 {
		calibration.Status = "insufficient_validation_data"
		calibration.Notes = append(calibration.Notes, "No fold had both calibration residuals and held-out validation residuals.")
	} else if !allStable {
		calibration.Status = CanonicalRFReadinessCalibrationUnstable
		calibration.Notes = append(calibration.Notes, "Constant-bias stability is not established across independent folds; no correction is active.")
	} else {
		calibration.Status = CanonicalRFReadinessCalibrationCandidate
		calibration.Notes = append(calibration.Notes, "Bias is a frequency-specific diagnostic candidate only; LOS/NLOS-specific calibration and production promotion are disabled in Concept 6A.")
	}
	return calibration
}
