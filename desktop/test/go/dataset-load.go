// Qualification helper: build from backend-go, outside the production executable.
// Usage: go build -o /tmp/atom-load ../desktop/test/go/dataset-load.go
//
//	/tmp/atom-load DATASET [CPU_PROFILE]
package main

import (
	"ankara-5g-raytracer/raytracer"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"runtime"
	"runtime/pprof"
	"time"
)

func main() {
	var profile *os.File
	if len(os.Args) > 2 {
		var err error
		profile, err = os.Create(os.Args[2])
		if err != nil {
			panic(err)
		}
		if err = pprof.StartCPUProfile(profile); err != nil {
			panic(err)
		}
	}
	var before, after, live runtime.MemStats
	runtime.ReadMemStats(&before)
	start := time.Now()
	pack, err := raytracer.LoadDatasetPack(os.Args[1])
	elapsed := time.Since(start)
	if err != nil {
		panic(err)
	}
	runtime.ReadMemStats(&after)
	if profile != nil {
		pprof.StopCPUProfile()
		profile.Close()
	}
	runtime.GC()
	runtime.ReadMemStats(&live)
	footprints := pack.BuildingIndex.Footprints()
	vertices := 0
	for _, building := range footprints {
		vertices += len(building.Vertices)
	}
	hash := sha256.New()
	snapshot := struct {
		Buildings []*raytracer.BuildingFootprint  `json:"buildings"`
		Towers    []raytracer.TowerStation        `json:"towers"`
		Demand    raytracer.BuildingDemandSummary `json:"demand"`
	}{footprints, pack.Towers, pack.BuildingIndex.DemandSummary("")}
	if err = json.NewEncoder(hash).Encode(snapshot); err != nil {
		panic(err)
	}
	json.NewEncoder(os.Stdout).Encode(map[string]any{"load_ms": float64(elapsed) / float64(time.Millisecond), "buildings": len(footprints), "vertices": vertices, "towers": len(pack.Towers), "snapshot_sha256": hex.EncodeToString(hash.Sum(nil)), "allocated_bytes": after.TotalAlloc - before.TotalAlloc, "allocations": after.Mallocs - before.Mallocs, "gc_cycles": after.NumGC - before.NumGC, "live_heap_bytes": live.HeapAlloc, "go": runtime.Version()})
	runtime.KeepAlive(pack)
}
