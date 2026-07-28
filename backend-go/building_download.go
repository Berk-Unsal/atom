package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	defaultBuildingDownloadCapacity    = 2
	defaultBuildingDownloadClientLimit = 1
	defaultBuildingDownloadsPerMinute  = 2
	buildingCacheMaxAgeSeconds         = 3600
)

func strongETag(digest string) string {
	digest = strings.ToLower(strings.TrimSpace(digest))
	if digest == "" {
		return ""
	}
	return `"` + digest + `"`
}

func buildingDatasetCacheControl(private bool) string {
	visibility := "public"
	if private {
		visibility = "private"
	}
	return visibility + ", max-age=" + strconv.Itoa(buildingCacheMaxAgeSeconds) + ", must-revalidate"
}

func requireBuildingAPIKey(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if apiKey == "" {
			c.Next()
			return
		}
		if !validAPIKey(c, apiKey) {
			c.Header("Cache-Control", "no-store")
			c.Header("WWW-Authenticate", `Bearer realm="A.T.O.M building dataset"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "valid building dataset API key required"})
			return
		}
		c.Next()
	}
}

func serveBuildingNotModified(etag string, cacheControl string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if etag != "" && etagMatches(c.GetHeader("If-None-Match"), etag) {
			setBuildingCacheHeaders(c, etag, cacheControl)
			c.AbortWithStatus(http.StatusNotModified)
			return
		}
		c.Next()
	}
}

func serveBuildingGeoJSON(path string, etag string, cacheControl string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if path == "" || path == "not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "ankara_buildings.geojson is not configured"})
			return
		}
		setBuildingCacheHeaders(c, etag, cacheControl)
		// The content hash is the canonical validator. Ignore filesystem timestamps,
		// which can change between otherwise identical container builds.
		c.Request.Header.Del("If-Modified-Since")
		c.Request.Header.Del("If-None-Match")
		c.File(path)
	}
}

func setBuildingCacheHeaders(c *gin.Context, etag string, cacheControl string) {
	c.Header("Cache-Control", cacheControl)
	c.Header("Content-Type", "application/geo+json")
	if etag != "" {
		c.Header("ETag", etag)
	}
}

func etagMatches(header string, etag string) bool {
	for candidate := range strings.SplitSeq(header, ",") {
		candidate = strings.TrimSpace(candidate)
		if candidate == "*" || strings.TrimPrefix(candidate, "W/") == etag {
			return true
		}
	}
	return false
}
