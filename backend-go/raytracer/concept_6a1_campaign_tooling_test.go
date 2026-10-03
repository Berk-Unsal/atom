package raytracer

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func concept6A1RepoRoot(t *testing.T) string {
	t.Helper()
	_, sourceFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(sourceFile), "../.."))
}

func concept6A1Fixture(t *testing.T) ([]byte, Concept6A1CampaignManifest, Concept6A1TransmitterMap) {
	t.Helper()
	root := concept6A1RepoRoot(t)
	raw, err := os.ReadFile(filepath.Join(root, "examples", "concept-6a1-signal-collector-dry-run.txt"))
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := os.ReadFile(filepath.Join(root, "examples", "concept-6a1-dry-run-campaign.json"))
	if err != nil {
		t.Fatal(err)
	}
	mapBytes, err := os.ReadFile(filepath.Join(root, "examples", "concept-6a1-dry-run-transmitter-map.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest Concept6A1CampaignManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	var transmitterMap Concept6A1TransmitterMap
	if err := json.Unmarshal(mapBytes, &transmitterMap); err != nil {
		t.Fatal(err)
	}
	return raw, manifest, transmitterMap
}

func concept6A1IssueCodes(export Concept6A1SignalCollectorExport) map[string]bool {
	codes := map[string]bool{}
	for _, issue := range export.Issues {
		codes[issue.Code] = true
	}
	return codes
}

func concept6A1Readiness(t *testing.T, report Concept6A1QualityReport, quantity string, frequency float64) Concept6A1QuantityReadiness {
	t.Helper()
	for _, row := range report.QuantityReadiness {
		if row.Quantity == quantity && row.FrequencyGHz != nil && *row.FrequencyGHz == frequency {
			return row
		}
	}
	t.Fatalf("missing readiness row %s@%g: %+v", quantity, frequency, report.QuantityReadiness)
	return Concept6A1QuantityReadiness{}
}

func TestConcept6A1SignalCollectorParserPreservesEscapesAndRejectsMalformedRows(t *testing.T) {
	raw := "SIGNAL_COLLECTOR_TXT_V6\nrecord_count=3\n\n" +
		"timestamp_iso_utc\tepoch_ms\telapsed_realtime_ns\tsession_id\tsequence_number\tsource\tpayload\n" +
		"2026-09-21T10:00:00+03:00\t1789974000000\t10\ts-escape\t1\tsession\trecord_type=survey_point;note=a\\;b\\=c\\tz\n" +
		"2026-09-21T10:00:01Z\t1789974001000\t9\ts-escape\t2\tsession\trecord_type=survey_point\n" +
		"2026-09-21T10:00:02Z\t1789974002000\t8\ts-escape\t3\tsession\trecord_type=survey_point;bad=trailing\\\n"
	export, err := ParseConcept6A1SignalCollectorTXT([]byte(raw))
	if err != nil {
		t.Fatal(err)
	}
	if len(export.Rows) != 2 || export.DataRowCount != 3 || export.Rows[0].TimestampISOUTC != "2026-09-21T07:00:00Z" {
		t.Fatalf("normalized rows = %+v", export.Rows)
	}
	if got := export.Rows[0].Payload["note"]; got != "a;b=c\tz" {
		t.Fatalf("escaped payload = %q", got)
	}
	codes := concept6A1IssueCodes(export)
	if !codes["malformed_row"] || !codes["elapsed_realtime_not_monotonic"] {
		t.Fatalf("malformed and monotonic issues = %+v", export.Issues)
	}
	if !codes["record_count_mismatch"] {
		t.Fatalf("expected record count warning = %+v", export.Issues)
	}
}

func TestConcept6A1ParserSupportsGzipAndHashesOriginalContainer(t *testing.T) {
	raw, _, _ := concept6A1Fixture(t)
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err := writer.Write(raw); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	export, err := ParseConcept6A1SignalCollector(compressed.Bytes())
	if err != nil {
		t.Fatal(err)
	}
	if export.RawContainer != "gzip" || export.RawSHA256 != Concept6A1RawChecksum(compressed.Bytes()) || export.RawBytes != compressed.Len() || len(export.Rows) != 16 {
		t.Fatalf("gzip provenance = %+v", export)
	}
}

func TestConcept6A1ManifestAndMapRejectMissingSemantics(t *testing.T) {
	_, manifest, transmitterMap := concept6A1Fixture(t)
	if got := ValidateConcept6A1CampaignManifest(manifest); got != "" {
		t.Fatalf("fixture manifest rejected: %s", got)
	}
	missingHeight := manifest
	missingHeight.Receiver.HeightAGLM = nil
	if got := ValidateConcept6A1CampaignManifest(missingHeight); !strings.Contains(got, "height_agl_m") {
		t.Fatalf("missing height was accepted: %q", got)
	}
	badProvenance := transmitterMap
	badProvenance.Entries = append([]Concept6A1TransmitterMapEntry(nil), transmitterMap.Entries...)
	badProvenance.Entries[0].FieldProvenance["frequency_ghz"] = Concept6A1FieldProvenance{Status: "measured", Source: "invalid status"}
	if got := ValidateConcept6A1TransmitterMap(badProvenance); !strings.Contains(got, "field_provenance") {
		t.Fatalf("unknown provenance status was accepted: %q", got)
	}
	badProfile := transmitterMap
	badProfile.Entries = append([]Concept6A1TransmitterMapEntry(nil), transmitterMap.Entries...)
	badProfile.Entries[0].RFProfile.PropagationModelID = "legacy_fspl_walls"
	if got := ValidateConcept6A1TransmitterMap(badProfile); !strings.Contains(got, "urban_short_range") {
		t.Fatalf("noncanonical profile was accepted: %q", got)
	}
}

func TestConcept6A1MappingRequiresExactPLMNAndCellID(t *testing.T) {
	_, _, transmitterMap := concept6A1Fixture(t)
	entry := &transmitterMap.Entries[0]
	if got := concept6A1MapEntryForCell(transmitterMap, entry.PLMN, entry.ObservedCellID); got != entry {
		t.Fatalf("exact PLMN + Cell ID did not match: got=%+v want=%+v", got, entry)
	}
	if got := concept6A1MapEntryForCell(transmitterMap, "99999", entry.ObservedCellID); got != nil {
		t.Fatalf("wrong PLMN matched a transmitter: %+v", got)
	}
	if got := concept6A1MapEntryForCell(transmitterMap, entry.PLMN, "different-cell-same-PCI"); got != nil {
		t.Fatalf("PCI-only or geographic fallback matched an unrelated Cell ID: %+v", got)
	}

	duplicate := transmitterMap
	duplicate.Entries = append(append([]Concept6A1TransmitterMapEntry(nil), transmitterMap.Entries...), transmitterMap.Entries[0])
	duplicate.Entries[len(duplicate.Entries)-1].ATOMCellID = "atom-duplicate-identity"
	if got := ValidateConcept6A1TransmitterMap(duplicate); !strings.Contains(got, "observed PLMN/cell identity is duplicated") {
		t.Fatalf("ambiguous PLMN + Cell ID mapping was accepted: %q", got)
	}
}

func TestConcept6A1DoesNotPromoteNearbyOrStrongestInventoryCell(t *testing.T) {
	raw, manifest, transmitterMap := concept6A1Fixture(t)
	// Make the synthetic planning point coincide with the receive coordinate.
	// A changed observed Cell ID must still remain unmapped without the exact key.
	transmitterMap.Entries[0].Lat = 39.912
	transmitterMap.Entries[0].Lon = 32.849
	if got := ValidateConcept6A1TransmitterMap(transmitterMap); got != "" {
		t.Fatalf("synthetic nearby map rejected: %s", got)
	}
	mutated := strings.ReplaceAll(string(raw), "cell_id=1001", "cell_id=nearby-unmapped-cell")
	imported, err := ImportConcept6A1SignalCollector([]byte(mutated), manifest, transmitterMap)
	if err != nil {
		t.Fatal(err)
	}
	seen := false
	for _, observation := range imported.Observations {
		if observation.RawCellID != "nearby-unmapped-cell" {
			continue
		}
		seen = true
		if observation.Observation.TransmitterID != "" || observation.MappingClass == Concept6A1MappingExact {
			t.Fatalf("nearby/strongest planning point was promoted without an exact ID: %+v", observation)
		}
	}
	if !seen {
		t.Fatal("mutated serving rows were not retained for mapping-policy inspection")
	}
}

func TestConcept6A1SyntheticDryRunIsEndToEndAndUncalibrated(t *testing.T) {
	raw, manifest, transmitterMap := concept6A1Fixture(t)
	first, err := EvaluateConcept6A1SignalCollector(context.Background(), raw, manifest, transmitterMap, nil)
	if err != nil {
		t.Fatal(err)
	}
	second, err := EvaluateConcept6A1SignalCollector(context.Background(), raw, manifest, transmitterMap, nil)
	if err != nil {
		t.Fatal(err)
	}
	quality := first.Import.Quality
	if quality.RawRows != 16 || quality.ParsedRows != 16 || quality.CellRows != 9 || quality.RegisteredCellRows != 6 || quality.NeighborCellRows != 3 {
		t.Fatalf("raw/cell quality = %+v", quality)
	}
	if quality.ValidCoordinates != 4 || quality.PoorPositionRows != 1 || quality.MissingCoordinates != 1 || quality.MissingMeasurementRows != 2 {
		t.Fatalf("coordinate/measurement quality = %+v", quality)
	}
	if quality.StationaryRows != 14 || quality.MovingRows != 0 || quality.UnclassifiedMotionRows != 0 || len(quality.FixedPointGroups) != 2 {
		t.Fatalf("route and motion quality = %+v", quality)
	}
	if quality.ExactMappings != 14 || quality.UnresolvedMappings != 0 || quality.SuitableForCalibration {
		t.Fatalf("mapping/calibration quality = %+v", quality)
	}
	if first.Import.Export.RawSHA256 != Concept6A1RawChecksum(raw) || first.Import.Export.RawContainer != "text" {
		t.Fatalf("raw preservation = %+v", first.Import.Export)
	}
	if first.Validation.CalibrationActive || first.Validation.ProductionCandidate || first.Validation.Readiness == CanonicalRFReadinessValidatedForDeclaredScope {
		t.Fatalf("dry-run was overinterpreted: readiness=%q active=%v candidate=%v", first.Validation.Readiness, first.Validation.CalibrationActive, first.Validation.ProductionCandidate)
	}
	if first.Validation.Holdout == nil {
		t.Fatal("canonical response did not retain holdout policy")
	}
	if first.Validation.Calibration != nil && first.Validation.Calibration.Promoted {
		t.Fatal("diagnostic calibration was promoted")
	}
	if first.Validation.ValidationFingerprint != second.Validation.ValidationFingerprint || first.Validation.ObservationChecksum != second.Validation.ObservationChecksum || first.Import.Export.RawSHA256 != second.Import.Export.RawSHA256 {
		t.Fatal("repeated dry-run changed its fingerprints")
	}

	if got := concept6A1Readiness(t, quality, CanonicalRFQuantityRSRPDBm, 2.6); !got.SuitableForValidation || got.Applicable != 2 || got.InsufficientMetadata != 0 {
		t.Fatalf("2.6 RSRP readiness = %+v", got)
	}
	if got := concept6A1Readiness(t, quality, CanonicalRFQuantityRSRPDBm, 28); got.SuitableForValidation || got.InsufficientMetadata != 2 || got.Blockers == nil {
		t.Fatalf("28 GHz RSRP readiness = %+v", got)
	}
	for _, quantity := range []string{CanonicalRFQuantitySINRDB, CanonicalRFQuantityRSRQDB, CanonicalRFQuantityRSSIDBm} {
		frequency := 2.6
		if quantity == CanonicalRFQuantitySINRDB || quantity == CanonicalRFQuantityRSRQDB {
			if got := concept6A1Readiness(t, quality, quantity, frequency); got.SuitableForValidation || got.InsufficientMetadata != 2 {
				t.Fatalf("2.6 %s readiness = %+v", quantity, got)
			}
		}
	}
	if quality.SuitableForSINRValidation || quality.SuitableForRSRQValidation || quality.SuitableForReceivedPower {
		t.Fatalf("radio-quality/received-power readiness was overstated: %+v", quality)
	}

	seenRawCells := map[string]bool{}
	for _, imported := range first.Import.Observations {
		seenRawCells[imported.RawCellID] = true
		if imported.RawCellID != "1001" && imported.RawCellID != "2001" {
			t.Fatalf("neighbor or unregistered row became canonical: %+v", imported)
		}
		if imported.RawCellID == "2001" && imported.Observation.BandwidthMHz != nil {
			t.Fatal("NR planning bandwidth was copied into a missing raw observation")
		}
		if imported.RawCellID == "2001" && (imported.RawIdentifiers["nrarfcn"] != "205416" || imported.RawIdentifiers["pci"] != "201" || imported.RawIdentifiers["plmn"] != "28601") {
			t.Fatalf("raw NR identifiers were not retained: %+v", imported.RawIdentifiers)
		}
		if imported.Observation.Quantity == CanonicalRFQuantityReceivedPowerDBm {
			t.Fatal("adapter fabricated received_power_dbm from a handset RSRP field")
		}
	}
	if !seenRawCells["1001"] || !seenRawCells["2001"] || len(seenRawCells) != 2 {
		t.Fatalf("canonical raw serving identities = %+v", seenRawCells)
	}
	for _, result := range first.Validation.Observations {
		if result.FrequencyGHz == 28 && result.Quantity == CanonicalRFQuantityRSRPDBm && result.ExclusionReason != "bandwidth_missing" {
			t.Fatalf("28 GHz RSRP blocker changed: %+v", result)
		}
		if result.FrequencyGHz == 2.6 && (result.Quantity == CanonicalRFQuantitySINRDB || result.Quantity == CanonicalRFQuantityRSRQDB || result.Quantity == CanonicalRFQuantityRSSIDBm) && !strings.HasPrefix(result.ExclusionReason, "interference_validation_limited") {
			t.Fatalf("2.6 radio-quality blocker changed: %+v", result)
		}
	}
}

func TestConcept6A1MissingFieldsAreNotSilentlyDefaulted(t *testing.T) {
	raw, manifest, transmitterMap := concept6A1Fixture(t)
	manifest.Receiver.HeightAGLM = nil
	if _, err := ImportConcept6A1SignalCollector(raw, manifest, transmitterMap); err == nil || !strings.Contains(err.Error(), "height_agl_m") {
		t.Fatalf("missing receiver height was silently repaired: %v", err)
	}
	manifest.Receiver.HeightAGLM = func() *float64 { value := 1.8; return &value }()
	withoutFrequency := strings.Replace(string(raw), ";frequency_mhz=2600", "", 1)
	imported, err := ImportConcept6A1SignalCollector([]byte(withoutFrequency), manifest, transmitterMap)
	if err != nil {
		t.Fatal(err)
	}
	if imported.Quality.MissingFrequencyRows == 0 {
		t.Fatalf("missing raw frequency was not retained as a quality failure: %+v", imported.Quality)
	}
	missingFrequencyObservation := false
	for _, observation := range imported.Observations {
		if observation.RawCellID == "1001" && observation.Observation.FrequencyGHz == nil {
			missingFrequencyObservation = true
		}
	}
	if !missingFrequencyObservation {
		t.Fatal("adapter inferred frequency from map or neighboring row")
	}
}

func TestConcept6A1AmbiguousServingRowsAreRetainedWithoutStrongestCellSelection(t *testing.T) {
	raw, manifest, transmitterMap := concept6A1Fixture(t)
	mutated := strings.Replace(string(raw), "registered=false;connection_status=NONE;cell_timestamp_ms=1789984801000;plmn=28601;cell_id=1002", "registered=true;connection_status=PRIMARY_SERVING;cell_timestamp_ms=1789984801000;plmn=28601;cell_id=1002", 1)
	mutated = strings.Replace(mutated, "cell_id=1002;pci=102;tac=1;earfcn=2850;band=LTE Band 7;frequency_mhz=2600;rsrp=-96", "cell_id=1002;pci=102;tac=1;earfcn=2850;band=LTE Band 7;frequency_mhz=2600;rsrp=-40", 1)
	imported, err := ImportConcept6A1SignalCollector([]byte(mutated), manifest, transmitterMap)
	if err != nil {
		t.Fatal(err)
	}
	if imported.Quality.AmbiguousServingGroups != 1 {
		t.Fatalf("ambiguous serving group was not counted: %+v", imported.Quality)
	}
	seen := map[string]bool{}
	for _, observation := range imported.Observations {
		seen[observation.RawCellID] = true
	}
	if !seen["1001"] || !seen["1002"] {
		t.Fatalf("adapter selected a strongest cell instead of retaining serving rows: %+v", seen)
	}
}

func TestConcept6A1MovingRowsAndUnknownEndpointAnnotationsRemainExplicit(t *testing.T) {
	raw, manifest, transmitterMap := concept6A1Fixture(t)
	movingRaw := strings.Replace(string(raw), "horizontal_accuracy_m=4;speed_mps=0", "horizontal_accuracy_m=4;speed_mps=2", 1)
	imported, err := ImportConcept6A1SignalCollector([]byte(movingRaw), manifest, transmitterMap)
	if err != nil {
		t.Fatal(err)
	}
	if imported.Quality.MovingRows == 0 || imported.Quality.StationaryRows == 0 {
		t.Fatalf("moving/stationary rows were not separated: %+v", imported.Quality)
	}
	unknownAnnotations := manifest
	unknownAnnotations.PointAnnotations = nil
	evaluation, err := EvaluateConcept6A1SignalCollector(context.Background(), raw, unknownAnnotations, transmitterMap, nil)
	if err != nil {
		t.Fatal(err)
	}
	if evaluation.Validation.Counts.Applicable != 0 || evaluation.Validation.Counts.InsufficientMetadata == 0 {
		t.Fatalf("unknown LOS/outdoor annotations were repaired: %+v", evaluation.Validation.Counts)
	}
}

func TestConcept6A1SanitizedRealV6ServingConflictIsNotPromoted(t *testing.T) {
	_, _, transmitterMap := concept6A1Fixture(t)
	root := concept6A1RepoRoot(t)
	raw, err := os.ReadFile(filepath.Join(root, "backend-go", "raytracer", "testdata", "concept-6a1-real-v6-structure-sanitized.txt"))
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := os.ReadFile(filepath.Join(root, "docs", "concept-6a1-1-campaign-manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest Concept6A1CampaignManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	if manifest.Receiver.HeightAGLM == nil || *manifest.Receiver.HeightAGLM != 1.4 || manifest.Receiver.HeightSource != CanonicalRFHeightAssumed {
		t.Fatalf("operator user-estimated 1.4 m height was not represented through the supported schema: %+v", manifest.Receiver)
	}
	if got := ValidateConcept6A1CampaignManifest(manifest); got != "" {
		t.Fatalf("real pilot manifest rejected: %s", got)
	}

	export, err := ParseConcept6A1SignalCollector(raw)
	if err != nil {
		t.Fatal(err)
	}
	if export.DataRowCount != 8 || len(export.Rows) != 8 {
		t.Fatalf("sanitized source row counts = data:%d parsed:%d", export.DataRowCount, len(export.Rows))
	}
	registeredConflict, neighborZeroID, serviceState, servingChange, genericCallback := false, false, false, false, false
	for _, row := range export.Rows {
		payload := row.Payload
		switch payload["record_type"] {
		case "cell":
			if payload["registered"] == "true" && payload["connection_status"] == "NONE" {
				registeredConflict = true
				if !strings.Contains(payload["raw_cell_identity"], "mBandwidth=2147483647") || payload["bandwidth"] != "" {
					t.Fatalf("raw unavailable bandwidth semantics changed: %+v", payload)
				}
			}
			if payload["registered"] == "false" && payload["cell_id"] == "0" {
				neighborZeroID = true
			}
		case "event":
			serviceState = serviceState || payload["event"] == "SERVICE_STATE_CHANGED" && strings.Contains(payload["after"], "mCellBandwidths=[10000]")
			servingChange = servingChange || payload["event"] == "SERVING_CELL_CHANGED" && payload["before_cell_id"] == "1234567" && payload["after_cell_id"] == "7654321"
		case "signal_strength":
			genericCallback = genericCallback || payload["dbm"] == "-55" && payload["cell_id"] == ""
		}
	}
	if !registeredConflict || !neighborZeroID || !serviceState || !servingChange || !genericCallback {
		t.Fatalf("source structures were not preserved: conflict=%v zero_neighbor=%v service_state=%v serving_change=%v callback=%v", registeredConflict, neighborZeroID, serviceState, servingChange, genericCallback)
	}

	imported, err := ImportConcept6A1SignalCollector(raw, manifest, transmitterMap)
	if err != nil {
		t.Fatal(err)
	}
	if imported.Quality.RegisteredCellRows != 0 || imported.Quality.NeighborCellRows != 3 || len(imported.Observations) != 0 || imported.Quality.SuitableForCalibration {
		t.Fatalf("contradictory registered flag or neighbor became canonical evidence: quality=%+v observations=%d", imported.Quality, len(imported.Observations))
	}

	evaluation, err := EvaluateConcept6A1SignalCollector(context.Background(), raw, manifest, transmitterMap, nil)
	if err != nil {
		t.Fatal(err)
	}
	if evaluation.Validation.Counts.Total != 0 || evaluation.Validation.Readiness != CanonicalRFReadinessNoMeasurementData || evaluation.Validation.CalibrationActive || evaluation.Validation.ProductionCandidate {
		t.Fatalf("source conflict or generic callback promoted readiness/calibration: %+v", evaluation.Validation)
	}
}
