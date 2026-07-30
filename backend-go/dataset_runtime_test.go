package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

func TestDatasetRuntimeListsAndAtomicallySwitchesInstalledPacks(t *testing.T) {
	installedRoot := t.TempDir()
	firstRoot := writeInstalledDatasetFixture(t, installedRoot, "first", "first-pack")
	secondRoot := writeInstalledDatasetFixture(t, installedRoot, "second", "second-pack")
	first, err := raytracer.LoadDatasetPack(firstRoot)
	if err != nil {
		t.Fatalf("load first pack: %v", err)
	}
	runtime := newDatasetRuntime(first, nil, installedRoot)
	list := runtime.List()
	if list.ActiveID != "first-pack" || len(list.Datasets) != 2 {
		t.Fatalf("unexpected installed datasets: %+v", list)
	}
	snapshot := runtime.Current()
	second, err := runtime.Switch("second-pack")
	if err != nil {
		t.Fatalf("switch dataset: %v", err)
	}
	if runtime.Current() != second || runtime.Current().Manifest.ID != "second-pack" {
		t.Fatalf("runtime did not expose switched pack")
	}
	if snapshot.Manifest.ID != "first-pack" || snapshot.Root == secondRoot {
		t.Fatalf("in-flight snapshot mutated during switch: %+v", snapshot.Manifest)
	}
}

func TestDatasetRuntimeDoesNotSwapInvalidPack(t *testing.T) {
	installedRoot := t.TempDir()
	firstRoot := writeInstalledDatasetFixture(t, installedRoot, "first", "first-pack")
	badRoot := writeInstalledDatasetFixture(t, installedRoot, "bad", "bad-pack")
	if err := os.WriteFile(filepath.Join(badRoot, "towers.geojson"), []byte("corrupt"), 0o600); err != nil {
		t.Fatalf("corrupt fixture: %v", err)
	}
	first, err := raytracer.LoadDatasetPack(firstRoot)
	if err != nil {
		t.Fatalf("load first pack: %v", err)
	}
	runtime := newDatasetRuntime(first, nil, installedRoot)
	if _, err := runtime.Switch("bad-pack"); err == nil {
		t.Fatal("invalid pack switch succeeded")
	}
	if runtime.Current().Manifest.ID != "first-pack" {
		t.Fatal("failed switch changed active dataset")
	}
}

func TestDatasetRuntimeRejectsPathsOutsideInstallRoot(t *testing.T) {
	installedRoot := t.TempDir()
	outsideRoot := t.TempDir()
	writeInstalledDatasetFixture(t, outsideRoot, "outside", "outside-pack")
	if err := os.Symlink(filepath.Join(outsideRoot, "outside"), filepath.Join(installedRoot, "linked")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	runtime := newDatasetRuntime(nil, nil, installedRoot)
	if _, err := runtime.Switch("outside-pack"); err == nil {
		t.Fatal("switch accepted a pack outside the install root")
	}
}

func TestDatasetRuntimeRejectsDuplicateInstalledManifestIDs(t *testing.T) {
	installedRoot := t.TempDir()
	writeInstalledDatasetFixture(t, installedRoot, "first", "duplicate-pack")
	writeInstalledDatasetFixture(t, installedRoot, "second", "duplicate-pack")
	runtime := newDatasetRuntime(nil, nil, installedRoot)
	list := runtime.List()
	if len(list.Datasets) != 0 || len(list.Warnings) != 1 || !strings.Contains(list.Warnings[0], "duplicate") {
		t.Fatalf("duplicate catalog = %+v", list)
	}
	if _, err := runtime.Switch("duplicate-pack"); err == nil {
		t.Fatal("duplicate manifest ID was switchable")
	}
}

func TestDatasetRoutesListAndSwitchOnlyByInstalledID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	installedRoot := t.TempDir()
	firstRoot := writeInstalledDatasetFixture(t, installedRoot, "first", "first-pack")
	writeInstalledDatasetFixture(t, installedRoot, "second", "second-pack")
	first, err := raytracer.LoadDatasetPack(firstRoot)
	if err != nil {
		t.Fatalf("load first pack: %v", err)
	}
	runtime := newDatasetRuntime(first, nil, installedRoot)
	router := gin.New()
	registerDatasetRoutes(router, runtime, "")

	listRequest := httptest.NewRequest(http.MethodGet, "/api/datasets", nil)
	listResponse := httptest.NewRecorder()
	router.ServeHTTP(listResponse, listRequest)
	if listResponse.Code != http.StatusOK || !bytes.Contains(listResponse.Body.Bytes(), []byte(`"active_id":"first-pack"`)) {
		t.Fatalf("list response = %d %s", listResponse.Code, listResponse.Body.String())
	}
	switchRequest := httptest.NewRequest(http.MethodPost, "/api/datasets/switch", bytes.NewBufferString(`{"id":"second-pack"}`))
	switchRequest.Header.Set("Content-Type", "application/json")
	switchResponse := httptest.NewRecorder()
	router.ServeHTTP(switchResponse, switchRequest)
	if switchResponse.Code != http.StatusOK || runtime.Current().Manifest.ID != "second-pack" {
		t.Fatalf("switch response = %d %s", switchResponse.Code, switchResponse.Body.String())
	}
	pathRequest := httptest.NewRequest(http.MethodPost, "/api/datasets/switch", bytes.NewBufferString(`{"id":"../first"}`))
	pathRequest.Header.Set("Content-Type", "application/json")
	pathResponse := httptest.NewRecorder()
	router.ServeHTTP(pathResponse, pathRequest)
	if pathResponse.Code != http.StatusNotFound {
		t.Fatalf("path-like id response = %d %s", pathResponse.Code, pathResponse.Body.String())
	}
}

func TestDatasetSwitchCanRequireAdminAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerDatasetRoutes(router, newDatasetRuntime(nil, nil, ""), "secret")
	request := httptest.NewRequest(http.MethodPost, "/api/datasets/switch", bytes.NewBufferString(`{"id":"missing"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized || !strings.Contains(response.Header().Get("WWW-Authenticate"), "dataset administration") {
		t.Fatalf("response = %d headers=%v body=%s", response.Code, response.Header(), response.Body.String())
	}
}

func writeInstalledDatasetFixture(t *testing.T, installedRoot, directory, id string) string {
	t.Helper()
	root := filepath.Join(installedRoot, directory)
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatalf("create dataset fixture: %v", err)
	}
	source := filepath.Join("raytracer", "testdata", "sample-pack")
	for _, name := range []string{"towers.geojson", "buildings.geojson"} {
		contents, err := os.ReadFile(filepath.Join(source, name))
		if err != nil {
			t.Fatalf("read source fixture %s: %v", name, err)
		}
		if err := os.WriteFile(filepath.Join(root, name), contents, 0o600); err != nil {
			t.Fatalf("write fixture %s: %v", name, err)
		}
	}
	manifestBytes, err := os.ReadFile(filepath.Join(source, "manifest.json"))
	if err != nil {
		t.Fatalf("read source manifest: %v", err)
	}
	var manifest raytracer.DatasetManifest
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatalf("decode source manifest: %v", err)
	}
	manifest.ID = id
	manifest.Name = id
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("encode fixture manifest: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "manifest.json"), encoded, 0o600); err != nil {
		t.Fatalf("write fixture manifest: %v", err)
	}
	return root
}
