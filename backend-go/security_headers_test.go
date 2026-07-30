package main

import (
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
	if insecure.Header().Get("Content-Security-Policy") == "" || insecure.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("security headers missing: %#v", insecure.Header())
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
