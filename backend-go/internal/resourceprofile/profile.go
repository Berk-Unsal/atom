// Package resourceprofile observes runtime resources. It has no admission or
// scheduler setters and is deliberately independent of RF scientific code.
package resourceprofile

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"runtime"
	"runtime/metrics"
	"strings"
)

type Signal[T any] struct {
	State          string   `json:"state"` // known, unlimited, absent, unknown
	Value          *T       `json:"value"`
	Sources        []string `json:"sources"`
	UnknownSources []string `json:"unknown_sources,omitempty"`
}

func known[T any](value T, source string) Signal[T] {
	return Signal[T]{State: "known", Value: &value, Sources: []string{source}}
}
func state[T any](s, source string) Signal[T] {
	result := Signal[T]{State: s, Sources: []string{source}}
	if s == "unknown" {
		result.UnknownSources = []string{source}
	}
	return result
}

type CPU struct {
	VisibleLogical Signal[int]     `json:"visible_logical_cpus"`
	GOMAXPROCS     Signal[int]     `json:"gomaxprocs"`
	Quota          Signal[float64] `json:"cgroup_quota_cores"`
	QuotaMicros    Signal[uint64]  `json:"leaf_quota_micros"`
	PeriodMicros   Signal[uint64]  `json:"leaf_period_micros"`
	CPUSet         Signal[int]     `json:"cpuset_cpus"`
	Effective      Signal[float64] `json:"effective_observed_capacity_cores"`
}
type Memory struct {
	HostTotal     Signal[uint64] `json:"host_total_bytes"`
	HostAvailable Signal[uint64] `json:"host_available_bytes"`
	Limit         Signal[uint64] `json:"cgroup_limit_bytes"`
	High          Signal[uint64] `json:"cgroup_high_bytes"`
	Current       Signal[uint64] `json:"cgroup_current_bytes"`
	Effective     Signal[uint64] `json:"effective_observed_limit_bytes"`
}
type Runtime struct {
	GoVersion     string         `json:"go_version"`
	OS            string         `json:"os"`
	Arch          string         `json:"arch"`
	GoMemoryLimit Signal[uint64] `json:"go_memory_limit_bytes"`
	GCPercent     Signal[uint64] `json:"gc_percent"`
}
type RFPolicy struct {
	GlobalConcurrency    int     `json:"global_concurrency"`
	PerClientConcurrency int     `json:"per_client_concurrency"`
	AttemptLimit         int     `json:"request_attempt_limit"`
	WindowSeconds        int     `json:"request_window_seconds"`
	DeadlineSeconds      float64 `json:"request_deadline_seconds"`
	MaxCells             int     `json:"max_cells"`
	Source               string  `json:"source"`
}
type Experiments struct {
	Workers       int    `json:"configured_workers"`
	QueueCapacity int    `json:"queue_capacity"`
	MaxRuns       int    `json:"max_runs_per_job"`
	Source        string `json:"source"`
}
type Dataset struct {
	State      string            `json:"state"`
	ID         string            `json:"id,omitempty"`
	Version    string            `json:"version,omitempty"`
	SHA256     map[string]string `json:"sha256,omitempty"`
	Footprints *int              `json:"indexed_footprint_count"`
	Cells      *int              `json:"inventory_cell_count"`
	Vertices   *int              `json:"total_polygon_vertices"`
	Source     string            `json:"source"`
}
type Snapshot struct {
	SchemaVersion        int         `json:"schema_version"`
	Mode                 string      `json:"mode"`
	Environment          string      `json:"environment"`
	EnvironmentSource    string      `json:"environment_source"`
	CgroupVersion        string      `json:"cgroup_version"`
	ConstraintVisibility string      `json:"constraint_visibility"`
	CPU                  CPU         `json:"cpu"`
	Memory               Memory      `json:"memory"`
	Runtime              Runtime     `json:"runtime"`
	RF                   RFPolicy    `json:"rf_policy"`
	Experiments          Experiments `json:"experiments"`
	Dataset              Dataset     `json:"dataset"`
	Fingerprint          string      `json:"diagnostic_fingerprint"`
	Warnings             []string    `json:"warnings"`
}

// Profile holds an immutable serialized snapshot. View returns a deep copy;
// callers cannot mutate the retained profile or the dataset hash map.
type Profile struct{ raw string }

func (p Profile) MarshalJSON() ([]byte, error) { return []byte(p.raw), nil }
func (p Profile) View() Snapshot               { var s Snapshot; _ = json.Unmarshal([]byte(p.raw), &s); return s }

type Provider struct {
	ReadFile            func(string) ([]byte, error)
	NumCPU              func() int
	GOMAXPROCS          func() int
	OS, Arch, GoVersion string
	HostMemory          func() (Signal[uint64], Signal[uint64])
	RuntimeLimits       func() (Signal[uint64], Signal[uint64])
}

func SystemProvider() Provider {
	return Provider{os.ReadFile, runtime.NumCPU, func() int { return runtime.GOMAXPROCS(0) }, runtime.GOOS, runtime.GOARCH, runtime.Version(), hostMemory, runtimeLimits}
}
func runtimeLimits() (Signal[uint64], Signal[uint64]) {
	samples := []metrics.Sample{{Name: "/gc/gomemlimit:bytes"}, {Name: "/gc/gogc:percent"}}
	metrics.Read(samples)
	memory, gc := state[uint64]("unknown", "runtime/metrics /gc/gomemlimit:bytes"), state[uint64]("unknown", "runtime/metrics /gc/gogc:percent")
	if samples[0].Value.Kind() == metrics.KindUint64 {
		v := samples[0].Value.Uint64()
		memory = known(v, memory.Sources[0])
		if v == uint64(1<<63-1) {
			memory = state[uint64]("unlimited", memory.Sources[0])
		}
	}
	if samples[1].Value.Kind() == metrics.KindUint64 {
		v := samples[1].Value.Uint64()
		gc = known(v, gc.Sources[0])
		if v == ^uint64(0) {
			gc = state[uint64]("unlimited", gc.Sources[0])
		}
	}
	return memory, gc
}
func Collect(p Provider, rf RFPolicy, experiments Experiments, dataset Dataset) Profile {
	s := Snapshot{SchemaVersion: 1, Mode: "auto", Environment: "unknown", EnvironmentSource: "no portable container evidence", CgroupVersion: "absent", ConstraintVisibility: "visible_hierarchy_only", RF: rf, Experiments: experiments, Dataset: dataset, Warnings: []string{}}
	s.Runtime = Runtime{GoVersion: p.GoVersion, OS: p.OS, Arch: p.Arch}
	s.CPU.VisibleLogical = known(p.NumCPU(), "runtime.NumCPU (process-visible, not physical host inventory)")
	s.CPU.GOMAXPROCS = known(p.GOMAXPROCS(), "runtime.GOMAXPROCS(0)")
	s.CPU.Quota = state[float64]("absent", "cgroup CPU controller")
	s.CPU.QuotaMicros = state[uint64]("absent", "cgroup CPU controller")
	s.CPU.PeriodMicros = state[uint64]("absent", "cgroup CPU controller")
	s.CPU.CPUSet = state[int]("absent", "cgroup cpuset controller")
	s.Memory.Limit = state[uint64]("absent", "cgroup memory controller")
	s.Memory.High = s.Memory.Limit
	s.Memory.Current = s.Memory.Limit
	s.Memory.HostTotal, s.Memory.HostAvailable = p.HostMemory()
	s.Runtime.GoMemoryLimit, s.Runtime.GCPercent = p.RuntimeLimits()
	if p.OS == "linux" {
		discoverCgroups(p, &s)
	} else if p.OS == "darwin" {
		s.Environment = "native"
		s.EnvironmentSource = "darwin runtime (not Linux container)"
	}
	if s.Memory.HostTotal.State == "unknown" {
		s.Warnings = append(s.Warnings, "host total memory unavailable")
	}
	s.CPU.Effective = known(float64(*s.CPU.VisibleLogical.Value), "min of known runtime-visible CPU, GOMAXPROCS, quota and cpuset upper bounds")
	for _, v := range []Signal[int]{s.CPU.VisibleLogical, s.CPU.GOMAXPROCS, s.CPU.CPUSet} {
		if v.Value != nil && float64(*v.Value) < *s.CPU.Effective.Value {
			*s.CPU.Effective.Value = float64(*v.Value)
		}
		s.CPU.Effective.Sources = append(s.CPU.Effective.Sources, v.Sources...)
		s.CPU.Effective.UnknownSources = append(s.CPU.Effective.UnknownSources, v.UnknownSources...)
	}
	if s.CPU.Quota.Value != nil && *s.CPU.Quota.Value < *s.CPU.Effective.Value {
		*s.CPU.Effective.Value = *s.CPU.Quota.Value
	}
	s.CPU.Effective.Sources = append(s.CPU.Effective.Sources, s.CPU.Quota.Sources...)
	s.CPU.Effective.UnknownSources = append(s.CPU.Effective.UnknownSources, s.CPU.Quota.UnknownSources...)
	s.Memory.Effective = minimum(s.Memory.HostTotal, s.Memory.Limit)
	s.Memory.Effective.Sources = append([]string{"min of known host/VM total and visible cgroup hard memory ceilings"}, s.Memory.Effective.Sources...)
	// Availability and usage are dynamic and excluded from diagnostic identity.
	identity := s
	identity.Memory.HostAvailable = Signal[uint64]{}
	identity.Memory.Current = Signal[uint64]{}
	identity.Warnings = nil
	raw, _ := json.Marshal(identity)
	sum := sha256.Sum256(raw)
	s.Fingerprint = hex.EncodeToString(sum[:])
	raw, _ = json.Marshal(s)
	return Profile{raw: string(raw)}
}
func minimum[T uint64 | float64 | int](a, b Signal[T]) Signal[T] {
	sources := append(append([]string{}, a.Sources...), b.Sources...)
	unknown := append(append([]string{}, a.UnknownSources...), b.UnknownSources...)
	if a.Value != nil && b.Value != nil {
		v := min(*a.Value, *b.Value)
		return Signal[T]{State: "known", Value: &v, Sources: sources, UnknownSources: unknown}
	}
	if a.Value != nil {
		v := *a.Value
		return Signal[T]{State: "known", Value: &v, Sources: sources, UnknownSources: unknown}
	}
	if b.Value != nil {
		v := *b.Value
		return Signal[T]{State: "known", Value: &v, Sources: sources, UnknownSources: unknown}
	}
	st := "absent"
	if a.State == "unknown" || b.State == "unknown" {
		st = "unknown"
	} else if a.State == "unlimited" || b.State == "unlimited" {
		st = "unlimited"
	}
	return Signal[T]{State: st, Sources: sources, UnknownSources: unknown}
}
func (s *Snapshot) warn(message string) {
	for _, v := range s.Warnings {
		if v == message {
			return
		}
	}
	if len(s.Warnings) < 12 {
		s.Warnings = append(s.Warnings, message)
	}
}
func unescapeMount(s string) string {
	return strings.NewReplacer(`\040`, " ", `\011`, "\t", `\012`, "\n", `\134`, `\`).Replace(s)
}
