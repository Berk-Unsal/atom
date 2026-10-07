package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"hash/maphash"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
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
	"/api/sub-thz-reference":                    {},
	"/api/sub-thz-p1411-reference":              {},
	"/api/sub-thz-validation":                   {},
	"/api/sub-thz-material-reference":           {},
	"/api/sub-thz-reflection-reference":         {},
	"/api/coverage-surface":                     {},
	"/api/processes/batch-experiment/execution": {},
	"/api/analyze-sector":                       {},
	"/api/simulate":                             {},
	"/api/coverage-gaps":                        {},
	"/api/optimize-azimuth":                     {},
	"/api/evaluate-network":                     {},
	"/api/optimize-network":                     {},
	"/api/building-entry-analysis":              {},
	"/api/explain-network-cell":                 {},
	"/api/interference":                         {},
	"/api/recommend-sites":                      {},
	"/api/measurements/evaluate":                {},
}

type rfClientState struct {
	active          int
	ordinarySpent   int
	ordinaryHeld    int
	extraSpent      int
	extraHeld       int
	workflowCount   int
	workflowRecords map[string]*rfWorkflow
	windowStart     time.Time
	lastSeen        time.Time
}

type rfRequestLimiter struct {
	slots                chan struct{}
	perClientConcurrency int
	requestsPerMinute    int
	mu                   sync.Mutex
	clients              map[string]*rfClientState
	overflow             rfClientState
	now                  func() time.Time
	logger               *slog.Logger
	clientHashSeed       maphash.Seed
	requestSequence      atomic.Uint64
	workflows            map[string]*rfWorkflow
	expiries             rfWorkflowHeap
	expiryTimer          *time.Timer
	expiryWake           time.Time
	expiryEpoch          uint64
	workflowDisabled     bool
	currentContext       func() rfWorkflowContext
	capabilityRandom     func([]byte) (int, error)
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
		logger:               slog.Default(),
		clientHashSeed:       maphash.MakeSeed(),
	}
}

func (limiter *rfRequestLimiter) middleware() gin.HandlerFunc {
	return limiter.middlewareFor("RF analysis")
}

func (limiter *rfRequestLimiter) middlewareFor(resource string) gin.HandlerFunc {
	return func(c *gin.Context) {
		clientID := c.ClientIP()
		requestID := limiter.requestSequence.Add(1)
		release, remaining, resetSeconds, retryAfter, reason := limiter.acquire(clientID, resource)
		c.Header("RateLimit-Limit", strconv.Itoa(limiter.requestsPerMinute))
		c.Header("RateLimit-Remaining", strconv.Itoa(remaining))
		c.Header("RateLimit-Reset", strconv.Itoa(resetSeconds))
		if reason != "" {
			limiter.logDenial(c, resource, clientID, requestID, remaining, retryAfter, reason)
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
			limiter.logDenial(c, resource, clientID, requestID, remaining, 1, "capacity_busy")
			c.Header("Cache-Control", "no-store")
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": resource + " capacity is busy; retry shortly"})
		}
	}
}

func (limiter *rfRequestLimiter) logDenial(c *gin.Context, resource, clientID string, requestID uint64, remaining, retryAfter int, reason string) {
	// A process-local keyed hash correlates a bucket without logging peer addresses.
	// Log admission denials only; successful requests already have Gin access logs.
	limiter.logger.Warn("request admission denied",
		"rate_limit_class", resource, "operation", c.FullPath(),
		"request_id", requestID, "client_key_hash", strconv.FormatUint(maphash.String(limiter.clientHashSeed, clientID), 16),
		"allowed", false, "remaining", remaining, "retry_after_seconds", retryAfter, "reason", reason)
}

func (limiter *rfRequestLimiter) acquire(clientID string, resource string) (func(), int, int, int, string) {
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := limiter.now()
	state := limiter.clientState(clientID, now)
	if now.Sub(state.windowStart) >= time.Minute {
		state.windowStart = now
		state.ordinarySpent = 0
		state.extraSpent = 0
	}
	state.lastSeen = now
	// Round up: integer Retry-After must never advertise an expiry before reset.
	resetDuration := state.windowStart.Add(time.Minute).Sub(now)
	resetSeconds := int((resetDuration + time.Second - 1) / time.Second)
	if resetSeconds < 1 {
		resetSeconds = 1
	}
	if state.ordinarySpent+state.ordinaryHeld >= limiter.requestsPerMinute {
		return func() {}, 0, resetSeconds, resetSeconds, resource + " request budget exceeded; retry after the current rate-limit window"
	}

	state.ordinarySpent++
	remaining := limiter.requestsPerMinute - state.ordinarySpent - state.ordinaryHeld
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
			if state.active != 0 || state.workflowCount != 0 || (!oldestTime.IsZero() && !state.lastSeen.Before(oldestTime)) {
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
	limiter.clients[strings.Clone(clientID)] = state
	return state
}

func protectExpensiveRFRoutes(limiter *rfRequestLimiter, timeout time.Duration, apiKey string) gin.HandlerFunc {
	limiterMiddleware := limiter.workflowMiddleware(apiKey)
	return func(c *gin.Context) {
		if c.Request.Method == http.MethodDelete && c.Request.URL.Path == "/api/rf-workflows" {
			if apiKey != "" && !validAPIKey(c, apiKey) {
				c.Header("WWW-Authenticate", `Bearer realm="A.T.O.M RF API"`)
				c.AbortWithStatusJSON(401, gin.H{"error": "valid RF API key required"})
				return
			}
			c.Set("atom.rf.auth", sha256.Sum256([]byte(apiKey)))
			c.Next()
			return
		}
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
