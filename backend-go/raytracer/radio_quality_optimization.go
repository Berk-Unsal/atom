package raytracer

import (
	"context"
	"math"
	"sort"
)

// radioQualityOptimizationLink contains geometry that is invariant across an
// azimuth candidate. Antenna eligibility and the directional link budget are
// deliberately evaluated in the candidate hot loop.
type radioQualityOptimizationLink struct {
	inHorizon          bool
	geometryValid      bool
	distanceM          float64
	bearingDeg         float64
	losState           PropagationLOSState
	endpointCase       PropagationEndpointCase
	wallCount          int
	losClassification  *LOSClassification
	buildingDataActive bool
}

type radioQualityOptimizationCell struct {
	id                string
	profile           CellRFProfile
	receiverThreshold ReceiverThreshold
	preset            interferencePreset
	links             []radioQualityOptimizationLink
}

type radioQualityOptimizationContext struct {
	request             InterferenceRequest
	samples             []gridSample
	cells               []radioQualityOptimizationCell
	noiseFigureDB       float64
	calibrationOffsetDB float64
	metadata            OptimizationRadioQualityMetadata
}

// prepareRadioQualityOptimizationContext builds one candidate-independent
// sampled domain and caches path geometry before any azimuth scoring occurs.
func prepareRadioQualityOptimizationContext(ctx context.Context, req NetworkOptimizationRequest, buildings *BuildingIndex) (*radioQualityOptimizationContext, OptimizationRadioQualityMetadata, error) {
	metadata := defaultRadioQualityOptimizationMetadata(false, req)
	if !optimizationObjectiveEnabled(req.Optimization, radioQualityOptimizationObjectiveID) {
		metadata.Reason = "disabled"
		return nil, metadata, nil
	}
	metadata.Enabled = true

	interferenceRequest := networkOptimizationInterferenceRequest(req)
	for _, tower := range interferenceRequest.Towers {
		profile := tower.RFProfile.normalized()
		if !IsAnalysisTechnology(profile.NetworkTech) {
			metadata.Available = false
			metadata.Reason = RadioQualityOptimizationUnavailableReason
			return nil, metadata, nil
		}
		if _, err := interferencePresetFor(profile.NetworkTech, profile.BandwidthMHz); err != nil {
			metadata.Available = false
			metadata.Reason = RadioQualityOptimizationUnavailableReason
			return nil, metadata, nil
		}
	}

	samples, effectiveSpacing, err := buildInterferenceGridContext(ctx, interferenceRequest)
	if err != nil {
		return nil, metadata, err
	}
	if len(samples) == 0 {
		metadata.Reason = "no_evaluation_samples"
		return nil, metadata, nil
	}
	metadata.SampleCount = len(samples)
	metadata.SampleSpacingM = effectiveSpacing
	metadata.DomainID = radioQualityOptimizationDomainID(interferenceRequest, samples, effectiveSpacing)

	preparedCells := make([]radioQualityOptimizationCell, 0, len(interferenceRequest.Towers))
	for index, tower := range interferenceRequest.Towers {
		if err := ctx.Err(); err != nil {
			return nil, metadata, err
		}
		profile := effectiveInterferenceTowerProfile(interferenceRequest, tower, index).normalized()
		preset, presetErr := interferencePresetFor(profile.NetworkTech, profile.BandwidthMHz)
		if presetErr != nil {
			metadata.Available = false
			metadata.Reason = RadioQualityOptimizationUnavailableReason
			return nil, metadata, nil
		}
		threshold := receiverThresholdForProfileOrManual(profile)
		cell := radioQualityOptimizationCell{
			id: tower.ID, profile: profile, receiverThreshold: threshold,
			preset: preset, links: make([]radioQualityOptimizationLink, len(samples)),
		}
		origin := Point{Lon: tower.TowerLon, Lat: tower.TowerLat}
		for sampleIndex, sample := range samples {
			if sampleIndex%32 == 0 {
				if err := ctx.Err(); err != nil {
					return nil, metadata, err
				}
			}
			distance := ApproxDistanceMeters(origin, sample.point)
			link := radioQualityOptimizationLink{
				inHorizon:     distance <= profile.RadiusMeters,
				distanceM:     distance,
				bearingDeg:    BearingDegrees(origin, sample.point),
				geometryValid: true,
			}
			if !link.inHorizon {
				cell.links[sampleIndex] = link
				continue
			}
			pathGeometry, geometryErr := buildPropagationPathGeometryContextWithOptions(ctx, origin, sample.point, buildings, propagationPathGeometryOptions{
				TxHeightM: profile.AntennaHeightM,
				RxHeightM: profile.ReceiverHeightM,
			})
			if geometryErr != nil {
				if ctxErr := ctx.Err(); ctxErr != nil {
					return nil, metadata, ctxErr
				}
				// Keep the point in the fixed denominator, but make the link
				// unavailable rather than silently falling back to a different
				// geometry calculation.
				link.geometryValid = false
				cell.links[sampleIndex] = link
				continue
			}
			link.buildingDataActive = pathGeometry.available
			link.losState, link.endpointCase, link.wallCount, link.losClassification = classifyPropagationPath(profile, pathGeometry, sample.point, distance)
			cell.links[sampleIndex] = link
		}
		preparedCells = append(preparedCells, cell)
	}

	metadata.Available = true
	metadata.Reason = ""
	return &radioQualityOptimizationContext{
		request:             interferenceRequest,
		samples:             samples,
		cells:               preparedCells,
		noiseFigureDB:       radioQualityOptimizationNoiseFigure(req),
		calibrationOffsetDB: req.CalibrationOffsetDB,
		metadata:            metadata,
	}, metadata, nil
}

func defaultRadioQualityOptimizationMetadata(enabled bool, req NetworkOptimizationRequest) OptimizationRadioQualityMetadata {
	metadata := OptimizationRadioQualityMetadata{
		Enabled:                  enabled,
		Available:                false,
		DomainDescription:        RadioQualityOptimizationDomainDescription,
		SampleOrdering:           RadioQualityOptimizationSampleOrdering,
		DomainSource:             RadioQualityOptimizationDomainSource,
		HorizonMode:              RadioQualityOptimizationHorizonMode,
		HorizonDescription:       RadioQualityInterferenceHorizonSemantics,
		PolicyID:                 "planning-default-v1",
		RSRPThresholdDBm:         InterferenceRSRPThresholdDBm,
		SINRThresholdDB:          InterferenceSINRThresholdDB,
		RSRQThresholdDB:          InterferenceRSRQThresholdDB,
		ServiceabilityRule:       "serviceable = RSRP >= threshold AND SINR >= threshold AND RSRQ >= threshold",
		ServingSelectionMode:     RadioQualityServingSelectionAutomatic,
		ServingSelectionMetric:   RadioQualityServingSelectionMetric,
		CoChannelEligibilityRule: RadioQualityCoChannelRule,
		HorizonBounded:           true,
	}
	if !enabled {
		metadata.Reason = "disabled"
	}
	interferenceRequest := networkOptimizationInterferenceRequest(req)
	metadata.SampleSpacingM = interferenceRequest.SampleSpacingM
	metadata.HorizonMeters = interferenceHorizonMeters(interferenceRequest)
	return metadata
}

func networkOptimizationInterferenceRequest(req NetworkOptimizationRequest) InterferenceRequest {
	interferenceRequest := InterferenceRequest{
		NetworkTech:         req.RFProfile.NetworkTech,
		RadiusMeters:        req.RadiusMeters,
		FrequencyGHz:        req.FrequencyGHz,
		TxPowerDBm:          req.TxPowerDBm,
		BeamWidthDeg:        req.BeamWidthDeg,
		BandwidthMHz:        req.RFProfile.BandwidthMHz,
		LoadFactor:          req.RFProfile.LoadFactor,
		ReuseFactor:         req.RFProfile.ReuseFactor,
		NoiseFigureDB:       req.RFProfile.ReceiverNoiseFigureDB,
		SampleSpacingM:      DefaultInterferenceSpacingM,
		CalibrationOffsetDB: req.CalibrationOffsetDB,
		RFProfile:           req.RFProfile,
		Towers:              make([]InterferenceTowerRequest, 0, len(req.Towers)),
	}
	for _, tower := range req.Towers {
		profile := tower.RFProfile
		if profile.SchemaVersion == 0 {
			profile = req.RFProfile
		}
		interferenceRequest.Towers = append(interferenceRequest.Towers, InterferenceTowerRequest{
			ID: tower.ID, TowerLon: tower.TowerLon, TowerLat: tower.TowerLat,
			AzimuthDeg: tower.AzimuthDeg, RFProfile: profile,
		})
	}
	NormalizeInterferenceRequest(&interferenceRequest)
	return interferenceRequest
}

func radioQualityOptimizationNoiseFigure(req NetworkOptimizationRequest) float64 {
	noiseFigure := req.RFProfile.ReceiverNoiseFigureDB
	if !isFiniteRadioValue(noiseFigure) || noiseFigure < 0 {
		return DefaultInterferenceNoiseFigure
	}
	return noiseFigure
}

func radioQualityOptimizationDomainID(req InterferenceRequest, samples []gridSample, spacing float64) string {
	type domainSample struct {
		Row int     `json:"row"`
		Col int     `json:"col"`
		Lon float64 `json:"lon"`
		Lat float64 `json:"lat"`
	}
	horizons := interferenceHorizonMeters(req)
	ordered := make([]domainSample, 0, len(samples))
	for _, sample := range samples {
		ordered = append(ordered, domainSample{
			Row: sample.row, Col: sample.col,
			Lon: roundFloat(sample.point.Lon, 9), Lat: roundFloat(sample.point.Lat, 9),
		})
	}
	return fingerprintJSON("radio-quality-domain", struct {
		Version  string         `json:"version"`
		Source   string         `json:"source"`
		SpacingM float64        `json:"spacing_m"`
		Horizons []float64      `json:"horizons_m"`
		Samples  []domainSample `json:"samples"`
	}{
		Version:  RadioQualityOptimizationDomainIDVersion,
		Source:   RadioQualityOptimizationDomainSource,
		SpacingM: roundFloat(spacing, 6),
		Horizons: horizons,
		Samples:  ordered,
	})
}

// evaluate returns compact aggregate raw metrics. It deliberately does not
// allocate the public interference ledger or per-interferer explanations.
func (optimizationContext *radioQualityOptimizationContext) evaluate(ctx context.Context, azimuths []float64) (OptimizationRawMetrics, error) {
	raw := OptimizationRawMetrics{
		RadioQualityTotalSamples: len(optimizationContext.samples),
		RadioQualityOutageByReason: map[string]int{
			"no_carrier": 0, "rsrp_failed": 0, "sinr_failed": 0,
			"rsrq_failed": 0, "multiple_failures": 0, "unavailable_configuration": 0,
		},
		RadioQualityServingCellSamples: make(map[string]int),
	}
	if raw.RadioQualityTotalSamples == 0 {
		return raw, nil
	}
	sinrValues := make([]float64, 0, len(optimizationContext.samples))
	rsrpValues := make([]float64, 0, len(optimizationContext.samples))
	rsrqValues := make([]float64, 0, len(optimizationContext.samples))
	for sampleIndex := range optimizationContext.samples {
		if sampleIndex%16 == 0 {
			if err := ctx.Err(); err != nil {
				return OptimizationRawMetrics{}, err
			}
		}
		pointSignals := make([]receivedCellSignal, 0, len(optimizationContext.cells))
		for cellIndex, cell := range optimizationContext.cells {
			if sampleIndex >= len(cell.links) {
				continue
			}
			link := cell.links[sampleIndex]
			if !link.inHorizon || !link.geometryValid {
				continue
			}
			azimuth := 0.0
			if cellIndex < len(azimuths) {
				azimuth = azimuths[cellIndex]
			}
			antenna := EvaluateAntennaLink(cell.profile, math.Max(link.distanceM, 1), link.bearingDeg, azimuth)
			if !antenna.Eligible {
				continue
			}
			propagation := EvaluatePropagationLink(PropagationLinkContext{
				Profile: cell.profile, GroundDistanceM: link.distanceM,
				HorizontalOffsetDeg: antenna.HorizontalOffsetDeg,
				CalibrationOffsetDB: optimizationContext.calibrationOffsetDB,
				LOSState:            link.losState, EndpointCase: link.endpointCase,
				LOSClassification:     link.losClassification,
				BuildingDataAvailable: link.buildingDataActive,
				WallEventCount:        link.wallCount, ReceiverThreshold: &cell.receiverThreshold,
			})
			carrierDBm := propagation.ReceivedPowerDBm
			if !isFiniteRadioValue(carrierDBm) {
				continue
			}
			rsrpDBm, ok := carrierPowerToReferencePower(carrierDBm, cell.preset)
			if !ok {
				continue
			}
			rsrpMW, ok := referencePowerMilliwatts(rsrpDBm)
			if !ok {
				continue
			}
			pointSignals = append(pointSignals, receivedCellSignal{
				cellID: cell.id, networkTech: cell.profile.NetworkTech,
				channelID: cell.profile.ChannelID, frequencyGHz: cell.profile.FrequencyGHz,
				bandwidthMHz: cell.profile.BandwidthMHz, receivedCarrierDBm: carrierDBm,
				rsrpDBm: rsrpDBm, loadFactor: cell.profile.LoadFactor, preset: cell.preset,
				receiverThreshold: cell.receiverThreshold,
				servingEligible:   ReceiverUsableSignal(carrierDBm, cell.receiverThreshold.SensitivityDBm),
				linkBudget:        propagation.LinkBudget, wallCount: link.wallCount,
				losState: string(propagation.LOSState), classifierID: propagation.LOSClassifierID,
				classificationBasis: propagation.ClassificationBasis, terrainStatus: propagation.TerrainStatus,
				losClassification: propagation.LOSClassification,
			})
			_ = rsrpMW // the reference power is re-derived below to keep the signal type compact
		}

		serving, servingFound := selectServingInterferenceSignal(InterferenceRequest{ServingCellID: ""}, pointSignals)
		if !servingFound {
			raw.RadioQualityOutageByReason["no_carrier"]++
			continue
		}
		raw.RadioQualityServingCellSamples[serving.cellID]++
		servingMW, servingOK := referencePowerMilliwatts(serving.rsrpDBm)
		if !servingOK {
			raw.RadioQualityOutageByReason["unavailable_configuration"]++
			continue
		}
		noiseDBm := ThermalNoisePerREDBm(serving.preset.scsKHz, optimizationContext.noiseFigureDB)
		noiseMW := DBmToMilliwatts(noiseDBm)
		interferenceMW := 0.0
		for _, signal := range pointSignals {
			if signal.cellID == serving.cellID || !sameInterferenceCarrier(signal, serving) {
				continue
			}
			interfererMW, ok := referencePowerMilliwatts(signal.rsrpDBm)
			if ok {
				interferenceMW += interfererMW * signal.loadFactor
			}
		}
		metrics := computeRadioQualityMetrics(servingMW, interferenceMW, noiseMW, serving.preset.resourceBlocks)
		failures := radioQualityServiceabilityFailures(serving.rsrpDBm, metrics.SINRDB, metrics.RSRQDB)
		if len(failures) == 0 {
			raw.RadioQualityServiceableSamples++
		} else {
			raw.RadioQualityOutageByReason[radioQualityOptimizationOutageReason(failures)]++
		}
		sinrValues = append(sinrValues, metrics.SINRDB)
		rsrpValues = append(rsrpValues, serving.rsrpDBm)
		rsrqValues = append(rsrqValues, metrics.RSRQDB)
	}
	raw.RadioQualityServiceableFraction = ratio01(float64(raw.RadioQualityServiceableSamples), float64(raw.RadioQualityTotalSamples))
	if len(sinrValues) > 0 {
		p10SINR, medianSINR := nearestRankPercentile(sinrValues, 10), nearestRankPercentile(sinrValues, 50)
		p10RSRP, medianRSRP := nearestRankPercentile(rsrpValues, 10), nearestRankPercentile(rsrpValues, 50)
		p10RSRQ, medianRSRQ := nearestRankPercentile(rsrqValues, 10), nearestRankPercentile(rsrqValues, 50)
		raw.RadioQualityP10SINRDB, raw.RadioQualityMedianSINRDB = floatPointer(p10SINR), floatPointer(medianSINR)
		raw.RadioQualityP10RSRPDBm, raw.RadioQualityMedianRSRPDBm = floatPointer(p10RSRP), floatPointer(medianRSRP)
		raw.RadioQualityP10RSRQDB, raw.RadioQualityMedianRSRQDB = floatPointer(p10RSRQ), floatPointer(medianRSRQ)
	}
	return raw, nil
}

func radioQualityOptimizationOutageReason(failures []string) string {
	if len(failures) > 1 {
		return "multiple_failures"
	}
	if len(failures) == 0 {
		return "unavailable_configuration"
	}
	switch failures[0] {
	case "rsrp_below_threshold":
		return "rsrp_failed"
	case "sinr_below_threshold":
		return "sinr_failed"
	case "rsrq_below_threshold":
		return "rsrq_failed"
	default:
		return "unavailable_configuration"
	}
}

func radioQualityMetricsEvaluated(stats NetworkOptimizationStats) bool {
	return stats.RawMetrics.RadioQualityTotalSamples > 0
}

func radioQualityOptimizationMetadataPointer(metadata OptimizationRadioQualityMetadata) *OptimizationRadioQualityMetadata {
	copy := metadata
	copy.HorizonMeters = append([]float64(nil), metadata.HorizonMeters...)
	return &copy
}

// Keep a deterministic helper available to tests and report adapters that
// need a stable serving-cell distribution without relying on map iteration.
func sortedRadioQualityServingCellSamples(samples map[string]int) []string {
	ids := make([]string, 0, len(samples))
	for id := range samples {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
