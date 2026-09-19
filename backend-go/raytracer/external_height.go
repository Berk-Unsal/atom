package raytracer

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

const MaxExternalHeightDatasetBytes int64 = 512 << 20

type externalGeoJSONCollection struct {
	Type     string          `json:"type"`
	Features []feature       `json:"features"`
	CRS      json.RawMessage `json:"crs,omitempty"`
}

// LoadExternalBuildingHeightRecordsFromGeoJSON accepts the source-independent
// A.T.O.M. sidecar contract: every polygon feature must expose a finite,
// non-negative `height_agl_m` property and must already be in EPSG:4326. A
// vendor adapter is responsible for mapping its native schema into this
// contract before calling the matcher; no vendor field names are inferred.
func LoadExternalBuildingHeightRecordsFromGeoJSON(path string, provenance EvidenceProvenance) ([]ExternalBuildingHeightRecord, error) {
	contents, err := readFileWithLimit(path, MaxExternalHeightDatasetBytes, "external building-height dataset")
	if err != nil {
		return nil, err
	}
	var collection externalGeoJSONCollection
	if err := json.Unmarshal(contents, &collection); err != nil {
		return nil, fmt.Errorf("decode external building-height GeoJSON: %w", err)
	}
	if collection.Type != "FeatureCollection" {
		return nil, errors.New("external building-height dataset must be a GeoJSON FeatureCollection")
	}
	if !externalCRSIsEPSG4326(collection.CRS) {
		return nil, errors.New("external building-height dataset must use EPSG:4326 coordinates")
	}
	if provenance.Category == "" {
		provenance.Category = SpatialHeightExternal
	}
	if provenance.EvidenceClass == "" {
		provenance.EvidenceClass = EvidenceUsableWithQualification
	}
	if provenance.VerticalDatumKind == "" {
		provenance.VerticalDatumKind = "not_applicable_agl"
	}
	if provenance.Derivation == "" {
		provenance.Derivation = "external GeoJSON height_agl_m sidecar contract"
	}
	records := make([]ExternalBuildingHeightRecord, 0, len(collection.Features))
	for index, feature := range collection.Features {
		height, ok := externalHeightProperty(feature)
		if !ok {
			return nil, fmt.Errorf("external building-height feature %d requires finite non-negative height_agl_m", index)
		}
		rings := feature.Geometry.OuterRings()
		if len(rings) == 0 {
			return nil, fmt.Errorf("external building-height feature %d requires Polygon or MultiPolygon geometry", index)
		}
		baseID := feature.IDOrIndex(index)
		for ringIndex, ring := range rings {
			if len(ring) < 3 {
				return nil, fmt.Errorf("external building-height feature %d contains an invalid polygon ring", index)
			}
			if _, valid := BoundsFromPoints(ring); !valid || !externalCoordinatesInRange(ring) {
				return nil, fmt.Errorf("external building-height feature %d must contain finite EPSG:4326 coordinates", index)
			}
			id := baseID
			if len(rings) > 1 {
				id = fmt.Sprintf("%s-%d", baseID, ringIndex)
			}
			records = append(records, ExternalBuildingHeightRecord{ID: id, Footprint: ring, HeightAGLM: height, Source: provenance, AcquisitionEpoch: provenance.AcquisitionEpoch})
		}
	}
	return records, nil
}

func externalCRSIsEPSG4326(raw json.RawMessage) bool {
	if len(raw) == 0 || string(raw) == "null" {
		// RFC 7946 GeoJSON without a legacy CRS member uses WGS84 longitude/latitude.
		return true
	}
	var crs struct {
		Type       string `json:"type"`
		Properties struct {
			Name string `json:"name"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(raw, &crs); err != nil || !strings.EqualFold(strings.TrimSpace(crs.Type), "name") {
		return false
	}
	name := strings.ToLower(strings.TrimSpace(crs.Properties.Name))
	return name == "epsg:4326" || name == "urn:ogc:def:crs:epsg::4326" || name == "http://www.opengis.net/def/crs/epsg/0/4326" || name == "http://www.opengis.net/gml/srs/epsg.xml#4326"
}

func externalHeightProperty(feature feature) (float64, bool) {
	for key, value := range feature.Properties {
		if !strings.EqualFold(strings.TrimSpace(key), "height_agl_m") {
			continue
		}
		var height float64
		switch typed := value.(type) {
		case float64:
			height = typed
		case json.Number:
			parsed, err := typed.Float64()
			if err != nil {
				return 0, false
			}
			height = parsed
		case string:
			parsed, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
			if err != nil {
				return 0, false
			}
			height = parsed
		default:
			return 0, false
		}
		return height, height >= 0 && !math.IsNaN(height) && !math.IsInf(height, 0)
	}
	return 0, false
}

func externalCoordinatesInRange(points []Point) bool {
	for _, point := range points {
		if math.IsNaN(point.Lon) || math.IsNaN(point.Lat) || math.IsInf(point.Lon, 0) || math.IsInf(point.Lat, 0) || point.Lon < -180 || point.Lon > 180 || point.Lat < -90 || point.Lat > 90 {
			return false
		}
	}
	return true
}
