package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const desktopTokenHeader = "X-Atom-Desktop-Token"

type proxyTarget struct {
	generation string
	token      string
	proxy      *httputil.ReverseProxy
}

// apiRouter forwards only the existing API routes from the stable WebView
// origin to the current sidecar generation; everything else falls through to
// the embedded (or Vite) assets. The renderer never learns the port or token.
//
// Wails v2 loads the page while OnStartup is still running, so API requests
// that arrive before the first sidecar generation wait (bounded) instead of
// failing and booting the UI into a dataset-unavailable state.
type apiRouter struct {
	target         atomic.Pointer[proxyTarget]
	allowedOrigins map[string]bool
	startupWait    time.Duration
	ready          chan struct{}
	readyOnce      sync.Once
}

func newAPIRouter(allowedOrigins []string) *apiRouter {
	router := &apiRouter{allowedOrigins: map[string]bool{}, startupWait: sidecarStartupTimeout, ready: make(chan struct{})}
	for _, origin := range allowedOrigins {
		router.allowedOrigins[origin] = true
	}
	return router
}

func (router *apiRouter) switchTo(child *sidecar) {
	backend := &url.URL{Scheme: "http", Host: child.Address}
	proxy := &httputil.ReverseProxy{
		Rewrite: func(request *httputil.ProxyRequest) {
			request.SetURL(backend)
			request.Out.Host = child.Address
			request.Out.Header.Del(desktopTokenHeader)
			request.Out.Header.Set(desktopTokenHeader, child.Token)
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			log.Printf("desktop proxy: %v", err)
			http.Error(w, `{"error":"desktop backend unavailable"}`, http.StatusBadGateway)
		},
	}
	router.target.Store(&proxyTarget{generation: child.Generation, token: child.Token, proxy: proxy})
	router.readyOnce.Do(func() { close(router.ready) })
}

func isAPIPath(path string) bool {
	return strings.HasPrefix(path, "/api/") || path == "/healthz" || path == "/readyz"
}

func (router *apiRouter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if !isAPIPath(request.URL.Path) {
			next.ServeHTTP(w, request)
			return
		}
		if origin := request.Header.Get("Origin"); origin != "" && !router.allowedOrigins[origin] {
			http.Error(w, `{"error":"desktop transport rejected"}`, http.StatusForbidden)
			return
		}
		if site := request.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" && site != "none" {
			http.Error(w, `{"error":"desktop transport rejected"}`, http.StatusForbidden)
			return
		}
		select {
		case <-router.ready:
		case <-request.Context().Done():
			return
		case <-time.After(router.startupWait):
			http.Error(w, `{"error":"desktop backend is starting"}`, http.StatusServiceUnavailable)
			return
		}
		router.target.Load().proxy.ServeHTTP(w, request)
	})
}
