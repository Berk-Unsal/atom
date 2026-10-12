package main

import (
	"context"
	"reflect"
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
)

func TestAutoResourceProfilePolicyInvariance(t *testing.T) {
	limiter := newRFRequestLimiterWithBudget(2, 1, 20)
	now := time.Now()
	limiter.now = func() time.Time { return now }
	manager := newExperimentManager(modelVersion, 1, 16)
	index := raytracer.NewBuildingIndex([]*raytracer.BuildingFootprint{{ID: "a", Bounds: raytracer.Bounds{MinLon: 0, MinLat: 0, MaxLon: 1, MaxLat: 1}, Vertices: []raytracer.Point{{Lon: 0, Lat: 0}, {Lon: 1, Lat: 0}, {Lon: 1, Lat: 1}}}, nil})
	pack := &raytracer.DatasetPack{BuildingIndex: index, Manifest: raytracer.DatasetManifest{ID: "test", Version: "1", SHA256: map[string]string{"test": "hash"}}}
	request := raytracer.StaticSimulationRequestInput{}
	before, be := raytracer.SimulateStaticRaysContext(context.Background(), request.ToRequest(), index)
	profile := collectAutoResourceProfile(pack, limiter, defaultRFRequestTimeout, manager).View()
	after, ae := raytracer.SimulateStaticRaysContext(context.Background(), request.ToRequest(), index)
	if !reflect.DeepEqual(before, after) || !reflect.DeepEqual(be, ae) {
		t.Fatal("RF output changed")
	}
	if profile.RF.GlobalConcurrency != 2 || profile.RF.PerClientConcurrency != 1 || profile.RF.AttemptLimit != 20 || profile.RF.WindowSeconds != 60 || profile.RF.DeadlineSeconds != 60 || profile.RF.MaxCells != 8 {
		t.Fatal(profile.RF)
	}
	if profile.Experiments.Workers != 1 || profile.Experiments.QueueCapacity != 16 || profile.Experiments.MaxRuns != 64 || manager.workers != 1 {
		t.Fatal(profile.Experiments)
	}
	if *profile.Dataset.Footprints != 1 || *profile.Dataset.Vertices != 3 {
		t.Fatal(profile.Dataset)
	}
	for i := 0; i < 21; i++ {
		release, _, _, _, why := limiter.acquire("test", "RF")
		release()
		if (why == "") != (i < 20) {
			t.Fatalf("attempt %d changed", i)
		}
	}
	now = now.Add(time.Minute)
	release, _, _, _, why := limiter.acquire("test", "RF")
	release()
	if why != "" {
		t.Fatal("window altered")
	}
}
func TestAutoResourceProfileReportsNormalizedConfiguration(t *testing.T) {
	limiter := newRFRequestLimiterWithBudget(0, 8, 0)
	manager := newExperimentManager(modelVersion, 9, 0)
	s := collectAutoResourceProfile(nil, limiter, 60*time.Second, manager).View()
	if s.RF.GlobalConcurrency != 1 || s.RF.PerClientConcurrency != 1 || s.RF.AttemptLimit != 1 || s.Experiments.Workers != 4 || s.Experiments.QueueCapacity != 16 || s.Dataset.State != "unknown" || s.Dataset.Footprints != nil || s.Dataset.Cells != nil || s.Dataset.Vertices != nil {
		t.Fatal(s)
	}
}
