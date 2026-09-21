package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"ankara-5g-raytracer/raytracer"
)

const maxJSONArtifactBytes = 8 << 20

type campaignReport struct {
	SchemaVersion        int                                       `json:"schema_version"`
	Adapter              string                                    `json:"adapter"`
	RawFormat            string                                    `json:"raw_format"`
	RawContainer         string                                    `json:"raw_container"`
	RawSHA256            string                                    `json:"raw_sha256"`
	RawBytes             int                                       `json:"raw_bytes"`
	CanonicalDataset     raytracer.CanonicalRFValidationDataset    `json:"canonical_dataset"`
	ImportedObservations []raytracer.Concept6A1ImportedObservation `json:"imported_observations"`
	Quality              raytracer.Concept6A1QualityReport         `json:"quality"`
	Validation           raytracer.CanonicalRFValidationResponse   `json:"validation"`
	CalibrationActive    bool                                      `json:"calibration_active"`
	ProductionCandidate  bool                                      `json:"production_candidate"`
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "import-concept-6a1:", err)
		os.Exit(1)
	}
}

func run() error {
	rawPath := flag.String("raw", "", "path to an immutable Signal Collector V6 .txt or .txt.gz export")
	manifestPath := flag.String("manifest", "", "path to a Concept 6A.1 campaign manifest JSON")
	mapPath := flag.String("transmitter-map", "", "path to a Concept 6A.1 transmitter map JSON")
	outputPath := flag.String("output", "", "optional report output path; stdout when omitted")
	flag.Parse()
	if *rawPath == "" || *manifestPath == "" || *mapPath == "" {
		return errors.New("-raw, -manifest, and -transmitter-map are required")
	}
	raw, err := readRaw(*rawPath)
	if err != nil {
		return fmt.Errorf("read raw export: %w", err)
	}
	var manifest raytracer.Concept6A1CampaignManifest
	if err := readJSON(*manifestPath, &manifest); err != nil {
		return fmt.Errorf("read campaign manifest: %w", err)
	}
	var transmitterMap raytracer.Concept6A1TransmitterMap
	if err := readJSON(*mapPath, &transmitterMap); err != nil {
		return fmt.Errorf("read transmitter map: %w", err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	evaluation, err := raytracer.EvaluateConcept6A1SignalCollector(ctx, raw, manifest, transmitterMap, nil)
	if err != nil {
		return err
	}
	report := campaignReport{
		SchemaVersion:        raytracer.Concept6A1SchemaVersion,
		Adapter:              raytracer.Concept6A1CollectorAdapterVersion,
		RawFormat:            evaluation.Import.Export.FormatVersion,
		RawContainer:         evaluation.Import.Export.RawContainer,
		RawSHA256:            evaluation.Import.Export.RawSHA256,
		RawBytes:             evaluation.Import.Export.RawBytes,
		CanonicalDataset:     evaluation.Import.Dataset,
		ImportedObservations: evaluation.Import.Observations,
		Quality:              evaluation.Import.Quality,
		Validation:           evaluation.Validation,
		CalibrationActive:    evaluation.Validation.CalibrationActive,
		ProductionCandidate:  evaluation.Validation.ProductionCandidate,
	}
	encoded, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return fmt.Errorf("encode report: %w", err)
	}
	encoded = append(encoded, '\n')
	if *outputPath == "" {
		_, err = os.Stdout.Write(encoded)
		return err
	}
	if err := os.WriteFile(*outputPath, encoded, 0644); err != nil {
		return fmt.Errorf("write report: %w", err)
	}
	return nil
}

func readJSON(path string, target any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if len(data) > maxJSONArtifactBytes {
		return fmt.Errorf("JSON artifact exceeds %d bytes", maxJSONArtifactBytes)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return errors.New("JSON artifact contains trailing values")
		}
		return err
	}
	return nil
}

func readRaw(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	raw, err := io.ReadAll(io.LimitReader(file, raytracer.Concept6A1MaxRawBytes+1))
	if err != nil {
		return nil, err
	}
	if len(raw) > raytracer.Concept6A1MaxRawBytes {
		return nil, fmt.Errorf("raw export exceeds %d bytes", raytracer.Concept6A1MaxRawBytes)
	}
	return raw, nil
}
