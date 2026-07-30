package raytracer

import "math"

func FreeSpacePathLossMetersGHz(distanceMeters float64, frequencyGHz float64) float64 {
	distance := math.Max(distanceMeters, 1)
	return 20*math.Log10(distance) + 20*math.Log10(frequencyGHz) + 32.45
}

func PenetrationLossForFrequencyGHz(frequencyGHz float64) float64 {
	switch {
	case frequencyGHz < LTEFrequencyMaxGHz:
		return 8
	case frequencyGHz < NRFrequencyMaxGHz:
		return 30
	default:
		return 80
	}
}

func ReceivedPowerDBm(distanceMeters float64, frequencyGHz float64, txPowerDBm float64, attenuationDB float64) float64 {
	return EffectiveIsotropicRadiatedPowerDBm(txPowerDBm) - FreeSpacePathLossMetersGHz(distanceMeters, frequencyGHz) - attenuationDB
}

func MaxTheoreticalDistanceMeters(txPowerDBm float64, frequencyGHz float64, attenuationDB float64) float64 {
	if frequencyGHz <= 0 {
		return 0
	}
	exponent := (EffectiveIsotropicRadiatedPowerDBm(txPowerDBm) - ReceiverSensitivity - attenuationDB - 20*math.Log10(frequencyGHz) - 32.45) / 20
	return math.Pow(10, exponent)
}

func EffectiveIsotropicRadiatedPowerDBm(txPowerDBm float64) float64 {
	return txPowerDBm + AntennaGainDBi
}
