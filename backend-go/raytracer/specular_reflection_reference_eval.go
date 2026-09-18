package raytracer

import (
	"context"
	"fmt"
	"math"
	"math/cmplx"
	"sort"
	"strings"
)

const (
	specularReflectionGeometryTolerance   = 1e-7
	specularReflectionEndpointTolerance   = 1e-7
	specularReflectionVisibilityTolerance = 1e-8
	specularReflectionNumericFloor        = 1e-300
)

type specularReflectionVec struct {
	x float64
	y float64
	z float64
}

func (v specularReflectionVec) add(other specularReflectionVec) specularReflectionVec {
	return specularReflectionVec{v.x + other.x, v.y + other.y, v.z + other.z}
}

func (v specularReflectionVec) sub(other specularReflectionVec) specularReflectionVec {
	return specularReflectionVec{v.x - other.x, v.y - other.y, v.z - other.z}
}

func (v specularReflectionVec) scale(value float64) specularReflectionVec {
	return specularReflectionVec{v.x * value, v.y * value, v.z * value}
}

func (v specularReflectionVec) dot(other specularReflectionVec) float64 {
	return v.x*other.x + v.y*other.y + v.z*other.z
}

func (v specularReflectionVec) cross(other specularReflectionVec) specularReflectionVec {
	return specularReflectionVec{
		v.y*other.z - v.z*other.y,
		v.z*other.x - v.x*other.z,
		v.x*other.y - v.y*other.x,
	}
}

func (v specularReflectionVec) norm() float64 {
	return math.Sqrt(v.dot(v))
}

func (v specularReflectionVec) finite() bool {
	return finiteFloat(v.x) && finiteFloat(v.y) && finiteFloat(v.z)
}

func normalizeSpecularReflectionVec(value specularReflectionVec) (specularReflectionVec, bool) {
	norm := value.norm()
	if !finiteFloat(norm) || norm <= specularReflectionGeometryTolerance {
		return specularReflectionVec{}, false
	}
	return value.scale(1 / norm), true
}

func specularReflectionVecFromInput(value SpecularReflectionVectorInput) specularReflectionVec {
	return specularReflectionVec{x: value.X, y: value.Y, z: value.Z}
}

func specularReflectionPointOutput(value specularReflectionVec) SpecularReflectionENUPoint {
	return SpecularReflectionENUPoint{X: value.x, Y: value.y, Z: value.z}
}

func specularReflectionNormalOutput(value specularReflectionVec) SpecularReflectionNormalOutput {
	return SpecularReflectionNormalOutput{X: value.x, Y: value.y, Z: value.z}
}

type specularReflectionCoordinateMode string

const (
	specularReflectionLocalENU      specularReflectionCoordinateMode = "local_enu"
	specularReflectionGeographicENU specularReflectionCoordinateMode = "geographic_enu"
)

type specularReflectionFrame struct {
	mode             specularReflectionCoordinateMode
	originLon        float64
	originLat        float64
	originZ          float64
	originProvenance string
}

func (frame specularReflectionFrame) output() SpecularReflectionLocalFrameOutput {
	return SpecularReflectionLocalFrameOutput{
		CoordinateSystem:     "ENU",
		Mode:                 string(frame.mode),
		Projection:           "local tangent-plane equirectangular metric projection",
		Origin:               SpecularReflectionGeographicOrigin{Lon: frame.originLon, Lat: frame.originLat, Z: frame.originZ},
		OriginENU:            SpecularReflectionENUPoint{},
		OriginProvenance:     frame.originProvenance,
		TransformDescription: "east=(lon-lon0)·cos(lat0)·R, north=(lat-lat0)·R, up=z-z0; R=6371000 m",
	}
}

func resolveSpecularReflectionFrame(request SpecularReflectionReferenceRequest) (specularReflectionFrame, error) {
	mode := strings.ToLower(strings.TrimSpace(request.CoordinateFrame.Mode))
	if mode == "" {
		if reflectionPositionIsGeographic(request.Tx.Position) || reflectionPositionIsGeographic(request.Rx.Position) || reflectionPositionIsGeographic(request.Facade.Start) || reflectionPositionIsGeographic(request.Facade.End) {
			mode = string(specularReflectionGeographicENU)
		} else {
			mode = string(specularReflectionLocalENU)
		}
	}
	frame := specularReflectionFrame{mode: specularReflectionCoordinateMode(mode)}
	switch frame.mode {
	case specularReflectionLocalENU, "enu":
		frame.mode = specularReflectionLocalENU
		frame.originProvenance = "declared_local_enu_origin"
		return frame, nil
	case specularReflectionGeographicENU, "wgs84_enu", "epsg:4326":
		frame.mode = specularReflectionGeographicENU
	default:
		return specularReflectionFrame{}, fmt.Errorf("coordinate_frame.mode must be local_enu or geographic_enu")
	}
	if request.CoordinateFrame.Origin != nil {
		lon, lat, z, ok := rawSpecularReflectionGeographicPosition(*request.CoordinateFrame.Origin, 0)
		if !ok {
			return specularReflectionFrame{}, fmt.Errorf("coordinate_frame.origin must provide finite WGS84 lon/lat")
		}
		frame.originLon, frame.originLat, frame.originZ = lon, lat, z
		frame.originProvenance = "declared_wgs84_origin"
		return frame, nil
	}
	lon, lat, _, ok := rawSpecularReflectionGeographicPosition(request.Tx.Position, 0)
	if !ok {
		return specularReflectionFrame{}, fmt.Errorf("geographic_enu requires a WGS84 origin or geographic tx position")
	}
	frame.originLon, frame.originLat = lon, lat
	frame.originProvenance = "derived_from_tx_wgs84_position"
	return frame, nil
}

func reflectionPositionIsGeographic(position SpecularReflectionPositionInput) bool {
	return position.Lon != nil && position.Lat != nil
}

func rawSpecularReflectionGeographicPosition(position SpecularReflectionPositionInput, defaultZ float64) (float64, float64, float64, bool) {
	if position.Lon != nil && position.Lat != nil && finiteInRange(*position.Lon, -180, 180) && finiteInRange(*position.Lat, -90, 90) {
		z := defaultZ
		if position.Z != nil {
			z = *position.Z
		} else if len(position.Coordinates) >= 3 {
			z = position.Coordinates[2]
		}
		return *position.Lon, *position.Lat, z, finiteFloat(z)
	}
	if len(position.Coordinates) >= 2 && finiteInRange(position.Coordinates[0], -180, 180) && finiteInRange(position.Coordinates[1], -90, 90) {
		z := defaultZ
		if len(position.Coordinates) >= 3 {
			z = position.Coordinates[2]
		}
		return position.Coordinates[0], position.Coordinates[1], z, finiteFloat(z)
	}
	return 0, 0, 0, false
}

func (frame specularReflectionFrame) resolvePosition(position SpecularReflectionPositionInput, height *float64, defaultZ float64) (specularReflectionVec, bool, error) {
	if frame.mode == specularReflectionGeographicENU {
		lon, lat, z, ok := rawSpecularReflectionGeographicPosition(position, defaultZ)
		if !ok {
			return specularReflectionVec{}, false, fmt.Errorf("position does not provide finite geographic lon/lat")
		}
		if height != nil {
			if !finiteFloat(*height) {
				return specularReflectionVec{}, false, fmt.Errorf("position height is not finite")
			}
			z = *height
		}
		east := normalizeLongitude(lon-frame.originLon) * math.Pi / 180 * EarthRadiusMeters * math.Cos(frame.originLat*math.Pi/180)
		north := (lat - frame.originLat) * math.Pi / 180 * EarthRadiusMeters
		return specularReflectionVec{x: east, y: north, z: z - frame.originZ}, true, nil
	}
	var x, y, z float64
	switch {
	case position.ENU != nil:
		x, y, z = position.ENU.X, position.ENU.Y, position.ENU.Z
	case position.X != nil && position.Y != nil:
		x, y = *position.X, *position.Y
		if position.Z != nil {
			z = *position.Z
		} else {
			z = defaultZ
		}
	case len(position.Coordinates) >= 2:
		x, y = position.Coordinates[0], position.Coordinates[1]
		if len(position.Coordinates) >= 3 {
			z = position.Coordinates[2]
		} else {
			z = defaultZ
		}
	default:
		return specularReflectionVec{}, false, fmt.Errorf("position does not provide finite local ENU x/y")
	}
	if height != nil {
		z = *height
	}
	value := specularReflectionVec{x: x, y: y, z: z}
	if !value.finite() {
		return specularReflectionVec{}, false, fmt.Errorf("position contains a non-finite local ENU coordinate")
	}
	return value, true, nil
}

type specularReflectionResolvedGeometry struct {
	frame          specularReflectionFrame
	tx             specularReflectionVec
	rx             specularReflectionVec
	start          specularReflectionVec
	end            specularReflectionVec
	planePoint     specularReflectionVec
	normal         specularReflectionVec
	normalSource   string
	baseZ          *float64
	topZ           *float64
	segmentLen     float64
	segmentTangent specularReflectionVec
	polygon        []specularReflectionVec
}

func resolveSpecularReflectionGeometry(request SpecularReflectionReferenceRequest) (specularReflectionResolvedGeometry, error) {
	frame, err := resolveSpecularReflectionFrame(request)
	if err != nil {
		return specularReflectionResolvedGeometry{}, err
	}
	tx, _, err := frame.resolvePosition(request.Tx.Position, request.Tx.HeightM, 0)
	if err != nil {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("tx: %w", err)
	}
	rx, _, err := frame.resolvePosition(request.Rx.Position, request.Rx.HeightM, 0)
	if err != nil {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("rx: %w", err)
	}
	startInput := request.Facade.Start
	endInput := request.Facade.End
	if request.Facade.SegmentStart != nil {
		startInput = *request.Facade.SegmentStart
	}
	if request.Facade.SegmentEnd != nil {
		endInput = *request.Facade.SegmentEnd
	}
	start, _, err := frame.resolvePosition(startInput, nil, 0)
	if err != nil {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("facade start: %w", err)
	}
	end, _, err := frame.resolvePosition(endInput, nil, start.z)
	if err != nil {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("facade end: %w", err)
	}
	if math.Abs(end.z-start.z) > specularReflectionGeometryTolerance {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("facade segment must be horizontal")
	}
	segment := end.sub(start)
	segmentHorizontal := specularReflectionVec{x: segment.x, y: segment.y}
	segmentLen := segmentHorizontal.norm()
	if !finiteFloat(segmentLen) || segmentLen <= specularReflectionGeometryTolerance {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("facade segment is degenerate")
	}
	tangent, _ := normalizeSpecularReflectionVec(segmentHorizontal)
	planePoint := start
	if request.Facade.PlanePoint != nil {
		planePoint, _, err = frame.resolvePosition(*request.Facade.PlanePoint, nil, start.z)
		if err != nil {
			return specularReflectionResolvedGeometry{}, fmt.Errorf("facade plane point: %w", err)
		}
	}
	lineDistance := math.Abs(segmentHorizontal.cross(specularReflectionVec{x: planePoint.x - start.x, y: planePoint.y - start.y}).z) / segmentLen
	if !finiteFloat(lineDistance) || lineDistance > 1e-5 {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("facade plane point is not on the finite facade line")
	}
	resolved := specularReflectionResolvedGeometry{
		frame: frame, tx: tx, rx: rx, start: start, end: end, planePoint: planePoint,
		baseZ: request.Facade.BaseZ, topZ: request.Facade.TopZ, segmentLen: segmentLen, segmentTangent: tangent,
	}
	if request.Facade.OutwardNormal != nil {
		normal := specularReflectionVecFromInput(*request.Facade.OutwardNormal)
		length := normal.norm()
		if !finiteFloat(length) || math.Abs(length-1) > 1e-3 {
			return specularReflectionResolvedGeometry{}, fmt.Errorf("facade outward normal must be a finite unit normal")
		}
		normal, _ = normalizeSpecularReflectionVec(normal)
		resolved.normal = normal
		resolved.normalSource = request.Facade.NormalProvenance
		if resolved.normalSource == "" {
			resolved.normalSource = "user_declared"
		}
	} else {
		polygon := make([]specularReflectionVec, 0, len(request.Facade.PolygonContext.Vertices))
		for _, vertex := range request.Facade.PolygonContext.Vertices {
			value, _, positionErr := frame.resolvePosition(vertex, nil, 0)
			if positionErr != nil {
				return specularReflectionResolvedGeometry{}, fmt.Errorf("facade polygon context: %w", positionErr)
			}
			polygon = append(polygon, value)
		}
		if strings.EqualFold(strings.TrimSpace(request.Facade.PolygonContext.Role), "hole") {
			return specularReflectionResolvedGeometry{}, fmt.Errorf("facade polygon_context hole cannot establish an exterior normal")
		}
		normal, deriveErr := deriveSpecularReflectionOutwardNormal(start, end, polygon)
		if deriveErr != nil {
			return specularReflectionResolvedGeometry{}, deriveErr
		}
		resolved.normal = normal
		resolved.normalSource = "geometry_derived:polygon_exterior_winding"
		resolved.polygon = polygon
	}
	if math.Abs(resolved.normal.z) > 1e-6 {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("initial production scope requires a vertical facade with horizontal outward normal")
	}
	if resolved.normal.norm() <= specularReflectionGeometryTolerance {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("facade normal is invalid")
	}
	txSide := resolved.normal.dot(resolved.tx.sub(resolved.planePoint))
	rxSide := resolved.normal.dot(resolved.rx.sub(resolved.planePoint))
	if !finiteFloat(txSide) || !finiteFloat(rxSide) || txSide <= specularReflectionGeometryTolerance || rxSide <= specularReflectionGeometryTolerance {
		return specularReflectionResolvedGeometry{}, fmt.Errorf("tx and rx must lie on the declared exterior side of the facade")
	}
	return resolved, nil
}

func deriveSpecularReflectionOutwardNormal(start, end specularReflectionVec, polygon []specularReflectionVec) (specularReflectionVec, error) {
	if len(polygon) < 3 {
		return specularReflectionVec{}, fmt.Errorf("facade polygon context requires at least three vertices")
	}
	area2 := 0.0
	for index := range polygon {
		next := polygon[(index+1)%len(polygon)]
		area2 += polygon[index].x*next.y - next.x*polygon[index].y
	}
	if !finiteFloat(area2) || math.Abs(area2) <= specularReflectionGeometryTolerance {
		return specularReflectionVec{}, fmt.Errorf("facade polygon context is degenerate")
	}
	requested := specularReflectionVec{x: end.x - start.x, y: end.y - start.y}
	found := false
	var polygonEdge specularReflectionVec
	for index := range polygon {
		next := polygon[(index+1)%len(polygon)]
		forward := specularReflectionVec{x: next.x - polygon[index].x, y: next.y - polygon[index].y}
		reverse := specularReflectionVec{x: polygon[index].x - next.x, y: polygon[index].y - next.y}
		if forward.sub(requested).norm() <= 1e-5 {
			found = true
			polygonEdge = forward
			break
		}
		if reverse.sub(requested).norm() <= 1e-5 {
			found = true
			polygonEdge = reverse.scale(-1)
			break
		}
	}
	if !found {
		return specularReflectionVec{}, fmt.Errorf("facade segment is not an edge in polygon_context; outward side cannot be established")
	}
	var candidate specularReflectionVec
	if area2 > 0 {
		candidate = specularReflectionVec{x: polygonEdge.y, y: -polygonEdge.x}
	} else {
		candidate = specularReflectionVec{x: -polygonEdge.y, y: polygonEdge.x}
	}
	normal, ok := normalizeSpecularReflectionVec(candidate)
	if !ok {
		return specularReflectionVec{}, fmt.Errorf("facade segment is degenerate")
	}
	return normal, nil
}

type specularReflectionImageGeometry struct {
	imageTx       specularReflectionVec
	point         specularReflectionVec
	t             float64
	segmentT      float64
	lineDistance  float64
	d1            float64
	d2            float64
	total         float64
	imageLength   float64
	incidenceDeg  float64
	reflectionDeg float64
	ki            specularReflectionVec
	kr            specularReflectionVec
	basis         SpecularReflectionBasisOutput
	equalityError float64
}

func calculateSpecularReflectionImageGeometry(geometry specularReflectionResolvedGeometry) (specularReflectionImageGeometry, string) {
	imageTx := geometry.tx.sub(geometry.normal.scale(2 * geometry.normal.dot(geometry.tx.sub(geometry.planePoint))))
	denominator := geometry.normal.dot(geometry.rx.sub(imageTx))
	if !finiteFloat(denominator) || math.Abs(denominator) <= specularReflectionGeometryTolerance {
		return specularReflectionImageGeometry{}, "no_specular_intersection"
	}
	t := -geometry.normal.dot(imageTx.sub(geometry.planePoint)) / denominator
	if !finiteFloat(t) || t < -specularReflectionEndpointTolerance || t > 1+specularReflectionEndpointTolerance {
		return specularReflectionImageGeometry{}, "no_specular_intersection"
	}
	point := imageTx.add(geometry.rx.sub(imageTx).scale(t))
	if !point.finite() {
		return specularReflectionImageGeometry{}, "no_specular_intersection"
	}
	segmentVector := geometry.end.sub(geometry.start)
	segmentT := point.sub(geometry.start).dot(segmentVector) / (geometry.segmentLen * geometry.segmentLen)
	lineDistance := math.Abs(segmentVector.cross(point.sub(geometry.start)).z) / geometry.segmentLen
	if !finiteFloat(segmentT) || !finiteFloat(lineDistance) || lineDistance > 1e-5 {
		return specularReflectionImageGeometry{}, "specular_point_not_on_facade_line"
	}
	if segmentT < -specularReflectionEndpointTolerance || segmentT > 1+specularReflectionEndpointTolerance {
		return specularReflectionImageGeometry{}, "specular_point_outside_facade_segment"
	}
	if segmentT < 0 {
		segmentT = 0
	}
	if segmentT > 1 {
		segmentT = 1
	}
	if geometry.baseZ == nil || geometry.topZ == nil {
		return specularReflectionImageGeometry{imageTx: imageTx, point: point, t: t, segmentT: segmentT, lineDistance: lineDistance}, "vertical_extent_unknown"
	}
	if *geometry.baseZ > *geometry.topZ {
		return specularReflectionImageGeometry{}, "invalid_vertical_extent"
	}
	if point.z < *geometry.baseZ-specularReflectionEndpointTolerance || point.z > *geometry.topZ+specularReflectionEndpointTolerance {
		return specularReflectionImageGeometry{imageTx: imageTx, point: point, t: t, segmentT: segmentT, lineDistance: lineDistance}, "specular_point_outside_vertical_extent"
	}
	d1 := geometry.tx.sub(point).norm()
	d2 := point.sub(geometry.rx).norm()
	total := d1 + d2
	imageLength := imageTx.sub(geometry.rx).norm()
	if !finiteFloat(d1) || !finiteFloat(d2) || !finiteFloat(total) || d1 <= specularReflectionGeometryTolerance || d2 <= specularReflectionGeometryTolerance || !finiteFloat(imageLength) {
		return specularReflectionImageGeometry{}, "zero_length_or_non_finite_leg"
	}
	ki, ok := normalizeSpecularReflectionVec(point.sub(geometry.tx))
	if !ok {
		return specularReflectionImageGeometry{}, "zero_length_or_non_finite_leg"
	}
	kr, ok := normalizeSpecularReflectionVec(geometry.rx.sub(point))
	if !ok {
		return specularReflectionImageGeometry{}, "zero_length_or_non_finite_leg"
	}
	reflectedDirection := ki.sub(geometry.normal.scale(2 * ki.dot(geometry.normal)))
	equalityError := reflectedDirection.sub(kr).norm()
	if !finiteFloat(equalityError) || equalityError > 1e-5 {
		return specularReflectionImageGeometry{}, "specular_equality_failed"
	}
	incidence := math.Acos(math.Min(1, math.Abs(ki.dot(geometry.normal)))) * 180 / math.Pi
	reflection := math.Acos(math.Min(1, math.Abs(kr.dot(geometry.normal)))) * 180 / math.Pi
	basis, basisErr := specularReflectionBasis(geometry.normal, ki)
	if basisErr != "" {
		return specularReflectionImageGeometry{}, basisErr
	}
	return specularReflectionImageGeometry{
		imageTx: imageTx, point: point, t: t, segmentT: segmentT, lineDistance: lineDistance,
		d1: d1, d2: d2, total: total, imageLength: imageLength, incidenceDeg: incidence, reflectionDeg: reflection,
		ki: ki, kr: kr, basis: basis, equalityError: equalityError,
	}, ""
}

func specularReflectionBasis(normal, incident specularReflectionVec) (SpecularReflectionBasisOutput, string) {
	s := normal.cross(incident)
	normalIncidence := s.norm() <= 1e-7
	if normalIncidence {
		candidate := specularReflectionVec{z: 1}
		candidate = candidate.sub(normal.scale(candidate.dot(normal)))
		var ok bool
		s, ok = normalizeSpecularReflectionVec(candidate)
		if !ok {
			candidate = specularReflectionVec{y: 1}
			candidate = candidate.sub(normal.scale(candidate.dot(normal)))
			s, ok = normalizeSpecularReflectionVec(candidate)
			if !ok {
				return SpecularReflectionBasisOutput{}, "invalid_polarization_basis"
			}
		}
	} else {
		var ok bool
		s, ok = normalizeSpecularReflectionVec(s)
		if !ok {
			return SpecularReflectionBasisOutput{}, "invalid_polarization_basis"
		}
	}
	p, ok := normalizeSpecularReflectionVec(s.cross(incident))
	if !ok {
		return SpecularReflectionBasisOutput{}, "invalid_polarization_basis"
	}
	return SpecularReflectionBasisOutput{
		TE: specularReflectionNormalOutput(s), TM: specularReflectionNormalOutput(p),
		NormalIncidenceBasis: normalIncidence,
		Convention:           "TE=s=normalize(cross(facade_normal, incident_propagation)); TM=p=normalize(cross(TE, incident_propagation)); at normal incidence TE uses projected ENU up then TM follows",
		MagnitudesEquivalent: normalIncidence,
	}, ""
}

type specularReflectionMaterialResolution struct {
	output               SpecularReflectionMaterialOutput
	coefficient          complex128
	interfaceCoefficient complex128
	status               string
	reason               string
	properties           materialResolvedProperties
}

func resolveSpecularReflectionMaterial(request SpecularReflectionReferenceRequest, incidenceDeg float64) (specularReflectionMaterialResolution, error) {
	material := request.Material
	thickness := material.ThicknessM
	if thickness == nil {
		zero := 0.0
		thickness = &zero
	}
	materialRequest := MaterialReferenceRequest{
		SchemaVersion:       MaterialReferenceSchemaVersion,
		FrequencyGHz:        request.FrequencyGHz,
		MaterialSource:      material.MaterialSource,
		MaterialID:          material.MaterialID,
		UserMaterial:        material.UserMaterial,
		ThicknessM:          thickness,
		ThicknessProvenance: material.ThicknessProvenance,
		IncidenceAngle:      incidenceDeg,
		Polarization:        strings.ToUpper(strings.TrimSpace(request.Polarization)),
		IncidentMedium:      material.IncidentMedium,
		ExitMedium:          material.ExitMedium,
	}
	if material.UserMaterial != nil {
		if validationError := validateUserMaterial(*material.UserMaterial); validationError != "" {
			return specularReflectionMaterialResolution{}, fmt.Errorf("material.user_material: %s", validationError)
		}
		if material.UserMaterial.PropertySource == MaterialPropertySourceInferred {
			return specularReflectionMaterialResolution{}, fmt.Errorf("material.user_material.property_source inferred is not accepted; declare P.2040, measured, manufacturer, or user_declared properties")
		}
	}
	properties, materialStatus, err := resolveMaterialReferenceProperties(materialRequest)
	if err != nil {
		return specularReflectionMaterialResolution{}, err
	}
	output := SpecularReflectionMaterialOutput{
		Mode: material.Mode, MaterialSource: material.MaterialSource, MaterialID: properties.MaterialID,
		Name: properties.Name, P2040Identity: "ITU-R P.2040-4; complex TE/TM field reflection coefficient",
		PropertySource: properties.PropertySource, Provenance: material.Provenance,
		ThicknessProvenance: material.ThicknessProvenance, PhaseCoherence: material.PhaseCoherence,
	}
	if material.ThicknessM != nil {
		value := *material.ThicknessM
		output.ThicknessM = &value
	}
	if properties.FrequencyRangeGHz != [2]float64{} {
		// Preserve the P.2040 row identity without copying the entire slab output
		// ledger into this isolated path response.
		output.P2040Identity = fmt.Sprintf("%s; material range %.3g–%.3g GHz", output.P2040Identity, properties.FrequencyRangeGHz[0], properties.FrequencyRangeGHz[1])
	}
	if materialStatus != MaterialReferenceStatusApplicable {
		return specularReflectionMaterialResolution{output: output, properties: properties, status: SpecularReflectionStatusInapplicable, reason: "material_frequency_out_of_range"}, nil
	}
	incidentEpsilon := materialReferenceMediumComplex(material.IncidentMedium, request.FrequencyGHz)
	materialEpsilon := properties.ComplexRelativePermittivity
	nIncident := cmplx.Sqrt(incidentEpsilon)
	nMaterial := cmplx.Sqrt(materialEpsilon)
	if !materialReferenceComplexFinite(nIncident) || !materialReferenceComplexFinite(nMaterial) || cmplx.Abs(nIncident) <= 0 || cmplx.Abs(nMaterial) <= 0 {
		return specularReflectionMaterialResolution{}, fmt.Errorf("material reflection produced an invalid refractive index")
	}
	angleRadians := incidenceDeg * math.Pi / 180
	sinIncident := complex(math.Sin(angleRadians), 0)
	cosIncident := complex(math.Cos(angleRadians), 0)
	sinMaterial := nIncident * sinIncident / nMaterial
	cosMaterial := materialReferencePositiveRoot(1 - sinMaterial*sinMaterial)
	if !materialReferenceComplexFinite(cosMaterial) {
		return specularReflectionMaterialResolution{}, fmt.Errorf("material reflection produced an invalid transmitted angle")
	}
	interfaceCoefficient := materialReferenceInterfaceReflection(strings.ToUpper(strings.TrimSpace(request.Polarization)), nIncident, cosIncident, nMaterial, cosMaterial)
	if !materialReferenceComplexFinite(interfaceCoefficient) {
		return specularReflectionMaterialResolution{}, fmt.Errorf("material reflection produced a non-finite interface coefficient")
	}
	coefficient := interfaceCoefficient
	multipleInternalReflections := false
	if material.Mode == SpecularReflectionMaterialSlab {
		if material.ThicknessM == nil {
			return specularReflectionMaterialResolution{output: output, properties: properties, status: SpecularReflectionStatusInapplicable, reason: "thickness_unknown_for_slab_mode"}, nil
		}
		materialRequest.ThicknessM = material.ThicknessM
		numerics, numericErr := evaluateMaterialReferenceSlab(materialRequest, properties)
		if numericErr != nil {
			return specularReflectionMaterialResolution{}, numericErr
		}
		coefficient = numerics.ReflectionCoefficient
		interfaceCoefficient = numerics.FirstInterfaceReflectionCoefficient
		multipleInternalReflections = true
	}
	power := cmplxAbsSquared(coefficient)
	if !finiteFloat(power) || power < 0 || power > 1+1e-8 {
		return specularReflectionMaterialResolution{}, fmt.Errorf("reflection coefficient power fraction is outside the passive range")
	}
	if power > 1 {
		power = 1
	}
	output.ReflectionCoefficient = ptrSpecularReflectionCoefficient(specularReflectionCoefficientOutput(coefficient))
	output.InterfaceCoefficient = ptrSpecularReflectionCoefficient(specularReflectionCoefficientOutput(interfaceCoefficient))
	output.MultipleInternalReflections = multipleInternalReflections
	if material.ThicknessM == nil && material.Mode == SpecularReflectionMaterialInterface {
		output.ThicknessProvenance = "not_applicable_interface_mode"
	}
	return specularReflectionMaterialResolution{output: output, coefficient: coefficient, interfaceCoefficient: interfaceCoefficient, properties: properties}, nil
}

func ptrSpecularReflectionCoefficient(value SpecularReflectionCoefficientOutput) *SpecularReflectionCoefficientOutput {
	return &value
}

func calculateSpecularReflectionWavelength(frequencyGHz float64) float64 {
	return 299792458.0 / (frequencyGHz * 1e9)
}

type specularReflectionAntennaEvaluation struct {
	output      SpecularReflectionAntennaOutput
	patternLoss float64
	eligible    bool
	reason      string
}

func evaluateSpecularReflectionAntenna(antenna SpecularReflectionAntennaInput, gainFallback *float64, label string, source, target specularReflectionVec, frequencyGHz float64) (specularReflectionAntennaEvaluation, error) {
	gain, hasGain := specularReflectionAntennaGain(antenna)
	if !hasGain && gainFallback != nil {
		gain, hasGain = *gainFallback, true
	}
	if !hasGain || !finiteFloat(gain) {
		return specularReflectionAntennaEvaluation{}, fmt.Errorf("%s antenna gain is missing or non-finite", label)
	}
	direction := target.sub(source)
	horizontalDistance := math.Hypot(direction.x, direction.y)
	distance := direction.norm()
	if !finiteFloat(distance) || distance <= specularReflectionGeometryTolerance {
		return specularReflectionAntennaEvaluation{}, fmt.Errorf("%s antenna direction has zero length", label)
	}
	azimuth := normalizeDegrees(math.Atan2(direction.x, direction.y) * 180 / math.Pi)
	elevation := math.Atan2(direction.z, horizontalDistance) * 180 / math.Pi
	patternID := strings.TrimSpace(antenna.PatternID)
	if patternID == "" && strings.EqualFold(antenna.Mode, "directional") {
		patternID = AntennaPatternCosineSectorID
	}
	patternLoss := 0.0
	eligible := true
	eligibilityReason := "isotropic_reference"
	if !oneOf(strings.ToLower(strings.TrimSpace(antenna.Mode)), "isotropic", "omni") {
		if antenna.BoresightAzimuthDeg == nil || antenna.BoresightElevationDeg == nil {
			return specularReflectionAntennaEvaluation{}, fmt.Errorf("%s directional antenna requires boresight azimuth and elevation", label)
		}
		beamWidth := 360.0
		if antenna.BeamWidthDeg != nil {
			beamWidth = *antenna.BeamWidthDeg
		}
		horizontalOffset := smallestAngleDifference(azimuth, *antenna.BoresightAzimuthDeg)
		verticalOffset := elevation - *antenna.BoresightElevationDeg
		profile := DefaultCellRFProfile("5g", frequencyGHz, 0, 0, 0, 0, 0, 0)
		profile.HorizontalPatternID = patternID
		profile.VerticalPatternID = "panel-20deg"
		profile.BeamWidthDeg = beamWidth
		// EvaluateAntennaPattern's vertical cut is expressed as a depression
		// angle. A synthetic zero-height profile gives the same symmetric
		// offset as the explicit ENU elevation difference without inventing a
		// second receiver orientation.
		profile.AntennaHeightM = 0
		profile.ReceiverHeightM = math.Tan(verticalOffset*math.Pi/180) * math.Max(horizontalDistance, 0.1)
		pattern := EvaluateAntennaPattern(profile, math.Max(horizontalDistance, 0.1), horizontalOffset)
		patternLoss = pattern.TotalAttenuationDB
		eligible = pattern.HardBeamEligible
		eligibilityReason = pattern.HardBeamEligibilityReason
	}
	var aperture *float64
	if antenna.ApertureM != nil {
		value := *antenna.ApertureM
		aperture = &value
	}
	return specularReflectionAntennaEvaluation{
		output: SpecularReflectionAntennaOutput{
			Mode: antenna.Mode, PatternID: patternID, AbsoluteGainDBi: gain,
			DepartureAzimuthDeg: specularFloatPointer(azimuth), DepartureElevationDeg: specularFloatPointer(elevation),
			ArrivalLookAzimuthDeg: specularFloatPointer(azimuth), ArrivalLookElevationDeg: specularFloatPointer(elevation),
			PatternAttenuationDB: patternLoss, PatternEligible: eligible,
			PatternEligibilityReason: eligibilityReason, ApertureM: aperture,
		},
		patternLoss: patternLoss, eligible: eligible, reason: eligibilityReason,
	}, nil
}

func specularFloatPointer(value float64) *float64 { return &value }

func (value SpecularReflectionAntennaOutput) withTxDirection(azimuth, elevation float64) SpecularReflectionAntennaOutput {
	value.DepartureAzimuthDeg = specularFloatPointer(azimuth)
	value.DepartureElevationDeg = specularFloatPointer(elevation)
	return value
}

func (value SpecularReflectionAntennaOutput) withRxDirection(azimuth, elevation float64) SpecularReflectionAntennaOutput {
	value.ArrivalLookAzimuthDeg = specularFloatPointer(azimuth)
	value.ArrivalLookElevationDeg = specularFloatPointer(elevation)
	return value
}

func reflectionDirection(source, target specularReflectionVec) (float64, float64, bool) {
	direction := target.sub(source)
	horizontal := math.Hypot(direction.x, direction.y)
	if !direction.finite() || direction.norm() <= specularReflectionGeometryTolerance {
		return 0, 0, false
	}
	return normalizeDegrees(math.Atan2(direction.x, direction.y) * 180 / math.Pi), math.Atan2(direction.z, horizontal) * 180 / math.Pi, true
}

type specularReflectionResolvedObstacle struct {
	id          string
	polygon     []specularReflectionVec
	baseZ       float64
	topZ        float64
	reflector   bool
	heightKnown bool
}

func resolveSpecularReflectionObstacles(request SpecularReflectionReferenceRequest, frame specularReflectionFrame) ([]specularReflectionResolvedObstacle, error) {
	if len(request.Obstructions) == 0 {
		return nil, nil
	}
	obstacles := make([]specularReflectionResolvedObstacle, 0, len(request.Obstructions))
	for _, input := range request.Obstructions {
		polygon := make([]specularReflectionVec, 0, len(input.Polygon))
		for _, position := range input.Polygon {
			value, _, err := frame.resolvePosition(position, nil, 0)
			if err != nil {
				return nil, fmt.Errorf("obstruction %s: %w", input.ID, err)
			}
			polygon = append(polygon, value)
		}
		if len(polygon) < 3 {
			return nil, fmt.Errorf("obstruction %s polygon is degenerate", input.ID)
		}
		obstacles = append(obstacles, specularReflectionResolvedObstacle{id: input.ID, polygon: polygon, baseZ: *input.BaseZ, topZ: *input.TopZ, reflector: input.Reflector, heightKnown: true})
	}
	return obstacles, nil
}

func evaluateSpecularReflectionVisibility(
	request SpecularReflectionReferenceRequest,
	geometry specularReflectionResolvedGeometry,
	image specularReflectionImageGeometry,
	buildings *BuildingIndex,
) (SpecularReflectionVisibilityOutput, []string, error) {
	output := SpecularReflectionVisibilityOutput{
		TerrainStatus: request.Terrain.Mode,
		Leg1:          SpecularReflectionLegVisibility{Status: SpecularReflectionVisibilityUnknown, Evidence: "not_evaluated"},
		Leg2:          SpecularReflectionLegVisibility{Status: SpecularReflectionVisibilityUnknown, Evidence: "not_evaluated"},
	}
	qualifications := []string{}
	if request.Terrain.Mode == SpecularReflectionTerrainSurveyed {
		// The current dataset has no terrain surface object. Explicitly named
		// surveyed/dataset mode is retained in the ledger but cannot be called
		// available without a supplied terrain adapter.
		output.TerrainStatus = "terrain_unavailable"
		qualifications = append(qualifications, "terrain_unknown")
	} else {
		output.TerrainStatus = "flat_ground_relative_datum_assumed"
	}
	obstacles, err := resolveSpecularReflectionObstacles(request, geometry.frame)
	if err != nil {
		return output, qualifications, err
	}
	if len(obstacles) > 0 {
		output.Leg1 = evaluateSpecularReflectionLeg(geometry.tx, image.point, obstacles, request.Facade.ReflectingObjectID, true)
		output.Leg2 = evaluateSpecularReflectionLeg(image.point, geometry.rx, obstacles, request.Facade.ReflectingObjectID, false)
	} else if buildings != nil && geometry.frame.mode == specularReflectionGeographicENU {
		datasetObstacles, datasetErr := resolveDatasetReflectionObstacles(buildings, geometry.frame, geometry.tx, image.point, geometry.rx, request.Facade.ReflectingObjectID, request.Terrain.Mode)
		if datasetErr != nil {
			return output, qualifications, datasetErr
		}
		output.Leg1 = evaluateSpecularReflectionLeg(geometry.tx, image.point, datasetObstacles, request.Facade.ReflectingObjectID, true)
		output.Leg2 = evaluateSpecularReflectionLeg(image.point, geometry.rx, datasetObstacles, request.Facade.ReflectingObjectID, false)
		output.Leg1.Evidence = "dataset_building_index"
		output.Leg2.Evidence = "dataset_building_index"
	} else if buildings != nil {
		output.Leg1 = SpecularReflectionLegVisibility{Status: SpecularReflectionVisibilityVisible, Evidence: "local_enu_no_dataset_projection; no explicit obstruction supplied"}
		output.Leg2 = SpecularReflectionLegVisibility{Status: SpecularReflectionVisibilityVisible, Evidence: "local_enu_no_dataset_projection; no explicit obstruction supplied"}
		qualifications = append(qualifications, "visibility_assumed_for_local_enu")
	} else {
		qualifications = append(qualifications, "visibility_unknown")
	}
	if output.Leg1.Status == SpecularReflectionVisibilityUnknown || output.Leg2.Status == SpecularReflectionVisibilityUnknown {
		qualifications = append(qualifications, "two_leg_visibility_unknown")
	}
	return output, qualifications, nil
}

func evaluateSpecularReflectionLeg(start, end specularReflectionVec, obstacles []specularReflectionResolvedObstacle, reflectingID string, firstLeg bool) SpecularReflectionLegVisibility {
	result := SpecularReflectionLegVisibility{Status: SpecularReflectionVisibilityVisible, Evidence: "explicit_obstruction_geometry"}
	for _, obstacle := range obstacles {
		intervals := specularReflectionPolygonIntervals(start, end, obstacle.polygon)
		if len(intervals) == 0 {
			continue
		}
		for _, interval := range intervals {
			positiveLength := interval.exit-interval.entry > specularReflectionVisibilityTolerance
			if !obstacle.heightKnown && positiveLength {
				result.Status = SpecularReflectionVisibilityUnknown
				result.BlockingObjectIDs = appendUniqueSpecularString(result.BlockingObjectIDs, obstacle.id)
				result.Reasons = appendUniqueSpecularString(result.Reasons, "obstruction_height_unknown")
				result.Intervals = append(result.Intervals, SpecularReflectionLegInterval{EntryT: interval.entry, ExitT: interval.exit, PositiveLength: true})
				continue
			}
			verticalOverlap := specularReflectionLegVerticalOverlap(start, end, interval.entry, interval.exit, obstacle.baseZ, obstacle.topZ)
			result.Intervals = append(result.Intervals, SpecularReflectionLegInterval{EntryT: interval.entry, ExitT: interval.exit, PositiveLength: positiveLength, VerticalOverlap: verticalOverlap})
			isReflector := obstacle.reflector || (reflectingID != "" && obstacle.id == reflectingID)
			if isReflector && !positiveLength {
				// A zero-length contact at S is the only self-intersection
				// exemption. The same object is not exempted from a positive
				// interior interval behind the reflection point.
				continue
			}
			if !verticalOverlap {
				continue
			}
			if isReflector && positiveLength {
				result.Status = SpecularReflectionVisibilityBlocked
				result.BlockingObjectIDs = appendUniqueSpecularString(result.BlockingObjectIDs, obstacle.id)
				result.Reasons = appendUniqueSpecularString(result.Reasons, "blocked_by_reflector_geometry")
				continue
			}
			result.Status = SpecularReflectionVisibilityBlocked
			result.BlockingObjectIDs = appendUniqueSpecularString(result.BlockingObjectIDs, obstacle.id)
			if firstLeg {
				result.Reasons = appendUniqueSpecularString(result.Reasons, "first_leg_obstructed")
			} else {
				result.Reasons = appendUniqueSpecularString(result.Reasons, "second_leg_obstructed")
			}
		}
	}
	return result
}

type specularReflectionInterval struct{ entry, exit float64 }

func specularReflectionPolygonIntervals(start, end specularReflectionVec, polygon []specularReflectionVec) []specularReflectionInterval {
	if len(polygon) < 3 {
		return nil
	}
	direction := end.sub(start)
	if math.Hypot(direction.x, direction.y) <= specularReflectionGeometryTolerance {
		return nil
	}
	parameters := []float64{0, 1}
	for index := range polygon {
		a := polygon[index]
		b := polygon[(index+1)%len(polygon)]
		edge := b.sub(a)
		denominator := direction.x*edge.y - direction.y*edge.x
		relative := a.sub(start)
		if math.Abs(denominator) > specularReflectionVisibilityTolerance {
			t := (relative.x*edge.y - relative.y*edge.x) / denominator
			u := (relative.x*direction.y - relative.y*direction.x) / denominator
			if t >= -specularReflectionVisibilityTolerance && t <= 1+specularReflectionVisibilityTolerance && u >= -specularReflectionVisibilityTolerance && u <= 1+specularReflectionVisibilityTolerance {
				parameters = appendUniqueReflectionParameter(parameters, t)
			}
			continue
		}
		if math.Abs(relative.x*direction.y-relative.y*direction.x) <= specularReflectionVisibilityTolerance {
			if math.Abs(direction.x) >= math.Abs(direction.y) && math.Abs(direction.x) > specularReflectionVisibilityTolerance {
				parameters = appendUniqueReflectionParameter(parameters, (a.x-start.x)/direction.x)
				parameters = appendUniqueReflectionParameter(parameters, (b.x-start.x)/direction.x)
			} else if math.Abs(direction.y) > specularReflectionVisibilityTolerance {
				parameters = appendUniqueReflectionParameter(parameters, (a.y-start.y)/direction.y)
				parameters = appendUniqueReflectionParameter(parameters, (b.y-start.y)/direction.y)
			}
		}
	}
	sort.Float64s(parameters)
	intervals := make([]specularReflectionInterval, 0, len(parameters))
	for index := 0; index+1 < len(parameters); index++ {
		entry, exit := parameters[index], parameters[index+1]
		if exit-entry <= specularReflectionVisibilityTolerance {
			continue
		}
		midpoint := start.add(direction.scale((entry + exit) / 2))
		if specularReflectionPointInPolygon(midpoint, polygon) || specularReflectionPointOnPolygonBoundary(midpoint, polygon) {
			intervals = append(intervals, specularReflectionInterval{entry: entry, exit: exit})
		}
	}
	if len(intervals) == 0 {
		for _, parameter := range parameters[1 : len(parameters)-1] {
			point := start.add(direction.scale(parameter))
			if specularReflectionPointOnPolygonBoundary(point, polygon) {
				intervals = append(intervals, specularReflectionInterval{entry: parameter, exit: parameter})
			}
		}
	}
	return intervals
}

func appendUniqueReflectionParameter(parameters []float64, candidate float64) []float64 {
	if !finiteFloat(candidate) || candidate < -specularReflectionVisibilityTolerance || candidate > 1+specularReflectionVisibilityTolerance {
		return parameters
	}
	candidate = math.Max(0, math.Min(1, candidate))
	for _, existing := range parameters {
		if math.Abs(existing-candidate) <= specularReflectionVisibilityTolerance {
			return parameters
		}
	}
	return append(parameters, candidate)
}

func specularReflectionPointInPolygon(point specularReflectionVec, polygon []specularReflectionVec) bool {
	inside := false
	for index, current := range polygon {
		next := polygon[(index+1)%len(polygon)]
		if (current.y > point.y) != (next.y > point.y) && point.x < (next.x-current.x)*(point.y-current.y)/(next.y-current.y)+current.x {
			inside = !inside
		}
	}
	return inside
}

func specularReflectionPointOnPolygonBoundary(point specularReflectionVec, polygon []specularReflectionVec) bool {
	for index, current := range polygon {
		next := polygon[(index+1)%len(polygon)]
		if specularReflectionPointToSegmentDistance(point, current, next) <= 1e-6 {
			return true
		}
	}
	return false
}

func specularReflectionPointToSegmentDistance(point, start, end specularReflectionVec) float64 {
	segment := end.sub(start)
	denominator := segment.x*segment.x + segment.y*segment.y
	if denominator <= specularReflectionGeometryTolerance {
		return math.Hypot(point.x-start.x, point.y-start.y)
	}
	t := ((point.x-start.x)*segment.x + (point.y-start.y)*segment.y) / denominator
	t = math.Max(0, math.Min(1, t))
	closest := start.add(segment.scale(t))
	return math.Hypot(point.x-closest.x, point.y-closest.y)
}

func specularReflectionLegVerticalOverlap(start, end specularReflectionVec, entry, exit, baseZ, topZ float64) bool {
	entryZ := start.z + (end.z-start.z)*entry
	exitZ := start.z + (end.z-start.z)*exit
	minimum := math.Min(entryZ, exitZ)
	maximum := math.Max(entryZ, exitZ)
	return maximum >= baseZ-specularReflectionVisibilityTolerance && minimum <= topZ+specularReflectionVisibilityTolerance
}

func appendUniqueSpecularString(values []string, candidate string) []string {
	for _, value := range values {
		if value == candidate {
			return values
		}
	}
	return append(values, candidate)
}

func (frame specularReflectionFrame) localToGeographic(value specularReflectionVec) Point {
	latRadians := frame.originLat * math.Pi / 180
	cosLatitude := math.Cos(latRadians)
	if math.Abs(cosLatitude) < 1e-12 {
		cosLatitude = 1e-12
	}
	lon := frame.originLon + value.x/(EarthRadiusMeters*cosLatitude)*180/math.Pi
	lat := frame.originLat + value.y/EarthRadiusMeters*180/math.Pi
	return Point{Lon: normalizeLongitude(lon), Lat: lat}
}

func resolveDatasetReflectionObstacles(
	buildings *BuildingIndex,
	frame specularReflectionFrame,
	tx, point, rx specularReflectionVec,
	reflectingID string,
	terrainMode string,
) ([]specularReflectionResolvedObstacle, error) {
	if buildings == nil {
		return nil, nil
	}
	if terrainMode != SpecularReflectionTerrainFlat {
		return nil, nil
	}
	geoPoints := []Point{frame.localToGeographic(tx), frame.localToGeographic(point), frame.localToGeographic(rx)}
	bounds := Bounds{MinLon: geoPoints[0].Lon, MaxLon: geoPoints[0].Lon, MinLat: geoPoints[0].Lat, MaxLat: geoPoints[0].Lat}
	for _, geo := range geoPoints[1:] {
		bounds.MinLon = math.Min(bounds.MinLon, geo.Lon)
		bounds.MaxLon = math.Max(bounds.MaxLon, geo.Lon)
		bounds.MinLat = math.Min(bounds.MinLat, geo.Lat)
		bounds.MaxLat = math.Max(bounds.MaxLat, geo.Lat)
	}
	// A small metric margin catches a building whose edge lies exactly on a
	// reflected leg without asking the whole Ankara pack to be walked.
	margin := 2.0 / EarthRadiusMeters * 180 / math.Pi
	marginLat := margin
	marginLon := margin / math.Max(math.Abs(math.Cos(frame.originLat*math.Pi/180)), 1e-12)
	bounds.MinLon -= marginLon
	bounds.MaxLon += marginLon
	bounds.MinLat -= marginLat
	bounds.MaxLat += marginLat
	candidates := buildings.SearchBounds(bounds)
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i] == nil {
			return false
		}
		if candidates[j] == nil {
			return true
		}
		return candidates[i].ID < candidates[j].ID
	})
	result := make([]specularReflectionResolvedObstacle, 0, len(candidates))
	for _, building := range candidates {
		if building == nil || len(building.Vertices) < 3 {
			continue
		}
		polygon := make([]specularReflectionVec, 0, len(building.Vertices))
		for _, vertex := range building.Vertices {
			// The loader stores WGS84 vertices. Re-project them around the same
			// local origin rather than treating degrees as metres.
			lon, lat := vertex.Lon, vertex.Lat
			local, _, err := frame.resolvePosition(SpecularReflectionPositionInput{Lon: &lon, Lat: &lat}, nil, 0)
			if err != nil {
				return nil, err
			}
			polygon = append(polygon, local)
		}
		height, _, _, known := heightEvidenceForBuilding(building)
		if !known {
			result = append(result, specularReflectionResolvedObstacle{id: building.ID, polygon: polygon, reflector: building.ID == reflectingID, heightKnown: false})
			continue
		}
		reflector := building.ID == reflectingID || logicalBuildingID(building) == reflectingID
		result = append(result, specularReflectionResolvedObstacle{id: building.ID, polygon: polygon, baseZ: 0, topZ: height, reflector: reflector, heightKnown: true})
	}
	return result, nil
}

// EvaluateSpecularReflectionReferenceContext evaluates exactly one declared
// image-source reflection. It is intentionally not reachable from the
// canonical simulation functions.
func EvaluateSpecularReflectionReferenceContext(ctx context.Context, request SpecularReflectionReferenceRequest, buildings *BuildingIndex) (SpecularReflectionReferenceResponse, error) {
	if err := ctx.Err(); err != nil {
		return SpecularReflectionReferenceResponse{}, err
	}
	if validationError := ValidateSpecularReflectionReferenceRequest(request); validationError != "" {
		return SpecularReflectionReferenceResponse{}, fmt.Errorf("specular reflection reference: %s", validationError)
	}
	request.Polarization = strings.ToUpper(strings.TrimSpace(request.Polarization))
	if request.Material.Mode == "" {
		request.Material.Mode = request.Material.ReflectionMode
	}
	response := SpecularReflectionReferenceResponse{
		SchemaVersion: SpecularReflectionReferenceSchemaVersion,
		Model:         SpecularReflectionReferenceModelID, ModelID: SpecularReflectionReferenceModelID, ModelVersion: SpecularReflectionReferenceModelVersion,
		Readiness: SpecularReflectionReferenceReadiness, Promoted: false, ProductionCandidate: false, Canonical: false, NetworkCoupled: false,
		MultipathCombined: false, CoherentMultipathCombined: false, Status: SpecularReflectionStatusInapplicable,
		Applicability:             SpecularReflectionApplicability{Status: SpecularReflectionStatusInapplicable},
		DiffuseScatteringModelled: false, AtmosphereCompositionSupported: false, DirectPathCalculated: false,
		Exclusions: []string{
			"direct_plus_reflected_coherent_sum",
			"multi_bounce_reflection",
			"diffuse_scattering_and_brdf",
			"curvature_solver",
			"automatic_osm_material_inference",
			"P.1411_composition",
			"P.526_composition",
			"research_sub_thz_80_db_wall_addition",
			"canonical_network_coverage_interference_radio_quality_optimizer_coupling",
		},
		Assumptions: []string{
			"One vertical planar facade and one finite horizontal segment are declared explicitly.",
			"Image-source geometry is evaluated in a local metric ENU frame.",
			"P.2040 supplies one complex TE/TM field coefficient; its power magnitude is applied exactly once.",
			"The result is an isolated reflected-path reference power, not total network received power.",
		},
		Limitations: []string{
			"Finite-edge diffraction, curvature, unresolved construction layers, and diffuse power are not modelled.",
			"Unknown roughness and antenna aperture remain explicit qualifications rather than inferred facts.",
			"Atmospheric integration is deferred and no direct-path comparison is calculated.",
			"The current Ankara dataset is never searched for a best reflector and OSM material labels are not used as electrical properties.",
		},
		Fingerprint: specularReflectionFingerprint(request),
	}
	geometry, geometryErr := resolveSpecularReflectionGeometry(request)
	if geometryErr != nil {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "invalid_facade_or_coordinate_geometry")
		response.Applicability.Qualifications = appendUniqueSpecularString(response.Applicability.Qualifications, geometryErr.Error())
		response.Status = SpecularReflectionStatusInapplicable
		response.Applicability.Status = response.Status
		response.Facade = SpecularReflectionFacadeOutput{GeometryProvenance: request.Facade.GeometryProvenance, NormalProvenance: request.Facade.NormalProvenance, HeightProvenance: request.Facade.HeightProvenance, BaseZ: request.Facade.BaseZ, TopZ: request.Facade.TopZ, DiffuseScatteringModelled: false}
		return response, nil
	}
	response.Geometry = SpecularReflectionGeometryOutput{
		LocalFrame: geometry.frame.output(), TxENU: specularReflectionPointOutput(geometry.tx), RxENU: specularReflectionPointOutput(geometry.rx),
		FacadeStartENU: specularReflectionPointOutput(geometry.start), FacadeEndENU: specularReflectionPointOutput(geometry.end),
		PlanePointENU: specularReflectionPointOutput(geometry.planePoint), PlaneNormal: specularReflectionNormalOutput(geometry.normal),
		AngleConvention:      "incidence/reflection angle is measured from the facade normal using acos(abs(k·n)); k_i points Tx→S and k_r points S→Rx",
		VerticalExtentStatus: "known",
		BaseZ:                geometry.baseZ, TopZ: geometry.topZ,
	}
	response.Facade = SpecularReflectionFacadeOutput{
		GeometryProvenance: geometryGeometryProvenance(request.Facade.GeometryProvenance), NormalProvenance: geometry.normalSource,
		HeightProvenance: request.Facade.HeightProvenance, BaseZ: geometry.baseZ, TopZ: geometry.topZ,
		FacadeExtentKnown: geometry.baseZ != nil && geometry.topZ != nil, DiffuseScatteringModelled: false,
	}
	if geometry.baseZ == nil || geometry.topZ == nil {
		response.Geometry.VerticalExtentStatus = "unknown"
	}
	image, imageReason := calculateSpecularReflectionImageGeometry(geometry)
	if imageReason != "" {
		if image.point.finite() {
			response.Geometry.MirroredTxENU = pointPointer(specularReflectionPointOutput(image.imageTx))
			response.Geometry.ReflectionPointENU = pointPointer(specularReflectionPointOutput(image.point))
			response.Geometry.ImageIntersectionT = specularFloatPointer(image.t)
			response.Geometry.SegmentParameter = specularFloatPointer(image.segmentT)
			response.Geometry.SegmentDistanceFromLineM = specularFloatPointer(image.lineDistance)
		}
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, imageReason)
		response.Status = SpecularReflectionStatusInapplicable
		response.Applicability.Status = response.Status
		if imageReason == "vertical_extent_unknown" {
			response.Geometry.VerticalExtentStatus = "unknown"
		}
		if imageReason == "specular_point_outside_vertical_extent" {
			response.Geometry.VerticalExtentStatus = "outside"
		}
		return response, nil
	}
	response.Geometry.MirroredTxENU = pointPointer(specularReflectionPointOutput(image.imageTx))
	response.Geometry.ReflectionPointENU = pointPointer(specularReflectionPointOutput(image.point))
	response.Geometry.ImageIntersectionT = specularFloatPointer(image.t)
	response.Geometry.SegmentParameter = specularFloatPointer(image.segmentT)
	response.Geometry.SegmentDistanceFromLineM = specularFloatPointer(image.lineDistance)
	response.Geometry.D1M = specularFloatPointer(image.d1)
	response.Geometry.D2M = specularFloatPointer(image.d2)
	response.Geometry.TotalPathLengthM = specularFloatPointer(image.total)
	response.Geometry.ImagePathLengthM = specularFloatPointer(image.imageLength)
	imageDifference := math.Abs(image.total - image.imageLength)
	response.Geometry.ImagePathDifferenceM = specularFloatPointer(imageDifference)
	response.Geometry.IncidenceAngleDeg = specularFloatPointer(image.incidenceDeg)
	response.Geometry.ReflectionAngleDeg = specularFloatPointer(image.reflectionDeg)
	response.Geometry.SpecularEqualityError = specularFloatPointer(image.equalityError)
	response.Geometry.Basis = &image.basis

	wavelength := calculateSpecularReflectionWavelength(request.FrequencyGHz)
	response.Spreading = SpecularReflectionSpreadingOutput{
		WavelengthM: wavelength, TotalPathLengthM: image.total,
		FSPLReflectedPathDB:   specularReflectionFSPL(image.total, wavelength),
		Formula:               "FSPL(L)=20log10(4πL/λ), L=d1+d2=|Tx_image−Rx|",
		TwoLegFSPLComposition: false,
	}
	if imageDifference > 1e-5*math.Max(1, image.total) {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "image_path_length_mismatch")
	}

	material, materialErr := resolveSpecularReflectionMaterial(request, image.incidenceDeg)
	if materialErr != nil {
		return SpecularReflectionReferenceResponse{}, materialErr
	}
	response.Material = material.output
	if material.status == SpecularReflectionStatusInapplicable {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, material.reason)
		response.Status = SpecularReflectionStatusInapplicable
		response.Applicability.Status = response.Status
		return response, nil
	}
	response.Facade.Roughness = specularReflectionRoughness(request.RMSRoughnessM, wavelength, image.incidenceDeg)
	response.Evidence.Fresnel = specularReflectionFresnelEvidence(wavelength, image.d1, image.d2, image.segmentT, geometry.segmentLen, image.point.z, geometry.baseZ, geometry.topZ)
	response.Facade.FresnelZoneScaleM = specularFloatPointer(response.Evidence.Fresnel.RadiusM)
	response.Facade.FiniteReflectorEvidence = response.Evidence.Fresnel.FiniteReflectorEvidence
	response.Evidence.FarField = specularReflectionFarFieldEvidence(request, wavelength, image.d1, image.d2)
	if geometry.baseZ != nil && geometry.topZ != nil {
		horizontalLeft := image.segmentT * geometry.segmentLen
		horizontalRight := (1 - image.segmentT) * geometry.segmentLen
		verticalBelow := image.point.z - *geometry.baseZ
		verticalAbove := *geometry.topZ - image.point.z
		response.Facade.AvailableHorizontalLeftM = specularFloatPointer(horizontalLeft)
		response.Facade.AvailableHorizontalRightM = specularFloatPointer(horizontalRight)
		response.Facade.AvailableVerticalBelowM = specularFloatPointer(verticalBelow)
		response.Facade.AvailableVerticalAboveM = specularFloatPointer(verticalAbove)
	}

	qualifications := []string{}
	if response.Facade.Roughness != nil {
		if response.Facade.Roughness.SpecularityStatus == "unknown" {
			qualifications = append(qualifications, "roughness_unknown")
		} else if response.Facade.Roughness.SpecularityStatus == "rough_surface_warning" {
			qualifications = append(qualifications, "rough_surface")
		}
	}
	if response.Evidence.FarField.Status == "unknown" {
		qualifications = append(qualifications, "antenna_far_field_unknown")
	} else if response.Evidence.FarField.Status == "warning" {
		qualifications = append(qualifications, "antenna_far_field_warning")
	}
	if response.Evidence.Fresnel.FiniteReflectorEvidence == "facade_extent_smaller_than_scalar_fresnel_zone" {
		qualifications = append(qualifications, "finite_reflector_extent_qualification")
	}

	visibility, visibilityQualifications, visibilityErr := evaluateSpecularReflectionVisibility(request, geometry, image, buildings)
	if visibilityErr != nil {
		return SpecularReflectionReferenceResponse{}, visibilityErr
	}
	response.Visibility = visibility
	qualifications = append(qualifications, visibilityQualifications...)
	if visibility.Leg1.Status == SpecularReflectionVisibilityBlocked {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "leg1_blocked")
	}
	if visibility.Leg2.Status == SpecularReflectionVisibilityBlocked {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "leg2_blocked")
	}
	if visibility.Leg1.Status == SpecularReflectionVisibilityUnknown {
		qualifications = append(qualifications, "leg1_visibility_unknown")
	}
	if visibility.Leg2.Status == SpecularReflectionVisibilityUnknown {
		qualifications = append(qualifications, "leg2_visibility_unknown")
	}

	txAntenna, antennaErr := evaluateSpecularReflectionAntenna(*request.Tx.Antenna, request.LinkBudget.TxGainDBi, "tx", geometry.tx, image.point, request.FrequencyGHz)
	if antennaErr != nil {
		return SpecularReflectionReferenceResponse{}, antennaErr
	}
	rxAntenna, antennaErr := evaluateSpecularReflectionAntenna(*request.Rx.Antenna, request.LinkBudget.RxGainDBi, "rx", geometry.rx, image.point, request.FrequencyGHz)
	if antennaErr != nil {
		return SpecularReflectionReferenceResponse{}, antennaErr
	}
	txAzimuth, txElevation, _ := reflectionDirection(geometry.tx, image.point)
	rxAzimuth, rxElevation, _ := reflectionDirection(geometry.rx, image.point)
	txAntenna.output = txAntenna.output.withTxDirection(txAzimuth, txElevation)
	txAntenna.output.ArrivalLookAzimuthDeg = nil
	txAntenna.output.ArrivalLookElevationDeg = nil
	rxAntenna.output = rxAntenna.output.withRxDirection(rxAzimuth, rxElevation)
	rxAntenna.output.DepartureAzimuthDeg = nil
	rxAntenna.output.DepartureElevationDeg = nil
	response.Antennas = SpecularReflectionAntennasOutput{Tx: txAntenna.output, Rx: rxAntenna.output}
	if !txAntenna.eligible || !rxAntenna.eligible {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "antenna_pattern_outside_hard_beam")
	}

	txPattern := request.LinkBudget.TxPatternAttenuationDB + txAntenna.patternLoss
	rxPattern := request.LinkBudget.RxPatternAttenuationDB + rxAntenna.patternLoss
	pt := *request.LinkBudget.PtConductedDBm
	reflectionTermDB := 0.0
	reflectionTermAvailable := material.output.ReflectionCoefficient != nil && material.output.ReflectionCoefficient.PowerFraction > specularReflectionNumericFloor
	if reflectionTermAvailable {
		reflectionTermDB = 10 * math.Log10(material.output.ReflectionCoefficient.PowerFraction)
	}
	response.LinkBudget = SpecularReflectionLinkBudgetOutput{
		PtConductedDBm: pt, TxAbsoluteGainDBi: txAntenna.output.AbsoluteGainDBi, TxPatternAttenuationDB: txPattern,
		RxAbsoluteGainDBi: rxAntenna.output.AbsoluteGainDBi, RxPatternAttenuationDB: rxPattern,
		SystemLossDB: request.LinkBudget.SystemLossDB, PolarizationLossDB: request.LinkBudget.PolarizationLossDB,
		CalibrationDB: request.LinkBudget.CalibrationDB, FSPLReflectedPathDB: response.Spreading.FSPLReflectedPathDB,
		ReflectionPowerTermDB: reflectionTermDB,
		Equation:              "Pr_ref_dBm=Pt_conducted+Gt_absolute−A_tx_pattern+Gr_absolute−A_rx_pattern−L_system−L_polarization+calibration−FSPL(L)+10log10(|Γ|²)",
	}
	if !reflectionTermAvailable {
		response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "reflection_coefficient_zero_or_below_numeric_floor")
	} else {
		power := pt + txAntenna.output.AbsoluteGainDBi - txPattern + rxAntenna.output.AbsoluteGainDBi - rxPattern - request.LinkBudget.SystemLossDB - request.LinkBudget.PolarizationLossDB + request.LinkBudget.CalibrationDB - response.Spreading.FSPLReflectedPathDB + reflectionTermDB
		if finiteFloat(power) {
			response.LinkBudget.ReflectedPathReferencePowerDBm = &power
		} else {
			response.Applicability.Reasons = appendUniqueSpecularString(response.Applicability.Reasons, "non_finite_reference_power")
		}
	}

	response.Applicability.Qualifications = appendUniqueStable(response.Applicability.Qualifications, qualifications)
	if len(response.Applicability.Reasons) > 0 {
		response.Status = SpecularReflectionStatusInapplicable
	} else if len(response.Applicability.Qualifications) > 0 {
		response.Status = SpecularReflectionStatusQualified
	} else {
		response.Status = SpecularReflectionStatusApplicable
	}
	response.Applicability.Status = response.Status
	return response, nil
}

func pointPointer(value SpecularReflectionENUPoint) *SpecularReflectionENUPoint { return &value }

func geometryGeometryProvenance(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	return value
}

func appendUniqueStable(existing []string, values []string) []string {
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		existing = appendUniqueSpecularString(existing, value)
	}
	return existing
}

func specularReflectionFSPL(distance, wavelength float64) float64 {
	if distance <= 0 || wavelength <= 0 || !finiteFloat(distance) || !finiteFloat(wavelength) {
		return 0
	}
	return 20 * math.Log10(4*math.Pi*distance/wavelength)
}

func specularReflectionRoughness(rms *float64, wavelength, incidenceDeg float64) *SpecularReflectionRoughnessOutput {
	output := &SpecularReflectionRoughnessOutput{SmoothSurfaceCriterion: "Rayleigh-style g=4π·rms_roughness/λ·cos(incidence_angle); smooth reference requires g<0.3"}
	if rms == nil {
		output.SpecularityStatus = "unknown"
		output.SpecularityEvidence = "unknown"
		return output
	}
	rmsCopy := *rms
	parameter := 4 * math.Pi * rmsCopy / wavelength * math.Cos(incidenceDeg*math.Pi/180)
	output.RMSRoughnessM = &rmsCopy
	output.RoughnessParameter = &parameter
	output.SpecularityEvidence = "explicit_rms_roughness"
	if parameter < 0.3 {
		output.SpecularityStatus = "supported_smooth"
	} else {
		output.SpecularityStatus = "rough_surface_warning"
	}
	return output
}

func specularReflectionFresnelEvidence(wavelength, d1, d2, segmentT, segmentLength, z float64, baseZ, topZ *float64) SpecularReflectionFresnelOutput {
	radius := math.Sqrt(wavelength * d1 * d2 / (d1 + d2))
	horizontalKnown := finiteFloat(segmentT) && finiteFloat(segmentLength)
	verticalKnown := baseZ != nil && topZ != nil
	evidence := "facade_extent_known"
	if horizontalKnown && verticalKnown {
		horizontalMinimum := math.Min(segmentT*segmentLength, (1-segmentT)*segmentLength)
		verticalMinimum := math.Min(z-*baseZ, *topZ-z)
		if horizontalMinimum < radius || verticalMinimum < radius {
			evidence = "facade_extent_smaller_than_scalar_fresnel_zone"
		}
	} else if !horizontalKnown || !verticalKnown {
		evidence = "facade_extent_unknown"
	}
	return SpecularReflectionFresnelOutput{RadiusM: radius, HorizontalExtentKnown: horizontalKnown, VerticalExtentKnown: verticalKnown, FiniteReflectorEvidence: evidence}
}

func specularReflectionFarFieldEvidence(request SpecularReflectionReferenceRequest, wavelength, d1, d2 float64) SpecularReflectionFarFieldOutput {
	txAperture := request.Tx.Antenna.ApertureM
	rxAperture := request.Rx.Antenna.ApertureM
	output := SpecularReflectionFarFieldOutput{Status: "unknown", WavelengthM: wavelength, Comparison: "Physical aperture is required; gain is never reverse-engineered into aperture."}
	if txAperture != nil {
		value := *txAperture
		bound := 2 * value * value / wavelength
		output.TxApertureM, output.TxFarFieldRangeM, output.TxComparedDistanceM = &value, &bound, &d1
	}
	if rxAperture != nil {
		value := *rxAperture
		bound := 2 * value * value / wavelength
		output.RxApertureM, output.RxFarFieldRangeM, output.RxComparedDistanceM = &value, &bound, &d2
	}
	if txAperture == nil || rxAperture == nil {
		return output
	}
	txBound := 2 * (*txAperture) * (*txAperture) / wavelength
	rxBound := 2 * (*rxAperture) * (*rxAperture) / wavelength
	if d1+1e-9 >= txBound && d2+1e-9 >= rxBound {
		output.Status = "supported"
		output.Comparison = "Both relevant leg distances meet R_ff≈2D²/λ."
	} else {
		output.Status = "warning"
		output.Comparison = "At least one relevant leg is shorter than R_ff≈2D²/λ."
	}
	return output
}
