// Standalone metadata tool outside the shipping build graph. No RF computation.
package main

import (
	"ankara-5g-raytracer/raytracer"
	"encoding/json"
	"math"
	"os"
)

func main() {
	var input struct {
		Selected []struct {
			ID     string `json:"id"`
			Towers []struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"towers"`
		} `json:"selected"`
	}
	body, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	if err = json.Unmarshal(body, &input); err != nil {
		panic(err)
	}
	pack, err := raytracer.LoadDatasetPack(os.Args[2])
	if err != nil {
		panic(err)
	}
	rows := map[string]any{}
	for _, d := range input.Selected {
		pairs := map[string]any{}
		for _, n := range []int{6, 8} {
			bounds := raytracer.Bounds{MinLon: 180, MinLat: 90, MaxLon: -180, MaxLat: -90}
			for _, t := range d.Towers[:n] {
				b := raytracer.BoundsAroundPoint(raytracer.Point{Lon: t.Coordinates[0], Lat: t.Coordinates[1]}, 400)
				bounds.MinLon = math.Min(bounds.MinLon, b.MinLon)
				bounds.MinLat = math.Min(bounds.MinLat, b.MinLat)
				bounds.MaxLon = math.Max(bounds.MaxLon, b.MaxLon)
				bounds.MaxLat = math.Max(bounds.MaxLat, b.MaxLat)
			}
			found := pack.BuildingIndex.SearchBounds(bounds)
			vertices := 0
			for _, f := range found {
				vertices += len(f.Vertices)
			}
			key := "6C"
			if n == 8 {
				key = "8C"
			}
			pairs[key] = map[string]any{"bounds": bounds, "footprints": len(found), "vertices": vertices}
		}
		rows[d.ID] = pairs
	}
	out, err := json.MarshalIndent(rows, "", "  ")
	if err != nil {
		panic(err)
	}
	if err = os.WriteFile(os.Args[3], append(out, '\n'), 0644); err != nil {
		panic(err)
	}
}
