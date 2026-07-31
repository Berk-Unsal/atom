package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultRFRequestsPerMinute = 20
	defaultRFRequestTimeout    = 60 * time.Second
	defaultRFClientLimit       = 1
	maxTrackedRFClients        = 4096
)

var expensiveRFRoutes = map[string]struct{}{
	"/api/path-profile":                         {},
	"/api/coverage-surface":                     {},
	"/api/processes/batch-experiment/execution": {},
	"/api/analyze-sector":                       {},
	"/api/simulate":                             {},
	"/api/coverage-gaps":                        {},
	"/api/optimize-azimuth":                     {},
	"/api/evaluate-network":                     {},
	"/api/optimize-network":                     {},
	"/api/interference":                         {},
	"/api/recommend-sites":                      {},
	"/api/measurements/evaluate":                {},
}

type rfClientState struct {
	active      int
	requests    int
	windowStart time.Time
	lastSeen    time.Time
}

type rfRequestLimiter struct {
	slots                chan struct{}
	perClientConcurrency int
	requestsPerMinute    int
	mu                   sync.Mutex
	clients              map[string]*rfClientState
	overflow             rfClientState
	now                  func() time.Time
}

func newRFRequestLimiter(capacity int) *rfRequestLimiter {
	return newRFRequestLimiterWithBudget(capacity, defaultRFClientLimit, defaultRFRequestsPerMinute)
}

func newRFRequestLimiterWithBudget(capacity, perClientConcurrency, requestsPerMinute int) *rfRequestLimiter {
	if capacity < 1 {
		capacity = 1
	}
	if perClientConcurrency < 1 {
		perClientConcurrency = 1
	}
	if perClientConcurrency > capacity {
		perClientConcurrency = capacity
	}
	if requestsPerMinute < 1 {
		requestsPerMinute = 1
	}
	return &rfRequestLimiter{
		slots:                make(chan struct{}, capacity),
		perClientConcurrency: perClientConcurrency,
		requestsPerMinute:    requestsPerMinute,
		clients:              make(map[string]*rfClientState),
		now:                  time.Now,
	}
}

func (limiter *rfRequestLimiter) middleware() gin.HandlerFunc {
	return limiter.middlewareFor("RF analysis")
}

func (limiter *rfRequestLimiter) middlewareFor(resource string) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID := c.ClientIP()
		release, remaining, resetSeconds, retryAfter, reason := limiter.acquire(clientID, resource)
		c.Header("RateLimit-Limit", strconv.Itoa(limiter.requestsPerMinute))
		c.Header("RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("RateLimit-Reset", strconv.Itoa(resetSeconds))
		if reason != "" {
			c.Header("Cache-Control", "no-store")
			c.Header("Retry-After", strconv.Itoa(retryAfter))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": reason})
			return
		}

		select {
		case limiter.slots <- struct{}{}:
			defer func() {
				<-limiter.slots
				release()
			}()
			c.Next()
		default:
			release()
			c.Header("Cache-Control", "no-store")
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": resource + " capacity is busy; retry shortly"})
		}
	}
}

func (limiter *rfRequestLimiter) acquire(clientID string, resource string) (func(), int, int, int, string) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := limiter.now()
	state := limiter.clientState(clientID, now)
	if now.Sub(state.windowStart) >= time.Minute {
		state.windowStart = now
		state.requests = 0
	}
	state.lastSeen = now
	resetSeconds := int(state.windowStart.Add(time.Minute).Sub(now).Seconds())
	if resetSeconds < 1 {
		resetSeconds = 1
	}
	if state.requests >= limiter.requestsPerMinute {
		return func() {}, 0, resetSeconds, resetSeconds, resource + " request budget exceeded; retry after the current rate-limit window"
	}

	state.requests++
	remaining := limiter.requestsPerMinute - state.requests
	if state.active >= limiter.perClientConcurrency {
		return func() {}, remaining, resetSeconds, 1, "another " + resource + " is already running for this client"
	}
	state.active++

	var once sync.Once
	return func() {
		once.Do(func() {
			limiter.mu.Lock()
			defer limiter.mu.Unlock()
			if state.active > 0 {
				state.active--
				state.lastSeen = limiter.now()
			}
		})
	}, remaining, resetSeconds, 0, ""
}

func (limiter *rfRequestLimiter) clientState(clientID string, now time.Time) *rfClientState {
	if state := limiter.clients[clientID]; state != nil {
		return state
	}
	if len(limiter.clients) >= maxTrackedRFClients {
		var oldestID string
		var oldestTime time.Time
		for id, state := range limiter.clients {
			if state.active != 0 || (!oldestTime.IsZero() && !state.lastSeen.Before(oldestTime)) {
				continue
			}
			oldestID = id
			oldestTime = state.lastSeen
		}
		if oldestID != "" {
			delete(limiter.clients, oldestID)
		} else {
			if limiter.overflow.windowStart.IsZero() {
				limiter.overflow.windowStart = now
			}
			limiter.overflow.lastSeen = now
			return &limiter.overflow
		}
	}
	state := &rfClientState{windowStart: now, lastSeen: now}
	limiter.clients[clientID] = state
	return state
}

func protectExpensiveRFRoutes(limiter *rfRequestLimiter, timeout time.Duration, apiKey string) gin.HandlerFunc {
	limiterMiddleware := limiter.middleware()
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost {
			c.Next()
			return
		}
		if _, protected := expensiveRFRoutes[c.Request.URL.Path]; !protected {
			c.Next()
			return
		}
		if apiKey != "" && !validAPIKey(c, apiKey) {
			c.Header("WWW-Authenticate", `Bearer realm="A.T.O.M RF API"`)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "valid RF API key required"})
			return
		}

		if timeout <= 0 {
			limiterMiddleware(c)
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), timeout)
		defer cancel()
		c.Request = c.Request.WithContext(ctx)
		limiterMiddleware(c)
	}
}

func validAPIKey(c *gin.Context, expected string) bool {
	provided := strings.TrimSpace(c.GetHeader("X-API-Key"))
	if authorization := strings.TrimSpace(c.GetHeader("Authorization")); strings.HasPrefix(strings.ToLower(authorization), "bearer ") {
		provided = strings.TrimSpace(authorization[len("bearer "):])
	}
	providedHash := sha256.Sum256([]byte(provided))
	expectedHash := sha256.Sum256([]byte(expected))
	return subtle.ConstantTimeCompare(providedHash[:], expectedHash[:]) == 1
}
