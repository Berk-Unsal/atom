package raytracer

import (
	"math"
	"sort"
)

func calculateInterferenceStats(req InterferenceRequest, features []InterferenceFeature, demandCandidates int, affectedDemandBuildings int, affectedDemand float64) InterferenceStats {
	stats := InterferenceStats{
		SampleCount:             len(features),
		DemandCandidates:        demandCandidates,
		AffectedDemandBuildings: affectedDemandBuildings,
		AffectedDemand:          affectedDemand,
		OutageByReason:          make(map[string]int),
		PerServingCell:          make([]InterferenceCellSummary, 0),
	}
	sinrValues := make([]float64, 0, len(features))
	rsrpValues := make([]float64, 0, len(features))
	rsrqValues := make([]float64, 0, len(features))
	cellStats := make(map[string]*cellAccumulator)
	for _, feature := range features {
		properties := feature.Properties
		if properties.RSRPDBm == nil || properties.SINRDB == nil || properties.RSRQDB == nil {
			stats.NoSignalCount++
			if len(properties.ServiceabilityFailures) == 0 {
				stats.OutageByReason["no_eligible_carrier"]++
			} else {
				for _, reason := range properties.ServiceabilityFailures {
					stats.OutageByReason[reason]++
				}
			}
			continue
		}
		stats.SignalSamples++
		if properties.Serviceable {
			stats.ServiceableSamples++
		}
		if properties.InterferenceLimited {
			stats.InterferenceLimitedCount++
		}
		if !properties.Serviceable {
			for _, reason := range properties.ServiceabilityFailures {
				stats.OutageByReason[reason]++
			}
		}
		sinrValues = append(sinrValues, *properties.SINRDB)
		rsrpValues = append(rsrpValues, *properties.RSRPDBm)
		rsrqValues = append(rsrqValues, *properties.RSRQDB)
		accumulator := cellStats[properties.ServingCellID]
		if accumulator == nil {
			accumulator = &cellAccumulator{channelID: properties.ChannelID}
			cellStats[properties.ServingCellID] = accumulator
		}
		accumulator.servingSamples++
		if properties.Serviceable {
			accumulator.serviceable++
		}
		accumulator.sinrTotal += *properties.SINRDB
		accumulator.rsrpTotal += *properties.RSRPDBm
		accumulator.rsrqTotal += *properties.RSRQDB
	}
	if stats.SampleCount > 0 {
		stats.ServiceablePct = roundOne(100 * float64(stats.ServiceableSamples) / float64(stats.SampleCount))
		stats.InterferenceLimitedPct = roundOne(100 * float64(stats.InterferenceLimitedCount) / float64(stats.SampleCount))
	}
	stats.ValidSampleCount = len(sinrValues)
	if stats.ValidSampleCount > 0 {
		stats.AvgSINRDB = floatPointer(roundOne(averageFloat64(sinrValues)))
		stats.P10SINRDB = floatPointer(roundOne(nearestRankPercentile(sinrValues, 10)))
		stats.MedianSINRDB = floatPointer(roundOne(nearestRankPercentile(sinrValues, 50)))
		stats.AvgRSRPDBm = floatPointer(roundOne(averageFloat64(rsrpValues)))
		stats.P10RSRPDBm = floatPointer(roundOne(nearestRankPercentile(rsrpValues, 10)))
		stats.AvgRSRQDB = floatPointer(roundOne(averageFloat64(rsrqValues)))
		stats.P10RSRQDB = floatPointer(roundOne(nearestRankPercentile(rsrqValues, 10)))
	}
	if stats.SignalSamples > 0 {
		fraction := roundOne(float64(stats.ServiceableSamples) / float64(stats.SignalSamples))
		stats.ServiceableFraction = floatPointer(fraction)
	}
	for _, tower := range req.Towers {
		accumulator := cellStats[tower.ID]
		if accumulator == nil || accumulator.servingSamples == 0 {
			continue
		}
		count := float64(accumulator.servingSamples)
		stats.PerServingCell = append(stats.PerServingCell, InterferenceCellSummary{
			CellID:             tower.ID,
			ChannelID:          accumulator.channelID,
			ServingSamples:     accumulator.servingSamples,
			ServiceableSamples: accumulator.serviceable,
			AvgSINRDB:          roundOne(accumulator.sinrTotal / count),
			AvgRSRPDBm:         roundOne(accumulator.rsrpTotal / count),
			AvgRSRQDB:          roundOne(accumulator.rsrqTotal / count),
		})
	}
	return stats
}

func DBmToMilliwatts(dbm float64) float64 {
	return math.Pow(10, dbm/10)
}

func MilliwattsToDBm(milliwatts float64) float64 {
	if milliwatts <= 0 {
		return math.Inf(-1)
	}
	return 10 * math.Log10(milliwatts)
}

func ThermalNoisePerREDBm(subcarrierSpacingKHz float64, noiseFigureDB float64) float64 {
	return ThermalNoiseDBm(subcarrierSpacingKHz*1000, noiseFigureDB, ReceiverReferenceTemperatureK)
}

func interferenceQualityClass(rsrpDBm float64, sinrDB float64, rsrqDB float64) string {
	if rsrpDBm < -100 || sinrDB < 0 || rsrqDB < -20 {
		return "poor"
	}
	if rsrpDBm < -90 || sinrDB < 13 || rsrqDB < -15 {
		return "fair"
	}
	if rsrpDBm < -80 || sinrDB < 20 || rsrqDB < -10 {
		return "good"
	}
	return "excellent"
}

func pointInsideAnyTowerRadius(req InterferenceRequest, point Point) bool {
	for index, tower := range req.Towers {
		profile := effectiveInterferenceTowerProfile(req, tower, index)
		if ApproxDistanceMeters(Point{Lon: tower.TowerLon, Lat: tower.TowerLat}, point) <= profile.RadiusMeters {
			return true
		}
	}
	return false
}

func nearestRankPercentile(values []float64, percentile float64) float64 {
	if len(values) == 0 {
		return 0
	}
	sorted := append([]float64(nil), values...)
	sort.Float64s(sorted)
	rank := int(math.Ceil(percentile / 100 * float64(len(sorted))))
	if rank < 1 {
		rank = 1
	}
	if rank > len(sorted) {
		rank = len(sorted)
	}
	return sorted[rank-1]
}

func averageFloat64(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	total := 0.0
	for _, value := range values {
		total += value
	}
	return total / float64(len(values))
}

func roundOne(value float64) float64 {
	return math.Round(value*10) / 10
}

func floatPointer(value float64) *float64 {
	return &value
}

func pointerValue(value *float64) float64 {
	if value == nil {
		return math.Inf(-1)
	}
	return *value
}
