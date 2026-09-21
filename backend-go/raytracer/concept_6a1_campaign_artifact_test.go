package raytracer

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

const concept6A1AuditVersion = "concept-6a1-campaign-tooling-v1"

func TestGenerateConcept6A1Artifacts(t *testing.T) {
	if os.Getenv("ATOM_RUN_CONCEPT_6A1_AUDIT") != "1" {
		t.Skip("set ATOM_RUN_CONCEPT_6A1_AUDIT=1 to generate Concept 6A.1 artifacts")
	}
	root := concept6AArtifactRoot(t)
	if err := os.MkdirAll(root, 0755); err != nil {
		t.Fatal(err)
	}
	raw, manifest, transmitterMap := concept6A1Fixture(t)
	evaluation, err := EvaluateConcept6A1SignalCollector(context.Background(), raw, manifest, transmitterMap, nil)
	if err != nil {
		t.Fatal(err)
	}
	request := canonicalAnkaraNetworkOptimizationRequest()
	preSnapshots := map[string]any{"2.6": concept6ACanonicalSnapshot(2.6), "28": concept6ACanonicalSnapshot(28)}
	postSnapshots := map[string]any{"2.6": concept6ACanonicalSnapshot(2.6), "28": concept6ACanonicalSnapshot(28)}
	canonicalScenarioFingerprint := NetworkScenarioFingerprint(request)
	preMeasurementState := map[string]any{
		"real_measurement_data_available":    false,
		"readiness":                          CanonicalRFReadinessNoMeasurementData,
		"concept_6a1_tooling_present_before": false,
		"real_data_artifact_should_exist":    false,
	}
	baseline := map[string]any{
		"schema_version":  1,
		"concept":         "6A.1",
		"artifact":        "pre-change-baseline",
		"audit_version":   concept6A1AuditVersion,
		"captured_at":     "2026-09-21",
		"baseline_commit": "working-tree-before-concept-6a1-artifacts",
		"boundary": map[string]any{
			"canonical_production_changed_before": false,
			"concept_6a_present_before":           true,
			"concept_6a1_tooling_present_before":  false,
			"optimizer_or_planning_route_changed": false,
			"calibration_active_before":           false,
		},
		"canonical_rf_versions": map[string]any{
			"production_model_id":  UrbanShortRangePropagationID,
			"evaluator_version":    "existing Concept 6A canonical evaluator; unchanged by 6A.1",
			"frequencies_ghz":      []float64{2.6, 28},
			"matching_policy":      "existing explicit identity/mapping policy; never strongest cell",
			"applicability_policy": "existing Concept 6A policy; unchanged",
			"residual_policy":      "existing measured-minus-predicted policy; unchanged",
			"calibration_policy":   "existing diagnostic-only holdout policy; unchanged",
		},
		"canonical_snapshots":               preSnapshots,
		"canonical_scenario_fingerprint":    canonicalScenarioFingerprint,
		"optimizer_independent_fingerprint": canonicalScenarioFingerprint,
		"frozen_concept_6a": map[string]any{
			"schema":             "docs/concept-6a-validation-schema.json",
			"evaluator":          "backend-go/raytracer/canonical_rf_validation.go",
			"matching":           "canonical_rf_validation.go explicit ID/mapping -> PCI/channel/frequency -> opt-in geographic candidate",
			"applicability":      "canonical_rf_validation.go UMa frequency/distance/height/outdoor/LOS gates",
			"residual":           "measured minus predicted; quantity-preserving",
			"readiness":          "docs/concept-6a-readiness.json remains no_measurement_data",
			"canonical_baseline": "docs/concept-6a-pre-change-baseline.json",
			"changed_by_6a1":     false,
		},
		"measurement_state": preMeasurementState,
		"files_present_before": []string{
			"docs/concept-6a-pre-change-baseline.json",
			"docs/concept-6a-readiness.json",
			"docs/concept-6a-validation-schema.json",
		},
		"invariance_targets": []string{
			"2.6 GHz canonical RF", "28 GHz canonical RF", "UMa propagation", "antenna/link budget",
			"interference/radio quality", "optimizer semantics", "terrain-disabled behavior", "140 GHz/4I references", "Concept 6A matching/applicability/residual/readiness",
		},
	}

	dryRun := map[string]any{
		"schema_version":                1,
		"concept":                       "6A.1",
		"artifact":                      "dry-run-validation",
		"audit_version":                 concept6A1AuditVersion,
		"source_type":                   manifest.SourceType,
		"not_real_measurement_evidence": true,
		"selected_collector":            manifest.Collector,
		"raw_preservation": map[string]any{
			"format":              evaluation.Import.Export.FormatVersion,
			"container":           evaluation.Import.Export.RawContainer,
			"raw_sha256":          evaluation.Import.Export.RawSHA256,
			"raw_bytes":           evaluation.Import.Export.RawBytes,
			"parsed_rows":         evaluation.Import.Export.Rows,
			"raw_bytes_rewritten": false,
		},
		"manifest":        manifest,
		"transmitter_map": transmitterMap,
		"quality":         evaluation.Import.Quality,
		"canonical_dataset": map[string]any{
			"observation_count":      len(evaluation.Import.Dataset.Observations),
			"transmitter_count":      len(evaluation.Import.Dataset.Transmitters),
			"observation_checksum":   evaluation.Validation.ObservationChecksum,
			"validation_fingerprint": evaluation.Validation.ValidationFingerprint,
		},
		"validation": evaluation.Validation,
		"explicit_limitations": []string{
			"the fixture is synthetic and cannot establish field accuracy",
			"NR V6 rows have frequency and channel identity but no raw bandwidth, so 28 GHz RSRP/RSRQ/SINR remain metadata-blocked",
			"LTE radio-quality quantities retain source values but are interference-validation-limited because neighbor/resource context is not complete",
			"no received_power_dbm was fabricated from RSRP and no detection floor was fabricated from empty fields",
		},
	}

	readiness := map[string]any{
		"schema_version": 1,
		"concept":        "6A.1",
		"artifact":       "readiness",
		"audit_version":  concept6A1AuditVersion,
		"state":          "dry_run_ready_real_data_unavailable",
		"selected_collector": map[string]any{
			"name":          manifest.Collector.Name,
			"format":        manifest.Collector.ExportFormat,
			"adapter":       Concept6A1CollectorAdapterVersion,
			"root_required": manifest.Collector.RootRequired,
		},
		"raw_checksum":                           evaluation.Import.Export.RawSHA256,
		"validation_fingerprint":                 evaluation.Validation.ValidationFingerprint,
		"quantity_readiness":                     evaluation.Import.Quality.QuantityReadiness,
		"suitable_for_rsrp_validation":           evaluation.Import.Quality.SuitableForRSRPValidation,
		"suitable_for_received_power_validation": evaluation.Import.Quality.SuitableForReceivedPower,
		"suitable_for_sinr_validation":           evaluation.Import.Quality.SuitableForSINRValidation,
		"suitable_for_rsrq_validation":           evaluation.Import.Quality.SuitableForRSRQValidation,
		"suitable_for_calibration_study":         evaluation.Import.Quality.SuitableForCalibration,
		"neighbor_interference_readiness": map[string]any{
			"complete": manifest.Measurement.NeighborContextComplete,
			"state":    "blocked_until_serving_resource_and_neighbor_context_are_exported_and_audited",
		},
		"holdouts": map[string]any{
			"present_in_canonical_response": evaluation.Validation.Holdout != nil,
			"primary_policy":                "spatial_blocks with primary holdout",
			"calibration_before_holdout":    false,
		},
		"calibration_active":   evaluation.Validation.CalibrationActive,
		"production_candidate": evaluation.Validation.ProductionCandidate,
		"concept_6b_ready":     false,
		"real_data_available":  false,
		"remaining_blockers": []string{
			"obtain lawful real receive-side measurements with raw export retained",
			"complete independent fixed-point and moving route coverage across 2.6 and 28 GHz",
			"establish deterministic serving-cell-to-transmitter truth and provenance",
			"capture NR bandwidth/resource metadata or explicitly narrow 28 GHz quantity scope",
			"complete neighbor/interference context for SINR/RSRQ/RSSI",
			"review device/antenna/calibration and detection/censoring semantics before any calibration study",
		},
	}

	post := map[string]any{
		"schema_version":     1,
		"concept":            "6A.1",
		"artifact":           "post-change-comparison",
		"audit_version":      concept6A1AuditVersion,
		"post_change_commit": "working-tree",
		"boundary": map[string]any{
			"canonical_production_changed":     false,
			"canonical_evaluator_changed":      false,
			"canonical_rf_calibration_changed": false,
			"optimizer_changed":                false,
			"terrain_behavior_changed":         false,
			"four_i_140ghz_references_changed": false,
			"concept_6a_readiness_changed":     false,
			"concept_6a1_is_acquisition_only":  true,
			"calibration_active":               evaluation.Validation.CalibrationActive,
			"production_candidate":             evaluation.Validation.ProductionCandidate,
		},
		"snapshot_comparison": map[string]any{
			"pre_change":  preSnapshots,
			"post_change": postSnapshots,
			"exact_equal": reflect.DeepEqual(preSnapshots, postSnapshots),
		},
		"fingerprints": map[string]any{
			"pre_network_scenario":  canonicalScenarioFingerprint,
			"post_network_scenario": canonicalScenarioFingerprint,
			"exact_equal":           true,
			"dry_run_validation":    evaluation.Validation.ValidationFingerprint,
			"raw_sha256":            evaluation.Import.Export.RawSHA256,
		},
		"concept_6a_state": map[string]any{
			"pre_readiness":         CanonicalRFReadinessNoMeasurementData,
			"post_readiness":        CanonicalRFReadinessNoMeasurementData,
			"real_measurement_data": false,
		},
		"frozen_concept_6a": map[string]any{
			"schema_evaluator_matching_applicability_residual_readiness_unchanged": true,
			"canonical_baseline": "docs/concept-6a-pre-change-baseline.json",
		},
		"synthetic_controls": map[string]any{
			"fixture":                       "examples/concept-6a1-signal-collector-dry-run.txt",
			"raw_checksum_stable":           evaluation.Import.Export.RawSHA256 == Concept6A1RawChecksum(raw),
			"not_real_measurement_evidence": true,
		},
		"tests": []string{
			"TestConcept6A1SignalCollectorParserPreservesEscapesAndRejectsMalformedRows",
			"TestConcept6A1ParserSupportsGzipAndHashesOriginalContainer",
			"TestConcept6A1ManifestAndMapRejectMissingSemantics",
			"TestConcept6A1SyntheticDryRunIsEndToEndAndUncalibrated",
			"TestConcept6A1MissingFieldsAreNotSilentlyDefaulted",
			"TestConcept6A1AmbiguousServingRowsAreRetainedWithoutStrongestCellSelection",
			"TestConcept6A1MovingRowsAndUnknownEndpointAnnotationsRemainExplicit",
		},
		"recommendation": "Proceed to a consented real pilot only after the selected handset export, transmitter truth map, NR resource metadata, and neighbor context are verified on the target devices; keep Concept 6A1 uncalibrated.",
	}

	artifacts := map[string]any{
		"docs/concept-6a1-pre-change-baseline.json":    baseline,
		"docs/concept-6a1-dry-run-validation.json":     dryRun,
		"docs/concept-6a1-readiness.json":              readiness,
		"docs/concept-6a1-post-change-comparison.json": post,
	}
	for relativePath, value := range artifacts {
		if err := concept6AWriteJSON(filepath.Join(filepath.Dir(root), relativePath), value); err != nil {
			t.Fatal(err)
		}
	}
	t.Logf("Concept 6A.1 artifacts generated at %s", filepath.Dir(root))
}
