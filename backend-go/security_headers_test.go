package main

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSecurityHeadersAndHTTPSBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(securityHeaders([]string{"192.0.2.0/24"}), requireHTTPS(true, []string{"192.0.2.0/24"}))
	router.GET("/", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	insecure := httptest.NewRecorder()
	router.ServeHTTP(insecure, httptest.NewRequest(http.MethodGet, "/", nil))
	if insecure.Code != http.StatusUpgradeRequired {
		t.Fatalf("insecure status = %d, want 426", insecure.Code)
	}
	contentSecurityPolicy := insecure.Header().Get("Content-Security-Policy")
	if contentSecurityPolicy == "" || insecure.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("security headers missing: %#v", insecure.Header())
	}
	if insecure.Header().Get("Referrer-Policy") != "strict-origin-when-cross-origin" {
		t.Fatalf("Referrer-Policy = %q, want strict-origin-when-cross-origin", insecure.Header().Get("Referrer-Policy"))
	}

	secureRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	secureRequest.Header.Set("X-Forwarded-Proto", "https")
	secure := httptest.NewRecorder()
	router.ServeHTTP(secure, secureRequest)
	if secure.Code != http.StatusNoContent {
		t.Fatalf("secure status = %d, want 204", secure.Code)
	}
	if secure.Header().Get("Strict-Transport-Security") == "" {
		t.Fatal("secure response is missing HSTS")
	}

	spoofedRequest := httptest.NewRequest(http.MethodGet, "/", nil)
	spoofedRequest.RemoteAddr = "198.51.100.10:1234"
	spoofedRequest.Header.Set("X-Forwarded-Proto", "https")
	spoofed := httptest.NewRecorder()
	router.ServeHTTP(spoofed, spoofedRequest)
	if spoofed.Code != http.StatusUpgradeRequired || spoofed.Header().Get("Strict-Transport-Security") != "" {
		t.Fatalf("untrusted forwarded proto bypassed HTTPS boundary: status=%d headers=%#v", spoofed.Code, spoofed.Header())
	}
}

func TestBasemapContentSecurityPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	// Pin every directive so adding a raster provider cannot relax other sources.
	const expectedPolicy = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://tile.openstreetmap.org https://tiles.stadiamaps.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:"
	for _, tt := range []struct {
		name         string
		requireHTTPS bool
		tls          bool
		forwarded    bool
		wantStatus   int
	}{
		{name: "local HTTP", wantStatus: http.StatusNoContent},
		{name: "direct HTTPS", requireHTTPS: true, tls: true, wantStatus: http.StatusNoContent},
		{name: "trusted HTTPS proxy", requireHTTPS: true, forwarded: true, wantStatus: http.StatusNoContent},
		{name: "HTTPS required rejection", requireHTTPS: true, wantStatus: http.StatusUpgradeRequired},
	} {
		t.Run(tt.name, func(t *testing.T) {
			proxies := []string{"192.0.2.0/24"}
			router := gin.New()
			router.Use(securityHeaders(proxies), requireHTTPS(tt.requireHTTPS, proxies))
			router.GET("/", func(c *gin.Context) { c.Status(http.StatusNoContent) })
			request := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.tls {
				request.TLS = &tls.ConnectionState{}
			}
			if tt.forwarded {
				request.Header.Set("X-Forwarded-Proto", "https")
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", response.Code, tt.wantStatus)
			}
			if got := response.Header().Values("Content-Security-Policy"); len(got) != 1 || got[0] != expectedPolicy {
				t.Fatalf("Content-Security-Policy = %q, want one exact policy %q", got, expectedPolicy)
			}
		})
	}
}
