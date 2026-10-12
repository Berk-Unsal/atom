package raytracer

import (
	"context"
	"fmt"
	"math"
	"math/cmplx"
)

type materialReferenceResolvedNumerics struct {
	ReflectionCoefficient               complex128
	TransmissionCoefficient             *complex128
	FirstInterfaceReflectionCoefficient complex128
	InterfaceReflectionPowerFraction    float64
	ReflectedPowerFraction              float64
	TransmittedPowerFraction            *float64
	AbsorbedPowerFraction               *float64
	PowerFluxCorrection                 float64
	TransmissionLossDB                  *float64
	LowerBoundTransmissionLossDB        *float64
	NumericState                        string
	Angles                              MaterialReferenceMediumAngles
	PropagationConstant                 complex128
	NormalPhaseThickness                complex128
}

func EvaluateMaterialReferenceContext(ctx context.Context, request MaterialReferenceRequest) (MaterialReferenceResponse, error) {
	if err := checkMaterialReferenceContext(ctx); err != nil {
		return MaterialReferenceResponse{}, err
	}
	if validationError := ValidateMaterialReferenceRequest(request); validationError != "" {
		return MaterialReferenceResponse{}, fmt.Errorf("material reference: %s", validationError)
	}
	if request.ThicknessProvenance == "" {
		request.ThicknessProvenance = "user_declared"
	}
	angleSource := "user_declared"
	facadeNormalProvenance := "unknown"
	geometryMode := "declared_plane_wave"
	if request.GeometryContext != nil {
		if request.GeometryContext.IncidenceAngleSource != "" {
			angleSource = request.GeometryContext.IncidenceAngleSource
		}
		if request.GeometryContext.FacadeNormalProvenance != "" {
			facadeNormalProvenance = request.GeometryContext.FacadeNormalProvenance
		}
		if request.GeometryContext.IntersectionsDetected > 0 {
			geometryMode = "selected_interaction_not_composed"
		}
	}
	properties, materialStatus, err := resolveMaterialReferenceProperties(request)
	if err != nil {
		return MaterialReferenceResponse{}, err
	}
	materialOutput := materialReferenceOutputProperties(properties, *request.ThicknessM)
	materialOutput.ThicknessProvenance = request.ThicknessProvenance

	response := MaterialReferenceResponse{
		SchemaVersion: MaterialReferenceSchemaVersion,
		ModelID:       MaterialReferenceModelID,
		ModelVersion:  MaterialReferenceModelVersion,
		Status:        materialStatus,
		Readiness:     "reference_only",
		Promoted:      false,
		Reference:     MaterialReferenceCitationInfo(),
		Material:      materialOutput,
		Geometry: MaterialReferenceGeometryOutput{
			FrequencyGHz: request.FrequencyGHz, WavelengthM: materialReferenceWavelength(request.FrequencyGHz), IncidenceAngleDeg: request.IncidenceAngle,
			IncidenceAngleSource: angleSource, AngleConvention: "0 degrees is normal incidence; angle is measured from the interface normal",
			Polarization: request.Polarization, FacadeNormalProvenance: facadeNormalProvenance, GeometryMode: geometryMode,
		},
		Applicability: MaterialReferenceApplicability{
			Status: materialStatus, AngleRangeDeg: [2]float64{0, 89.999999}, SupportedPolarizations: []string{MaterialPolarizationTE, MaterialPolarizationTM},
		},
		Comparison: MaterialReferenceComparison{
			HistoricalResearchHeuristicDB: MaterialReferenceHeuristicDB,
			Combined:                      false,
			Interpretation:                "The historical 80 dB/event research_sub_thz heuristic and this declared slab reference are side-by-side contracts; they are never added.",
		},
		PropertyProvenance: map[string]string{
			"material_properties": properties.PropertySource,
			"thickness":           request.ThicknessProvenance,
			"incidence_angle":     angleSource,
			"polarization":        "user_declared",
			"surrounding_media":   "user_declared",
		},
		Fingerprint: materialReferenceFingerprint(request),
		Assumptions: []string{
			"Non-magnetic, isotropic, homogeneous plane-wave media are assumed.",
			"P.2040-4 uses the exp(-jωt) convention; complex relative permittivity is εr' - jεr''.",
			"The returned transmission loss is -10 log10 of the transmitted normal power-flux fraction.",
			"TE means electric field perpendicular to the plane of incidence; TM means electric field parallel to it.",
		},
		Limitations: []string{
			"Material/slab transmission reference only; this is not building-entry loss, indoor propagation, or an urban reflected path.",
			"No automatic OSM material mapping, thickness inference, moisture correction, facade normal inference, or multi-building loss summation is performed.",
			"Smooth parallel slab interfaces are assumed; roughness, diffuse scattering, air gaps, coatings, frames, and multilayer construction are not modelled.",
			"P.2040 Table 3 frequency ranges are enforced as implementation applicability bounds; no row is extrapolated.",
			"P.2109, P.1411, P.526, atmospheric terms, research_sub_thz, building entry, and network simulation are not composed with this result.",
		},
	}
	response.Media.Incident = materialReferenceMediumOutput(request.IncidentMedium)
	response.Media.Exit = materialReferenceMediumOutput(request.ExitMedium)
	if properties.FrequencyRangeGHz != [2]float64{} {
		response.Applicability.FrequencyRangeGHz = properties.FrequencyRangeGHz
	}
	if materialStatus != MaterialReferenceStatusApplicable {
		response.Applicability.Reasons = []string{"requested frequency is outside the selected P.2040 material row or user-declared property range; no extrapolation is performed"}
		return response, nil
	}
	if err := checkMaterialReferenceContext(ctx); err != nil {
		return MaterialReferenceResponse{}, err
	}
	numerics, err := evaluateMaterialReferenceSlab(request, properties)
	if err != nil {
		return MaterialReferenceResponse{}, err
	}
	response.Status = numerics.NumericState
	response.Applicability.Status = numerics.NumericState
	if numerics.NumericState == MaterialReferenceStatusPowerBalanceWarning {
		response.Applicability.Reasons = []string{"computed reflected and transmitted power fractions did not satisfy the passive-material balance tolerance"}
	}
	response.Ledger = materialReferenceLedgerOutput(numerics)
	if numerics.TransmissionLossDB != nil {
		value := *numerics.TransmissionLossDB
		response.Comparison.SlabTransmissionLossDB = &value
		difference := value - MaterialReferenceHeuristicDB
		response.Comparison.DifferenceFromHeuristicDB = &difference
	} else if numerics.LowerBoundTransmissionLossDB != nil {
		value := *numerics.LowerBoundTransmissionLossDB
		response.Comparison.SlabLowerBoundTransmissionLossDB = &value
	}
	return response, nil
}

func materialReferenceMediumOutput(medium MaterialReferenceMedium) MaterialReferenceMediumOutput {
	return MaterialReferenceMediumOutput{
		Name: medium.Name, RelativePermittivity: medium.RelativePermittivity,
		ConductivitySPerM: medium.ConductivitySPerM, PropertySource: medium.PropertySource,
	}
}

func materialReferenceWavelength(frequencyGHz float64) float64 {
	return 299792458.0 / (frequencyGHz * 1e9)
}

func evaluateMaterialReferenceSlab(request MaterialReferenceRequest, properties materialResolvedProperties) (materialReferenceResolvedNumerics, error) {
	frequencyGHz := request.FrequencyGHz
	incidentEpsilon := materialReferenceMediumComplex(request.IncidentMedium, frequencyGHz)
	slabEpsilon := properties.ComplexRelativePermittivity
	exitEpsilon := materialReferenceMediumComplex(request.ExitMedium, frequencyGHz)
	if !materialReferenceComplexFinite(incidentEpsilon) || !materialReferenceComplexFinite(slabEpsilon) || !materialReferenceComplexFinite(exitEpsilon) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference produced a non-finite complex permittivity")
	}
	nIncident := cmplx.Sqrt(incidentEpsilon)
	nSlab := cmplx.Sqrt(slabEpsilon)
	nExit := cmplx.Sqrt(exitEpsilon)
	if !materialReferenceComplexFinite(nIncident) || !materialReferenceComplexFinite(nSlab) || !materialReferenceComplexFinite(nExit) || cmplx.Abs(nIncident) == 0 || cmplx.Abs(nSlab) == 0 || cmplx.Abs(nExit) == 0 {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference produced an invalid refractive index")
	}
	angleRadians := request.IncidenceAngle * math.Pi / 180
	sinIncident := complex(math.Sin(angleRadians), 0)
	sinSlab := nIncident * sinIncident / nSlab
	sinExit := nIncident * sinIncident / nExit
	cosIncident := materialReferencePositiveRoot(1 - sinIncident*sinIncident)
	cosSlab := materialReferencePositiveRoot(1 - sinSlab*sinSlab)
	cosExit := materialReferencePositiveRoot(1 - sinExit*sinExit)
	if !materialReferenceComplexFinite(cosIncident) || !materialReferenceComplexFinite(cosSlab) || !materialReferenceComplexFinite(cosExit) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference produced an invalid refracted angle")
	}
	interfaceIncident := materialReferenceInterfaceReflection(request.Polarization, nIncident, cosIncident, nSlab, cosSlab)
	interfaceExit := materialReferenceInterfaceReflection(request.Polarization, nSlab, cosSlab, nExit, cosExit)
	if !materialReferenceComplexFinite(interfaceIncident) || !materialReferenceComplexFinite(interfaceExit) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference produced a non-finite interface coefficient")
	}
	k0 := 2 * math.Pi / materialReferenceWavelength(frequencyGHz)
	propagationConstant := complex(k0, 0) * nSlab
	phaseThickness := propagationConstant * complex(*request.ThicknessM, 0) * cosSlab
	if !materialReferenceComplexFinite(propagationConstant) || !materialReferenceComplexFinite(phaseThickness) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference produced a non-finite propagation constant")
	}
	logRoundTrip := 2 * imag(phaseThickness)
	roundTrip := complex(0, 0)
	if logRoundTrip >= math.Log(math.SmallestNonzeroFloat64) {
		roundTrip = cmplx.Exp(complex(logRoundTrip, -2*real(phaseThickness)))
	}
	denominator := 1 + interfaceIncident*interfaceExit*roundTrip
	if cmplx.Abs(denominator) < 1e-14 || !materialReferenceComplexFinite(denominator) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference slab denominator is numerically singular")
	}
	reflection := interfaceIncident + interfaceExit*roundTrip
	reflection /= denominator
	logNumerator := imag(phaseThickness) + materialReferenceLogAbs(1+interfaceIncident) + materialReferenceLogAbs(1+interfaceExit)
	logDenominator := materialReferenceLogAbs(denominator)
	logTransmissionMagnitude := logNumerator - logDenominator
	transmissionPhase := -real(phaseThickness) + cmplx.Phase(1+interfaceIncident) + cmplx.Phase(1+interfaceExit) - cmplx.Phase(denominator)
	if !materialReferenceComplexFinite(reflection) || !finiteFloat(logTransmissionMagnitude) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference produced a non-finite slab coefficient")
	}
	powerCorrection := materialReferencePowerFluxCorrection(nIncident, cosIncident, nExit, cosExit)
	if !finiteFloat(powerCorrection) || powerCorrection <= 0 {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference power-flux correction is not positive and finite")
	}
	reflectedPower := cmplx.Abs(reflection) * cmplx.Abs(reflection)
	interfaceReflectionPower := cmplx.Abs(interfaceIncident) * cmplx.Abs(interfaceIncident)
	if !finiteFloat(reflectedPower) || !finiteFloat(interfaceReflectionPower) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference reflected power is not finite")
	}
	result := materialReferenceResolvedNumerics{
		ReflectionCoefficient: reflection, FirstInterfaceReflectionCoefficient: interfaceIncident,
		InterfaceReflectionPowerFraction: interfaceReflectionPower, ReflectedPowerFraction: reflectedPower, PowerFluxCorrection: powerCorrection,
		NumericState:        MaterialReferenceStatusApplicable,
		Angles:              MaterialReferenceMediumAngles{IncidentDeg: angleRadians * 180 / math.Pi, SlabDeg: materialReferenceAngleDegrees(cosSlab), ExitDeg: materialReferenceAngleDegrees(cosExit)},
		PropagationConstant: propagationConstant, NormalPhaseThickness: phaseThickness,
	}
	if logTransmissionMagnitude < math.Log(math.SmallestNonzeroFloat64) {
		lowerBound := -10 * (2*logTransmissionMagnitude + math.Log(powerCorrection)) / math.Ln10
		if !finiteFloat(lowerBound) {
			return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference lower-bound transmission loss is not finite")
		}
		result.NumericState = MaterialReferenceStatusBelowNumericFloor
		result.LowerBoundTransmissionLossDB = &lowerBound
		return result, nil
	}
	transmissionMagnitude := math.Exp(logTransmissionMagnitude)
	transmission := cmplx.Rect(transmissionMagnitude, transmissionPhase)
	transmittedPower := transmissionMagnitude * transmissionMagnitude * powerCorrection
	if !materialReferenceComplexFinite(transmission) || !finiteFloat(transmittedPower) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference transmitted power is not finite")
	}
	if transmittedPower < 0 || reflectedPower < 0 || transmittedPower > 1+1e-8 || reflectedPower > 1+1e-8 {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference power fraction is outside the passive range")
	}
	balance := 1 - reflectedPower - transmittedPower
	if balance < -1e-8 {
		result.NumericState = MaterialReferenceStatusPowerBalanceWarning
	} else {
		if balance < 0 {
			balance = 0
		}
		result.AbsorbedPowerFraction = &balance
	}
	transmissionLoss := -10 * math.Log10(transmittedPower)
	if !finiteFloat(transmissionLoss) {
		return materialReferenceResolvedNumerics{}, fmt.Errorf("material reference transmission loss is not finite")
	}
	result.TransmissionCoefficient = &transmission
	result.TransmittedPowerFraction = &transmittedPower
	result.TransmissionLossDB = &transmissionLoss
	return result, nil
}

func materialReferencePositiveRoot(value complex128) complex128 {
	root := cmplx.Sqrt(value)
	if real(root) < 0 || (math.Abs(real(root)) < 1e-15 && imag(root) > 0) {
		return -root
	}
	return root
}

func materialReferenceInterfaceReflection(polarization string, n1, cos1, n2, cos2 complex128) complex128 {
	if polarization == MaterialPolarizationTM {
		return (n2*cos1 - n1*cos2) / (n2*cos1 + n1*cos2)
	}
	return (n1*cos1 - n2*cos2) / (n1*cos1 + n2*cos2)
}

func materialReferencePowerFluxCorrection(nIncident, cosIncident, nExit, cosExit complex128) float64 {
	correction := nExit * cosExit / (nIncident * cosIncident)
	return real(correction)
}

func materialReferenceLogAbs(value complex128) float64 {
	if value == 0 {
		return math.Inf(-1)
	}
	return math.Log(cmplx.Abs(value))
}

func materialReferenceAngleDegrees(cosine complex128) float64 {
	angle := cmplx.Acos(cosine)
	value := real(angle) * 180 / math.Pi
	if !finiteFloat(value) {
		return 0
	}
	return value
}

func materialReferenceLedgerOutput(numerics materialReferenceResolvedNumerics) *MaterialReferenceSlabLedger {
	ledger := &MaterialReferenceSlabLedger{
		ReflectionCoefficient:               materialReferenceComplexPointer(numerics.ReflectionCoefficient),
		FirstInterfaceReflectionCoefficient: materialReferenceComplexPointer(numerics.FirstInterfaceReflectionCoefficient),
		InterfaceReflectionPowerFraction:    numerics.InterfaceReflectionPowerFraction,
		ReflectedPowerFraction:              numerics.ReflectedPowerFraction,
		TransmittedPowerFraction:            numerics.TransmittedPowerFraction,
		AbsorbedPowerFraction:               numerics.AbsorbedPowerFraction,
		PowerFluxCorrection:                 numerics.PowerFluxCorrection,
		TransmissionLossDB:                  numerics.TransmissionLossDB,
		LowerBoundTransmissionLossDB:        numerics.LowerBoundTransmissionLossDB,
		NumericState:                        numerics.NumericState,
		MultipleInternalReflectionsIncluded: true,
		Angles:                              numerics.Angles,
	}
	if numerics.TransmissionCoefficient != nil {
		ledger.TransmissionCoefficient = materialReferenceComplexPointer(*numerics.TransmissionCoefficient)
	}
	propagation := materialReferenceComplexOutput(numerics.PropagationConstant)
	phaseThickness := materialReferenceComplexOutput(numerics.NormalPhaseThickness)
	ledger.PropagationConstant = &propagation
	ledger.NormalPhaseThickness = &phaseThickness
	return ledger
}

func materialReferenceComplexPointer(value complex128) *MaterialReferenceComplexOutput {
	output := materialReferenceComplexOutput(value)
	return &output
}
