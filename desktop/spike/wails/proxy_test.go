package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestAPIRouterForwardsOnlyAPIRoutesWithHostToken(t *testing.T) {
	var gotToken, gotHost string
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotToken, gotHost = r.Header.Get(desktopTokenHeader), r.Host
		w.WriteHeader(http.StatusTeapot)
	}))
	defer backend.Close()
	router := newAPIRouter([]string{"wails://wails"})
	router.switchTo(&sidecar{Generation: "g1", Token: "secret", Address: strings.TrimPrefix(backend.URL, "http://")})
	assets := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	handler := router.Middleware(assets)

	cases := []struct {
		name, method, path, origin, fetchSite, clientToken string
		want                                               int
	}{
		{"asset", http.MethodGet, "/index.html", "", "", "", http.StatusOK},
		{"api path prefix lookalike", http.MethodGet, "/apix", "", "", "", http.StatusOK},
		{"api same origin", http.MethodGet, "/api/meta", "wails://wails", "same-origin", "", http.StatusTeapot},
		{"api no origin", http.MethodPost, "/api/simulate", "", "", "", http.StatusTeapot},
		{"readyz", http.MethodGet, "/readyz", "", "", "", http.StatusTeapot},
		{"client token replaced", http.MethodGet, "/api/meta", "", "", "forged", http.StatusTeapot},
		{"foreign origin", http.MethodPost, "/api/datasets/switch", "https://example.com", "", "", http.StatusForbidden},
		{"cross-site fetch metadata", http.MethodGet, "/api/buildings", "", "cross-site", "", http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotToken, gotHost = "", ""
			request := httptest.NewRequest(tc.method, "wails://wails"+tc.path, nil)
			if tc.origin != "" {
				request.Header.Set("Origin", tc.origin)
			}
			if tc.fetchSite != "" {
				request.Header.Set("Sec-Fetch-Site", tc.fetchSite)
			}
			if tc.clientToken != "" {
				request.Header.Set(desktopTokenHeader, tc.clientToken)
			}
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != tc.want {
				t.Fatalf("status = %d, want %d", recorder.Code, tc.want)
			}
			if tc.want == http.StatusTeapot {
				if gotToken != "secret" {
					t.Fatalf("backend token = %q, want host-injected token", gotToken)
				}
				if gotHost != strings.TrimPrefix(backend.URL, "http://") {
					t.Fatalf("backend Host = %q, want exact listener", gotHost)
				}
			}
		})
	}
}

func TestAPIRouterHoldsEarlyRequestsUntilFirstSidecar(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }))
	defer backend.Close()
	router := newAPIRouter(nil)
	handler := router.Middleware(http.NotFoundHandler())
	done := make(chan int, 1)
	go func() {
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/meta", nil))
		done <- recorder.Code
	}()
	select {
	case code := <-done:
		t.Fatalf("request finished with %d before the sidecar was ready", code)
	case <-time.After(30 * time.Millisecond):
	}
	router.switchTo(&sidecar{Generation: "g1", Token: "t", Address: strings.TrimPrefix(backend.URL, "http://")})
	if code := <-done; code != http.StatusTeapot {
		t.Fatalf("status = %d, want request forwarded once ready", code)
	}
}

func TestAPIRouterTimesOutWhenSidecarNeverStarts(t *testing.T) {
	router := newAPIRouter(nil)
	router.startupWait = 10 * time.Millisecond
	recorder := httptest.NewRecorder()
	router.Middleware(http.NotFoundHandler()).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/meta", nil))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503 after the bounded startup wait", recorder.Code)
	}
}
