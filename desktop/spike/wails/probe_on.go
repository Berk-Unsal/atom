//go:build spikeprobe

package main

// The spike probe drives the real app inside the native WebView and writes
// observations to $ATOM_SPIKE_REPORT. It exists only with -tags spikeprobe so
// no probe route or script can reach a release build.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/logger"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const probeLogLevel = logger.DEBUG

type spikeProbe struct {
	mu       sync.Mutex
	results  map[string]any
	requests []map[string]string
	child    *sidecar
	started  time.Time
	domSeen  int
	done     chan struct{}
	doneOnce sync.Once
}

func newSpikeProbe(*apiRouter) *spikeProbe {
	return &spikeProbe{results: map[string]any{}, started: time.Now(), done: make(chan struct{})}
}

func (probe *spikeProbe) record(key string, value any) {
	probe.mu.Lock()
	defer probe.mu.Unlock()
	probe.results[key] = value
}

func (probe *spikeProbe) currentChild() *sidecar {
	probe.mu.Lock()
	defer probe.mu.Unlock()
	return probe.child
}

func (probe *spikeProbe) sidecarReady(ctx context.Context, child *sidecar) {
	probe.mu.Lock()
	probe.child = child
	probe.mu.Unlock()
	go func() {
		time.Sleep(6 * time.Minute)
		probe.record("hard_stop", true)
		runtime.Quit(ctx)
	}()
	probe.record("sidecar", map[string]any{
		"address":       child.Address,
		"generation":    child.Generation,
		"pid":           child.Listening.PID,
		"model_version": child.Listening.ModelVersion,
		"dataset":       child.Dataset.Dataset,
		"ready_ms":      time.Since(probe.started).Milliseconds(),
	})
}

func (probe *spikeProbe) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		probe.mu.Lock()
		if len(probe.requests) < 400 {
			probe.requests = append(probe.requests, map[string]string{
				"method":         request.Method,
				"path":           request.URL.Path,
				"origin":         request.Header.Get("Origin"),
				"sec_fetch_site": request.Header.Get("Sec-Fetch-Site"),
				"referer":        request.Header.Get("Referer"),
				"t_ms":           fmt.Sprint(time.Since(probe.started).Milliseconds()),
			})
		}
		probe.mu.Unlock()
		log.Printf("spike request %s %s origin=%q", request.Method, request.URL.Path, request.Header.Get("Origin"))
		if request.URL.Path != "/__spike/report" {
			next.ServeHTTP(w, request)
			return
		}
		body, _ := io.ReadAll(io.LimitReader(request.Body, 1<<20))
		var payload map[string]any
		if err := json.Unmarshal(body, &payload); err != nil {
			payload = map[string]any{"raw": string(body)}
		}
		probe.mu.Lock()
		for key, value := range payload {
			probe.results[key] = value
		}
		probe.mu.Unlock()
		if payload["phase"] == "done" {
			probe.doneOnce.Do(func() { close(probe.done) })
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func (probe *spikeProbe) domReady(ctx context.Context) {
	probe.mu.Lock()
	probe.domSeen++
	first := probe.domSeen == 1
	probe.results["dom_ready_count"] = probe.domSeen
	probe.mu.Unlock()
	if !first {
		return
	}
	for i := 0; probe.currentChild() == nil && i < 600; i++ {
		time.Sleep(100 * time.Millisecond)
	}
	if probe.currentChild() == nil {
		return
	}
	probe.record("dom_ready_ms", time.Since(probe.started).Milliseconds())
	script := fmt.Sprintf("(%s)(%q, %q);", probeScript, probe.child.Generation, probe.child.Address)
	runtime.WindowExecJS(ctx, script)
	go func() {
		select {
		case <-probe.done:
		case <-time.After(4 * time.Minute):
			probe.record("probe_timeout", true)
		}
		// Navigation enforcement: try to leave the app origin, then see what the
		// main frame is showing and whether it can still reach app routes.
		runtime.WindowExecJS(ctx, attributionClickScript)
		time.Sleep(6 * time.Second)
		runtime.WindowExecJS(ctx, navigationProbeScript)
		time.Sleep(6 * time.Second)
		runtime.Quit(ctx)
	}()
}

func (probe *spikeProbe) flush() {
	path := os.Getenv("ATOM_SPIKE_REPORT")
	if path == "" {
		return
	}
	probe.mu.Lock()
	defer probe.mu.Unlock()
	probe.results["requests"] = probe.requests
	data, _ := json.MarshalIndent(probe.results, "", "  ")
	if err := os.WriteFile(path, data, 0o600); err != nil {
		log.Printf("write spike report: %v", err)
	}
}

// attributionClickScript clicks the real Leaflet attribution link, a control
// every user can reach, and falls back to a scripted navigation.
const attributionClickScript = `(() => {
  const link = document.querySelector('.leaflet-control-attribution a[href^="https://"]:not([target])');
  fetch('/__spike/report', {method: 'POST', body: JSON.stringify({navigation_trigger: link ? 'click ' + link.href : 'location.assign'})})
    .finally(() => { if (link) { link.click(); } else { location.assign('https://example.com/'); } });
})();`

// navigationProbeScript runs in whatever document the main frame shows after
// the navigation attempt. If that is a foreign page, these requests show
// whether it can reach the app scheme, the API route and the native bridge.
const navigationProbeScript = `(() => {
  const here = String(location.href);
  const report = (extra) => fetch('wails://wails/__spike/report', {method: 'POST', mode: 'no-cors', body: JSON.stringify(Object.assign({navigation_after: here}, extra))}).catch(() => {});
  report({navigation_report_channel: 'fetch'});
  new Image().src = 'wails://wails/__spike/report?img=' + encodeURIComponent(here);
  fetch('wails://wails/api/meta', {method: 'POST', mode: 'no-cors', body: '{}'}).catch(() => {});
  try { window.webkit.messageHandlers.external.postMessage('wails:openInspector'); } catch (e) {}
  try { document.title = 'navigated:' + here; } catch (e) {}
})();`

const probeScript = `async function atomSpikeProbe(generation, address) {
  const out = {phase: 'running', probe_generation: generation};
  const t0 = performance.now();
  const ms = () => Math.round(performance.now() - t0);
  const send = (payload) => fetch('/__spike/report', {method: 'POST', body: JSON.stringify(payload)}).catch(() => {});
  const sleep = (n) => new Promise((resolve) => setTimeout(resolve, n));
  const step = async (name, fn) => {
    try { out[name] = await fn(); } catch (error) { out[name] = {error: String(error && (error.name + ': ' + error.message))}; }
    send({[name]: out[name]});
  };
  const button = (label) => [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === label);

  out.environment = {
    user_agent: navigator.userAgent, href: location.href, origin: location.origin,
    secure_context: window.isSecureContext, device_pixel_ratio: window.devicePixelRatio,
    prefers_dark: matchMedia('(prefers-color-scheme: dark)').matches,
    theme_attribute: document.documentElement.getAttribute('data-theme'),
    print_api: typeof window.print, indexeddb: typeof indexedDB, storage_estimate: navigator.storage ? 'present' : 'absent',
  };
  send({environment: out.environment});

  await step('app_ready', async () => {
    for (let i = 0; i < 240; i += 1) {
      const run = button('Run Sector');
      if (run && !run.disabled) return {ready: true, after_ms: ms()};
      await sleep(500);
    }
    return {ready: false, after_ms: ms()};
  });

  await step('api_meta_json', async () => {
    const response = await fetch('/api/meta');
    const meta = await response.json();
    return {status: response.status, model_version: meta.model_version, supported_technologies: meta.supported_technologies,
      technology_capabilities: meta.technology_capabilities, dataset_id: meta.dataset && meta.dataset.id, dataset_version: meta.dataset && meta.dataset.version};
  });

  let towers = [];
  await step('api_towers_blob', async () => {
    const response = await fetch('/api/towers');
    const blob = await response.blob();
    const parsed = JSON.parse(await blob.text());
    towers = parsed.features || [];
    return {status: response.status, bytes: blob.size, type: blob.type, features: towers.length};
  });

  await step('abort_large_download', async () => {
    const controller = new AbortController();
    const started = performance.now();
    const pending = fetch('/api/buildings', {signal: controller.signal}).then((r) => r.arrayBuffer());
    setTimeout(() => controller.abort(), 40);
    try { await pending; return {aborted: false, elapsed_ms: Math.round(performance.now() - started)}; }
    catch (error) { return {aborted: error.name === 'AbortError', name: error.name, elapsed_ms: Math.round(performance.now() - started)}; }
  });

  await step('evaluate_8_cells', async () => {
    if (towers.length < 8) return {skipped: 'fewer than 8 towers'};
    const coord = (f) => f.geometry.coordinates;
    const [lon0, lat0] = coord(towers[0]);
    const nearest = towers.slice().sort((a, b) => {
      const da = (coord(a)[0] - lon0) ** 2 + (coord(a)[1] - lat0) ** 2;
      const db = (coord(b)[0] - lon0) ** 2 + (coord(b)[1] - lat0) ** 2;
      return da - db;
    }).slice(0, 8);
    const body = {towers: nearest.map((f, i) => ({id: String((f.properties && (f.properties.id || f.properties.cell_id)) || 'spike-' + i), tower_lon: coord(f)[0], tower_lat: coord(f)[1]}))};
    const started = performance.now();
    const response = await fetch('/api/evaluate-network', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const text = await response.text();
    let summary = text.slice(0, 300);
    try { const json = JSON.parse(text); summary = {keys: Object.keys(json).slice(0, 12), scenario_fingerprint: json.scenario_fingerprint, error: json.error}; } catch (e) {}
    return {status: response.status, elapsed_ms: Math.round(performance.now() - started), bytes: text.length, summary};
  });

  await step('run_sector_ui', async () => {
    const run = button('Run Sector');
    if (!run) return {clicked: false};
    const started = performance.now();
    run.click();
    for (let i = 0; i < 240; i += 1) {
      const state = document.querySelector('.run-state');
      if (state && state.textContent.trim() === 'Ready') return {clicked: true, ready: true, elapsed_ms: Math.round(performance.now() - started)};
      await sleep(500);
    }
    const state = document.querySelector('.run-state');
    return {clicked: true, ready: false, state: state && state.textContent.trim()};
  });

  await sleep(4000);
  await step('map_dom', async () => {
    const tiles = [...document.querySelectorAll('img.leaflet-tile')];
    return {
      leaflet_container: !!document.querySelector('.leaflet-container'),
      tiles_total: tiles.length,
      tiles_loaded: tiles.filter((t) => t.complete && t.naturalWidth > 0).length,
      tile_hosts: [...new Set(tiles.map((t) => { try { return new URL(t.src).host; } catch (e) { return 'invalid'; } }))],
      markers: document.querySelectorAll('.leaflet-marker-icon, .leaflet-interactive').length,
      svg_paths: document.querySelectorAll('.leaflet-overlay-pane svg path').length,
      canvases: document.querySelectorAll('canvas').length,
      image_layers: document.querySelectorAll('.leaflet-image-layer').length,
    };
  });

  await step('storage', async () => {
    const databases = indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : 'unsupported';
    const previous = await new Promise((resolve, reject) => {
      const open = indexedDB.open('atom-desktop-spike', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('runs');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('runs', 'readwrite');
        const store = tx.objectStore('runs');
        const read = store.get('last');
        read.onsuccess = () => {
          store.put({generation, address, at: new Date().toISOString()}, 'last');
          tx.oncomplete = () => { db.close(); resolve(read.result || null); };
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const previousLocal = localStorage.getItem('atom-desktop-spike');
    localStorage.setItem('atom-desktop-spike', JSON.stringify({generation, address}));
    return {databases, previous_indexeddb_marker: previous, previous_localstorage_marker: previousLocal,
      workspace_key_present: localStorage.getItem('atom.planning.workspace.v1') !== null};
  });

  await step('window_open', async () => {
    const opened = window.open('https://example.com/', '_blank');
    return {returned: opened === null ? 'null' : typeof opened};
  });

  out.phase = 'done';
  out.probe_ms = ms();
  await send({phase: 'done', probe_ms: out.probe_ms});
}`
