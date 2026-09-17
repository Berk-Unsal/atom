package raytracer

import (
	"context"
	"math"
	"sort"
)

const (
	HeightAwareLOSClassifierID          = "footprint-height-los-v1"
	HeightAwareLOSClassifierDescription = "deterministic geometric Tx-to-Rx centerline visibility with explicit building-height provenance"
	TerrainStatusAvailable              = "terrain_available"
	TerrainStatusUnavailable            = "terrain_unavailable"

	losHeightGeometryEpsilonM = 1e-6
	pathParameterEpsilon      = 1e-9
)

const (
	LOSClassificationNoFootprint               = "no_footprint_intersection"
	LOSClassificationKnownRoofObstruction      = "known_height_obstruction"
	LOSClassificationKnownRoofsCleared         = "known_height_roofs_cleared"
	LOSClassificationUnknownHeightConservative = "conservative_2d_unknown_height"
	LOSClassificationKnownAndUnknown           = "known_obstruction_with_unknown_height_conservative"
	LOSClassificationBuildingDataUnavailable   = "building_data_unavailable"
	LOSClassificationIndoorTransmitter         = "transmitter_inside_building"
	LOSClassificationIndoorReceiver            = "receiver_inside_building"
)

// LOSBuildingInterval records the horizontal path interval occupied by one
// footprint and the vertical comparison used by the height-aware classifier.
// The interval parameters are fractions of the complete Tx-to-Rx path.
type LOSBuildingInterval struct {
	TEntry            float64 `json:"t_entry"`
	TExit             float64 `json:"t_exit"`
	LOSHeightAtEntryM float64 `json:"los_height_at_entry_m"`
	LOSHeightAtExitM  float64 `json:"los_height_at_exit_m"`
	MinimumLOSHeightM float64 `json:"minimum_los_height_m"`
	MaximumLOSHeightM float64 `json:"maximum_los_height_m"`
	RoofHeightM       float64 `json:"roof_height_m"`
	MinimumClearanceM float64 `json:"minimum_clearance_m"`
}

// LOSBuildingEvidence is deliberately diagnostic rather than a propagation
// loss term. It makes the classifier basis inspectable without adding
// diffraction, Fresnel margins, or material physics.
type LOSBuildingEvidence struct {
	BuildingID        string                `json:"building_id"`
	LogicalBuildingID string                `json:"logical_building_id,omitempty"`
	PartIDs           []string              `json:"part_ids,omitempty"`
	HeightM           float64               `json:"height_m,omitempty"`
	HeightSource      string                `json:"height_source"`
	HeightTag         string                `json:"height_tag,omitempty"`
	Intervals         []LOSBuildingInterval `json:"intervals,omitempty"`
}

type LOSClassification struct {
	State                  PropagationLOSState     `json:"state"`
	ClassifierID           string                  `json:"classifier_id"`
	ClassifierDescription  string                  `json:"classifier_description"`
	TerrainStatus          string                  `json:"terrain_status"`
	ClassificationBasis    string                  `json:"classification_basis"`
	EndpointCase           PropagationEndpointCase `json:"endpoint_case"`
	BlockingBuildings      []LOSBuildingEvidence   `json:"blocking_buildings,omitempty"`
	ClearedBuildings       []LOSBuildingEvidence   `json:"cleared_buildings,omitempty"`
	UnknownHeightBuildings []LOSBuildingEvidence   `json:"unknown_height_buildings,omitempty"`
}

type HeightEvidenceAudit struct {
	TotalFootprints          int     `json:"total_footprints"`
	ExplicitHeightCount      int     `json:"explicit_height_count"`
	ExplicitHeightPct        float64 `json:"explicit_height_pct"`
	LevelsDerivedHeightCount int     `json:"levels_derived_height_count"`
	LevelsDerivedHeightPct   float64 `json:"levels_derived_height_pct"`
	FallbackOnlyCount        int     `json:"fallback_only_count"`
	FallbackOnlyPct          float64 `json:"fallback_only_pct"`
	UnavailableHeightCount   int     `json:"unavailable_height_count"`
	UnavailableHeightPct     float64 `json:"unavailable_height_pct"`
}

func AuditBuildingHeightEvidence(buildings *BuildingIndex) HeightEvidenceAudit {
	if buildings == nil {
		return HeightEvidenceAudit{}
	}
	return AuditBuildingHeightEvidenceForFootprints(buildings.Footprints())
}

func AuditBuildingHeightEvidenceForFootprints(footprints []*BuildingFootprint) HeightEvidenceAudit {
	audit := HeightEvidenceAudit{TotalFootprints: len(footprints)}
	for _, building := range footprints {
		_, source, _, ok := heightEvidenceForBuilding(building)
		if ok && source == HeightEvidenceObservedTag {
			audit.ExplicitHeightCount++
			continue
		}
		if ok && source == HeightEvidenceFromLevels {
			audit.LevelsDerivedHeightCount++
			continue
		}
		if building != nil && building.HeightSource == HeightSourceFallbackLegacy {
			audit.FallbackOnlyCount++
		} else {
			audit.UnavailableHeightCount++
		}
	}
	if audit.TotalFootprints > 0 {
		total := float64(audit.TotalFootprints)
		audit.ExplicitHeightPct = roundFloat(float64(audit.ExplicitHeightCount)/total*100, 2)
		audit.LevelsDerivedHeightPct = roundFloat(float64(audit.LevelsDerivedHeightCount)/total*100, 2)
		audit.FallbackOnlyPct = roundFloat(float64(audit.FallbackOnlyCount)/total*100, 2)
		audit.UnavailableHeightPct = roundFloat(float64(audit.UnavailableHeightCount)/total*100, 2)
	}
	return audit
}

type propagationPathGeometryOptions struct {
	ExcludedBuildingIDs        map[string]struct{}
	ExcludedLogicalBuildingIDs map[string]struct{}
	Terrain                    TerrainModel
	TxHeightM                  float64
	RxHeightM                  float64
}

type buildingPathEvidence struct {
	building        *BuildingFootprint
	logicalBuilding string
	partIDs         []string
	intervals       []LOSBuildingInterval
}

func logicalBuildingID(building *BuildingFootprint) string {
	if building == nil {
		return ""
	}
	if building.LogicalID != "" {
		return building.LogicalID
	}
	return building.ID
}

func heightEvidenceForBuilding(building *BuildingFootprint) (float64, string, string, bool) {
	if building == nil {
		return 0, HeightEvidenceUnavailable, "", false
	}
	if building.HeightEvidenceSource == HeightEvidenceObservedTag || building.HeightEvidenceSource == HeightEvidenceFromLevels {
		height := building.HeightEvidenceMeters
		if height > 0 && !math.IsNaN(height) && !math.IsInf(height, 0) {
			return height, building.HeightEvidenceSource, building.HeightEvidenceTag, true
		}
		return 0, HeightEvidenceUnavailable, building.HeightEvidenceTag, false
	}
	// Synthetic fixtures and older in-memory callers may populate only the
	// pre-4F.1 source field. Preserve those explicit semantics without
	// promoting the generic fallback into roof evidence.
	switch building.HeightSource {
	case HeightSourceExplicitLegacy:
		if building.HeightMeters > 0 {
			return building.HeightMeters, HeightEvidenceObservedTag, "height", true
		}
	case HeightSourceLevelsLegacy:
		if building.HeightMeters > 0 {
			return building.HeightMeters, HeightEvidenceFromLevels, "building:levels", true
		}
	}
	return 0, HeightEvidenceUnavailable, "", false
}

func heightSourceForBuilding(building *BuildingFootprint) string {
	_, source, _, ok := heightEvidenceForBuilding(building)
	if !ok {
		return HeightEvidenceUnavailable
	}
	return source
}

func terrainStatusForModel(terrain TerrainModel) string {
	if terrain != nil && terrain.Metadata().Available {
		return TerrainStatusAvailable
	}
	return TerrainStatusUnavailable
}

func terrainStatusForProfile(profile CellRFProfile) string {
	if classifierIDForProfile(profile) == HeightAwareLOSClassifierID {
		return TerrainStatusUnavailable
	}
	return ""
}

func classifierIDForProfile(profile CellRFProfile) string {
	if profile.PropagationModelID == UrbanShortRangePropagationID {
		return HeightAwareLOSClassifierID
	}
	return ""
}

func (geometry propagationPathGeometry) lineHeightAt(t float64) float64 {
	t = math.Max(0, math.Min(1, t))
	return geometry.txHeightM + (geometry.rxHeightM-geometry.txHeightM)*t
}

func (geometry propagationPathGeometry) classify2D(point Point, distanceM float64) (PropagationLOSState, PropagationEndpointCase, int) {
	if !geometry.available || geometry.buildings == nil {
		return PropagationLOSState(PropagationLOSUnknown), PropagationEndpointCase(PropagationEndpointUnknown), 0
	}
	if geometry.txInside {
		return PropagationLOSState(PropagationLOSUnknown), PropagationEndpointCase(PropagationEndpointIndoorTx), 0
	}
	if building := geometry.buildings.BuildingAt(point); building != nil && !pointOnPolygonBoundary(point, building.Vertices) {
		return PropagationLOSState(PropagationLOSUnknown), PropagationEndpointCase(PropagationEndpointIndoorRx), countPropagationWallEvents(geometry.intersections, distanceM)
	}
	wallEvents := countPropagationWallEvents(geometry.intersections, distanceM)
	if wallEvents > 0 {
		return PropagationLOSState(PropagationNLOS), PropagationEndpointCase(PropagationEndpointOutdoorO2O), wallEvents
	}
	return PropagationLOSState(PropagationLOS), PropagationEndpointCase(PropagationEndpointOutdoorO2O), 0
}

func (geometry propagationPathGeometry) classifyHeightAware(point Point, distanceM float64) LOSClassification {
	classification := LOSClassification{
		State:                 PropagationLOSState(PropagationLOS),
		ClassifierID:          HeightAwareLOSClassifierID,
		ClassifierDescription: HeightAwareLOSClassifierDescription,
		TerrainStatus:         geometry.terrainStatus,
		ClassificationBasis:   LOSClassificationNoFootprint,
		EndpointCase:          PropagationEndpointCase(PropagationEndpointOutdoorO2O),
	}
	if !geometry.available || geometry.buildings == nil {
		classification.State = PropagationLOSState(PropagationLOSUnknown)
		classification.ClassificationBasis = LOSClassificationBuildingDataUnavailable
		classification.EndpointCase = PropagationEndpointCase(PropagationEndpointUnknown)
		return classification
	}
	if geometry.txInside {
		classification.State = PropagationLOSState(PropagationLOSUnknown)
		classification.ClassificationBasis = LOSClassificationIndoorTransmitter
		classification.EndpointCase = PropagationEndpointCase(PropagationEndpointIndoorTx)
		return classification
	}
	if building := geometry.endpointBuilding(point); building != nil {
		classification.State = PropagationLOSState(PropagationLOSUnknown)
		classification.ClassificationBasis = LOSClassificationIndoorReceiver
		classification.EndpointCase = PropagationEndpointCase(PropagationEndpointIndoorRx)
		return classification
	}

	currentT := 1.0
	if geometry.totalDistanceM > 0 {
		currentT = math.Max(0, math.Min(1, distanceM/geometry.totalDistanceM))
	}
	knownBlocker := false
	unknownHeight := false
	seenFootprint := false
	for _, evidence := range geometry.heightEvidence {
		intervals := intervalsReachedBy(evidence.intervals, currentT)
		if len(intervals) == 0 {
			continue
		}
		seenFootprint = true
		height, source, tag, hasEvidence := heightEvidenceForBuilding(evidence.building)
		diagnostic := LOSBuildingEvidence{
			BuildingID: evidence.logicalBuilding, LogicalBuildingID: evidence.logicalBuilding,
			PartIDs: append([]string(nil), evidence.partIDs...), HeightSource: source, HeightTag: tag, Intervals: intervals,
		}
		if !hasEvidence {
			unknownHeight = true
			classification.UnknownHeightBuildings = append(classification.UnknownHeightBuildings, diagnostic)
			continue
		}
		diagnostic.HeightM = height
		blocks := false
		for index := range diagnostic.Intervals {
			interval := &diagnostic.Intervals[index]
			interval.LOSHeightAtEntryM = geometry.lineHeightAt(interval.TEntry)
			interval.LOSHeightAtExitM = geometry.lineHeightAt(interval.TExit)
			interval.MinimumLOSHeightM = math.Min(interval.LOSHeightAtEntryM, interval.LOSHeightAtExitM)
			interval.MaximumLOSHeightM = math.Max(interval.LOSHeightAtEntryM, interval.LOSHeightAtExitM)
			interval.RoofHeightM = height
			interval.MinimumClearanceM = interval.MinimumLOSHeightM - height
			if interval.MinimumClearanceM <= losHeightGeometryEpsilonM {
				blocks = true
			}
		}
		if blocks {
			knownBlocker = true
			classification.BlockingBuildings = append(classification.BlockingBuildings, diagnostic)
		} else {
			classification.ClearedBuildings = append(classification.ClearedBuildings, diagnostic)
		}
	}

	switch {
	case knownBlocker && unknownHeight:
		classification.State = PropagationLOSState(PropagationNLOS)
		classification.ClassificationBasis = LOSClassificationKnownAndUnknown
	case knownBlocker:
		classification.State = PropagationLOSState(PropagationNLOS)
		classification.ClassificationBasis = LOSClassificationKnownRoofObstruction
	case unknownHeight:
		classification.State = PropagationLOSState(PropagationNLOS)
		classification.ClassificationBasis = LOSClassificationUnknownHeightConservative
	case seenFootprint:
		classification.State = PropagationLOSState(PropagationLOS)
		classification.ClassificationBasis = LOSClassificationKnownRoofsCleared
	}
	return classification
}

func classifyPropagationPath(profile CellRFProfile, geometry propagationPathGeometry, point Point, distanceM float64) (PropagationLOSState, PropagationEndpointCase, int, *LOSClassification) {
	legacyState, legacyEndpoint, wallEvents := geometry.classify2D(point, distanceM)
	if profile.PropagationModelID != UrbanShortRangePropagationID {
		return legacyState, legacyEndpoint, wallEvents, nil
	}
	classification := geometry.classifyHeightAware(point, distanceM)
	return classification.State, classification.EndpointCase, wallEvents, &classification
}

func (geometry propagationPathGeometry) endpointBuilding(point Point) *BuildingFootprint {
	if geometry.buildings == nil {
		return nil
	}
	var selected *BuildingFootprint
	for _, building := range geometry.buildings.SearchBounds(BoundsAroundPoint(point, 0.5)) {
		if building == nil || geometry.isExcludedBuilding(building) || pointOnPolygonBoundary(point, building.Vertices) || !PointInPolygon(point, building.Vertices) {
			continue
		}
		if selected == nil || building.HeightMeters > selected.HeightMeters || building.ID < selected.ID {
			selected = building
		}
	}
	return selected
}

func (geometry propagationPathGeometry) isExcludedBuilding(building *BuildingFootprint) bool {
	if building == nil {
		return false
	}
	if _, excluded := geometry.excludedBuildingIDs[building.ID]; excluded {
		return true
	}
	_, excluded := geometry.excludedLogicalBuildingIDs[logicalBuildingID(building)]
	return excluded
}

func intervalsReachedBy(intervals []LOSBuildingInterval, currentT float64) []LOSBuildingInterval {
	result := make([]LOSBuildingInterval, 0, len(intervals))
	for _, interval := range intervals {
		if interval.TEntry > currentT+pathParameterEpsilon {
			continue
		}
		interval.TExit = math.Min(interval.TExit, currentT)
		if interval.TExit+pathParameterEpsilon < interval.TEntry {
			continue
		}
		result = append(result, interval)
	}
	return result
}

func buildingPathIntervalsContext(ctx context.Context, start, end Point, polygon []Point) ([]LOSBuildingInterval, error) {
	if len(polygon) < 3 {
		return nil, nil
	}
	totalDistance := ApproxDistanceMeters(start, end)
	if totalDistance <= 0 {
		return nil, nil
	}
	points, err := segmentPolygonIntersectionsContext(ctx, start, end, polygon)
	if err != nil {
		return nil, err
	}
	parameters := []float64{0, 1}
	for _, point := range points {
		parameters = appendUniqueParameter(parameters, ApproxDistanceMeters(start, point)/totalDistance)
	}
	// SegmentIntersectionPoint intentionally ignores collinear edge pairs. Add
	// polygon vertices that lie on the path so a path grazing or following a
	// footprint edge still receives deterministic interval evidence.
	for _, vertex := range polygon {
		if pointToSegmentDistanceMeters(vertex, start, end) <= 0.01 {
			parameters = appendUniqueParameter(parameters, ApproxDistanceMeters(start, vertex)/totalDistance)
		}
	}
	sort.Float64s(parameters)
	intervals := make([]LOSBuildingInterval, 0, len(parameters))
	for index := 0; index+1 < len(parameters); index++ {
		entry, exit := parameters[index], parameters[index+1]
		if exit-entry <= pathParameterEpsilon {
			continue
		}
		midpoint := interpolateSegmentPoint(start, end, (entry+exit)/2)
		if PointInPolygon(midpoint, polygon) || pointOnPolygonBoundaryWithin(midpoint, polygon, 0.01) {
			intervals = append(intervals, LOSBuildingInterval{TEntry: entry, TExit: exit})
		}
	}
	if len(intervals) == 0 {
		// A tangent/vertex contact has no interior interval but is still a
		// deterministic geometric contact. A known roof blocks only when it
		// reaches the line at that contact; an unknown roof remains conservative.
		for _, parameter := range parameters[1 : len(parameters)-1] {
			intervals = append(intervals, LOSBuildingInterval{TEntry: parameter, TExit: parameter})
		}
	}
	return mergeLOSIntervals(intervals), nil
}

func pointOnPolygonBoundaryWithin(point Point, polygon []Point, toleranceM float64) bool {
	for index, start := range polygon {
		end := polygon[(index+1)%len(polygon)]
		if pointToSegmentDistanceMeters(point, start, end) <= toleranceM {
			return true
		}
	}
	return false
}

func appendUniqueParameter(parameters []float64, candidate float64) []float64 {
	candidate = math.Max(0, math.Min(1, candidate))
	for _, existing := range parameters {
		if math.Abs(existing-candidate) <= pathParameterEpsilon {
			return parameters
		}
	}
	return append(parameters, candidate)
}

func mergeLOSIntervals(intervals []LOSBuildingInterval) []LOSBuildingInterval {
	if len(intervals) < 2 {
		return intervals
	}
	sort.SliceStable(intervals, func(i, j int) bool { return intervals[i].TEntry < intervals[j].TEntry })
	merged := make([]LOSBuildingInterval, 0, len(intervals))
	for _, interval := range intervals {
		last := len(merged) - 1
		if last >= 0 && interval.TEntry <= merged[last].TExit+pathParameterEpsilon {
			merged[last].TExit = math.Max(merged[last].TExit, interval.TExit)
			continue
		}
		merged = append(merged, interval)
	}
	return merged
}
