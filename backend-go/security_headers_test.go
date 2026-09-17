package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
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
	if !strings.Contains(contentSecurityPolicy, "img-src 'self' data: https://tile.openstreetmap.org") || strings.Contains(contentSecurityPolicy, "*.tile.openstreetmap.org") {
		t.Fatalf("Content-Security-Policy has an invalid OSM tile source: %q", contentSecurityPolicy)
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
