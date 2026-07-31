package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

const (
	maxExperimentRuns          = 64
	maxExperimentJobs          = 128
	maxExperimentCacheEntries  = 16
	defaultExperimentQueueSize = 16
)

var errExperimentQueueFull = errors.New("experiment queue is full; retry shortly")

type experimentMatrix struct {
	FrequenciesGHz       []float64 `json:"frequencies_ghz,omitempty"`
	TxPowersDBm          []float64 `json:"tx_powers_dbm,omitempty"`
	BeamWidthsDeg        []float64 `json:"beam_widths_deg,omitempty"`
	AzimuthsDeg          []float64 `json:"azimuths_deg,omitempty"`
	CalibrationOffsetsDB []float64 `json:"calibration_offsets_db,omitempty"`
}

type experimentDefinition struct {
	Name   string                                 `json:"name"`
	Base   raytracer.StaticSimulationRequestInput `json:"base"`
	Matrix experimentMatrix                       `json:"matrix"`
}

type experimentParameters struct {
	FrequencyGHz        float64 `json:"frequency_ghz"`
	TxPowerDBm          float64 `json:"tx_power_dbm"`
	BeamWidthDeg        float64 `json:"beam_width_deg"`
	AzimuthDeg          float64 `json:"azimuth_deg"`
	CalibrationOffsetDB float64 `json:"calibration_offset_db"`
}

type experimentRunResult struct {
	Index           int                  `json:"index"`
	Fingerprint     string               `json:"fingerprint"`
	Parameters      experimentParameters `json:"parameters"`
	AvgRxDBm        float64              `json:"avg_rx_dbm"`
	BlockedPct      float64              `json:"blocked_pct"`
	GapPct          float64              `json:"gap_pct"`
	GapBuildings    int                  `json:"gap_buildings"`
	ServedBuildings int                  `json:"served_buildings"`
	NonDominated    bool                 `json:"non_dominated"`
	Explanation     string               `json:"explanation"`
}

type experimentResult struct {
	Runs       []experimentRunResult `json:"runs"`
	Objectives []string              `json:"objectives"`
	Definition experimentDefinition  `json:"definition"`
}

type experimentDatasetRef struct {
	ID      string            `json:"id"`
	Version string            `json:"version"`
	SHA256  map[string]string `json:"sha256"`
}

type experimentJobSnapshot struct {
	JobID         string               `json:"job_id"`
	ProcessID     string               `json:"process_id"`
	Status        string               `json:"status"`
	Message       string               `json:"message,omitempty"`
	CreatedAt     time.Time            `json:"created_at"`
	StartedAt     *time.Time           `json:"started_at,omitempty"`
	FinishedAt    *time.Time           `json:"finished_at,omitempty"`
	Progress      float64              `json:"progress"`
	CompletedRuns int                  `json:"completed_runs"`
	TotalRuns     int                  `json:"total_runs"`
	Fingerprint   string               `json:"fingerprint"`
	CacheHit      bool                 `json:"cache_hit"`
	Dataset       experimentDatasetRef `json:"dataset"`
	Result        *experimentResult    `json:"result,omitempty"`
}

type experimentRun struct {
	Parameters experimentParameters
	Request    raytracer.StaticSimulationRequest
}

type experimentJob struct {
	snapshot   experimentJobSnapshot
	definition experimentDefinition
	runs       []experimentRun
	pack       *raytracer.DatasetPack
	ctx        context.Context
	cancel     context.CancelFunc
}

type experimentCacheEntry struct {
	result    experimentResult
	createdAt time.Time
}

type experimentManager struct {
	mu           sync.Mutex
	jobs         map[string]*experimentJob
	cache        map[string]experimentCacheEntry
	queue        chan string
	modelVersion string
}

func newExperimentManager(modelVersion string, workers, queueSize int) *experimentManager {
	if workers < 1 {
		workers = 1
	}
	if workers > 4 {
		workers = 4
	}
	if queueSize < 1 {
		queueSize = defaultExperimentQueueSize
	}
	manager := &experimentManager{jobs: make(map[string]*experimentJob), cache: make(map[string]experimentCacheEntry), queue: make(chan string, queueSize), modelVersion: modelVersion}
	for index := 0; index < workers; index++ {
		go manager.worker()
	}
	return manager
}

func (manager *experimentManager) Start(definition experimentDefinition, pack *raytracer.DatasetPack) (experimentJobSnapshot, error) {
	if pack == nil || pack.BuildingIndex == nil {
		return experimentJobSnapshot{}, errors.New("dataset unavailable")
	}
	runs, err := expandExperiment(definition)
	if err != nil {
		return experimentJobSnapshot{}, err
	}
	dataset := experimentDatasetRef{ID: pack.Manifest.ID, Version: pack.Manifest.Version, SHA256: pack.Manifest.SHA256}
	fingerprint, err := experimentFingerprint(definition, runs, dataset, manager.modelVersion)
	if err != nil {
		return experimentJobSnapshot{}, err
	}
	now := time.Now().UTC()
	jobID, err := randomExperimentID()
	if err != nil {
		return experimentJobSnapshot{}, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	job := &experimentJob{
		definition: definition, runs: runs, pack: pack, ctx: ctx, cancel: cancel,
		snapshot: experimentJobSnapshot{JobID: jobID, ProcessID: "batch-experiment", Status: "accepted", CreatedAt: now, TotalRuns: len(runs), Fingerprint: fingerprint, Dataset: dataset},
	}
	manager.mu.Lock()
	manager.pruneJobsLocked()
	if cached, exists := manager.cache[fingerprint]; exists {
		finished := now
		result := cached.result
		job.snapshot.Status, job.snapshot.Progress, job.snapshot.CompletedRuns = "succeeded", 1, len(runs)
		job.snapshot.StartedAt, job.snapshot.FinishedAt, job.snapshot.Result, job.snapshot.CacheHit = &now, &finished, &result, true
		manager.jobs[jobID] = job
		snapshot := job.snapshot
		manager.mu.Unlock()
		cancel()
		return snapshot, nil
	}
	select {
	case manager.queue <- jobID:
		manager.jobs[jobID] = job
		snapshot := job.snapshot
		manager.mu.Unlock()
		return snapshot, nil
	default:
		manager.mu.Unlock()
		cancel()
		return experimentJobSnapshot{}, errExperimentQueueFull
	}
}

func (manager *experimentManager) Snapshot(jobID string) (experimentJobSnapshot, bool) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	job, exists := manager.jobs[jobID]
	if !exists {
		return experimentJobSnapshot{}, false
	}
	return job.snapshot, true
}

func (manager *experimentManager) Cancel(jobID string) (experimentJobSnapshot, bool) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	job, exists := manager.jobs[jobID]
	if !exists {
		return experimentJobSnapshot{}, false
	}
	if job.snapshot.Status == "accepted" || job.snapshot.Status == "running" {
		job.cancel()
		now := time.Now().UTC()
		job.snapshot.Status, job.snapshot.Message, job.snapshot.FinishedAt = "dismissed", "cancelled by user", &now
	}
	return job.snapshot, true
}

func (manager *experimentManager) worker() {
	for jobID := range manager.queue {
		manager.run(jobID)
	}
}

func (manager *experimentManager) run(jobID string) {
	manager.mu.Lock()
	job := manager.jobs[jobID]
	if job == nil || job.snapshot.Status != "accepted" {
		manager.mu.Unlock()
		return
	}
	started := time.Now().UTC()
	job.snapshot.Status, job.snapshot.StartedAt = "running", &started
	manager.mu.Unlock()

	results := make([]experimentRunResult, 0, len(job.runs))
	for index, run := range job.runs {
		if err := job.ctx.Err(); err != nil {
			manager.finishCancelled(jobID)
			return
		}
		response, err := raytracer.AnalyzeSectorContext(job.ctx, run.Request, job.pack.BuildingIndex)
		if err != nil {
			if errors.Is(err, context.Canceled) {
				manager.finishCancelled(jobID)
				return
			}
			manager.finishFailed(jobID, "experiment run failed")
			return
		}
		resultFingerprint, _ := json.Marshal(run.Parameters)
		results = append(results, experimentRunResult{
			Index: index, Fingerprint: shortSHA256(resultFingerprint), Parameters: run.Parameters,
			AvgRxDBm: response.Simulation.Stats.AvgRxDBm, BlockedPct: response.Simulation.Stats.BlockedPct,
			GapPct: response.CoverageGaps.Stats.GapPct, GapBuildings: response.CoverageGaps.Stats.GapBuildings,
			ServedBuildings: response.CoverageGaps.Stats.ServedBuildings,
		})
		manager.mu.Lock()
		if current := manager.jobs[jobID]; current != nil && current.snapshot.Status == "running" {
			current.snapshot.CompletedRuns = index + 1
			current.snapshot.Progress = float64(index+1) / float64(len(job.runs))
		}
		manager.mu.Unlock()
	}
	markExperimentPareto(results)
	result := experimentResult{Runs: results, Objectives: []string{"maximize avg_rx_dbm", "minimize gap_pct", "minimize blocked_pct"}, Definition: job.definition}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	current := manager.jobs[jobID]
	if current == nil || current.snapshot.Status == "dismissed" {
		return
	}
	finished := time.Now().UTC()
	current.snapshot.Status, current.snapshot.Progress, current.snapshot.CompletedRuns = "succeeded", 1, len(job.runs)
	current.snapshot.FinishedAt, current.snapshot.Result = &finished, &result
	manager.cache[current.snapshot.Fingerprint] = experimentCacheEntry{result: result, createdAt: finished}
	manager.pruneCacheLocked()
}

func (manager *experimentManager) finishCancelled(jobID string) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	job := manager.jobs[jobID]
	if job == nil || job.snapshot.Status == "dismissed" {
		return
	}
	now := time.Now().UTC()
	job.snapshot.Status, job.snapshot.Message, job.snapshot.FinishedAt = "dismissed", "cancelled", &now
}

func (manager *experimentManager) finishFailed(jobID, message string) {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	job := manager.jobs[jobID]
	if job == nil {
		return
	}
	now := time.Now().UTC()
	job.snapshot.Status, job.snapshot.Message, job.snapshot.FinishedAt = "failed", message, &now
}

func (manager *experimentManager) pruneJobsLocked() {
	if len(manager.jobs) < maxExperimentJobs {
		return
	}
	type candidate struct {
		id      string
		created time.Time
	}
	candidates := []candidate{}
	for id, job := range manager.jobs {
		if job.snapshot.Status != "accepted" && job.snapshot.Status != "running" {
			candidates = append(candidates, candidate{id: id, created: job.snapshot.CreatedAt})
		}
	}
	sort.Slice(candidates, func(i, j int) bool { return candidates[i].created.Before(candidates[j].created) })
	for len(manager.jobs) >= maxExperimentJobs && len(candidates) > 0 {
		delete(manager.jobs, candidates[0].id)
		candidates = candidates[1:]
	}
}

func (manager *experimentManager) pruneCacheLocked() {
	for len(manager.cache) > maxExperimentCacheEntries {
		oldestKey := ""
		var oldest time.Time
		for key, entry := range manager.cache {
			if oldestKey == "" || entry.createdAt.Before(oldest) {
				oldestKey, oldest = key, entry.createdAt
			}
		}
		delete(manager.cache, oldestKey)
	}
}

func expandExperiment(definition experimentDefinition) ([]experimentRun, error) {
	if strings.TrimSpace(definition.Name) == "" || len(definition.Name) > 128 {
		return nil, errors.New("experiment name is required and must be at most 128 bytes")
	}
	if definition.Base.TowerLon == nil || definition.Base.TowerLat == nil {
		return nil, errors.New("base tower_lon and tower_lat are required")
	}
	base := definition.Base.ToRequest()
	frequencies := experimentDimension(definition.Matrix.FrequenciesGHz, base.FrequencyGHz)
	powers := experimentDimension(definition.Matrix.TxPowersDBm, base.TxPowerDBm)
	beamWidths := experimentDimension(definition.Matrix.BeamWidthsDeg, base.BeamWidthDeg)
	azimuths := experimentDimension(definition.Matrix.AzimuthsDeg, base.AzimuthDeg)
	calibrations := experimentDimension(definition.Matrix.CalibrationOffsetsDB, base.CalibrationOffsetDB)
	total := len(frequencies) * len(powers) * len(beamWidths) * len(azimuths) * len(calibrations)
	if total < 1 || total > maxExperimentRuns {
		return nil, fmt.Errorf("experiment matrix must expand to between 1 and %d runs", maxExperimentRuns)
	}
	runs := make([]experimentRun, 0, total)
	for _, frequency := range frequencies {
		for _, power := range powers {
			for _, beamWidth := range beamWidths {
				for _, azimuth := range azimuths {
					for _, calibration := range calibrations {
						request := base
						request.FrequencyGHz, request.TxPowerDBm, request.BeamWidthDeg = frequency, power, beamWidth
						request.AzimuthDeg, request.CalibrationOffsetDB = azimuth, calibration
						request.RFProfile.FrequencyGHz, request.RFProfile.NetworkTech = frequency, raytracer.NetworkTechnologyForFrequency(frequency)
						request.RFProfile.TxPowerDBm, request.RFProfile.BeamWidthDeg = power, beamWidth
						if validationError := validateSimulationRequest(request); validationError != "" {
							return nil, fmt.Errorf("invalid experiment run: %s", validationError)
						}
						parameters := experimentParameters{FrequencyGHz: frequency, TxPowerDBm: power, BeamWidthDeg: beamWidth, AzimuthDeg: azimuth, CalibrationOffsetDB: calibration}
						runs = append(runs, experimentRun{Parameters: parameters, Request: request})
					}
				}
			}
		}
	}
	return runs, nil
}

func experimentDimension(values []float64, fallback float64) []float64 {
	if len(values) == 0 {
		return []float64{fallback}
	}
	return values
}

func experimentFingerprint(definition experimentDefinition, runs []experimentRun, dataset experimentDatasetRef, model string) (string, error) {
	parameters := make([]experimentParameters, len(runs))
	for index, run := range runs {
		parameters[index] = run.Parameters
	}
	canonical, err := json.Marshal(struct {
		Definition experimentDefinition   `json:"definition"`
		Parameters []experimentParameters `json:"parameters"`
		Dataset    experimentDatasetRef   `json:"dataset"`
		Model      string                 `json:"model"`
	}{definition, parameters, dataset, model})
	if err != nil {
		return "", err
	}
	hash := sha256.Sum256(canonical)
	return hex.EncodeToString(hash[:]), nil
}

func markExperimentPareto(results []experimentRunResult) {
	for index := range results {
		nonDominated := true
		for competitor := range results {
			if competitor == index {
				continue
			}
			betterOrEqual := results[competitor].AvgRxDBm >= results[index].AvgRxDBm && results[competitor].GapPct <= results[index].GapPct && results[competitor].BlockedPct <= results[index].BlockedPct
			strictlyBetter := results[competitor].AvgRxDBm > results[index].AvgRxDBm || results[competitor].GapPct < results[index].GapPct || results[competitor].BlockedPct < results[index].BlockedPct
			if betterOrEqual && strictlyBetter {
				nonDominated = false
				break
			}
		}
		results[index].NonDominated = nonDominated
		if nonDominated {
			results[index].Explanation = "No other run is at least as strong on received power and no worse on both gap and blockage percentages."
		} else {
			results[index].Explanation = "At least one run improves an objective without worsening the other selected objectives."
		}
	}
}

func randomExperimentID() (string, error) {
	bytes := make([]byte, 12)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return "job-" + hex.EncodeToString(bytes), nil
}

func shortSHA256(value []byte) string {
	hash := sha256.Sum256(value)
	return hex.EncodeToString(hash[:8])
}

func registerExperimentRoutes(router *gin.Engine, manager *experimentManager, runtime *datasetRuntime) {
	router.GET("/api/processes/batch-experiment", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"id": "batch-experiment", "version": "1.0.0", "job_control_options": []string{"async-execute", "dismiss"},
			"dimensions": []string{"frequency_ghz", "tx_power_dbm", "beam_width_deg", "azimuth_deg", "calibration_offset_db"},
			"max_runs":   maxExperimentRuns,
		})
	})
	router.POST("/api/processes/batch-experiment/execution", func(c *gin.Context) {
		var definition experimentDefinition
		if !bindJSON(c, &definition, "batch experiment") {
			return
		}
		snapshot, err := manager.Start(definition, runtime.Current())
		if err != nil {
			status := 400
			if errors.Is(err, errExperimentQueueFull) {
				status = 429
				c.Header("Retry-After", "2")
			} else if err.Error() == "dataset unavailable" {
				status = 503
			}
			c.JSON(status, gin.H{"error": err.Error()})
			return
		}
		status := 202
		if snapshot.CacheHit {
			status = 200
		}
		c.Header("Location", "/api/jobs/"+snapshot.JobID)
		c.JSON(status, snapshot)
	})
	router.GET("/api/jobs/:jobID", func(c *gin.Context) {
		snapshot, exists := manager.Snapshot(c.Param("jobID"))
		if !exists {
			c.JSON(404, gin.H{"error": "experiment job not found"})
			return
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(200, snapshot)
	})
	router.DELETE("/api/jobs/:jobID", func(c *gin.Context) {
		snapshot, exists := manager.Cancel(c.Param("jobID"))
		if !exists {
			c.JSON(404, gin.H{"error": "experiment job not found"})
			return
		}
		c.JSON(200, snapshot)
	})
}
