package raytracer

import (
	"math"
	"os"
	"path/filepath"
	"testing"
)

type spatialEvidenceTerrainFixture struct {
	metadata TerrainMetadata
	value    func(Point) (float64, bool)
}

func (fixture spatialEvidenceTerrainFixture) Elevation(point Point) (float64, bool) {
	return fixture.value(point)
}

func (fixture spatialEvidenceTerrainFixture) Metadata() TerrainMetadata { return fixture.metadata }

func (fixture spatialEvidenceTerrainFixture) Sample(point Point, _ string) (float64, bool) {
	return fixture.value(point)
}

func declaredDTMFixture(value func(Point) (float64, bool)) spatialEvidenceTerrainFixture {
	return spatialEvidenceTerrainFixture{
		metadata: TerrainMetadata{
			Available: true, Status: TerrainStatusAvailable, Source: "controlled-dtm", SourceVersion: "fixture-1",
			Kind: TerrainKindDTM, CRS: "EPSG:4326", VerticalDatum: "EGM2008", VerticalDatumKind: VerticalDatumOrthometric,
			Bounds: []float64{31, 38, 33, 41}, ResolutionXM: 30, ResolutionYM: 30, Interpolation: TerrainInterpolationBilinear,
		},
		value: value,
	}
}

func declaredDSMFixture(value func(Point) (float64, bool)) spatialEvidenceTerrainFixture {
	fixture := declaredDTMFixture(value)
	fixture.metadata.Source = "controlled-dsm"
	fixture.metadata.Kind = TerrainKindDSM
	return fixture
}

func rectangleBuilding(id string, minLon, minLat, maxLon, maxLat, height float64, source string) *BuildingFootprint {
	vertices := []Point{{Lon: minLon, Lat: minLat}, {Lon: maxLon, Lat: minLat}, {Lon: maxLon, Lat: maxLat}, {Lon: minLon, Lat: maxLat}}
	bounds, _ := BoundsFromPoints(vertices)
	building := &BuildingFootprint{ID: id, LogicalID: id, Bounds: bounds, Vertices: vertices, HeightMeters: height, HeightSource: source, Material: "concrete"}
	switch source {
	case HeightSourceExplicitLegacy:
		building.HeightEvidenceMeters, building.HeightEvidenceSource, building.HeightEvidenceTag = height, HeightEvidenceObservedTag, "height"
	case HeightSourceLevelsLegacy:
		building.HeightEvidenceMeters, building.HeightEvidenceSource, building.HeightEvidenceTag = height, HeightEvidenceFromLevels, "building:levels"
	}
	return building
}

func TestConcept4F3ATerrainSamplerAndPathResolution(t *testing.T) {
	path := filepath.Join(t.TempDir(), "terrain.tif")
	writeTestGeoTIFF(t, path)
	model, err := LoadGeoTIFFTerrain(path, "EPSG:4326")
	if err != nil {
		t.Fatalf("load fixture terrain: %v", err)
	}
	model = ApplyTerrainLayerDeclaration(model, TerrainMetadata{
		Kind: TerrainKindDTM, VerticalDatum: "EGM2008", VerticalDatumKind: VerticalDatumOrthometric,
		Interpolation: TerrainInterpolationBilinear, ResolutionXM: 30, ResolutionYM: 30,
	})
	sampler, err := NewTerrainSampler(model, TerrainInterpolationBilinear)
	if err != nil {
		t.Fatalf("new terrain sampler: %v", err)
	}
	sample := sampler.SampleTerrain(Point{Lon: 32.01, Lat: 39.99})
	if sample.Status != TerrainSampleInterpolated || sample.ElevationM == nil || math.Abs(*sample.ElevationM-115) > 0.001 || !sample.AuthoritativeGround {
		t.Fatalf("bilinear sample = %+v, want 115 m authoritative DTM", sample)
	}
	profile, err := BuildTerrainPathProfile(Point{Lon: 32.001, Lat: 39.999}, Point{Lon: 32.014, Lat: 39.999}, sampler, 0.1)
	if err != nil {
		t.Fatalf("path profile: %v", err)
	}
	if profile.EffectiveSpacingM != 30 || len(profile.Samples) != int(math.Ceil(profile.DistanceM/30))+1 || profile.Status != TerrainSampleUnavailable || len(profile.Limitations) == 0 {
		t.Fatalf("path profile oversampling guard = %+v", profile)
	}
}

func TestConcept4F3AControlledGeometryFixtures(t *testing.T) {
	flat := declaredDTMFixture(func(Point) (float64, bool) { return 100, true })
	flatSampler, _ := NewTerrainSampler(flat, TerrainInterpolationNearest)
	known := rectangleBuilding("known", 32.000, 39.000, 32.001, 39.001, 15, HeightSourceExplicitLegacy)
	base := CalculateBuildingBaseElevation(known, flatSampler, 5)
	if base.Status != TerrainSampleInterpolated || base.GroundMedianM == nil || *base.GroundMedianM != 100 || base.GroundSpreadM == nil || *base.GroundSpreadM != 0 {
		t.Fatalf("flat building base = %+v", base)
	}
	ledger := BuildingHeightLedgerFor(known, base, nil)
	if ledger.SelectedProvenance.Source != string(SpatialHeightOSMExplicit) || ledger.SelectedRoofElevation.ElevationAMSLM == nil || *ledger.SelectedRoofElevation.ElevationAMSLM != 115 {
		t.Fatalf("flat roof ledger = %+v", ledger)
	}

	sloped := declaredDTMFixture(func(point Point) (float64, bool) { return 100 + (point.Lon-32.0005)*100000, true })
	slopedSampler, _ := NewTerrainSampler(sloped, TerrainInterpolationBilinear)
	slopedBase := CalculateBuildingBaseElevation(known, slopedSampler, 5)
	if slopedBase.Status != BaseElevationUncertain || slopedBase.GroundSpreadM == nil || *slopedBase.GroundSpreadM <= 5 {
		t.Fatalf("sloped base uncertainty = %+v", slopedBase)
	}

	missing := CalculateBuildingBaseElevation(known, nil, 5)
	if missing.Status != TerrainSampleUnavailable || missing.GroundMedianM != nil {
		t.Fatalf("missing raster base = %+v", missing)
	}
	noDataValue := -9999.0
	noDataFixture := declaredDTMFixture(func(Point) (float64, bool) { return 0, false })
	noDataFixture.metadata.NoData = &noDataValue
	noDataSampler, _ := NewTerrainSampler(noDataFixture, TerrainInterpolationBilinear)
	if sample := noDataSampler.SampleTerrain(Point{Lon: 32.0005, Lat: 39.0005}); sample.Status != TerrainSampleNoData {
		t.Fatalf("no-data sample = %+v", sample)
	}
	if sample := noDataSampler.SampleTerrain(Point{Lon: 30, Lat: 35}); sample.Status != TerrainSampleOutsideDataset {
		t.Fatalf("outside sample was classified as no-data: %+v", sample)
	}

	dsm := declaredDSMFixture(func(Point) (float64, bool) { return 130, true })
	dsmSampler, _ := NewTerrainSampler(dsm, TerrainInterpolationBilinear)
	dsmBase := CalculateBuildingBaseElevation(known, dsmSampler, 5)
	if dsmBase.Status != "surface_not_ground" || dsmBase.GroundMedianM != nil {
		t.Fatalf("DSM was treated as ground: %+v", dsmBase)
	}
	dtmSample := TerrainSample{ElevationM: spatialFloatPointer(100), Kind: TerrainKindDTM, Source: EvidenceProvenance{Source: "dtm", VerticalDatum: "EGM2008", VerticalDatumKind: VerticalDatumOrthometric}}
	dsmSample := TerrainSample{ElevationM: spatialFloatPointer(130), Kind: TerrainKindDSM, Source: EvidenceProvenance{Source: "dsm", VerticalDatum: "EGM2008", VerticalDatumKind: VerticalDatumOrthometric}}
	ndsm, err := EvaluateNDSMDifference(dsmSample, dtmSample, "roof_median")
	if err != nil || ndsm.HeightAGLM == nil || *ndsm.HeightAGLM != 30 || ndsm.Provenance.EvidenceClass != EvidenceUsableWithQualification {
		t.Fatalf("nDSM derivation = %+v, err=%v", ndsm, err)
	}

	// External footprint fixture matrix: exact ID, high-IoU, ambiguous overlap,
	// and a record too far from any loader footprint.
	first := rectangleBuilding("exact", 32, 39, 32.001, 39.001, 10, HeightSourceExplicitLegacy)
	second := rectangleBuilding("overlap-a", 32.002, 39, 32.003, 39.001, 10, HeightSourceExplicitLegacy)
	third := rectangleBuilding("overlap-b", 32.002, 39, 32.003, 39.001, 10, HeightSourceExplicitLegacy)
	fourth := rectangleBuilding("high-iou", 32.004, 39, 32.005, 39.001, 10, HeightSourceExplicitLegacy)
	index := NewBuildingIndex([]*BuildingFootprint{first, second, third, fourth})
	records := []ExternalBuildingHeightRecord{
		{ID: "exact", Footprint: first.Vertices, HeightAGLM: 14, Source: EvidenceProvenance{Source: "Microsoft", EvidenceClass: EvidenceUsableWithQualification}},
		{ID: "external-high-iou", Footprint: []Point{{32.00405, 39.00005}, {32.00495, 39.00005}, {32.00495, 39.00095}, {32.00405, 39.00095}}, HeightAGLM: 16, Source: EvidenceProvenance{Source: "Microsoft", EvidenceClass: EvidenceUsableWithQualification}},
		{ID: "ambiguous", Footprint: second.Vertices, HeightAGLM: 18, Source: EvidenceProvenance{Source: "Microsoft", EvidenceClass: EvidenceUsableWithQualification}},
		{ID: "unmatched", Footprint: []Point{{33, 40}, {33.001, 40}, {33.001, 40.001}, {33, 40.001}}, HeightAGLM: 20, Source: EvidenceProvenance{Source: "Microsoft", EvidenceClass: EvidenceUsableWithQualification}},
	}
	matches := MatchExternalBuildingHeights(index, records, DefaultExternalHeightMatchPolicy())
	if matches[0].Quality != ExternalMatchExact || matches[1].Quality != ExternalMatchHighConfidenceIoU || matches[2].Quality != ExternalMatchAmbiguous || matches[3].Quality != ExternalMatchUnmatched {
		t.Fatalf("external matches = %+v", matches)
	}

	selected, alternatives, conflict := SelectHeightEvidence([]HeightEvidenceCandidate{
		{HeightAGLM: 10, Provenance: EvidenceProvenance{Source: string(SpatialHeightOSMExplicit), EvidenceClass: EvidenceTrusted}},
		{HeightAGLM: 30, Provenance: EvidenceProvenance{Source: string(SpatialHeightExternal), EvidenceClass: EvidenceUsableWithQualification}, MatchQuality: ExternalMatchHighConfidenceIoU},
	})
	if selected.Provenance.Source != string(SpatialHeightOSMExplicit) || len(alternatives) != 1 || conflict.Status != HeightConflictReviewRequired {
		t.Fatalf("conflict precedence = selected=%+v alternatives=%+v conflict=%+v", selected, alternatives, conflict)
	}
	ambiguous, _, _ := SelectHeightEvidence([]HeightEvidenceCandidate{{
		HeightAGLM:   40,
		Provenance:   EvidenceProvenance{Category: SpatialHeightExternal, EvidenceClass: EvidenceUsableWithQualification},
		MatchQuality: ExternalMatchAmbiguous,
	}})
	if ambiguous.Provenance.EvidenceClass != EvidenceUnavailable {
		t.Fatalf("ambiguous external height was selected: %+v", ambiguous)
	}
	_, err = CombineGroundAndBuildingHeight(GroundElevationEvidence{ElevationM: spatialFloatPointer(100), Kind: TerrainKindDTM, Source: EvidenceProvenance{VerticalDatum: "EGM2008", VerticalDatumKind: VerticalDatumOrthometric}}, BuildingHeightEvidence{HeightAGLM: spatialFloatPointer(10), Provenance: EvidenceProvenance{VerticalDatum: "WGS84", VerticalDatumKind: VerticalDatumEllipsoidal}})
	if err == nil {
		t.Fatal("incompatible vertical datum was accepted")
	}
	fallback := rectangleBuilding("fallback", 32, 39, 32.001, 39.001, 9, HeightSourceFallbackLegacy)
	fallbackLedger := BuildingHeightLedgerFor(fallback, BuildingBaseElevationResult{Status: TerrainSampleUnavailable, Kind: TerrainKindDEMUnspecified, Source: EvidenceProvenance{EvidenceClass: EvidenceUnavailable}}, nil)
	if fallbackLedger.SelectedConfidence != EvidenceFallbackOnly || fallbackLedger.SelectedProvenance.Source != string(SpatialHeightFallback) {
		t.Fatalf("fallback ledger = %+v", fallbackLedger)
	}
}

func TestConcept4F3AExternalHeightGeoJSONContract(t *testing.T) {
	path := filepath.Join(t.TempDir(), "external-heights.geojson")
	contents := `{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:4326"}},"features":[{"type":"Feature","id":"external-1","properties":{"height_agl_m":18.5},"geometry":{"type":"Polygon","coordinates":[[[32,39],[32.001,39],[32.001,39.001],[32,39.001],[32,39]]]}}]}`
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatalf("write external fixture: %v", err)
	}
	records, err := LoadExternalBuildingHeightRecordsFromGeoJSON(path, EvidenceProvenance{Source: "controlled-external", SourceVersion: "fixture-1", DatasetID: "external-fixture", EvidenceClass: EvidenceUsableWithQualification})
	if err != nil {
		t.Fatalf("load external height fixture: %v", err)
	}
	if len(records) != 1 || records[0].ID != "external-1" || records[0].HeightAGLM != 18.5 || records[0].Source.Category != SpatialHeightExternal || records[0].Source.VerticalDatumKind != "not_applicable_agl" {
		t.Fatalf("external records = %+v", records)
	}
	badPath := filepath.Join(t.TempDir(), "missing-height.geojson")
	badContents := `{"type":"FeatureCollection","features":[{"type":"Feature","id":"missing","properties":{},"geometry":{"type":"Polygon","coordinates":[[[32,39],[32.001,39],[32.001,39.001],[32,39.001],[32,39]]]}}]}`
	if err := os.WriteFile(badPath, []byte(badContents), 0o600); err != nil {
		t.Fatalf("write bad external fixture: %v", err)
	}
	if _, err := LoadExternalBuildingHeightRecordsFromGeoJSON(badPath, EvidenceProvenance{}); err == nil {
		t.Fatal("external record without height_agl_m was accepted")
	}
	wrongCRSPath := filepath.Join(t.TempDir(), "wrong-crs.geojson")
	wrongCRSContents := `{"type":"FeatureCollection","crs":{"type":"name","properties":{"name":"EPSG:3857"}},"features":[]}`
	if err := os.WriteFile(wrongCRSPath, []byte(wrongCRSContents), 0o600); err != nil {
		t.Fatalf("write wrong-CRS fixture: %v", err)
	}
	if _, err := LoadExternalBuildingHeightRecordsFromGeoJSON(wrongCRSPath, EvidenceProvenance{}); err == nil {
		t.Fatal("external record with non-EPSG:4326 CRS was accepted")
	}
}

func TestConcept4F3ASpatialFingerprintIsOrderIndependent(t *testing.T) {
	first := SpatialEvidenceFingerprint(SpatialEvidenceFingerprintInput{
		TerrainDatasets:        []SpatialEvidenceDatasetIdentity{{ID: "terrain-b", Version: "2", Kind: "dtm", Checksum: "b"}, {ID: "terrain-a", Version: "1", Kind: "dtm", Checksum: "a"}},
		BuildingHeightDatasets: []SpatialEvidenceDatasetIdentity{{ID: "osm", Version: "2026", Kind: "osm_embedded_height_evidence", Checksum: "c"}},
		SourcePrecedence:       DefaultHeightSourcePrecedence(), Interpolation: TerrainInterpolationBilinear, DatumTransformationPolicy: SpatialDatumPolicyVersion,
	})
	second := SpatialEvidenceFingerprint(SpatialEvidenceFingerprintInput{
		TerrainDatasets:        []SpatialEvidenceDatasetIdentity{{ID: "terrain-a", Version: "1", Kind: "dtm", Checksum: "a"}, {ID: "terrain-b", Version: "2", Kind: "dtm", Checksum: "b"}},
		BuildingHeightDatasets: []SpatialEvidenceDatasetIdentity{{ID: "osm", Version: "2026", Kind: "osm_embedded_height_evidence", Checksum: "c"}},
		SourcePrecedence:       DefaultHeightSourcePrecedence(), Interpolation: TerrainInterpolationBilinear, DatumTransformationPolicy: SpatialDatumPolicyVersion,
	})
	if first == "" || first != second {
		t.Fatalf("fingerprint order dependence: %q / %q", first, second)
	}
}

func TestConcept4F3AExistingGeoTIFFReaderStillClosesFixtureInputs(t *testing.T) {
	path := filepath.Join(t.TempDir(), "terrain.tif")
	writeTestGeoTIFF(t, path)
	model, err := LoadGeoTIFFTerrain(path, "EPSG:4326")
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if closer, ok := model.(interface{ Close() error }); ok {
		_ = closer.Close()
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("fixture disappeared: %v", err)
	}
}

func BenchmarkConcept4F3A1000TerrainSamples(b *testing.B) {
	fixture := declaredDTMFixture(func(point Point) (float64, bool) { return 100 + point.Lon + point.Lat, true })
	sampler, _ := NewTerrainSampler(fixture, TerrainInterpolationBilinear)
	points := make([]Point, 1000)
	for index := range points {
		points[index] = Point{Lon: 32 + float64(index%100)*0.0001, Lat: 39 + float64(index/100)*0.0001}
	}
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		for _, point := range points {
			_ = sampler.SampleTerrain(point)
		}
	}
}

func BenchmarkConcept4F3APathProfileSampling(b *testing.B) {
	fixture := declaredDTMFixture(func(point Point) (float64, bool) { return 100 + point.Lon + point.Lat, true })
	sampler, _ := NewTerrainSampler(fixture, TerrainInterpolationBilinear)
	start := Point{Lon: 32, Lat: 39}
	end := Point{Lon: 32.01, Lat: 39.01}
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		_, _ = BuildTerrainPathProfile(start, end, sampler, 10)
	}
}

func BenchmarkConcept4F3ABuildingBaseCalculation(b *testing.B) {
	fixture := declaredDTMFixture(func(point Point) (float64, bool) { return 100 + point.Lon + point.Lat, true })
	sampler, _ := NewTerrainSampler(fixture, TerrainInterpolationBilinear)
	building := rectangleBuilding("benchmark", 32, 39, 32.001, 39.001, 15, HeightSourceExplicitLegacy)
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		_ = CalculateBuildingBaseElevation(building, sampler, 5)
	}
}

func BenchmarkConcept4F3AAnkaraHeightLedgerJoin(b *testing.B) {
	datasetDir := os.Getenv("ATOM_DATASET_DIR")
	if datasetDir == "" {
		b.Skip("set ATOM_DATASET_DIR to benchmark the full Ankara height ledger join")
	}
	pack, err := LoadDatasetPack(datasetDir)
	if err != nil {
		b.Fatalf("load Ankara dataset: %v", err)
	}
	base := BuildingBaseElevationResult{Status: TerrainSampleUnavailable, Kind: TerrainKindDEMUnspecified, Source: EvidenceProvenance{EvidenceClass: EvidenceUnavailable}}
	b.ResetTimer()
	for iteration := 0; iteration < b.N; iteration++ {
		for _, building := range pack.BuildingIndex.Footprints() {
			_ = BuildingHeightLedgerFor(building, base, nil)
		}
	}
}
