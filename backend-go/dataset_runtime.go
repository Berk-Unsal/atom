package main

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

type datasetRuntime struct {
	mu          sync.RWMutex
	switchMu    sync.Mutex
	pack        *raytracer.DatasetPack
	loadError   string
	installRoot string
}

type installedDataset struct {
	ID            string                            `json:"id"`
	Name          string                            `json:"name"`
	Version       string                            `json:"version"`
	SchemaVersion int                               `json:"schema_version"`
	CRS           string                            `json:"crs"`
	Bounds        []float64                         `json:"bounds"`
	GeneratedAt   string                            `json:"generated_at"`
	Sources       []string                          `json:"sources"`
	Licenses      []string                          `json:"licenses"`
	Confidence    string                            `json:"confidence"`
	Files         raytracer.DatasetFiles            `json:"files"`
	SHA256        map[string]string                 `json:"sha256"`
	Layers        map[string]raytracer.DatasetLayer `json:"layers,omitempty"`
	Quality       *raytracer.DatasetQualityReport   `json:"quality,omitempty"`
	Active        bool                              `json:"active"`
	Available     bool                              `json:"available"`
}

type installedDatasetList struct {
	ActiveID string             `json:"active_id,omitempty"`
	Datasets []installedDataset `json:"datasets"`
	Warnings []string           `json:"warnings,omitempty"`
}

type datasetCandidate struct {
	root     string
	manifest raytracer.DatasetManifest
}

type datasetSwitchInput struct {
	ID string `json:"id"`
}

func loadRuntimeDataset() (*raytracer.DatasetPack, error) {
	root := os.Getenv("ATOM_DATASET_DIR")
	if root == "" {
		root = firstExistingDirectory([]string{
			filepath.Clean("../data-pipeline"),
			filepath.Clean("data-pipeline"),
			filepath.Clean("/app/data-pipeline"),
		})
	}
	if root == "" {
		return nil, errors.New("dataset directory with manifest.json was not found")
	}
	return raytracer.LoadDatasetPack(root)
}

func newDatasetRuntime(pack *raytracer.DatasetPack, loadErr error, installRoot string) *datasetRuntime {
	runtime := &datasetRuntime{pack: pack, installRoot: strings.TrimSpace(installRoot)}
	if loadErr != nil {
		runtime.loadError = "dataset unavailable"
	}
	return runtime
}

func (runtime *datasetRuntime) Current() *raytracer.DatasetPack {
	runtime.mu.RLock()
	defer runtime.mu.RUnlock()
	return runtime.pack
}

func (runtime *datasetRuntime) LoadError() string {
	runtime.mu.RLock()
	defer runtime.mu.RUnlock()
	return runtime.loadError
}

func (runtime *datasetRuntime) List() installedDatasetList {
	candidates, warnings := runtime.candidates()
	current := runtime.Current()
	activeID := ""
	if current != nil {
		activeID = current.Manifest.ID
		if _, exists := candidates[activeID]; !exists {
			candidates[activeID] = datasetCandidate{root: current.Root, manifest: current.Manifest}
		}
	}
	ids := make([]string, 0, len(candidates))
	for id := range candidates {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	datasets := make([]installedDataset, 0, len(ids))
	for _, id := range ids {
		manifest := candidates[id].manifest
		datasets = append(datasets, installedDataset{
			ID: manifest.ID, Name: manifest.Name, Version: manifest.Version,
			SchemaVersion: manifest.SchemaVersion, CRS: manifest.CRS, Bounds: manifest.Bounds,
			GeneratedAt: manifest.GeneratedAt, Sources: manifest.Sources, Licenses: manifest.Licenses,
			Confidence: manifest.Confidence, Files: manifest.Files, Layers: manifest.Layers,
			SHA256: manifest.SHA256, Quality: manifest.Quality, Active: id == activeID, Available: true,
		})
	}
	if datasets == nil {
		datasets = []installedDataset{}
	}
	return installedDatasetList{ActiveID: activeID, Datasets: datasets, Warnings: warnings}
}

func (runtime *datasetRuntime) Switch(id string) (*raytracer.DatasetPack, error) {
	id = strings.TrimSpace(id)
	if id == "" || len(id) > 128 {
		return nil, errors.New("dataset id is required and must be at most 128 bytes")
	}
	runtime.switchMu.Lock()
	defer runtime.switchMu.Unlock()
	current := runtime.Current()
	if current != nil && current.Manifest.ID == id {
		return current, nil
	}
	candidates, _ := runtime.candidates()
	candidate, exists := candidates[id]
	if !exists {
		return nil, errors.New("dataset is not installed")
	}
	pack, err := raytracer.LoadDatasetPack(candidate.root)
	if err != nil {
		return nil, fmt.Errorf("installed dataset failed validation: %w", err)
	}
	if pack.Manifest.ID != id {
		return nil, errors.New("installed dataset id changed while loading")
	}
	runtime.mu.Lock()
	runtime.pack = pack
	runtime.loadError = ""
	runtime.mu.Unlock()
	return pack, nil
}

func (runtime *datasetRuntime) candidates() (map[string]datasetCandidate, []string) {
	result := make(map[string]datasetCandidate)
	duplicateIDs := make(map[string]struct{})
	warnings := []string{}
	root := strings.TrimSpace(runtime.installRoot)
	if root == "" {
		return result, warnings
	}
	realRoot, err := filepath.EvalSymlinks(filepath.Clean(root))
	if err != nil {
		return result, []string{"installed dataset root is unavailable"}
	}
	paths := []string{}
	if fileExists(filepath.Join(realRoot, "manifest.json")) {
		paths = append(paths, realRoot)
	}
	entries, readErr := os.ReadDir(realRoot)
	if readErr != nil {
		return result, []string{"installed dataset root cannot be read"}
	}
	for _, entry := range entries {
		if entry.IsDir() {
			paths = append(paths, filepath.Join(realRoot, entry.Name()))
		}
	}
	sort.Strings(paths)
	for _, path := range paths {
		resolved, resolveErr := filepath.EvalSymlinks(path)
		if resolveErr != nil || !pathInsideRoot(realRoot, resolved) {
			warnings = append(warnings, "an installed dataset entry was ignored")
			continue
		}
		manifest, _, _, manifestErr := raytracer.ReadDatasetManifest(resolved)
		if manifestErr != nil {
			if fileExists(filepath.Join(resolved, "manifest.json")) {
				warnings = append(warnings, "an installed dataset manifest is invalid")
			}
			continue
		}
		if _, alreadyDuplicate := duplicateIDs[manifest.ID]; alreadyDuplicate {
			continue
		}
		if _, duplicate := result[manifest.ID]; duplicate {
			delete(result, manifest.ID)
			duplicateIDs[manifest.ID] = struct{}{}
			warnings = append(warnings, fmt.Sprintf("duplicate installed dataset id %q was ignored", manifest.ID))
			continue
		}
		result[manifest.ID] = datasetCandidate{root: resolved, manifest: manifest}
	}
	return result, warnings
}

func registerDatasetRoutes(router *gin.Engine, runtime *datasetRuntime, adminAPIKey string) {
	router.GET("/api/datasets", func(c *gin.Context) {
		c.JSON(http.StatusOK, runtime.List())
	})
	router.POST("/api/datasets/switch", requireDatasetAdminAPIKey(adminAPIKey), func(c *gin.Context) {
		var input datasetSwitchInput
		if !bindJSON(c, &input, "dataset switch") {
			return
		}
		pack, err := runtime.Switch(input.ID)
		if err != nil {
			if err.Error() == "dataset is not installed" {
				c.JSON(http.StatusNotFound, gin.H{"error": "dataset is not installed"})
				return
			}
			logDatasetSwitchFailure(input.ID, err)
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "installed dataset failed validation; active dataset was not changed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "active", "dataset": pack.Manifest})
	})
}

func requireDatasetAdminAPIKey(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if apiKey == "" {
			c.Next()
			return
		}
		if !validAPIKey(c, apiKey) {
			c.Header("Cache-Control", "no-store")
			c.Header("WWW-Authenticate", `Bearer realm="A.T.O.M dataset administration"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "valid dataset administration API key required"})
			return
		}
		c.Next()
	}
}

func pathInsideRoot(root, path string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator))
}

func logDatasetSwitchFailure(id string, err error) {
	log.Printf("dataset switch for %q failed validation: %v", strings.TrimSpace(id), err)
}

func firstExistingDirectory(candidates []string) string {
	for _, candidate := range candidates {
		info, err := os.Stat(filepath.Join(candidate, "manifest.json"))
		if err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}
