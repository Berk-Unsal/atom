package main

// Only the inherited-pipe desktop mode consumes this host-owned registry.
// HTTP clients still select opaque IDs through the existing validated switch.
import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"

	"ankara-5g-raytracer/raytracer"
)

type desktopDatasetEntry struct {
	ID             string `json:"id"`
	Root           string `json:"root"`
	ManifestSHA256 string `json:"manifest_sha256"`
}
type desktopDatasetRegistry struct {
	Schema  int                   `json:"schema"`
	Entries []desktopDatasetEntry `json:"entries"`
}

func datasetManifestDigest(root string) (string, error) {
	file, err := os.Open(filepath.Join(root, "manifest.json"))
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > raytracer.MaxDatasetManifestBytes {
		return "", errors.New("dataset manifest is not a bounded regular file")
	}
	bytes, err := io.ReadAll(io.LimitReader(file, raytracer.MaxDatasetManifestBytes+1))
	if err != nil || int64(len(bytes)) > raytracer.MaxDatasetManifestBytes {
		return "", errors.New("dataset manifest read failed")
	}
	digest := sha256.Sum256(bytes)
	return hex.EncodeToString(digest[:]), nil
}

func desktopDatasetCandidates(file string) (map[string]datasetCandidate, []string) {
	result := map[string]datasetCandidate{}
	invalid := func() (map[string]datasetCandidate, []string) {
		return result, []string{"desktop dataset registry is unavailable or invalid; use Data to repair it"}
	}
	bytes, err := readDesktopRegistryFile(file)
	if err != nil {
		return invalid()
	}
	var registry desktopDatasetRegistry
	if json.Unmarshal(bytes, &registry) != nil || registry.Schema != 1 || len(registry.Entries) < 1 || len(registry.Entries) > 101 {
		return invalid()
	}
	warnings := []string{}
	duplicates := map[string]bool{}
	seen := map[string]bool{}
	for _, entry := range registry.Entries {
		if entry.ID == "" || len(entry.ID) > 128 || !filepath.IsAbs(entry.Root) || len(entry.ManifestSHA256) != 64 {
			return map[string]datasetCandidate{}, []string{"desktop dataset registry contains an invalid entry"}
		}
		if _, err := hex.DecodeString(entry.ManifestSHA256); err != nil {
			return map[string]datasetCandidate{}, []string{"desktop dataset registry contains an invalid digest"}
		}
		if duplicates[entry.ID] {
			continue
		}
		if seen[entry.ID] {
			delete(result, entry.ID)
			duplicates[entry.ID] = true
			warnings = append(warnings, "ambiguous desktop dataset ID was ignored")
			continue
		}
		seen[entry.ID] = true
		manifest, _, realRoot, err := raytracer.ReadDatasetManifest(entry.Root)
		hash, hashErr := datasetManifestDigest(entry.Root)
		if err != nil || hashErr != nil || manifest.ID != entry.ID || hash != entry.ManifestSHA256 {
			warnings = append(warnings, "a registered dataset is missing or changed; use Data to locate or add it explicitly")
			continue
		}
		result[entry.ID] = datasetCandidate{root: realRoot, manifest: manifest, manifestHash: hash}
	}
	return result, warnings
}

func validateDesktopCandidate(candidate datasetCandidate, pack *raytracer.DatasetPack) error {
	if candidate.manifestHash == "" {
		return nil
	}
	hash, err := datasetManifestDigest(candidate.root)
	if err != nil || hash != candidate.manifestHash || !reflect.DeepEqual(candidate.manifest, pack.Manifest) {
		return errors.New("registered dataset changed during validation")
	}
	return nil
}

func loadDesktopRuntimeDataset(registry, selectedRoot string) (*raytracer.DatasetPack, error) {
	candidates, _ := desktopDatasetCandidates(registry)
	realRoot, err := filepath.EvalSymlinks(selectedRoot)
	if err != nil {
		return nil, errors.New("selected desktop dataset is unavailable; use Data to locate it")
	}
	for _, candidate := range candidates {
		if candidate.root != realRoot {
			continue
		}
		pack, err := raytracer.LoadDatasetPack(candidate.root)
		if err != nil {
			return nil, err
		}
		if err = validateDesktopCandidate(candidate, pack); err != nil {
			return nil, err
		}
		return pack, nil
	}
	return nil, errors.New("selected desktop dataset is not approved or has changed; use Data to recover")
}

// A separate, bounded, host-invoked process performs complete canonical pack
// validation without a listener or transport credentials. Cancellation kills
// only this owned validation process. Existing validator CLI remains intact.
func runDatasetJSONValidation(args []string) bool {
	if len(args) == 0 || args[0] != "--validate-dataset-json" {
		return false
	}
	if len(args) != 2 && (len(args) != 3 || args[2] != "--parent-lifetime-stdin") {
		os.Exit(2)
	}
	if len(args) == 3 {
		// The native host keeps this pipe open and sends no payload. Host death
		// closes it even during CPU-bound parsing. Validation is read-only, so
		// immediate process exit safely abandons only this owned candidate.
		go func() { _, _ = io.Copy(io.Discard, os.Stdin); os.Exit(1) }()
	}
	pack, err := raytracer.LoadDatasetPack(args[1])
	if err != nil {
		os.Stderr.WriteString("dataset validation failed\n")
		os.Exit(1)
	}
	if err := json.NewEncoder(os.Stdout).Encode(pack.Manifest); err != nil {
		os.Exit(1)
	}
	return true
}
