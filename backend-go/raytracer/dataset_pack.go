package raytracer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const DatasetManifestSchemaVersion = 1

type DatasetManifest struct {
	SchemaVersion int               `json:"schema_version"`
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Version       string            `json:"version"`
	CRS           string            `json:"crs"`
	Bounds        []float64         `json:"bounds"`
	GeneratedAt   string            `json:"generated_at"`
	Sources       []string          `json:"sources"`
	Licenses      []string          `json:"licenses"`
	Confidence    string            `json:"confidence"`
	Files         DatasetFiles      `json:"files"`
	SHA256        map[string]string `json:"sha256"`
}

type DatasetFiles struct {
	Towers    string `json:"towers"`
	Buildings string `json:"buildings"`
}

type DatasetPack struct {
	Root          string
	ManifestPath  string
	TowerPath     string
	BuildingPath  string
	Manifest      DatasetManifest
	Towers        []TowerStation
	BuildingIndex *BuildingIndex
	BuildingStats BuildingIndexStats
}

func LoadDatasetPack(root string) (*DatasetPack, error) {
	root = filepath.Clean(strings.TrimSpace(root))
	if root == "" || root == "." {
		return nil, errors.New("dataset directory is required")
	}
	manifestPath := filepath.Join(root, "manifest.json")
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read dataset manifest: %w", err)
	}
	var manifest DatasetManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return nil, fmt.Errorf("decode dataset manifest: %w", err)
	}
	if err := validateDatasetManifest(manifest); err != nil {
		return nil, err
	}
	towerPath, err := datasetFilePath(root, manifest.Files.Towers)
	if err != nil {
		return nil, fmt.Errorf("tower file: %w", err)
	}
	buildingPath, err := datasetFilePath(root, manifest.Files.Buildings)
	if err != nil {
		return nil, fmt.Errorf("building file: %w", err)
	}
	for name, path := range map[string]string{
		manifest.Files.Towers:    towerPath,
		manifest.Files.Buildings: buildingPath,
	} {
		expected := strings.ToLower(strings.TrimSpace(manifest.SHA256[name]))
		if expected == "" {
			return nil, fmt.Errorf("sha256 is required for %s", name)
		}
		actual, hashErr := fileSHA256(path)
		if hashErr != nil {
			return nil, fmt.Errorf("hash %s: %w", name, hashErr)
		}
		if actual != expected {
			return nil, fmt.Errorf("sha256 mismatch for %s", name)
		}
	}
	towers, err := LoadTowersFromGeoJSON(towerPath)
	if err != nil {
		return nil, fmt.Errorf("load towers: %w", err)
	}
	if len(towers) == 0 {
		return nil, errors.New("tower dataset contains no valid Point features")
	}
	seenTowerIDs := make(map[string]struct{}, len(towers))
	for _, tower := range towers {
		if tower.ID == "" || tower.Lon < -180 || tower.Lon > 180 || tower.Lat < -90 || tower.Lat > 90 {
			return nil, errors.New("tower dataset contains an invalid id or coordinate")
		}
		if _, exists := seenTowerIDs[tower.ID]; exists {
			return nil, fmt.Errorf("tower dataset contains duplicate id %q", tower.ID)
		}
		seenTowerIDs[tower.ID] = struct{}{}
	}
	buildingIndex, buildingStats, err := LoadBuildingIndexFromGeoJSON(buildingPath)
	if err != nil {
		return nil, fmt.Errorf("load buildings: %w", err)
	}
	if buildingIndex.Len() == 0 {
		return nil, errors.New("building dataset contains no valid Polygon features")
	}
	return &DatasetPack{
		Root:          root,
		ManifestPath:  manifestPath,
		TowerPath:     towerPath,
		BuildingPath:  buildingPath,
		Manifest:      manifest,
		Towers:        towers,
		BuildingIndex: buildingIndex,
		BuildingStats: buildingStats,
	}, nil
}

func validateDatasetManifest(manifest DatasetManifest) error {
	if manifest.SchemaVersion != DatasetManifestSchemaVersion {
		return fmt.Errorf("unsupported dataset schema_version %d", manifest.SchemaVersion)
	}
	if strings.TrimSpace(manifest.ID) == "" || strings.TrimSpace(manifest.Name) == "" || strings.TrimSpace(manifest.Version) == "" {
		return errors.New("dataset id, name, and version are required")
	}
	if manifest.CRS != "EPSG:4326" {
		return errors.New("dataset crs must be EPSG:4326")
	}
	if len(manifest.Bounds) != 4 || manifest.Bounds[0] >= manifest.Bounds[2] || manifest.Bounds[1] >= manifest.Bounds[3] {
		return errors.New("dataset bounds must be [west, south, east, north]")
	}
	if manifest.Bounds[0] < -180 || manifest.Bounds[2] > 180 || manifest.Bounds[1] < -90 || manifest.Bounds[3] > 90 {
		return errors.New("dataset bounds must contain valid EPSG:4326 coordinates")
	}
	if strings.TrimSpace(manifest.GeneratedAt) == "" || len(manifest.Sources) == 0 || len(manifest.Licenses) == 0 {
		return errors.New("dataset generated_at, sources, and licenses are required")
	}
	if strings.TrimSpace(manifest.Confidence) == "" {
		return errors.New("dataset confidence note is required")
	}
	if manifest.Files.Towers == "" || manifest.Files.Buildings == "" {
		return errors.New("dataset tower and building files are required")
	}
	return nil
}

func datasetFilePath(root string, name string) (string, error) {
	path := filepath.Join(root, filepath.Clean(name))
	relative, err := filepath.Rel(root, path)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", errors.New("path must remain inside the dataset directory")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("path must reference a file")
	}
	return path, nil
}

func fileSHA256(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
