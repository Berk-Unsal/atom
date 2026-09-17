package raytracer

import "strings"

const RFReferenceCatalogSchemaVersion = 1

const (
	RFReferenceStatusMathematical   = "mathematical_reference"
	RFReferenceStatusReferenceScope = "reference_scope_only"
	RFReferenceStatusResearchOnly   = "research_profile_only"

	RFReferenceReasonApplicable                  = "applicable"
	RFReferenceReasonFrequencyOutOfRange         = "frequency_out_of_range"
	RFReferenceReasonDistanceOutOfRange          = "distance_out_of_range"
	RFReferenceReasonUnsupportedEnvironment      = "unsupported_environment"
	RFReferenceReasonRequiredTerrainMissing      = "required_terrain_missing"
	RFReferenceReasonRequiredBuildingDataMissing = "required_building_data_missing"
	RFReferenceReasonRequiredLOSOrNLOSMissing    = "required_los_or_nlos_missing"
	RFReferenceReasonResearchProfileOnly         = "research_profile_only"
	RFReferenceReasonUnsupportedEndpoint         = "unsupported_endpoint"

	RFEndpointSupported    = "supported"
	RFEndpointResearchOnly = "research_only"
	RFEndpointUnsupported  = "unsupported"
)

// RFReferenceApplicability describes a reference model's documented scope.
// It is metadata only: the catalog does not dispatch or alter RF calculations.
type RFReferenceApplicability struct {
	ID                    string   `json:"id"`
	ModelFamily           string   `json:"model_family"`
	StandardOrReference   string   `json:"standard_or_reference"`
	Revision              string   `json:"revision"`
	Equation              string   `json:"equation"`
	Scenario              string   `json:"scenario"`
	AllowedScenarios      []string `json:"allowed_scenarios,omitempty"`
	FrequencyMinGHz       float64  `json:"frequency_min_ghz"`
	FrequencyMaxGHz       float64  `json:"frequency_max_ghz"`
	PathLengthMinM        float64  `json:"path_length_min_m,omitempty"`
	PathLengthMaxM        float64  `json:"path_length_max_m,omitempty"`
	PathLengthNote        string   `json:"path_length_note"`
	RequiresTerrain       bool     `json:"requires_terrain"`
	RequiresBuildingData  bool     `json:"requires_building_data"`
	RequiresLOSOrNLOS     bool     `json:"requires_los_or_nlos"`
	SupportsBuildingEntry bool     `json:"supports_building_entry"`
	Status                string   `json:"status"`
	Note                  string   `json:"note"`
}

type RFReferenceApplicabilityInput struct {
	FrequencyGHz          float64 `json:"frequency_ghz"`
	DistanceM             float64 `json:"distance_m"`
	Scenario              string  `json:"scenario"`
	TerrainAvailable      bool    `json:"terrain_available"`
	BuildingDataAvailable bool    `json:"building_data_available"`
	LOSOrNLOSKnown        bool    `json:"los_or_nlos_known"`
}

type RFReferenceApplicabilityResult struct {
	ReferenceID string `json:"reference_id"`
	Applicable  bool   `json:"applicable"`
	Reason      string `json:"reason"`
	Detail      string `json:"detail,omitempty"`
}

func RFReferenceApplicabilityCatalog() []RFReferenceApplicability {
	return []RFReferenceApplicability{
		{
			ID: "fspl-metre-ghz", ModelFamily: "free-space-path-loss",
			StandardOrReference: "ITU-R P.525-5 mathematical reference", Revision: "P.525-5 (2024-11)",
			Equation: "20 log10(max(d, 1 m)) + 20 log10(f_GHz) + 32.45",
			Scenario: "any", FrequencyMinGHz: 0, FrequencyMaxGHz: MaxFrequencyGHz,
			PathLengthNote: "positive geometric distance; the current mathematical fixture clamps distances below 1 m to 1 m",
			Status:         RFReferenceStatusMathematical,
			Note:           "The metre/GHz equation is a deterministic reference fixture, not a claim of channel-model conformance.",
		},
		{
			ID: "itu-r-p1411", ModelFamily: "outdoor-short-range",
			StandardOrReference: "ITU-R P.1411", Revision: "P.1411-13 (2025-09)",
			Equation: "standard-defined scenario-specific outdoor path prediction",
			Scenario: "urban-short-range", AllowedScenarios: []string{"urban-short-range"},
			FrequencyMinGHz: 0.3, FrequencyMaxGHz: 300, RequiresBuildingData: true,
			PathLengthNote:    "scenario/section dependent; no universal distance bound is asserted by this metadata-only comparison entry",
			RequiresLOSOrNLOS: true, SupportsBuildingEntry: true, Status: RFReferenceStatusReferenceScope,
			Note: "A.T.O.M. keeps its inspectable urban_short_range profile separate from a claim that P.1411 is fully implemented.",
		},
		{
			ID: "itu-r-p1812", ModelFamily: "terrestrial-path-prediction",
			StandardOrReference: "ITU-R P.1812", Revision: "P.1812-8 (2025-09)",
			Equation: "standard-defined terrestrial path prediction",
			Scenario: "terrain-profile", AllowedScenarios: []string{"terrain-profile"},
			FrequencyMinGHz: 0.03, FrequencyMaxGHz: 6, PathLengthMinM: 250, PathLengthMaxM: 3000000,
			PathLengthNote:  "250 m to 3,000 km per the recorded reference scope",
			RequiresTerrain: true, RequiresLOSOrNLOS: true, Status: RFReferenceStatusReferenceScope,
			Note: "Applicability requires a terrain profile and the standard's path-length conditions; the current zero-datum fallback is not P.1812 conformance.",
		},
		{
			ID: "itu-r-p526", ModelFamily: "diffraction",
			StandardOrReference: "ITU-R P.526", Revision: "P.526-16 (2025-11)",
			Equation: "standard-defined diffraction methods including knife-edge",
			Scenario: "diffraction-obstacle", AllowedScenarios: []string{"diffraction-obstacle"},
			FrequencyMinGHz: 0.03, FrequencyMaxGHz: 300, RequiresLOSOrNLOS: true,
			PathLengthNote: "obstacle geometry and method dependent; no universal distance bound is asserted here",
			Status:         RFReferenceStatusReferenceScope,
			Note:           "The corpus records knife-edge reference values independently; the production path profile remains its existing single-knife-edge implementation.",
		},
		{
			ID: "3gpp-tr-38-901", ModelFamily: "3gpp-channel-model",
			StandardOrReference: "3GPP TR 38.901", Revision: "V19.4.0 (2026-06-23)",
			Equation: "standard-defined scenario pathloss and channel model",
			Scenario: "3gpp-channel-evaluation", AllowedScenarios: []string{"3gpp-channel-evaluation"},
			FrequencyMinGHz: 0.5, FrequencyMaxGHz: 100, RequiresLOSOrNLOS: true,
			PathLengthNote: "scenario and deployment geometry dependent; no universal distance bound is asserted here",
			Status:         RFReferenceStatusReferenceScope,
			Note:           "This entry identifies the comparison scope; the deterministic urban_short_range baseline uses the documented UMa path-loss subset and does not claim full 3GPP channel-model conformance.",
		},
		{
			ID: "atom-research-sub-thz", ModelFamily: "research-sub-thz",
			StandardOrReference: "A.T.O.M. research planning profile", Revision: "current runtime profile",
			Equation: "existing FSPL-plus-profile attenuation", Scenario: "research-sub-thz",
			AllowedScenarios: []string{"research-sub-thz"}, FrequencyMinGHz: 100, FrequencyMaxGHz: MaxFrequencyGHz,
			PathLengthNote: "planning-profile distance is governed by the selected runtime radius",
			Status:         RFReferenceStatusResearchOnly,
			Note:           "Research planning label; not a standards-conformance claim and not a replacement for a 140 GHz channel model.",
		},
	}
}

func RFReferenceApplicabilityByID(id string) (RFReferenceApplicability, bool) {
	for _, reference := range RFReferenceApplicabilityCatalog() {
		if reference.ID == id {
			return reference, true
		}
	}
	return RFReferenceApplicability{}, false
}

func CheckRFReferenceApplicability(reference RFReferenceApplicability, input RFReferenceApplicabilityInput) RFReferenceApplicabilityResult {
	result := RFReferenceApplicabilityResult{ReferenceID: reference.ID}
	if input.FrequencyGHz < reference.FrequencyMinGHz || input.FrequencyGHz > reference.FrequencyMaxGHz {
		result.Reason = RFReferenceReasonFrequencyOutOfRange
		result.Detail = "frequency is outside the reference scope"
		return result
	}
	if reference.PathLengthMinM > 0 && input.DistanceM < reference.PathLengthMinM || reference.PathLengthMaxM > 0 && input.DistanceM > reference.PathLengthMaxM {
		result.Reason = RFReferenceReasonDistanceOutOfRange
		result.Detail = "path length is outside the reference scope"
		return result
	}
	if len(reference.AllowedScenarios) > 0 && !referenceScenarioAllowed(reference.AllowedScenarios, input.Scenario) {
		result.Reason = RFReferenceReasonUnsupportedEnvironment
		result.Detail = "scenario is outside the reference scope"
		return result
	}
	if reference.RequiresTerrain && !input.TerrainAvailable {
		result.Reason = RFReferenceReasonRequiredTerrainMissing
		result.Detail = "the reference requires terrain data"
		return result
	}
	if reference.RequiresBuildingData && !input.BuildingDataAvailable {
		result.Reason = RFReferenceReasonRequiredBuildingDataMissing
		result.Detail = "the reference requires building data"
		return result
	}
	if reference.RequiresLOSOrNLOS && !input.LOSOrNLOSKnown {
		result.Reason = RFReferenceReasonRequiredLOSOrNLOSMissing
		result.Detail = "the reference requires a classified LOS or NLOS path"
		return result
	}
	if reference.Status == RFReferenceStatusResearchOnly {
		result.Reason = RFReferenceReasonResearchProfileOnly
		result.Detail = "the profile is explicitly research-only"
		return result
	}
	result.Applicable = true
	result.Reason = RFReferenceReasonApplicable
	return result
}

func referenceScenarioAllowed(allowed []string, scenario string) bool {
	for _, candidate := range allowed {
		if strings.EqualFold(strings.TrimSpace(candidate), strings.TrimSpace(scenario)) {
			return true
		}
	}
	return false
}

type RFTechnologyEndpointCapability struct {
	Technology   string  `json:"technology"`
	FrequencyGHz float64 `json:"frequency_ghz"`
	Endpoint     string  `json:"endpoint"`
	Status       string  `json:"status"`
	Reason       string  `json:"reason"`
	Note         string  `json:"note"`
}

func RFTechnologyEndpointCapabilityMatrix() []RFTechnologyEndpointCapability {
	const supported = "current deterministic engine accepts the technology at this endpoint"
	const research = "endpoint is available only as the existing research/planning profile"
	const unsupported = "endpoint validation deliberately excludes this technology"
	endpoints := []string{
		"/api/analyze-sector", "/api/simulate", "/api/coverage-surface",
		"/api/optimize-azimuth", "/api/optimize-network", "/api/evaluate-network",
		"/api/coverage-gaps", "/api/explain-network-cell", "/api/recommend-sites",
		"/api/path-profile", "/api/interference", "/api/measurements/evaluate",
	}
	result := make([]RFTechnologyEndpointCapability, 0, len(endpoints)*3)
	for _, endpoint := range endpoints {
		for _, technology := range []string{"4g", "5g", "6g"} {
			frequencyGHz := map[string]float64{"4g": 2.6, "5g": 28, "6g": 140}[technology]
			status, reason, note := RFEndpointSupported, "accepted_by_current_validation", supported
			if technology == "6g" && (endpoint == "/api/interference" || endpoint == "/api/measurements/evaluate" || endpoint == "/api/recommend-sites") {
				status, reason, note = RFEndpointUnsupported, RFReferenceReasonUnsupportedEndpoint, unsupported
			}
			if technology == "6g" && endpoint == "/api/path-profile" {
				status, reason, note = RFEndpointResearchOnly, RFReferenceReasonResearchProfileOnly, research
			}
			result = append(result, RFTechnologyEndpointCapability{Technology: technology, FrequencyGHz: frequencyGHz, Endpoint: endpoint, Status: status, Reason: reason, Note: note})
		}
	}
	return result
}

func RFTechnologyEndpointCapabilityFor(technology, endpoint string) (RFTechnologyEndpointCapability, bool) {
	for _, capability := range RFTechnologyEndpointCapabilityMatrix() {
		if strings.EqualFold(capability.Technology, technology) && capability.Endpoint == endpoint {
			return capability, true
		}
	}
	return RFTechnologyEndpointCapability{}, false
}
