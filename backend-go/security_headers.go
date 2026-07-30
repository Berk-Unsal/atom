package main

import (
	"net"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

const contentSecurityPolicy = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:"

func securityHeaders(trustedProxies []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Content-Security-Policy", contentSecurityPolicy)
		c.Header("Cross-Origin-Opener-Policy", "same-origin")
		c.Header("Permissions-Policy", "camera=(), geolocation=(), microphone=()")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		if requestIsHTTPS(c.Request, trustedProxies) {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		c.Next()
	}
}

func requireHTTPS(enabled bool, trustedProxies []string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !enabled || requestIsHTTPS(c.Request, trustedProxies) {
			c.Next()
			return
		}
		c.AbortWithStatusJSON(http.StatusUpgradeRequired, gin.H{"error": "HTTPS is required"})
	}
}

func requestIsHTTPS(request *http.Request, trustedProxies []string) bool {
	if request.TLS != nil {
		return true
	}
	if !strings.EqualFold(strings.TrimSpace(request.Header.Get("X-Forwarded-Proto")), "https") {
		return false
	}
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		host = request.RemoteAddr
	}
	remoteIP := net.ParseIP(host)
	if remoteIP == nil {
		return false
	}
	for _, value := range trustedProxies {
		if _, network, parseErr := net.ParseCIDR(value); parseErr == nil && network.Contains(remoteIP) {
			return true
		}
		if proxyIP := net.ParseIP(value); proxyIP != nil && proxyIP.Equal(remoteIP) {
			return true
		}
	}
	return false
}
