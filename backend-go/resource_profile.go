package main

import (
	"context"
	"log/slog"
	"time"

	"ankara-5g-raytracer/internal/resourceprofile"
	"ankara-5g-raytracer/raytracer"
)

func collectAutoResourceProfile(pack *raytracer.DatasetPack, limiter *rfRequestLimiter, deadline time.Duration, experiments *experimentManager) resourceprofile.Profile {
	dataset := resourceprofile.Dataset{State: "unknown", Source: "loaded dataset manifest + immutable building index metadata"}
	if pack != nil && pack.BuildingIndex != nil {
		dataset.State = "known"
		dataset.ID = pack.Manifest.ID
		dataset.Version = pack.Manifest.Version
		dataset.SHA256 = pack.Manifest.SHA256
		footprints, vertices, cells := pack.BuildingIndex.Len(), pack.BuildingIndex.VertexCount(), len(pack.Towers)
		dataset.Footprints = &footprints
		dataset.Vertices = &vertices
		dataset.Cells = &cells
	}
	return resourceprofile.Collect(resourceprofile.SystemProvider(), resourceprofile.RFPolicy{
		GlobalConcurrency: cap(limiter.slots), PerClientConcurrency: limiter.perClientConcurrency, AttemptLimit: limiter.requestsPerMinute, WindowSeconds: 60, DeadlineSeconds: deadline.Seconds(), MaxCells: raytracer.MaxNetworkTowers, Source: "configured RF limiter + request deadline + generated Cell cap; ClientIP anchored window"}, resourceprofile.Experiments{Workers: experiments.workers, QueueCapacity: cap(experiments.queue), MaxRuns: maxExperimentRuns, Source: "normalized experiment manager configuration"}, dataset)
}
func logAutoResourceProfile(profile resourceprofile.Profile) {
	s := profile.View()
	level := slog.LevelInfo
	if len(s.Warnings) > 0 {
		level = slog.LevelWarn
	}
	slog.Log(context.Background(), level, "Auto resource profile", "resource_mode", s.Mode, "environment", s.Environment, "cpu_visible", resourceSignalSummary(s.CPU.VisibleLogical), "gomaxprocs", resourceSignalSummary(s.CPU.GOMAXPROCS), "cpu_quota", resourceSignalSummary(s.CPU.Quota), "cpu_observed", resourceSignalSummary(s.CPU.Effective), "memory_observed", resourceSignalSummary(s.Memory.Effective), "rf_global_slots", s.RF.GlobalConcurrency, "experiment_workers", s.Experiments.Workers, "dataset_footprints", resourceCountSummary(s.Dataset.Footprints), "diagnostic_fingerprint", s.Fingerprint, "warnings", s.Warnings)
}

func resourceSignalSummary[T any](signal resourceprofile.Signal[T]) any {
	if signal.Value != nil {
		return *signal.Value
	}
	return signal.State
}

func resourceCountSummary(count *int) any {
	if count == nil {
		return "unknown"
	}
	return *count
}
