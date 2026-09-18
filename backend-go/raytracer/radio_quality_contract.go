package raytracer

import (
	"fmt"
	"math"
)

// RadioQualityContractVersion identifies the serialized planning semantics of
// the interference measurements. It is deliberately separate from the RF
// propagation model version: radio-quality diagnostics may evolve without
// changing the canonical received-power surface or optimizer.
const RadioQualityContractVersion = "atom-radio-quality-v1"

const (
	RadioQualityServingSelectionAutomatic    = "automatic_strongest_eligible"
	RadioQualityServingSelectionExplicit     = "explicit_cell_id"
	RadioQualityServingSelectionMetric       = "rsrp_dbm"
	RadioQualityCoChannelRule                = "exact channel_id, frequency_ghz, bandwidth_mhz, and technology match"
	RadioQualityCarrierPowerSemantics        = "received_carrier_power_dbm is propagation final power integrated over the configured carrier"
	RadioQualityResourceBasis                = "one occupied frequency resource element / subcarrier bandwidth"
	RadioQualityNoiseBandwidthSource         = "subcarrier_spacing_resource"
	RadioQualityRSRPConversionID             = "uniform-carrier-to-reference-resource-v1"
	RadioQualityLoadAssumption               = "configured deterministic full-resource occupancy factor; no scheduler or per-symbol allocation is modeled"
	RadioQualityAdjacentChannelModel         = "excluded"
	RadioQualityPartialOverlapModel          = "deferred"
	RadioQualityOptimizationCoupling         = "diagnostic-only; no radio-quality KPI feeds canonical optimization"
	RadioQualityServingAdmissionRule         = "serving selection requires strict received_carrier_power_dbm > the effective per-cell receiver sensitivity; finite non-serving signals are still eligible for co-channel interference"
	RadioQualityInterferenceHorizonSource    = "effective_cell_profile.radius_m"
	RadioQualityInterferenceHorizonSemantics = "finite per-cell interference-analysis horizon; outside_radius means the point is beyond that cell's configured radius and is not physical zero RF power or a receiver-sensitivity result"
)

// RadioQualityReference records the exact public specification section that
// informed a planning approximation. The implementation does not claim UE
// conformance: LTE CRS and NR SS/CSI measurement procedures require signal,
// time, and resource details that this deterministic planner does not model.
type RadioQualityReference struct {
	ID            string `json:"id"`
	Revision      string `json:"revision"`
	Sections      string `json:"sections"`
	URL           string `json:"url"`
	Applicability string `json:"applicability"`
}

func radioQualityReferences() []RadioQualityReference {
	return []RadioQualityReference{
		{
			ID: "3gpp-ts-36.214", Revision: "V18.1.0 (2025-07), Release 18",
			Sections:      "§5.1.1 RSRP; §5.1.3 RSRQ; §5.1.23 RS-SINR; §5.1.24 RSSI; §5.2.2-§5.2.3 received interference and thermal noise",
			URL:           "https://www.etsi.org/deliver/etsi_ts/136200_136299/136214/18.01.00_60/ts_136214v180100p.pdf",
			Applicability: "LTE planning reference; CRS-shaped approximation, not UE conformance",
		},
		{
			ID: "3gpp-ts-38.215", Revision: "V19.1.0 (2025-10), Release 19",
			Sections:      "§5.1.1 SS-RSRP; §5.1.3 SS-RSRQ; §5.1.5 SS-SINR; §5.1.21 RSSI",
			URL:           "https://www.etsi.org/deliver/etsi_ts/138200_138299/138215/19.01.00_60/ts_138215v190100p.pdf",
			Applicability: "NR SS planning reference; SSB/SS-shaped approximation, not UE conformance",
		},
		{
			ID: "3gpp-ts-36.211", Revision: "V12.5.0 (2015-01), Release 12",
			Sections:      "§6.2.3 physical resource blocks; 12 subcarriers at 15 kHz for normal LTE PRB",
			URL:           "https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/12.05.00_60/ts_136211v120500p.pdf",
			Applicability: "LTE resource-width normalization reference",
		},
		{
			ID: "3gpp-ts-38.104", Revision: "V18.10.0 (2025-10), Release 18",
			Sections:      "§5.3.2 NR transmission bandwidth configuration; FR2 120 kHz RB mappings",
			URL:           "https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/18.10.00_60/ts_138104v181000p.pdf",
			Applicability: "NR resource-block mapping reference",
		},
	}
}

// RadioQualityPowerLedgerEntry exposes every selected-cell decision at a
// sample. Power values are intentionally carried in both dBm and mW where the
// latter is used in a sum, so a consumer can audit the domain conversion.
type RadioQualityPowerLedgerEntry struct {
	CellID                  string             `json:"cell_id"`
	Role                    string             `json:"role,omitempty"`
	NetworkTech             string             `json:"network_tech"`
	ChannelID               string             `json:"channel_id"`
	FrequencyGHz            float64            `json:"frequency_ghz"`
	BandwidthMHz            float64            `json:"bandwidth_mhz"`
	ReceivedCarrierPowerDBm *float64           `json:"received_carrier_power_dbm,omitempty"`
	RSRPDBm                 *float64           `json:"rsrp_dbm,omitempty"`
	NormalizedPowerMW       *float64           `json:"normalized_power_mw,omitempty"`
	LoadedPowerMW           *float64           `json:"loaded_power_mw,omitempty"`
	LoadFactor              float64            `json:"load_factor"`
	ChannelMatch            bool               `json:"channel_match"`
	Eligible                bool               `json:"eligible"`
	ServingEligible         bool               `json:"serving_eligible"`
	ExclusionReason         string             `json:"exclusion_reason,omitempty"`
	ReceiverThreshold       *ReceiverThreshold `json:"receiver_threshold,omitempty"`
	ReceiverLinkMarginDB    *float64           `json:"receiver_link_margin_db,omitempty"`
}

type radioQualityMetrics struct {
	SINRDB  float64
	RSSIMW  float64
	RSSIDBm float64
	RSRQDB  float64
}

// computeRadioQualityMetrics keeps the power-domain transitions in one pure
// function. Desired, interference, and noise are all per-reference-resource
// powers; RSSI is then reconstructed over the occupied carrier bandwidth.
func computeRadioQualityMetrics(desiredPowerMW, interferencePowerMW, noisePowerMW float64, resourceBlocks int) radioQualityMetrics {
	occupiedSubcarriers := float64(12 * resourceBlocks)
	denominatorMW := noisePowerMW + interferencePowerMW
	metrics := radioQualityMetrics{
		SINRDB: 10 * math.Log10(desiredPowerMW/denominatorMW),
		RSSIMW: occupiedSubcarriers * (desiredPowerMW + interferencePowerMW + noisePowerMW),
	}
	metrics.RSSIDBm = MilliwattsToDBm(metrics.RSSIMW)
	metrics.RSRQDB = 10 * math.Log10(float64(resourceBlocks)*desiredPowerMW/metrics.RSSIMW)
	return metrics
}

func (preset interferencePreset) occupiedSubcarriers() int {
	return 12 * preset.resourceBlocks
}

func (preset interferencePreset) resourceBandwidthHz() float64 {
	return preset.scsKHz * 1000
}

func (preset interferencePreset) rsrpKind() string {
	if preset.measurementFamily == "lte_crs" {
		return "lte_crs_reference_signal_planning"
	}
	if preset.measurementFamily == "nr_ss" {
		return "nr_ss_reference_signal_planning"
	}
	return "generic_reference_resource_planning"
}

func (preset interferencePreset) conversionDescription() string {
	return fmt.Sprintf("uniform full-carrier PSD approximation: RSRP = received_carrier_power_dbm - 10log10(%d occupied subcarriers); LTE/NR reference-signal density, symbol scheduling, and RE overhead are not modeled", preset.occupiedSubcarriers())
}

func carrierPowerToReferencePower(carrierPowerDBm float64, preset interferencePreset) (float64, bool) {
	if !isFiniteRadioValue(carrierPowerDBm) || preset.occupiedSubcarriers() <= 0 {
		return 0, false
	}
	return carrierPowerDBm - 10*math.Log10(float64(preset.occupiedSubcarriers())), true
}

func referencePowerToCarrierPower(referencePowerDBm float64, preset interferencePreset) (float64, bool) {
	if !isFiniteRadioValue(referencePowerDBm) || preset.occupiedSubcarriers() <= 0 {
		return 0, false
	}
	return referencePowerDBm + 10*math.Log10(float64(preset.occupiedSubcarriers())), true
}

// referencePowerMilliwatts is the numerical-floor boundary for the linear
// resource-power domain. A finite dBm value can still underflow to zero when
// converted to mW; that is distinct from receiver sensitivity admission.
func referencePowerMilliwatts(referencePowerDBm float64) (float64, bool) {
	if !isFiniteRadioValue(referencePowerDBm) {
		return 0, false
	}
	powerMW := DBmToMilliwatts(referencePowerDBm)
	if !isFiniteRadioValue(powerMW) || powerMW <= 0 {
		return 0, false
	}
	return powerMW, true
}

func isFiniteRadioValue(value float64) bool {
	return value == value && value > -1e308 && value < 1e308
}
