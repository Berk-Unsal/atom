package main

import (
	"fmt"
	"os"

	"ankara-5g-raytracer/raytracer"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: validate-dataset <dataset-directory>")
		os.Exit(2)
	}
	pack, err := raytracer.LoadDatasetPack(os.Args[1])
	if err != nil {
		fmt.Fprintf(os.Stderr, "dataset invalid: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf(
		"dataset valid: %s %s (%d towers, %d buildings)\n",
		pack.Manifest.Name,
		pack.Manifest.Version,
		len(pack.Towers),
		pack.BuildingIndex.Len(),
	)
}
