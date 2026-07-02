package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const defaultCoreLabTimeout = 1500 * time.Millisecond

var allowedCoreLabScenarios = map[string]struct{}{
	"normal":              {},
	"registration_storm":  {},
	"udm_outage":          {},
	"ausf_auth_failure":   {},
	"pcf_policy_degraded": {},
	"upf_degraded":        {},
	"xn_degraded":         {},
	"xn_unavailable":      {},
}

type coreLabConfig struct {
	Enabled    bool
	AdapterURL string
	Timeout    time.Duration
}

type coreLabScenarioRequest struct {
	Scenario        string   `json:"scenario"`
	ClusterTowerIDs []string `json:"cluster_tower_ids"`
	NetworkTech     string   `json:"network_tech"`
}

func registerCoreLabRoutes(router *gin.Engine) {
	config := loadCoreLabConfig()
	router.GET("/api/core/status", proxyCoreLabGET(config, "/status", coreLabDisabledStatus, coreLabDisconnectedStatus))
	router.GET("/api/core/topology", proxyCoreLabGET(config, "/topology", coreLabDisabledTopology, coreLabDisconnectedTopology))
	router.GET("/api/core/sessions", proxyCoreLabGET(config, "/sessions", coreLabDisabledSessions, coreLabDisconnectedSessions))
	router.GET("/api/core/events", proxyCoreLabGET(config, "/events", coreLabDisabledEvents, coreLabDisconnectedEvents))
	router.POST("/api/core/scenario", proxyCoreLabScenario(config))
}

func loadCoreLabConfig() coreLabConfig {
	return coreLabConfig{
		Enabled:    envBool("CORE_LAB_ENABLED", false),
		AdapterURL: strings.TrimRight(getenv("CORE_LAB_ADAPTER_URL", "http://localhost:8090"), "/"),
		Timeout:    envDurationMS("CORE_LAB_TIMEOUT_MS", defaultCoreLabTimeout),
	}
}

func proxyCoreLabGET(config coreLabConfig, adapterPath string, disabledPayload func() gin.H, disconnectedPayload func(string) gin.H) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !is5GCoreRequestContext(c.Request.URL.Query()) {
			c.JSON(http.StatusOK, coreLabNotApplicablePayload(adapterPath))
			return
		}
		if !config.Enabled {
			c.JSON(http.StatusOK, disabledPayload())
			return
		}
		targetPath := adapterPath
		if c.Request.URL.RawQuery != "" {
			targetPath += "?" + c.Request.URL.RawQuery
		}
		payload, err := requestCoreLabAdapter(c.Request.Context(), config, http.MethodGet, targetPath, nil)
		if err != nil {
			c.JSON(http.StatusOK, disconnectedPayload(err.Error()))
			return
		}
		c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
	}
}

func proxyCoreLabScenario(config coreLabConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req coreLabScenarioRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid core scenario JSON: " + err.Error()})
			return
		}
		req.Scenario = strings.TrimSpace(req.Scenario)
		if _, ok := allowedCoreLabScenarios[req.Scenario]; !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "unknown core scenario: " + req.Scenario})
			return
		}
		if !is5GNetworkTech(req.NetworkTech) {
			c.JSON(http.StatusOK, gin.H{
				"mode":       "not_applicable",
				"state":      "not_applicable",
				"scenario":   req.Scenario,
				"message":    "5G Core Lab applies only to 5G mmWave.",
				"updated_at": time.Now().UTC().Format(time.RFC3339),
			})
			return
		}
		if !config.Enabled {
			c.JSON(http.StatusOK, gin.H{
				"mode":       "disabled",
				"state":      "disabled",
				"scenario":   req.Scenario,
				"updated_at": time.Now().UTC().Format(time.RFC3339),
			})
			return
		}
		body, err := json.Marshal(req)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not encode core scenario request"})
			return
		}
		payload, err := requestCoreLabAdapter(c.Request.Context(), config, http.MethodPost, "/scenario", body)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"mode":       "open5gs",
				"state":      "disconnected",
				"scenario":   req.Scenario,
				"message":    err.Error(),
				"updated_at": time.Now().UTC().Format(time.RFC3339),
			})
			return
		}
		c.Data(http.StatusOK, "application/json; charset=utf-8", payload)
	}
}

func requestCoreLabAdapter(parent context.Context, config coreLabConfig, method string, adapterPath string, body []byte) ([]byte, error) {
	if _, err := url.ParseRequestURI(config.AdapterURL); err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(parent, config.Timeout)
	defer cancel()

	requestURL := config.AdapterURL + adapterPath
	req, err := http.NewRequestWithContext(ctx, method, requestURL, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	response, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, &coreLabAdapterError{Status: response.StatusCode, Body: string(payload)}
	}
	if !json.Valid(payload) {
		return nil, &coreLabAdapterError{Status: response.StatusCode, Body: "adapter returned non-JSON payload"}
	}
	return payload, nil
}

type coreLabAdapterError struct {
	Status int
	Body   string
}

func (err *coreLabAdapterError) Error() string {
	if strings.TrimSpace(err.Body) == "" {
		return "core lab adapter returned status " + strconv.Itoa(err.Status)
	}
	return "core lab adapter returned status " + strconv.Itoa(err.Status) + ": " + err.Body
}

func coreLabDisabledStatus() gin.H {
	return gin.H{
		"mode":       "disabled",
		"state":      "disabled",
		"functions":  []gin.H{},
		"message":    "Core Lab is disabled. Set CORE_LAB_ENABLED=true and start the sidecar stack.",
		"updated_at": time.Now().UTC().Format(time.RFC3339),
	}
}

func coreLabDisconnectedStatus(message string) gin.H {
	return gin.H{
		"mode":       "open5gs",
		"state":      "disconnected",
		"functions":  []gin.H{},
		"message":    message,
		"updated_at": time.Now().UTC().Format(time.RFC3339),
	}
}

func coreLabDisabledTopology() gin.H {
	return gin.H{"state": "disabled", "nodes": []gin.H{}, "edges": []gin.H{}, "route_decisions": []gin.H{}}
}

func coreLabDisconnectedTopology(message string) gin.H {
	return gin.H{"state": "disconnected", "message": message, "nodes": []gin.H{}, "edges": []gin.H{}, "route_decisions": []gin.H{}}
}

func coreLabDisabledSessions() gin.H {
	return gin.H{"state": "disabled", "sessions": []gin.H{}, "session_count": 0}
}

func coreLabDisconnectedSessions(message string) gin.H {
	return gin.H{"state": "disconnected", "message": message, "sessions": []gin.H{}, "session_count": 0}
}

func coreLabDisabledEvents() gin.H {
	return gin.H{"state": "disabled", "events": []gin.H{}}
}

func coreLabDisconnectedEvents(message string) gin.H {
	return gin.H{"state": "disconnected", "message": message, "events": []gin.H{}}
}

func coreLabNotApplicablePayload(adapterPath string) gin.H {
	payload := gin.H{
		"mode":    "not_applicable",
		"state":   "not_applicable",
		"message": "5G Core Lab applies only to 5G mmWave.",
	}
	switch adapterPath {
	case "/topology":
		payload["nodes"] = []gin.H{}
		payload["edges"] = []gin.H{}
		payload["route_decisions"] = []gin.H{}
	case "/sessions":
		payload["sessions"] = []gin.H{}
		payload["session_count"] = 0
	case "/events":
		payload["events"] = []gin.H{}
	case "/status":
		payload["functions"] = []gin.H{}
	}
	return payload
}

func is5GCoreRequestContext(query url.Values) bool {
	networkTech := query.Get("network_tech")
	if networkTech == "" {
		return true
	}
	return is5GNetworkTech(networkTech)
}

func is5GNetworkTech(value string) bool {
	normalized := strings.ToLower(strings.TrimSpace(value))
	return normalized == "" || normalized == "5g" || normalized == "5g_mmwave" || normalized == "5g-mmwave"
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func envDurationMS(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	milliseconds, err := strconv.Atoi(value)
	if err != nil || milliseconds <= 0 {
		return fallback
	}
	return time.Duration(milliseconds) * time.Millisecond
}
