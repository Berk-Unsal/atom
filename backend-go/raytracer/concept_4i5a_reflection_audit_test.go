package raytracer

// This file is deliberately test-only. It records controlled geometry and data-readiness
// checks for Concept 4I.5A; it is not a reflection evaluator and is not imported by
// production request paths.

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

type concept4I5AVec2 struct {
	x float64
	y float64
}

type concept4I5AVec3 struct {
	x float64
	y float64
	z float64
}

func concept4I5ADot2(a, b concept4I5AVec2) float64 { return a.x*b.x + a.y*b.y }

func concept4I5ACross2(a, b concept4I5AVec2) float64 { return a.x*b.y - a.y*b.x }

func concept4I5ASub2(a, b concept4I5AVec2) concept4I5AVec2 {
	return concept4I5AVec2{x: a.x - b.x, y: a.y - b.y}
}

func concept4I5AAdd3(a, b concept4I5AVec3) concept4I5AVec3 {
	return concept4I5AVec3{x: a.x + b.x, y: a.y + b.y, z: a.z + b.z}
}

func concept4I5ASub3(a, b concept4I5AVec3) concept4I5AVec3 {
	return concept4I5AVec3{x: a.x - b.x, y: a.y - b.y, z: a.z - b.z}
}

func concept4I5AScale3(a concept4I5AVec3, scalar float64) concept4I5AVec3 {
	return concept4I5AVec3{x: a.x * scalar, y: a.y * scalar, z: a.z * scalar}
}

func concept4I5ADot3(a, b concept4I5AVec3) float64 { return a.x*b.x + a.y*b.y + a.z*b.z }

func concept4I5ANorm3(a concept4I5AVec3) float64 { return math.Sqrt(concept4I5ADot3(a, a)) }

func concept4I5ANormalize3(a concept4I5AVec3) (concept4I5AVec3, bool) {
	norm := concept4I5ANorm3(a)
	if norm == 0 || !concept4I5AIsFinite(norm) {
		return concept4I5AVec3{}, false
	}
	return concept4I5AScale3(a, 1/norm), true
}

func concept4I5AReflect3(point, planePoint, normal concept4I5AVec3) concept4I5AVec3 {
	return concept4I5ASub3(point, concept4I5AScale3(normal, 2*concept4I5ADot3(normal, concept4I5ASub3(point, planePoint))))
}

type concept4I5AGeometryResult struct {
	Status            string
	Reason            string
	Point             concept4I5AVec3
	PlaneParameter    float64
	SegmentParameter  float64
	IncidentAngleDeg  float64
	ReflectedAngleDeg float64
}

func concept4I5ASpecularPoint(tx, rx, planePoint, normal concept4I5AVec3, segmentStart, segmentEnd concept4I5AVec2, bottom, top *float64) concept4I5AGeometryResult {
	const epsilon = 1e-9
	txSide := concept4I5ADot3(normal, concept4I5ASub3(tx, planePoint))
	rxSide := concept4I5ADot3(normal, concept4I5ASub3(rx, planePoint))
	if txSide <= epsilon || rxSide <= epsilon {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "same_exterior_side_required"}
	}

	imageTx := concept4I5AReflect3(tx, planePoint, normal)
	line := concept4I5ASub3(rx, imageTx)
	denominator := concept4I5ADot3(normal, line)
	if math.Abs(denominator) <= epsilon {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "image_line_parallel_to_facade"}
	}
	planeParameter := -concept4I5ADot3(normal, concept4I5ASub3(imageTx, planePoint)) / denominator
	if planeParameter < -epsilon || planeParameter > 1+epsilon {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "image_intersection_not_between_image_source_and_receiver"}
	}
	point := concept4I5AAdd3(imageTx, concept4I5AScale3(line, planeParameter))

	segment := concept4I5AVec2{x: segmentEnd.x - segmentStart.x, y: segmentEnd.y - segmentStart.y}
	segmentLengthSquared := concept4I5ADot2(segment, segment)
	if segmentLengthSquared <= epsilon {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "degenerate_facade_segment"}
	}
	point2 := concept4I5AVec2{x: point.x, y: point.y}
	segmentParameter := concept4I5ADot2(concept4I5ASub2(point2, segmentStart), segment) / segmentLengthSquared
	if segmentParameter < -epsilon || segmentParameter > 1+epsilon {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "specular_point_outside_facade_segment", Point: point, PlaneParameter: planeParameter, SegmentParameter: segmentParameter}
	}
	if bottom == nil || top == nil {
		return concept4I5AGeometryResult{Status: "unknown", Reason: "vertical_extent_unknown", Point: point, PlaneParameter: planeParameter, SegmentParameter: segmentParameter}
	}
	if point.z < *bottom-epsilon || point.z > *top+epsilon {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "specular_point_outside_vertical_extent", Point: point, PlaneParameter: planeParameter, SegmentParameter: segmentParameter}
	}

	incident := concept4I5ASub3(point, tx)
	reflected := concept4I5ASub3(rx, point)
	incident, incidentOK := concept4I5ANormalize3(incident)
	reflected, reflectedOK := concept4I5ANormalize3(reflected)
	if !incidentOK || !reflectedOK {
		return concept4I5AGeometryResult{Status: "inapplicable", Reason: "zero_length_reflection_leg", Point: point, PlaneParameter: planeParameter, SegmentParameter: segmentParameter}
	}
	incidentAngle := math.Acos(math.Min(1, math.Abs(concept4I5ADot3(incident, normal)))) * 180 / math.Pi
	reflectedAngle := math.Acos(math.Min(1, math.Abs(concept4I5ADot3(reflected, normal)))) * 180 / math.Pi
	return concept4I5AGeometryResult{
		Status:            "applicable_geometry_only",
		Reason:            "finite_segment_and_vertical_extent_pass",
		Point:             point,
		PlaneParameter:    planeParameter,
		SegmentParameter:  segmentParameter,
		IncidentAngleDeg:  incidentAngle,
		ReflectedAngleDeg: reflectedAngle,
	}
}

func concept4I5AFresnelGammaTE(epsilonR, incidenceDeg float64) float64 {
	cosIncident := math.Cos(incidenceDeg * math.Pi / 180)
	cosTransmitted := math.Sqrt(math.Max(0, 1-(math.Sin(incidenceDeg*math.Pi/180)*math.Sin(incidenceDeg*math.Pi/180))/epsilonR))
	return (cosIncident - math.Sqrt(epsilonR)*cosTransmitted) / (cosIncident + math.Sqrt(epsilonR)*cosTransmitted)
}

func concept4I5AFresnelGammaTM(epsilonR, incidenceDeg float64) float64 {
	cosIncident := math.Cos(incidenceDeg * math.Pi / 180)
	cosTransmitted := math.Sqrt(math.Max(0, 1-(math.Sin(incidenceDeg*math.Pi/180)*math.Sin(incidenceDeg*math.Pi/180))/epsilonR))
	return (math.Sqrt(epsilonR)*cosIncident - cosTransmitted) / (math.Sqrt(epsilonR)*cosIncident + cosTransmitted)
}

func concept4I5ASignedRingArea(ring []Point, latitudeDeg float64) float64 {
	if len(ring) < 3 {
		return 0
	}
	cosLatitude := math.Cos(latitudeDeg * math.Pi / 180)
	area := 0.0
	for index := range ring {
		next := (index + 1) % len(ring)
		x0 := ring[index].Lon * 111320 * cosLatitude
		y0 := ring[index].Lat * 111320
		x1 := ring[next].Lon * 111320 * cosLatitude
		y1 := ring[next].Lat * 111320
		area += x0*y1 - x1*y0
	}
	return area / 2
}

func concept4I5AOutwardNormal(start, end Point, ringArea, latitudeDeg float64) concept4I5AVec2 {
	cosLatitude := math.Cos(latitudeDeg * math.Pi / 180)
	edge := concept4I5AVec2{x: (end.Lon - start.Lon) * 111320 * cosLatitude, y: (end.Lat - start.Lat) * 111320}
	if ringArea >= 0 {
		return concept4I5AVec2{x: edge.y, y: -edge.x}
	}
	return concept4I5AVec2{x: -edge.y, y: edge.x}
}

func concept4I5AProject(point, origin Point, latitudeDeg float64) concept4I5AVec2 {
	return concept4I5AVec2{
		x: (point.Lon - origin.Lon) * 111320 * math.Cos(latitudeDeg*math.Pi/180),
		y: (point.Lat - origin.Lat) * 111320,
	}
}

func concept4I5AProperSegmentCrossing(a, b, c, d concept4I5AVec2) bool {
	ab := concept4I5ASub2(b, a)
	cd := concept4I5ASub2(d, c)
	denominator := concept4I5ACross2(ab, cd)
	if math.Abs(denominator) <= 1e-12 {
		return false
	}
	ca := concept4I5ASub2(c, a)
	t := concept4I5ACross2(ca, cd) / denominator
	u := concept4I5ACross2(ca, ab) / denominator
	return t > 1e-9 && t < 1-1e-9 && u > 1e-9 && u < 1-1e-9
}

func concept4I5ALegObstructed(start, end, obstacleStart, obstacleEnd concept4I5AVec2) bool {
	return concept4I5AProperSegmentCrossing(start, end, obstacleStart, obstacleEnd)
}

func concept4I5AHeightEvidenceKnown(source string) bool {
	return source == HeightEvidenceObservedTag || source == HeightEvidenceFromLevels
}

func concept4I5AIsFinite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func TestConcept4I5AControlledGeometryAndComposition(t *testing.T) {
	planePoint := concept4I5AVec3{x: 0, y: 0, z: 0}
	normal := concept4I5AVec3{x: 1, y: 0, z: 0}
	cases := []struct {
		name         string
		tx           concept4I5AVec3
		rx           concept4I5AVec3
		segmentStart concept4I5AVec2
		segmentEnd   concept4I5AVec2
		bottom       *float64
		top          *float64
		wantStatus   string
		wantReason   string
		wantPoint    concept4I5AVec3
		checkPoint   bool
	}{
		{name: "symmetric_oblique_segment", tx: concept4I5AVec3{x: 50, y: -50, z: 10}, rx: concept4I5AVec3{x: 50, y: 50, z: 10}, segmentStart: concept4I5AVec2{x: -10, y: 0}, segmentEnd: concept4I5AVec2{x: 10, y: 0}, bottom: floatPtr(0), top: floatPtr(20), wantStatus: "applicable_geometry_only", wantReason: "finite_segment_and_vertical_extent_pass", wantPoint: concept4I5AVec3{x: 0, y: 0, z: 10}, checkPoint: true},
		{name: "normal_incidence", tx: concept4I5AVec3{x: 20, y: 0, z: 5}, rx: concept4I5AVec3{x: 40, y: 0, z: 5}, segmentStart: concept4I5AVec2{x: -1, y: -1}, segmentEnd: concept4I5AVec2{x: 1, y: 1}, bottom: floatPtr(0), top: floatPtr(20), wantStatus: "applicable_geometry_only", wantReason: "finite_segment_and_vertical_extent_pass", wantPoint: concept4I5AVec3{x: 0, y: 0, z: 5}, checkPoint: true},
		{name: "outside_segment", tx: concept4I5AVec3{x: 50, y: -50, z: 10}, rx: concept4I5AVec3{x: 50, y: 50, z: 10}, segmentStart: concept4I5AVec2{x: 1, y: 0}, segmentEnd: concept4I5AVec2{x: 10, y: 0}, bottom: floatPtr(0), top: floatPtr(20), wantStatus: "inapplicable", wantReason: "specular_point_outside_facade_segment"},
		{name: "vertical_extent_too_short", tx: concept4I5AVec3{x: 50, y: -50, z: 10}, rx: concept4I5AVec3{x: 50, y: 50, z: 10}, segmentStart: concept4I5AVec2{x: -10, y: 0}, segmentEnd: concept4I5AVec2{x: 10, y: 0}, bottom: floatPtr(0), top: floatPtr(5), wantStatus: "inapplicable", wantReason: "specular_point_outside_vertical_extent"},
		{name: "unknown_vertical_extent", tx: concept4I5AVec3{x: 50, y: -50, z: 10}, rx: concept4I5AVec3{x: 50, y: 50, z: 10}, segmentStart: concept4I5AVec2{x: -10, y: 0}, segmentEnd: concept4I5AVec2{x: 10, y: 0}, wantStatus: "unknown", wantReason: "vertical_extent_unknown"},
		{name: "wrong_side", tx: concept4I5AVec3{x: -50, y: -50, z: 10}, rx: concept4I5AVec3{x: 50, y: 50, z: 10}, segmentStart: concept4I5AVec2{x: -10, y: 0}, segmentEnd: concept4I5AVec2{x: 10, y: 0}, bottom: floatPtr(0), top: floatPtr(20), wantStatus: "inapplicable", wantReason: "same_exterior_side_required"},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			got := concept4I5ASpecularPoint(testCase.tx, testCase.rx, planePoint, normal, testCase.segmentStart, testCase.segmentEnd, testCase.bottom, testCase.top)
			if got.Status != testCase.wantStatus || got.Reason != testCase.wantReason {
				t.Fatalf("geometry result = %+v, want status=%s reason=%s", got, testCase.wantStatus, testCase.wantReason)
			}
			if testCase.checkPoint {
				if math.Abs(got.Point.x-testCase.wantPoint.x) > 1e-9 || math.Abs(got.Point.y-testCase.wantPoint.y) > 1e-9 || math.Abs(got.Point.z-testCase.wantPoint.z) > 1e-9 {
					t.Fatalf("specular point = %+v, want %+v", got.Point, testCase.wantPoint)
				}
				if math.Abs(got.IncidentAngleDeg-got.ReflectedAngleDeg) > 1e-9 {
					t.Fatalf("incidence/reflection angles differ: %.12f vs %.12f", got.IncidentAngleDeg, got.ReflectedAngleDeg)
				}
			}
		})
	}

	if te := concept4I5AFresnelGammaTE(4, 45); math.Abs(te-(-0.4514162296451364)) > 1e-12 {
		t.Fatalf("TE Fresnel coefficient = %.15f", te)
	}
	if tm := concept4I5AFresnelGammaTM(4, 45); math.Abs(tm-0.20377661238703063) > 1e-12 {
		t.Fatalf("TM Fresnel coefficient = %.15f", tm)
	}
	if math.Abs(concept4I5AFresnelGammaTE(1, 45)) > 1e-12 || math.Abs(concept4I5AFresnelGammaTM(1, 45)) > 1e-12 {
		t.Fatal("identical media must have zero reflection coefficient")
	}
	if math.Abs(concept4I5AFresnelGammaTE(100, 45)) <= 0.5 {
		t.Fatal("high-contrast interface fixture should have a large TE reflection coefficient")
	}
}

func TestConcept4I5APolygonNormalOrientationFixtures(t *testing.T) {
	ccw := []Point{{Lon: 0, Lat: 0}, {Lon: 0.001, Lat: 0}, {Lon: 0.001, Lat: 0.001}, {Lon: 0, Lat: 0.001}}
	cw := []Point{{Lon: 0, Lat: 0}, {Lon: 0, Lat: 0.001}, {Lon: 0.001, Lat: 0.001}, {Lon: 0.001, Lat: 0}}
	for _, testCase := range []struct {
		name  string
		ring  []Point
		want  float64
		wantX float64
		wantY float64
	}{
		{name: "counter_clockwise", ring: ccw, want: 1, wantX: 0, wantY: -1},
		{name: "clockwise", ring: cw, want: -1, wantX: -1, wantY: 0},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			area := concept4I5ASignedRingArea(testCase.ring, 39.92)
			if math.Copysign(1, area) != testCase.want {
				t.Fatalf("signed area = %.6f, want sign %.0f", area, testCase.want)
			}
			normal := concept4I5AOutwardNormal(testCase.ring[0], testCase.ring[1], area, 39.92)
			normalLength := math.Hypot(normal.x, normal.y)
			if normalLength == 0 || math.Abs(normal.x/normalLength-testCase.wantX) > 1e-9 || math.Abs(normal.y/normalLength-testCase.wantY) > 1e-9 {
				t.Fatalf("outward normal for south edge = %+v", normal)
			}
		})
	}

	outer := []Point{{Lon: 0, Lat: 0}, {Lon: 0.004, Lat: 0}, {Lon: 0.004, Lat: 0.004}, {Lon: 0, Lat: 0.004}}
	hole := []Point{{Lon: 0.001, Lat: 0.001}, {Lon: 0.001, Lat: 0.003}, {Lon: 0.003, Lat: 0.003}, {Lon: 0.003, Lat: 0.001}}
	if !PointInPolygon(Point{Lon: 0.0005, Lat: 0.0005}, outer) || !PointInPolygon(Point{Lon: 0.002, Lat: 0.002}, hole) {
		t.Fatal("outer and hole fixture points must remain distinguishable")
	}
	// The production loader does not retain holes as exterior facade candidates.
	t.Log("hole ring is retained as a separate geometry fixture, not an exterior facade")
	if concept4I5ASignedRingArea(outer, 39.92) == 0 || concept4I5ASignedRingArea(hole, 39.92) == 0 {
		t.Fatal("outer and hole rings must have measurable orientation")
	}
}

func TestConcept4I5AHeightEvidenceFixtures(t *testing.T) {
	fixtures := []struct {
		name   string
		source string
		known  bool
	}{
		{name: "observed", source: HeightEvidenceObservedTag, known: true},
		{name: "levels", source: HeightEvidenceFromLevels, known: true},
		{name: "fallback_or_unknown", source: HeightEvidenceUnavailable, known: false},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			if got := concept4I5AHeightEvidenceKnown(fixture.source); got != fixture.known {
				t.Fatalf("known(%q) = %t, want %t", fixture.source, got, fixture.known)
			}
		})
	}
}

func TestConcept4I5ATwoLegVisibilityFixtures(t *testing.T) {
	tx := concept4I5AVec2{x: 50, y: -50}
	s := concept4I5AVec2{x: 0, y: 0}
	rx := concept4I5AVec2{x: 50, y: 50}
	firstLegObstacle := [2]concept4I5AVec2{{x: 25, y: -30}, {x: 25, y: -20}}
	secondLegObstacle := [2]concept4I5AVec2{{x: 25, y: 20}, {x: 25, y: 30}}
	if !concept4I5ALegObstructed(tx, s, firstLegObstacle[0], firstLegObstacle[1]) {
		t.Fatal("fixture F must obstruct Tx->S")
	}
	if concept4I5ALegObstructed(s, rx, firstLegObstacle[0], firstLegObstacle[1]) {
		t.Fatal("fixture F obstacle must not obstruct S->Rx")
	}
	if !concept4I5ALegObstructed(s, rx, secondLegObstacle[0], secondLegObstacle[1]) {
		t.Fatal("fixture G must obstruct S->Rx")
	}
	if concept4I5ALegObstructed(tx, s, secondLegObstacle[0], secondLegObstacle[1]) {
		t.Fatal("fixture G obstacle must not obstruct Tx->S")
	}
	if concept4I5ALegObstructed(tx, s, s, concept4I5AVec2{x: 0, y: 1}) {
		t.Fatal("an obstacle that only meets the reflection endpoint must be exempt in the controlled fixture")
	}
}

type concept4I5AReadinessSummary struct {
	DatasetRoot                                     string `json:"dataset_root"`
	BuildingFootprints                              int    `json:"building_footprints"`
	OuterFacadeSegments                             int    `json:"outer_facade_segments_geometric_only"`
	TrustedHeightFootprints                         int    `json:"trusted_height_footprints"`
	TrustedHeightSegments                           int    `json:"segments_attached_to_trusted_height_buildings"`
	MaterialEvidenceFootprints                      int    `json:"material_evidence_footprints"`
	TerrainAvailable                                bool   `json:"terrain_available"`
	SampleCells                                     int    `json:"sample_cells"`
	SampleRaysPerCell                               int    `json:"sample_rays_per_cell"`
	SamplePaths                                     int    `json:"sample_paths"`
	GeometryOnlySpecularCandidates                  int    `json:"geometry_only_specular_candidates"`
	GeometryOnlyCandidatesWithHeightEvidence        int    `json:"geometry_only_candidates_with_height_evidence"`
	GeometryOnlyCandidatesWithFlatDatumVerticalSpan int    `json:"geometry_only_candidates_with_flat_datum_vertical_span"`
	CandidatesWithTerrainAnchoredVerticalSpan       int    `json:"candidates_with_terrain_anchored_vertical_span"`
	GeometryOnlyCandidatesWithMaterialEvidence      int    `json:"geometry_only_candidates_with_material_evidence"`
	UniquePathsWithSpecularCandidate                int    `json:"unique_paths_with_specular_candidate"`
	UniqueBuildingsWithSpecularCandidate            int    `json:"unique_buildings_with_specular_candidate"`
	CandidateInterpretation                         string `json:"candidate_interpretation"`
}

func floatPtr(value float64) *float64 { return &value }

func TestConcept4I5AAnkaraReadinessAudit(t *testing.T) {
	if os.Getenv("ATOM_RUN_CONCEPT_4I5A_READINESS") != "1" {
		t.Skip("set ATOM_DATASET_DIR and ATOM_RUN_CONCEPT_4I5A_READINESS=1 to run the read-only Ankara reflection readiness audit")
	}
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		t.Fatal("ATOM_DATASET_DIR is required for the readiness audit")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		t.Fatalf("load Ankara dataset pack: %v", err)
	}

	const (
		cells       = 6
		raysPerCell = 72
		radiusM     = 400.0
		txHeightM   = 25.0
		rxHeightM   = 1.5
	)
	cellIDs := []string{"LTE-35084", "LTE-35104", "LTE-35877", "LTE-313100", "LTE-313110", "LTE-322828"}
	towersByID := make(map[string]TowerStation, len(pack.Towers))
	for _, tower := range pack.Towers {
		towersByID[tower.ID] = tower
	}

	summary := concept4I5AReadinessSummary{
		DatasetRoot:             datasetDir,
		BuildingFootprints:      len(pack.BuildingIndex.Footprints()),
		TerrainAvailable:        pack.TerrainMeta.Available,
		SampleCells:             cells,
		SampleRaysPerCell:       raysPerCell,
		SamplePaths:             cells * raysPerCell,
		CandidateInterpretation: "Geometry-only image intersections in a fixed 6-cell/72-ray/400 m readiness sample. Counts are not viable reflected links; no roughness, material, visibility, terrain, antenna, atmospheric, or coherent-field gate is evaluated.",
	}
	for _, footprint := range pack.BuildingIndex.Footprints() {
		edges := len(footprint.Vertices)
		summary.OuterFacadeSegments += edges
		if concept4I5AHeightEvidenceKnown(footprint.HeightEvidenceSource) {
			summary.TrustedHeightFootprints++
			summary.TrustedHeightSegments += edges
		}
		if footprint.Material != "" && footprint.Material != "unknown" {
			summary.MaterialEvidenceFootprints++
		}
	}

	seenPaths := make(map[int]struct{})
	seenBuildings := make(map[string]struct{})
	pathIndex := 0
	for _, cellID := range cellIDs {
		tower, ok := towersByID[cellID]
		if !ok {
			t.Fatalf("canonical readiness tower %s missing from dataset", cellID)
		}
		origin := Point{Lon: tower.Lon, Lat: tower.Lat}
		for rayIndex := 0; rayIndex < raysPerCell; rayIndex++ {
			endpoint := DestinationPoint(origin, float64(rayIndex)*360/float64(raysPerCell), radiusM)
			minLon, maxLon := math.Min(origin.Lon, endpoint.Lon)-0.0025, math.Max(origin.Lon, endpoint.Lon)+0.0025
			minLat, maxLat := math.Min(origin.Lat, endpoint.Lat)-0.0025, math.Max(origin.Lat, endpoint.Lat)+0.0025
			for _, footprint := range pack.BuildingIndex.SearchBounds(Bounds{MinLon: minLon, MinLat: minLat, MaxLon: maxLon, MaxLat: maxLat}) {
				if footprint == nil || len(footprint.Vertices) < 2 {
					continue
				}
				area := concept4I5ASignedRingArea(footprint.Vertices, origin.Lat)
				for edgeIndex := range footprint.Vertices {
					next := (edgeIndex + 1) % len(footprint.Vertices)
					start := concept4I5AProject(footprint.Vertices[edgeIndex], origin, origin.Lat)
					end := concept4I5AProject(footprint.Vertices[next], origin, origin.Lat)
					normal2 := concept4I5AOutwardNormal(footprint.Vertices[edgeIndex], footprint.Vertices[next], area, origin.Lat)
					normal, normalOK := concept4I5ANormalize3(concept4I5AVec3{x: normal2.x, y: normal2.y})
					if !normalOK {
						continue
					}
					tx := concept4I5AVec3{x: 0, y: 0, z: txHeightM}
					rx2 := concept4I5AProject(endpoint, origin, origin.Lat)
					rx := concept4I5AVec3{x: rx2.x, y: rx2.y, z: rxHeightM}
					var bottom, top *float64
					if concept4I5AHeightEvidenceKnown(footprint.HeightEvidenceSource) {
						bottom = floatPtr(0)
						top = floatPtr(footprint.HeightEvidenceMeters)
					}
					result := concept4I5ASpecularPoint(tx, rx, concept4I5AVec3{x: start.x, y: start.y, z: 0}, normal, start, end, bottom, top)
					if result.Status != "applicable_geometry_only" && result.Status != "unknown" {
						continue
					}
					summary.GeometryOnlySpecularCandidates++
					seenPaths[pathIndex] = struct{}{}
					seenBuildings[footprint.ID] = struct{}{}
					if concept4I5AHeightEvidenceKnown(footprint.HeightEvidenceSource) {
						summary.GeometryOnlyCandidatesWithHeightEvidence++
						summary.GeometryOnlyCandidatesWithFlatDatumVerticalSpan++
					}
					if footprint.Material != "" && footprint.Material != "unknown" {
						summary.GeometryOnlyCandidatesWithMaterialEvidence++
					}
				}
			}
			pathIndex++
		}
	}
	summary.UniquePathsWithSpecularCandidate = len(seenPaths)
	summary.UniqueBuildingsWithSpecularCandidate = len(seenBuildings)
	if encoded, encodeErr := json.Marshal(summary); encodeErr == nil {
		t.Logf("ankara_reflection_readiness=%s", encoded)
	}
}
