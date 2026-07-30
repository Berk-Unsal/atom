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

const (
	DatasetManifestSchemaVersion              = 2
	MinimumDatasetManifestSchemaVersion       = 1
	MaxDatasetManifestBytes             int64 = 1 << 20
	MaxDatasetIdentityBytes                   = 128
)

type DatasetManifest struct {
	SchemaVersion int                     `json:"schema_version"`
	ID            string                  `json:"id"`
	Name          string                  `json:"name"`
	Version       string                  `json:"version"`
	CRS           string                  `json:"crs"`
	Bounds        []float64               `json:"bounds"`
	GeneratedAt   string                  `json:"generated_at"`
	Sources       []string                `json:"sources"`
	Licenses      []string                `json:"licenses"`
	Confidence    string                  `json:"confidence"`
	Files         DatasetFiles            `json:"files"`
	SHA256        map[string]string       `json:"sha256"`
	Layers        map[string]DatasetLayer `json:"layers,omitempty"`
	Quality       *DatasetQualityReport   `json:"quality,omitempty"`
}

type DatasetFiles struct {
	Towers          string `json:"towers"`
	Buildings       string `json:"buildings"`
	Terrain         string `json:"terrain,omitempty"`
	Clutter         string `json:"clutter,omitempty"`
	BuildingHeights string `json:"building_heights,omitempty"`
	Materials       string `json:"materials,omitempty"`
}

type DatasetLayer struct {
	Kind       string `json:"kind"`
	Format     string `json:"format"`
	CRS        string `json:"crs"`
	Units      string `json:"units,omitempty"`
	Optional   bool   `json:"optional"`
	Source     string `json:"source,omitempty"`
	License    string `json:"license,omitempty"`
	Confidence string `json:"confidence,omitempty"`
}

type DatasetQualityReport struct {
	Summary       string                       `json:"summary"`
	FeatureCounts map[string]int               `json:"feature_counts,omitempty"`
	MissingFields map[string]map[string]int    `json:"missing_fields,omitempty"`
	Geometry      map[string]DatasetGeometryQA `json:"geometry,omitempty"`
	Coverage      *DatasetCoverageQA           `json:"coverage,omitempty"`
}

type DatasetGeometryQA struct {
	InvalidInput int `json:"invalid_input"`
	Repaired     int `json:"repaired"`
	Dropped      int `json:"dropped"`
	Output       int `json:"output"`
}

type DatasetCoverageQA struct {
	RequestedBounds []float64 `json:"requested_bounds,omitempty"`
	DataBounds      []float64 `json:"data_bounds,omitempty"`
	CoverageRatio   float64   `json:"coverage_ratio,omitempty"`
}

type DatasetPack struct {
	Root          string
	ManifestPath  string
	TowerPath     string
	BuildingPath  string
	LayerPaths    map[string]string
	Manifest      DatasetManifest
	Towers        []TowerStation
	BuildingIndex *BuildingIndex
	BuildingStats BuildingIndexStats
}

func LoadDatasetPack(root string) (*DatasetPack, error) {
	manifest, manifestPath, root, err := ReadDatasetManifest(root)
	if err != nil {
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
	layerPaths := make(map[string]string)
	for layer, name := range manifest.Files.entries() {
		path, pathErr := datasetFilePath(root, name)
		if pathErr != nil {
			return nil, fmt.Errorf("%s file: %w", layer, pathErr)
		}
		layerPaths[layer] = path
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
	seenCellIDs := make(map[int64]struct{}, len(towers))
	for _, tower := range towers {
		if ValidateTowerID(tower.ID) != "" || tower.CellID <= 0 || tower.Lon < -180 || tower.Lon > 180 || tower.Lat < -90 || tower.Lat > 90 {
			return nil, errors.New("tower dataset contains an invalid id or coordinate")
		}
		if _, exists := seenTowerIDs[tower.ID]; exists {
			return nil, fmt.Errorf("tower dataset contains duplicate id %q", tower.ID)
		}
		seenTowerIDs[tower.ID] = struct{}{}
		if _, exists := seenCellIDs[tower.CellID]; exists {
			return nil, fmt.Errorf("tower dataset contains duplicate cell_id %d", tower.CellID)
		}
		seenCellIDs[tower.CellID] = struct{}{}
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
		LayerPaths:    layerPaths,
		Manifest:      manifest,
		Towers:        towers,
		BuildingIndex: buildingIndex,
		BuildingStats: buildingStats,
	}, nil
}

func ReadDatasetManifest(root string) (DatasetManifest, string, string, error) {
	root = filepath.Clean(strings.TrimSpace(root))
	if root == "" || root == "." {
		return DatasetManifest{}, "", "", errors.New("dataset directory is required")
	}
	manifestPath, err := datasetFilePath(root, "manifest.json")
	if err != nil {
		return DatasetManifest{}, "", "", fmt.Errorf("dataset manifest: %w", err)
	}
	manifestBytes, err := readFileWithLimit(manifestPath, MaxDatasetManifestBytes, "dataset manifest")
	if err != nil {
		return DatasetManifest{}, "", "", fmt.Errorf("read dataset manifest: %w", err)
	}
	var manifest DatasetManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		return DatasetManifest{}, "", "", fmt.Errorf("decode dataset manifest: %w", err)
	}
	if err := validateDatasetManifest(manifest); err != nil {
		return DatasetManifest{}, "", "", err
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return DatasetManifest{}, "", "", err
	}
	return manifest, manifestPath, realRoot, nil
}

func validateDatasetManifest(manifest DatasetManifest) error {
	if manifest.SchemaVersion < MinimumDatasetManifestSchemaVersion || manifest.SchemaVersion > DatasetManifestSchemaVersion {
		return fmt.Errorf("unsupported dataset schema_version %d", manifest.SchemaVersion)
	}
	if invalidDatasetIdentity(manifest.ID) || invalidDatasetIdentity(manifest.Name) || invalidDatasetIdentity(manifest.Version) {
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
	if strings.TrimSpace(manifest.GeneratedAt) == "" || !nonEmptyStrings(manifest.Sources) || !nonEmptyStrings(manifest.Licenses) {
		return errors.New("dataset generated_at, sources, and licenses are required")
	}
	if strings.TrimSpace(manifest.Confidence) == "" {
		return errors.New("dataset confidence note is required")
	}
	if manifest.Files.Towers == "" || manifest.Files.Buildings == "" {
		return errors.New("dataset tower and building files are required")
	}
	seenFiles := make(map[string]string)
	for layer, name := range manifest.Files.entries() {
		name = strings.TrimSpace(name)
		if previous, exists := seenFiles[name]; exists {
			return fmt.Errorf("dataset layers %s and %s cannot reference the same file", previous, layer)
		}
		seenFiles[name] = layer
		if strings.TrimSpace(manifest.SHA256[name]) == "" {
			return fmt.Errorf("sha256 is required for %s", name)
		}
		digest := strings.TrimSpace(manifest.SHA256[name])
		if len(digest) != sha256.Size*2 {
			return fmt.Errorf("sha256 for %s must contain 64 hexadecimal characters", name)
		}
		if _, err := hex.DecodeString(digest); err != nil {
			return fmt.Errorf("sha256 for %s must contain 64 hexadecimal characters", name)
		}
		if manifest.SchemaVersion >= 2 {
			metadata, exists := manifest.Layers[layer]
			if !exists {
				return fmt.Errorf("dataset layer metadata is required for %s", layer)
			}
			if strings.TrimSpace(metadata.Kind) == "" || strings.TrimSpace(metadata.Format) == "" || strings.TrimSpace(metadata.CRS) == "" {
				return fmt.Errorf("dataset layer %s requires kind, format, and crs", layer)
			}
			if (layer == "towers" || layer == "buildings") && metadata.Optional {
				return fmt.Errorf("dataset layer %s cannot be optional", layer)
			}
			if layer != "terrain" && metadata.CRS != "EPSG:4326" {
				return fmt.Errorf("dataset vector layer %s must use EPSG:4326", layer)
			}
		}
	}
	if manifest.SchemaVersion >= 2 && (manifest.Quality == nil || strings.TrimSpace(manifest.Quality.Summary) == "") {
		return errors.New("dataset quality summary is required for schema v2")
	}
	return nil
}

func invalidDatasetIdentity(value string) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed == "" || len(trimmed) > MaxDatasetIdentityBytes
}

func nonEmptyStrings(values []string) bool {
	if len(values) == 0 {
		return false
	}
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			return false
		}
	}
	return true
}

func (files DatasetFiles) entries() map[string]string {
	entries := map[string]string{
		"towers":    strings.TrimSpace(files.Towers),
		"buildings": strings.TrimSpace(files.Buildings),
	}
	optional := map[string]string{
		"terrain":          files.Terrain,
		"clutter":          files.Clutter,
		"building_heights": files.BuildingHeights,
		"materials":        files.Materials,
	}
	for layer, name := range optional {
		if name = strings.TrimSpace(name); name != "" {
			entries[layer] = name
		}
	}
	return entries
}

func datasetFilePath(root string, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || filepath.IsAbs(name) {
		return "", errors.New("path must be relative to the dataset directory")
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	path, err := filepath.EvalSymlinks(filepath.Join(realRoot, filepath.Clean(name)))
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(realRoot, path)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
		return "", errors.New("path must remain inside the dataset directory")
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("path must reference a regular file")
	}
	return path, nil
}

func readFileWithLimit(path string, maxBytes int64, label string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	contents, err := io.ReadAll(io.LimitReader(file, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(contents)) > maxBytes {
		return nil, fmt.Errorf("%s exceeds %d MiB", label, maxBytes>>20)
	}
	return contents, nil
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
