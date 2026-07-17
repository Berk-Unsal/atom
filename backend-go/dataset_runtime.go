package main

import (
	"errors"
	"os"
	"path/filepath"

	"ankara-5g-raytracer/raytracer"
)

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

func firstExistingDirectory(candidates []string) string {
	for _, candidate := range candidates {
		info, err := os.Stat(filepath.Join(candidate, "manifest.json"))
		if err == nil && !info.IsDir() {
			return candidate
		}
	}
	return ""
}
