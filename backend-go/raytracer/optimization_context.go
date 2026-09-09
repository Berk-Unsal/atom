package raytracer

import (
	"context"
	"math"
	"sort"
)

const optimizationDomainSource = "selected_cell_radius_union"
const optimizationDomainBoundaryToleranceMeters = 0.01
const optimizationDomainQueryPaddingMeters = 2.0

// OptimizationDomainMetadata describes the fixed geographic scope used by one
// network optimization request. It intentionally omits the complete geometry.
type OptimizationDomainMetadata struct {
	Source                      string    `json:"source"`
	SelectedCellCount           int       `json:"selected_cell_count"`
	RadiusPolicy                string    `json:"radius_policy"`
	EnvelopeRadiiMeters         []float64 `json:"envelope_radii_meters,omitempty"`
	RelevantBuildingEntities    int       `json:"relevant_building_entities"`
	RelevantDemandEntities      int       `json:"relevant_demand_entities"`
	RelevantResidentialEntities int       `json:"relevant_residential_entities"`
}

type optimizationDomainEnvelope struct {
	Center       Point
	RadiusMeters float64
}

type optimizationTargetDomain struct {
	Envelopes []optimizationDomainEnvelope
}

// PreparedNetworkOptimizationContext contains all request-scoped information
// that must remain invariant while candidate azimuths are evaluated.
type PreparedNetworkOptimizationContext struct {
	Domain                       optimizationTargetDomain
	DomainMetadata               OptimizationDomainMetadata
	RelevantBuildings            map[string]*BuildingFootprint
	RelevantDemandBuildings      map[string]*BuildingFootprint
	RelevantResidentialBuildings map[string]*BuildingFootprint
	TotalRelevantDemandWeight    float64
	TotalRelevantResidential     int
	ObjectiveAvailability        map[string]OptimizationObjectiveAvailability
}

func prepareNetworkOptimizationContext(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (*PreparedNetworkOptimizationContext, error) {
	prepared := &PreparedNetworkOptimizationContext{
		Domain:                       optimizationTargetDomain{},
		RelevantBuildings:            make(map[string]*BuildingFootprint),
		RelevantDemandBuildings:      make(map[string]*BuildingFootprint),
		RelevantResidentialBuildings: make(map[string]*BuildingFootprint),
		ObjectiveAvailability:        make(map[string]OptimizationObjectiveAvailability),
	}

	for _, tower := range req.Towers {
		profile := tower.RFProfile
		if profile.SchemaVersion == 0 {
			profile = req.RFProfile
		}
		radius := profile.RadiusMeters
		if radius <= 0 || math.IsNaN(radius) || math.IsInf(radius, 0) {
			radius = req.RadiusMeters
		}
		if radius <= 0 || math.IsNaN(radius) || math.IsInf(radius, 0) {
			continue
		}
		prepared.Domain.Envelopes = append(prepared.Domain.Envelopes, optimizationDomainEnvelope{
			Center:       Point{Lon: tower.TowerLon, Lat: tower.TowerLat},
			RadiusMeters: radius,
		})
		prepared.DomainMetadata.EnvelopeRadiiMeters = append(prepared.DomainMetadata.EnvelopeRadiiMeters, roundFloat(radius, 3))
	}
	prepared.DomainMetadata = OptimizationDomainMetadata{
		Source:                      optimizationDomainSource,
		SelectedCellCount:           len(req.Towers),
		RadiusPolicy:                "cell_rf_profile_radius_m_else_request_radius_m",
		EnvelopeRadiiMeters:         prepared.DomainMetadata.EnvelopeRadiiMeters,
		RelevantBuildingEntities:    0,
		RelevantDemandEntities:      0,
		RelevantResidentialEntities: 0,
	}

	if buildings != nil {
		seen := make(map[string]struct{})
		for _, envelope := range prepared.Domain.Envelopes {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			for _, building := range buildings.SearchBounds(BoundsAroundPoint(envelope.Center, envelope.RadiusMeters+optimizationDomainQueryPaddingMeters)) {
				if building == nil || building.ID == "" {
					continue
				}
				if _, alreadySeen := seen[building.ID]; alreadySeen {
					continue
				}
				if !prepared.Domain.intersectsFootprint(building) {
					continue
				}
				seen[building.ID] = struct{}{}
				prepared.RelevantBuildings[building.ID] = building
			}
		}

		relevantIDs := make([]string, 0, len(prepared.RelevantBuildings))
		for id := range prepared.RelevantBuildings {
			relevantIDs = append(relevantIDs, id)
		}
		sort.Strings(relevantIDs)
		for _, id := range relevantIDs {
			building := prepared.RelevantBuildings[id]
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if positiveFinite(building.DemandWeight) {
				centroid, ok := PolygonCentroid(building.Vertices)
				if ok && prepared.Domain.containsPoint(centroid) {
					prepared.RelevantDemandBuildings[id] = building
					prepared.TotalRelevantDemandWeight += building.DemandWeight
				}
			}
			if positiveFinite(building.ResidentialDemand) {
				prepared.RelevantResidentialBuildings[id] = building
			}
		}
	}

	prepared.TotalRelevantResidential = len(prepared.RelevantResidentialBuildings)
	prepared.DomainMetadata.RelevantBuildingEntities = len(prepared.RelevantBuildings)
	prepared.DomainMetadata.RelevantDemandEntities = len(prepared.RelevantDemandBuildings)
	prepared.DomainMetadata.RelevantResidentialEntities = prepared.TotalRelevantResidential
	prepared.ObjectiveAvailability = map[string]OptimizationObjectiveAvailability{
		"demand": {
			Available: prepared.TotalRelevantDemandWeight > 0,
			Reason:    objectiveAvailabilityReason(prepared.TotalRelevantDemandWeight > 0, "no_relevant_entities"),
		},
		"residential": {
			Available: prepared.TotalRelevantResidential > 0,
			Reason:    objectiveAvailabilityReason(prepared.TotalRelevantResidential > 0, "no_relevant_entities"),
		},
		"coverage": {
			Available: len(req.Towers) > 0 && req.Rays > 0,
			Reason:    objectiveAvailabilityReason(len(req.Towers) > 0 && req.Rays > 0, "no_reachable_rays"),
		},
		"overlap": {
			Available: len(prepared.RelevantBuildings) > 0,
			Reason:    objectiveAvailabilityReason(len(prepared.RelevantBuildings) > 0, "no_relevant_entities"),
		},
	}
	return prepared, nil
}

func objectiveAvailabilityReason(available bool, reason string) string {
	if available {
		return ""
	}
	return reason
}

func positiveFinite(value float64) bool {
	return value > 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func (domain optimizationTargetDomain) containsPoint(point Point) bool {
	for _, envelope := range domain.Envelopes {
		if ApproxDistanceMeters(envelope.Center, point) <= envelope.RadiusMeters+optimizationDomainBoundaryToleranceMeters {
			return true
		}
	}
	return false
}

func (domain optimizationTargetDomain) intersectsFootprint(building *BuildingFootprint) bool {
	if building == nil || len(building.Vertices) < 3 {
		return false
	}
	for _, envelope := range domain.Envelopes {
		if PointInPolygon(envelope.Center, building.Vertices) {
			return true
		}
		for index, vertex := range building.Vertices {
			if ApproxDistanceMeters(envelope.Center, vertex) <= envelope.RadiusMeters+optimizationDomainBoundaryToleranceMeters {
				return true
			}
			next := building.Vertices[(index+1)%len(building.Vertices)]
			if pointToSegmentDistanceMeters(envelope.Center, vertex, next) <= envelope.RadiusMeters+optimizationDomainBoundaryToleranceMeters {
				return true
			}
		}
	}
	return false
}

func pointToSegmentDistanceMeters(point Point, start Point, end Point) float64 {
	latScale := 111_320.0
	lonScale := latScale * math.Cos(point.Lat*math.Pi/180)
	if math.Abs(lonScale) < 1e-9 {
		lonScale = 1e-9
	}
	x1 := (start.Lon - point.Lon) * lonScale
	y1 := (start.Lat - point.Lat) * latScale
	x2 := (end.Lon - point.Lon) * lonScale
	y2 := (end.Lat - point.Lat) * latScale
	dx := x2 - x1
	dy := y2 - y1
	segmentLengthSquared := dx*dx + dy*dy
	if segmentLengthSquared <= 0 {
		return math.Sqrt(x1*x1 + y1*y1)
	}
	t := -(x1*dx + y1*dy) / segmentLengthSquared
	t = math.Max(0, math.Min(1, t))
	closestX := x1 + t*dx
	closestY := y1 + t*dy
	return math.Sqrt(closestX*closestX + closestY*closestY)
}
