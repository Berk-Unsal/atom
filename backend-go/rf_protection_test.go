package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestRFRequestLimiterPreservesCapacityForAnotherClient(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	limiter := newRFRequestLimiterWithBudget(2, 1, 20)
	started := make(chan struct{}, 2)
	release := make(chan struct{})
	router.POST("/job", limiter.middleware(), func(c *gin.Context) {
		started <- struct{}{}
		<-release
		c.Status(http.StatusNoContent)
	})

	responses := make(chan *httptest.ResponseRecorder, 2)
	startRequest := func(remoteAddr string) {
		req := httptest.NewRequest(http.MethodPost, "/job", nil)
		req.RemoteAddr = remoteAddr
		recorder := httptest.NewRecorder()
		go func() {
			router.ServeHTTP(recorder, req)
			responses <- recorder
		}()
	}

	startRequest("192.0.2.1:1000")
	<-started

	duplicate := httptest.NewRequest(http.MethodPost, "/job", nil)
	duplicate.RemoteAddr = "192.0.2.1:2000"
	duplicateRecorder := httptest.NewRecorder()
	router.ServeHTTP(duplicateRecorder, duplicate)
	if duplicateRecorder.Code != http.StatusTooManyRequests || !strings.Contains(duplicateRecorder.Body.String(), "already running") {
		t.Fatalf("same-client status = %d, body = %s", duplicateRecorder.Code, duplicateRecorder.Body.String())
	}

	startRequest("198.51.100.2:1000")
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("second client did not receive the reserved global slot")
	}
	close(release)
	for range 2 {
		if recorder := <-responses; recorder.Code != http.StatusNoContent {
			t.Fatalf("admitted request status = %d", recorder.Code)
		}
	}
}

func TestRFRequestLimiterEnforcesPerClientBudget(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	limiter := newRFRequestLimiterWithBudget(1, 1, 2)
	router.POST("/job", limiter.middleware(), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	for attempt := 1; attempt <= 3; attempt++ {
		req := httptest.NewRequest(http.MethodPost, "/job", nil)
		req.RemoteAddr = "192.0.2.1:1000"
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, req)
		if attempt < 3 && recorder.Code != http.StatusNoContent {
			t.Fatalf("attempt %d status = %d", attempt, recorder.Code)
		}
		if attempt == 3 {
			if recorder.Code != http.StatusTooManyRequests || recorder.Header().Get("RateLimit-Remaining") != "0" {
				t.Fatalf("budget status = %d, remaining = %q", recorder.Code, recorder.Header().Get("RateLimit-Remaining"))
			}
		}
	}
}

func TestRFProtectionRequiresConfiguredAPIKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(protectExpensiveRFRoutes(newRFRequestLimiter(1), time.Second, "correct-key"))
	router.POST("/api/simulate", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	unauthorized := httptest.NewRecorder()
	router.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodPost, "/api/simulate", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("missing-key status = %d", unauthorized.Code)
	}

	authorizedRequest := httptest.NewRequest(http.MethodPost, "/api/simulate", nil)
	authorizedRequest.Header.Set("Authorization", "Bearer correct-key")
	authorized := httptest.NewRecorder()
	router.ServeHTTP(authorized, authorizedRequest)
	if authorized.Code != http.StatusNoContent {
		t.Fatalf("valid-key status = %d", authorized.Code)
	}
}

func TestRFProtectionAppliesComputationDeadline(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(protectExpensiveRFRoutes(newRFRequestLimiter(1), 5*time.Millisecond, ""))
	router.POST("/api/simulate", func(c *gin.Context) {
		<-c.Request.Context().Done()
		writeRFResponse(c, struct{}{}, c.Request.Context().Err())
	})

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/simulate", nil).WithContext(context.Background()))
	if recorder.Code != http.StatusGatewayTimeout {
		t.Fatalf("status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
}
