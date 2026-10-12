// Standalone calibration client. Runs inside the unchanged production image,
// reading proc/cgroup counters and issuing actual HTTP requests. No RF code.
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type fixture struct {
	Frequency    float64           `json:"frequencyGHz"`
	Network      json.RawMessage   `json:"network"`
	Interference json.RawMessage   `json:"interference"`
	Simulations  []json.RawMessage `json:"simulations"`
}
type response struct {
	Endpoint  string  `json:"endpoint"`
	Status    int     `json:"status"`
	Bytes     int     `json:"response_bytes"`
	Wall      float64 `json:"wall_seconds"`
	Hash      string  `json:"sha256"`
	Remaining string  `json:"rate_remaining"`
	Error     string  `json:"error,omitempty"`
	Body      []byte  `json:"-"`
}
type counters struct {
	CPU, Throttle, ProcessCPU                          float64
	Periods, ThrottledPeriods, Current, Peak, RSS, HWM uint64
	Events                                             map[string]uint64
}

func numericFile(file string) uint64 {
	b, _ := os.ReadFile(file)
	n, _ := strconv.ParseUint(strings.TrimSpace(string(b)), 10, 64)
	return n
}
func fieldsFile(file string) map[string]uint64 {
	b, _ := os.ReadFile(file)
	v := map[string]uint64{}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) > 1 {
			n, _ := strconv.ParseUint(f[1], 10, 64)
			v[strings.TrimSuffix(f[0], ":")] = n
		}
	}
	return v
}
func stats() counters {
	cpu := fieldsFile("/sys/fs/cgroup/cpu.stat")
	proc := fieldsFile("/proc/1/status")
	b, _ := os.ReadFile("/proc/1/stat")
	text := string(b)
	process := 0.
	if i := strings.LastIndex(text, ")"); i >= 0 {
		f := strings.Fields(text[i+1:])
		if len(f) > 12 {
			u, _ := strconv.ParseUint(f[11], 10, 64)
			s, _ := strconv.ParseUint(f[12], 10, 64)
			process = float64(u+s) / 100
		}
	}
	return counters{float64(cpu["usage_usec"]) / 1e6, float64(cpu["throttled_usec"]) / 1e6, process, cpu["nr_periods"], cpu["nr_throttled"], numericFile("/sys/fs/cgroup/memory.current"), numericFile("/sys/fs/cgroup/memory.peak"), proc["VmRSS"] * 1024, proc["VmHWM"] * 1024, fieldsFile("/sys/fs/cgroup/memory.events")}
}

var clients = map[int]*http.Client{}

func request(ctx context.Context, client int, endpoint string, body []byte) response {
	method := "POST"
	if body == nil {
		method = "GET"
	}
	req, _ := http.NewRequestWithContext(ctx, method, "http://127.0.0.1:8080"+endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	start := time.Now()
	v, e := clients[client].Do(req)
	r := response{Endpoint: endpoint}
	if e != nil {
		r.Error = e.Error()
		r.Wall = time.Since(start).Seconds()
		return r
	}
	defer v.Body.Close()
	r.Status = v.StatusCode
	r.Remaining = v.Header.Get("RateLimit-Remaining")
	r.Body, e = io.ReadAll(v.Body)
	r.Wall = time.Since(start).Seconds()
	r.Bytes = len(r.Body)
	hash := sha256.Sum256(r.Body)
	r.Hash = hex.EncodeToString(hash[:])
	if e != nil {
		r.Error = e.Error()
	}
	return r
}
func measure(label string, fn func() ([]response, map[string]any)) map[string]any {
	before := stats()
	maxRSS, maxCurrent := before.RSS, before.Current
	samples := 0
	done, joined := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(joined)
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				v := stats()
				maxRSS = max(maxRSS, v.RSS)
				maxCurrent = max(maxCurrent, v.Current)
				samples++
			}
		}
	}()
	start := time.Now()
	rs, extra := fn()
	wall := time.Since(start).Seconds()
	close(done)
	<-joined
	after := stats()
	maxRSS = max(maxRSS, after.RSS)
	maxCurrent = max(maxCurrent, after.Current)
	statuses := []int{}
	totalBytes := 0
	minHeadroom := 60.
	for i := range rs {
		statuses = append(statuses, rs[i].Status)
		totalBytes += rs[i].Bytes
		minHeadroom = min(minHeadroom, 60-rs[i].Wall)
		rs[i].Body = nil
	}
	events := map[string]uint64{}
	for k, v := range after.Events {
		events[k] = v - before.Events[k]
	}
	row := map[string]any{"workflow": label, "wall_seconds": wall, "cgroup_cpu_seconds": after.CPU - before.CPU, "process_cpu_seconds": after.ProcessCPU - before.ProcessCPU, "average_equivalent_cores": (after.CPU - before.CPU) / wall, "throttled_seconds": after.Throttle - before.Throttle, "periods": after.Periods - before.Periods, "throttled_periods": after.ThrottledPeriods - before.ThrottledPeriods, "rss_sampled_max_bytes": maxRSS, "process_lifetime_hwm_bytes": after.HWM, "cgroup_current_before_bytes": before.Current, "cgroup_current_after_bytes": after.Current, "cgroup_sampled_max_bytes": maxCurrent, "cgroup_lifetime_peak_bytes": after.Peak, "memory_events_delta": events, "response_bytes": totalBytes, "statuses": statuses, "responses": rs, "minimum_request_deadline_headroom_seconds": minHeadroom, "samples": samples, "extra": extra}
	fmt.Fprintln(os.Stderr, label, "wall", wall, "statuses", statuses)
	return row
}
func main() {
	if len(os.Args) != 2 {
		panic("fixture path required")
	}
	var f fixture
	b, e := os.ReadFile(os.Args[1])
	if e != nil {
		panic(e)
	}
	if e = json.Unmarshal(b, &f); e != nil {
		panic(e)
	}
	// Real distinct socket identities without trusting forwarded client headers.
	for i := 1; i <= 64; i++ {
		d := net.Dialer{LocalAddr: &net.TCPAddr{IP: net.ParseIP(fmt.Sprintf("127.0.0.%d", i+1))}}
		clients[i] = &http.Client{Timeout: 75 * time.Second, Transport: &http.Transport{DialContext: d.DialContext}}
	}
	client := 1
	if f.Frequency >= 28 {
		client = 33
	}
	ctx := context.Background()
	rows := []map[string]any{}
	maps := func(c int, sims []json.RawMessage) []response {
		rs := []response{}
		for _, s := range sims {
			rs = append(rs, request(ctx, c, "/api/simulate", s))
		}
		return rs
	}
	evaluate := func(c int) []response {
		return append([]response{request(ctx, c, "/api/evaluate-network", f.Network)}, maps(c, f.Simulations)...)
	}
	rows = append(rows, measure("evaluate_maps", func() ([]response, map[string]any) { return evaluate(client), nil }))
	client++
	rows = append(rows, measure("optimize_maps", func() ([]response, map[string]any) {
		r := request(ctx, client, "/api/optimize-network", f.Network)
		rs := []response{r}
		if r.Status == 200 {
			var v struct {
				Towers []struct {
					ID      string  `json:"id"`
					Azimuth float64 `json:"optimal_azimuth"`
				} `json:"optimized_towers"`
			}
			_ = json.Unmarshal(r.Body, &v)
			var n struct {
				Towers []struct {
					ID string `json:"id"`
				} `json:"towers"`
			}
			_ = json.Unmarshal(f.Network, &n)
			sims := []json.RawMessage{}
			for i, raw := range f.Simulations {
				var sim map[string]any
				_ = json.Unmarshal(raw, &sim)
				for _, tower := range v.Towers {
					if tower.ID == n.Towers[i].ID {
						sim["azimuth"] = tower.Azimuth
					}
				}
				encoded, _ := json.Marshal(sim)
				sims = append(sims, encoded)
			}
			rs = append(rs, maps(client, sims)...)
		}
		return rs, nil
	}))
	client++
	rows = append(rows, measure("interference", func() ([]response, map[string]any) {
		return []response{request(ctx, client, "/api/interference", f.Interference)}, nil
	}))
	client++
	rows = append(rows, measure("evaluate_interference_reevaluate", func() ([]response, map[string]any) {
		rs := evaluate(client)
		rs = append(rs, request(ctx, client, "/api/interference", f.Interference))
		return append(rs, evaluate(client)...), nil
	}))
	client++
	rows = append(rows, measure("two_distinct_optimizers", func() ([]response, map[string]any) {
		rs := make([]response, 2)
		var wg sync.WaitGroup
		wg.Add(2)
		for i := range 2 {
			go func(i int) { defer wg.Done(); rs[i] = request(ctx, client+i, "/api/optimize-network", f.Network) }(i)
		}
		wg.Wait()
		return rs, nil
	}))
	client += 2
	for _, endpoint := range []string{"evaluate-network", "optimize-network"} {
		ep := endpoint
		rows = append(rows, measure("async_plus_"+ep, func() ([]response, map[string]any) {
			body, _ := json.Marshal(map[string]any{"name": "auto-profile-" + ep, "base": json.RawMessage(f.Simulations[0]), "matrix": map[string]any{"azimuths_deg": []float64{0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5}}})
			start := request(ctx, client, "/api/processes/batch-experiment/execution", body)
			rs := []response{start}
			var job struct {
				ID string `json:"job_id"`
			}
			_ = json.Unmarshal(start.Body, &job)
			extra := map[string]any{"experiment_start_status": start.Status, "cache_hit": false}
			if job.ID == "" {
				extra["error"] = "job id missing"
				return rs, extra
			}
			status := ""
			runningSeen := false
			for until := time.Now().Add(10 * time.Second); time.Now().Before(until); {
				r := request(ctx, client, "/api/jobs/"+job.ID, nil)
				var j map[string]any
				_ = json.Unmarshal(r.Body, &j)
				status, _ = j["status"].(string)
				extra["cache_hit"] = j["cache_hit"]
				if status == "running" {
					runningSeen = true
					break
				}
				if status == "succeeded" || status == "failed" {
					break
				}
				time.Sleep(5 * time.Millisecond)
			}
			interactiveStart := time.Now()
			rs = append(rs, request(ctx, client+1, "/api/"+ep, f.Network))
			interactiveEnd := time.Now()
			for until := time.Now().Add(120 * time.Second); time.Now().Before(until); {
				r := request(ctx, client, "/api/jobs/"+job.ID, nil)
				var j map[string]any
				_ = json.Unmarshal(r.Body, &j)
				status, _ = j["status"].(string)
				extra["completed_runs"] = j["completed_runs"]
				if finished, ok := j["finished_at"].(string); ok {
					finish, _ := time.Parse(time.RFC3339Nano, finished)
					begin, _ := time.Parse(time.RFC3339Nano, j["started_at"].(string))
					extra["experiment_wall_seconds"] = finish.Sub(begin).Seconds()
					overlapStart := interactiveStart
					if begin.After(overlapStart) {
						overlapStart = begin
					}
					overlapEnd := interactiveEnd
					if finish.Before(overlapEnd) {
						overlapEnd = finish
					}
					extra["actual_overlap_seconds"] = max(0., overlapEnd.Sub(overlapStart).Seconds())
				}
				if status == "succeeded" || status == "failed" || status == "dismissed" {
					break
				}
				time.Sleep(20 * time.Millisecond)
			}
			extra["running_observed_before_interactive"] = runningSeen
			extra["experiment_final_status"] = status
			return rs, extra
		}))
		client += 2
	}
	rows = append(rows, measure("cancel_optimizer_release", func() ([]response, map[string]any) {
		cancelCtx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
		defer cancel()
		r := request(cancelCtx, client, "/api/optimize-network", f.Network)
		time.Sleep(250 * time.Millisecond)
		next := request(ctx, client, "/api/evaluate-network", f.Network)
		return []response{r, next}, map[string]any{"cancel_after_ms": 100, "release_verified": next.Status == 200}
	}))
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"rows": rows, "measurement_method": "in-container HTTP client; 100ms proc/cgroup sampler; process CPU /proc/1/stat USER_HZ=100; cgroup includes probe overhead; lifetime peaks cumulative; request wall includes transfer; workflow deadline not aggregate 60s"})
}
