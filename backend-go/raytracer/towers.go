package raytracer

import (
	"encoding/json"
	"errors"
	"os"
)

type TowerStation struct {
	ID          string  `json:"id"`
	CellID      int64   `json:"cellId"`
	RadioType   string  `json:"radioType"`
	IsSimulated bool    `json:"isSimulated"`
	Lon         float64 `json:"lon"`
	Lat         float64 `json:"lat"`
}

func LoadTowersFromGeoJSON(path string) ([]TowerStation, error) {
	bytes, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var collection featureCollection
	if err := json.Unmarshal(bytes, &collection); err != nil {
		return nil, err
	}
	if collection.Type != "FeatureCollection" {
		return nil, errors.New("expected tower GeoJSON FeatureCollection")
	}

	towers := make([]TowerStation, 0, len(collection.Features))
	for index, feature := range collection.Features {
		if feature.Geometry.Type != "Point" {
			continue
		}

		var coordinates []float64
		if err := json.Unmarshal(feature.Geometry.Coordinates, &coordinates); err != nil || len(coordinates) < 2 {
			continue
		}

		props := feature.Properties
		towers = append(towers, TowerStation{
			ID:          feature.IDOrIndex(index),
			CellID:      int64(numberProperty(props, "cell_id")),
			RadioType:   stringProperty(props, "radio_type"),
			IsSimulated: boolProperty(props, "is_simulated"),
			Lon:         coordinates[0],
			Lat:         coordinates[1],
		})
	}
	return towers, nil
}

func numberProperty(properties map[string]any, key string) float64 {
	switch value := properties[key].(type) {
	case float64:
		return value
	case int:
		return float64(value)
	case int64:
		return float64(value)
	default:
		return 0
	}
}

func stringProperty(properties map[string]any, key string) string {
	if value, ok := properties[key].(string); ok {
		return value
	}
	return ""
}

func boolProperty(properties map[string]any, key string) bool {
	if value, ok := properties[key].(bool); ok {
		return value
	}
	return false
}
