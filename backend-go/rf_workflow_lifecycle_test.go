package main

import (
	"bytes"
	"container/heap"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"ankara-5g-raytracer/raytracer"
)

func TestBoundedAllProfileFieldsAreBound(t *testing.T) {
	input := networkRFChildren(wfNetwork(2), nil)[0]
	input.RFProfile = &raytracer.CellRFProfileInput{}
	// Visit every recognized profile field, including redundant gain aliases.
	raw, _ := json.Marshal(input.RFProfile)
	var profile map[string]any
	json.Unmarshal(raw, &profile)
	for key := range profile {
		t.Run(key, func(t *testing.T) {
			before, _ := rfChildDigest(input, "/api/simulate", 0)
			var changed map[string]any
			json.Unmarshal(raw, &changed)
			switch key {
			case "network_tech", "propagation_model", "band", "channel_id", "duplex_mode", "horizontal_pattern_id", "vertical_pattern_id", "receiver_sensitivity_mode":
				changed[key] = "different"
			default:
				changed[key] = 3
			}
			data, _ := json.Marshal(changed)
			candidate := input
			candidate.RFProfile = &raytracer.CellRFProfileInput{}
			if err := json.Unmarshal(data, candidate.RFProfile); err != nil {
				t.Fatal(err)
			}
			after, _ := rfChildDigest(candidate, "/api/simulate", 0)
			if before == after {
				t.Fatalf("unbound recognized field %s", key)
			}
		})
	}
	// A legacy gain alias must stay bound even when the TX alias overrides it.
	input.RFProfile = &raytracer.CellRFProfileInput{AntennaGainDBi: rfPointer(5.0), TxAntennaGainDBi: rfPointer(8.0)}
	before, _ := rfChildDigest(input, "/api/simulate", 0)
	input.RFProfile.AntennaGainDBi = rfPointer(6.0)
	after, _ := rfChildDigest(input, "/api/simulate", 0)
	if before == after {
		t.Fatal("redundant recognized alias not bound")
	}
}

func TestBoundedExpiryAndOrdinaryCarry(t *testing.T) {
	h := newWorkflowHarness(t, 0, "")
	now := time.Now()
	h.l.now = func() time.Time { return now }
	peer := "192.0.2.1"
	// Two grants occupy all extra and four ordinary holds, before either is used.
	a, ca := wfGrant(t, h, 6, "/api/evaluate-network", peer)
	b, cb := wfGrant(t, h, 6, "/api/evaluate-network", peer)
	h.l.mu.Lock()
	now = now.Add(59 * time.Second)
	h.l.mu.Unlock()
	wfChild(h, a, 0, peer, ca[0])
	wfChild(h, b, 0, peer, cb[0])
	h.l.mu.Lock()
	now = now.Add(2 * time.Second)
	h.l.mu.Unlock()
	out := wfChild(h, b, 2, peer, cb[2])
	if out.Code != 200 {
		t.Fatal("carried ordinary", out.Code)
	}
	s := h.l.clients[peer]
	if s.ordinarySpent != 1 || s.ordinaryHeld != 3 || s.extraSpent != 0 || s.extraHeld != 6 {
		t.Fatalf("carry %+v", s)
	}
	wfInvariant(t, h.l)
	// Replay/invalid requests cannot renew a valid lease.
	h.l.mu.Lock()
	expiry := h.l.workflows[b].idle
	h.l.mu.Unlock()
	out = wfChild(h, b, 2, peer, cb[2])
	if out.Code != 409 {
		t.Fatal("replay")
	}
	h.l.mu.Lock()
	same := h.l.workflows[b].idle.Equal(expiry)
	h.l.mu.Unlock()
	if !same {
		t.Fatal("replay renewed")
	}
	// Absolute deadline wins over any longer in-flight/idle deadline.
	h.l.mu.Lock()
	r := h.l.workflows[b]
	r.idle = r.absolute.Add(time.Minute)
	heap.Fix(&h.l.expiries, r.heapIndex)
	now = r.absolute
	h.l.expireDue(now)
	h.l.mu.Unlock()
	out = wfChild(h, b, 3, peer, cb[3])
	if out.Code != 410 {
		t.Fatal("absolute expiry")
	}
	wfInvariant(t, h.l)
}

func TestBoundedBoundaryAndCapacityHeaders(t *testing.T) {
	// Current ordinary tight burst remains39 when its old anchor was ordinary.
	h := newWorkflowHarness(t, 0, "")
	now := time.Now()
	h.l.now = func() time.Time { return now }
	peer := "192.0.2.1"
	wfHTTP(h, "/api/interference", peer, nil, nil, nil)
	h.l.mu.Lock()
	now = now.Add(59 * time.Second)
	h.l.mu.Unlock()
	admitted := 0
	for i := 0; i < 20; i++ {
		if wfHTTP(h, "/api/interference", peer, nil, nil, nil).Code == 204 {
			admitted++
		}
	}
	h.l.mu.Lock()
	now = now.Add(time.Second)
	h.l.mu.Unlock()
	for i := 0; i < 21; i++ {
		if wfHTTP(h, "/api/interference", peer, nil, nil, nil).Code == 204 {
			admitted++
		}
	}
	if admitted != 39 {
		t.Fatal("ordinary tight", admitted)
	}
	// An extra-funded carried claim can anchor with all20 ordinary units left.
	h = newWorkflowHarness(t, 0, "")
	now = time.Now()
	h.l.now = func() time.Time { return now }
	id, children := wfGrant(t, h, 6, "/api/evaluate-network", peer)
	h.l.mu.Lock()
	now = now.Add(59 * time.Second)
	h.l.mu.Unlock()
	wfChild(h, id, 0, peer, children[0])
	h.l.mu.Lock()
	now = now.Add(time.Second)
	h.l.mu.Unlock()
	wfChild(h, id, 1, peer, children[1])
	if h.l.clients[peer].ordinarySpent != 0 {
		t.Fatal("extra anchor charged ordinary")
	}
	h.l.mu.Lock()
	now = now.Add(59 * time.Second)
	h.l.mu.Unlock()
	admitted = 0
	for i := 0; i < 20; i++ {
		if wfHTTP(h, "/api/interference", peer, nil, nil, nil).Code == 204 {
			admitted++
		}
	}
	h.l.mu.Lock()
	now = now.Add(time.Second)
	h.l.mu.Unlock()
	for i := 0; i < 20; i++ {
		if wfHTTP(h, "/api/interference", peer, nil, nil, nil).Code == 204 {
			admitted++
		}
	}
	if admitted != 40 {
		t.Fatal("extra-anchor ordinary tight", admitted)
	}
	wfInvariant(t, h.l)
	// Combined tight bound55: old root outside burst, two8C workflows plus remainder.
	h = newWorkflowHarness(t, 0, "")
	now = time.Now()
	h.l.now = func() time.Time { return now }
	id, children = wfGrant(t, h, 8, "/api/evaluate-network", peer)
	h.l.mu.Lock()
	now = now.Add(59 * time.Second)
	h.l.mu.Unlock()
	admitted = 0
	for i, c := range children {
		if wfChild(h, id, i, peer, c).Code == 200 {
			admitted++
		}
	}
	for i := 0; i < 19; i++ {
		if wfHTTP(h, "/api/interference", peer, nil, nil, nil).Code == 204 {
			admitted++
		}
	}
	h.l.mu.Lock()
	now = now.Add(time.Second)
	h.l.mu.Unlock()
	id, children = wfGrant(t, h, 8, "/api/evaluate-network", peer)
	admitted++
	for i, c := range children {
		if wfChild(h, id, i, peer, c).Code == 200 {
			admitted++
		}
	}
	for i := 0; i < 19; i++ {
		if wfHTTP(h, "/api/interference", peer, nil, nil, nil).Code == 204 {
			admitted++
		}
	}
	if admitted != 55 {
		t.Fatal("combined tight", admitted)
	}
	out := wfHTTP(h, "/api/interference", peer, nil, nil, nil)
	if out.Code != 429 || out.Header().Get("RateLimit-Limit") != "20" || out.Header().Get("RF-Followup-Limit") != "8" || out.Header().Get("RF-Followup-Remaining") != "0" || out.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("headers", out.Header())
	}
	wfInvariant(t, h.l)
}

func TestBoundedConcurrentLifecycleRaces(t *testing.T) {
	h := newWorkflowHarness(t, 0, "")
	children := networkRFChildren(wfNetwork(2), nil)
	var wg sync.WaitGroup
	for worker := 0; worker < 12; worker++ {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			peer := fmt.Sprintf("192.0.2.%d", w+1)
			for i := 0; i < 50; i++ {
				root := wfHTTP(h, "/api/evaluate-network", peer, wfNetwork(2), map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
				id := root.Header().Get("RF-Workflow-ID")
				if id == "" {
					continue
				}
				var inner sync.WaitGroup
				for op := 0; op < 3; op++ {
					inner.Add(1)
					go func(op int) {
						defer inner.Done()
						switch op {
						case 0:
							wfChild(h, id, 0, peer, children[0])
						case 1:
							wfHTTP(h, "/api/rf-workflows", peer, nil, map[string]string{"RF-Workflow-ID": id}, nil)
						case 2:
							h.l.mu.Lock()
							h.l.expireDue(h.l.now())
							h.l.resetState(h.l.clients[peer], h.l.now())
							h.l.clientState("ephemeral-"+strconv.Itoa(w*50+i), h.l.now())
							h.l.mu.Unlock()
						}
					}(op)
				}
				inner.Wait()
			}
		}(worker)
	}
	wg.Wait()
	wfInvariant(t, h.l)
}

func TestBoundedObservabilityDoesNotLeakCapabilities(t *testing.T) {
	h := newWorkflowHarness(t, 0, "")
	var buffer bytes.Buffer
	h.l.logger = slog.New(slog.NewJSONHandler(&buffer, nil))
	peer := "192.0.2.1"
	id, children := wfGrant(t, h, 6, "/api/evaluate-network", peer)
	wfChild(h, id, 0, peer, children[0])
	wfChild(h, id, 0, peer, children[0])
	wfHTTP(h, "/api/rf-workflows", peer, nil, map[string]string{"RF-Workflow-ID": id}, nil)
	log := buffer.String()
	for _, secret := range []string{id, peer, "tower_lon", "rf_profile"} {
		if strings.Contains(log, secret) {
			t.Fatal("log leak", secret)
		}
	}
	for _, field := range []string{"policy", "classification", "workflow_hash", "funding", "ordinary_held", "extra_held", "remaining_children", "expiry_seconds"} {
		if !strings.Contains(log, field) {
			t.Fatal("missing diagnostic", field)
		}
	}
}

func TestBoundedAzimuthAndIneligibleRoots(t *testing.T) {
	h := newWorkflowHarness(t, time.Minute, "")
	peer := "192.0.2.1"
	input := networkRFChildren(wfNetwork(2), nil)[0]
	root := wfHTTP(h, "/api/optimize-azimuth", peer, input, map[string]string{"RF-Workflow": "azimuth-sector-v1"}, nil)
	if root.Code != 200 {
		t.Fatal(root.Code)
	}
	input.AzimuthDeg = rfPointer(45.0)
	out := wfHTTP(h, "/api/analyze-sector", peer, input, map[string]string{"RF-Workflow-ID": root.Header().Get("RF-Workflow-ID"), "RF-Workflow-Index": "0"}, nil)
	if out.Code != 200 || h.l.clients[peer].ordinarySpent != 1 || h.l.clients[peer].extraSpent != 1 {
		t.Fatal("Azimuth accounting")
	}
	for endpoint := range expensiveRFRoutes {
		family, _ := workflowFamily(endpoint)
		if family != "" {
			continue
		}
		before := h.l.clients[peer].extraSpent
		out := wfHTTP(h, endpoint, peer, input, map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
		if out.Code != 400 || out.Header().Get("RF-Workflow-ID") != "" || h.l.clients[peer].extraSpent != before {
			t.Fatal("ineligible", endpoint, out.Code)
		}
	}
	wfInvariant(t, h.l)
}

func TestBoundedStoredMetadataOwnsOnlyFixedValues(t *testing.T) {
	h := newWorkflowHarness(t, 0, "")
	peer := "192.0.2.1"
	body := wfNetwork(6)
	// Real URL parsing may return a path substring backed by a large query.
	out := wfHTTP(h, "/api/evaluate-network?padding="+strings.Repeat("x", 512*1024), peer, body, map[string]string{"RF-Workflow": "network-maps-v1"}, nil)
	if out.Code != 200 {
		t.Fatal(out.Code)
	}
	id := out.Header().Get("RF-Workflow-ID")
	h.l.mu.Lock()
	r := h.l.workflows[id]
	if r.root != workflowRoot("/api/evaluate-network") || r.protocol != "network-maps-v1" {
		t.Fatal("noncanonical metadata")
	}
	r.protocol = "future-v2"
	h.l.mu.Unlock()
	out = wfChild(h, id, 0, peer, networkRFChildren(body, nil)[0])
	if out.Code != 400 || h.children.Load() != 0 {
		t.Fatal("unsupported stored protocol", out.Code)
	}
	wfInvariant(t, h.l)
}
