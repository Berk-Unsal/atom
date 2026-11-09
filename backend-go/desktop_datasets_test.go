//go:build unix

package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"ankara-5g-raytracer/raytracer"
)

func writeDesktopRegistry(t *testing.T, roots ...string) string {
	t.Helper()
	registry := desktopDatasetRegistry{Schema: 1}
	for _, root := range roots {
		root, err := filepath.EvalSymlinks(root)
		if err != nil {
			t.Fatal(err)
		}
		manifest, _, _, err := raytracer.ReadDatasetManifest(root)
		if err != nil {
			t.Fatal(err)
		}
		hash, err := datasetManifestDigest(root)
		if err != nil {
			t.Fatal(err)
		}
		registry.Entries = append(registry.Entries, desktopDatasetEntry{ID: manifest.ID, Root: root, ManifestSHA256: hash})
	}
	bytes, _ := json.Marshal(registry)
	file := filepath.Join(t.TempDir(), "datasets.json")
	if err := os.WriteFile(file, bytes, 0o600); err != nil {
		t.Fatal(err)
	}
	return file
}

func TestDesktopDatasetRejectsSameContentRootSymlinkReplacement(t *testing.T) {
	root := writeInstalledDatasetFixture(t, t.TempDir(), "pack", "pack")
	registry := writeDesktopRegistry(t, root)
	pack, err := loadDesktopRuntimeDataset(registry, root)
	if err != nil {
		t.Fatal(err)
	}
	runtime := newDatasetRuntime(pack, nil, "")
	runtime.desktopRegistry = registry
	if err := os.Rename(root, root+"-moved"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(root+"-moved", root); err != nil {
		t.Fatal(err)
	}
	if _, err := loadDesktopRuntimeDataset(registry, root); err == nil {
		t.Fatal("startup followed a replaced approved root")
	}
	if _, err := runtime.Switch("pack"); err == nil {
		t.Fatal("activation followed a replaced approved root")
	}
	if runtime.Current() != pack {
		t.Fatal("rejected root changed active snapshot")
	}
}

func TestDesktopDatasetApprovedReferencesAndAtomicFailure(t *testing.T) {
	firstRoot := writeInstalledDatasetFixture(t, t.TempDir(), "first", "first-pack")
	secondRoot := writeInstalledDatasetFixture(t, t.TempDir(), "second", "second-pack")
	registry := writeDesktopRegistry(t, firstRoot, secondRoot)
	first, err := loadDesktopRuntimeDataset(registry, firstRoot)
	if err != nil {
		t.Fatal(err)
	}
	runtime := newDatasetRuntime(first, nil, "")
	runtime.desktopRegistry = registry
	if len(runtime.List().Datasets) != 2 {
		t.Fatal("approved external references missing")
	}
	if _, err := runtime.Switch("second-pack"); err != nil {
		t.Fatal(err)
	}
	if first.Manifest.ID != "first-pack" {
		t.Fatal("old in-flight snapshot mutated")
	}
	active := runtime.Current()
	if err := os.WriteFile(filepath.Join(secondRoot, "towers.geojson"), []byte("changed"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Switch("second-pack"); err == nil {
		t.Fatal("same-ID activation skipped reference revalidation")
	}
	if runtime.Current() != active {
		t.Fatal("failed validation replaced active snapshot")
	}
	if _, err := loadDesktopRuntimeDataset(registry, secondRoot); err == nil {
		t.Fatal("startup accepted changed reference")
	}
	if err := os.Rename(firstRoot, firstRoot+"-moved"); err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Switch("first-pack"); err == nil {
		t.Fatal("moved reference accepted")
	}
	if _, err := loadDesktopRuntimeDataset(registry, firstRoot); err == nil {
		t.Fatal("missing startup selection silently fell back")
	}
}

func TestDesktopDatasetRejectsChangedIdentityAndAmbiguousRegistry(t *testing.T) {
	root := writeInstalledDatasetFixture(t, t.TempDir(), "pack", "same-id")
	registry := writeDesktopRegistry(t, root)
	manifestFile := filepath.Join(root, "manifest.json")
	bytes, _ := os.ReadFile(manifestFile)
	var manifest raytracer.DatasetManifest
	json.Unmarshal(bytes, &manifest)
	manifest.Version = "new-version"
	changed, _ := json.Marshal(manifest)
	os.WriteFile(manifestFile, changed, 0o600)
	if _, err := loadDesktopRuntimeDataset(registry, root); err == nil {
		t.Fatal("self-consistent changed manifest bypassed approval digest")
	}
	os.WriteFile(manifestFile, bytes, 0o600)
	duplicate := writeInstalledDatasetFixture(t, t.TempDir(), "duplicate", "same-id")
	ambiguous := writeDesktopRegistry(t, root, duplicate)
	if candidates, _ := desktopDatasetCandidates(ambiguous); len(candidates) != 0 {
		t.Fatal("ambiguous ID selected one root")
	}
	// Even a missing first duplicate must not allow the second entry to win.
	os.RemoveAll(root)
	if candidates, _ := desktopDatasetCandidates(ambiguous); len(candidates) != 0 {
		t.Fatal("missing duplicate changed ambiguity semantics")
	}
}

func TestDesktopDatasetRegistryPrivateBoundedRegularFile(t *testing.T) {
	root := writeInstalledDatasetFixture(t, t.TempDir(), "pack", "pack")
	registry := writeDesktopRegistry(t, root)
	for _, mode := range []os.FileMode{0o644, 0o660} {
		os.Chmod(registry, mode)
		if _, err := readDesktopRegistryFile(registry); err == nil {
			t.Fatalf("shared mode %o accepted", mode)
		}
	}
	os.Chmod(registry, 0o600)
	link := filepath.Join(t.TempDir(), "registry-link")
	os.Symlink(registry, link)
	if _, err := readDesktopRegistryFile(link); err == nil {
		t.Fatal("registry symlink accepted")
	}
	hardlink := filepath.Join(t.TempDir(), "registry-hardlink")
	os.Link(registry, hardlink)
	if _, err := readDesktopRegistryFile(registry); err == nil {
		t.Fatal("multiply linked registry accepted")
	}
	os.Remove(hardlink)
	if err := os.WriteFile(registry, make([]byte, 256*1024+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readDesktopRegistryFile(registry); err == nil {
		t.Fatal("oversize registry accepted")
	}
}

func TestDesktopDatasetCanceledValidationDoesNotCommit(t *testing.T) {
	root := t.TempDir()
	firstRoot := writeInstalledDatasetFixture(t, root, "first", "first-pack")
	secondRoot := writeInstalledDatasetFixture(t, root, "second", "second-pack")
	first, _ := raytracer.LoadDatasetPack(firstRoot)
	runtime := newDatasetRuntime(first, nil, root)
	ctx, cancel := context.WithCancel(context.Background())
	runtime.loadPack = func(root string) (*raytracer.DatasetPack, error) {
		pack, err := raytracer.LoadDatasetPack(root)
		cancel()
		return pack, err
	}
	if _, err := runtime.SwitchContext(ctx, "second-pack"); err != context.Canceled {
		t.Fatalf("got %v", err)
	}
	if runtime.Current() != first {
		t.Fatal("canceled load committed a replacement")
	}
	if _, err := raytracer.LoadDatasetPack(secondRoot); err != nil {
		t.Fatal("test must use valid canonical data")
	}
}
