package main

import (
	"container/heap"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"hash/maphash"
	"strconv"
	"sync"
	"time"

	"ankara-5g-raytracer/raytracer"
	"github.com/gin-gonic/gin"
)

const rfBudgetPolicy = "bounded-followups-v1"
const rfExtraLimit = 8
const rfMaxChildren = 8
const rfWorkflowContextKey = "atom.rf.workflow"

type rfWorkflowContext struct {
	Identity  [32]byte
	Buildings *raytracer.BuildingIndex
}
type rfWorkflow struct {
	id                       string
	owner                    *rfClientState
	auth, context, parent    [32]byte
	root, protocol, endpoint string
	count                    int
	extraMask, used          uint8
	hashes                   [rfMaxChildren][32]byte
	admitted, idle, absolute time.Time
	pending                  bool
	heapIndex                int
}
type rfWorkflowHeap []*rfWorkflow

func (h rfWorkflowHeap) Len() int           { return len(h) }
func (h rfWorkflowHeap) Less(i, j int) bool { return h[i].expiry().Before(h[j].expiry()) }
func (h rfWorkflowHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].heapIndex = i
	h[j].heapIndex = j
}
func (h *rfWorkflowHeap) Push(x any) { r := x.(*rfWorkflow); r.heapIndex = len(*h); *h = append(*h, r) }
func (h *rfWorkflowHeap) Pop() any {
	a := *h
	r := a[len(a)-1]
	a[len(a)-1] = nil
	*h = a[:len(a)-1]
	r.heapIndex = -1
	return r
}
func (r *rfWorkflow) expiry() time.Time {
	if r.absolute.Before(r.idle) {
		return r.absolute
	}
	return r.idle
}
func (r *rfWorkflow) remaining() int {
	n := 0
	for i := 0; i < r.count; i++ {
		if r.used&(1<<i) == 0 {
			n++
		}
	}
	return n
}

type rfWorkflowRequest struct {
	limiter     *rfRequestLimiter
	state       *rfClientState
	context     rfWorkflowContext
	auth        [32]byte
	admitted    time.Time
	intent      string
	record      *rfWorkflow
	child       bool
	index       int
	expected    [32]byte
	verified    bool
	pendingStop func() bool
	requestID   uint64
}

func rfRequest(c *gin.Context) *rfWorkflowRequest {
	v, _ := c.Get(rfWorkflowContextKey)
	r, _ := v.(*rfWorkflowRequest)
	return r
}
func (l *rfRequestLimiter) contextSnapshot() rfWorkflowContext {
	if l.currentContext != nil {
		return l.currentContext()
	}
	return rfWorkflowContext{}
}
func ceilRFSeconds(d time.Duration) int {
	if d <= 0 {
		return 1
	}
	return int((d + time.Second - 1) / time.Second)
}
func (l *rfRequestLimiter) resetState(s *rfClientState, now time.Time) {
	if now.Sub(s.windowStart) >= time.Minute {
		s.windowStart = now
		s.ordinarySpent = 0
		s.extraSpent = 0
	}
	s.lastSeen = now
}
func (l *rfRequestLimiter) ordinaryCharge(s *rfClientState) bool {
	if s.ordinarySpent+s.ordinaryHeld >= l.requestsPerMinute {
		return false
	}
	s.ordinarySpent++
	return true
}
func (l *rfRequestLimiter) policyHeaders(c *gin.Context, s *rfClientState) {
	c.Header("RateLimit-Limit", strconv.Itoa(l.requestsPerMinute))
	c.Header("RateLimit-Remaining", strconv.Itoa(max(0, l.requestsPerMinute-s.ordinarySpent-s.ordinaryHeld)))
	reset := strconv.Itoa(ceilRFSeconds(s.windowStart.Add(time.Minute).Sub(l.now())))
	c.Header("RateLimit-Reset", reset)
	if !l.workflowDisabled {
		c.Header("RF-Budget-Policy", rfBudgetPolicy)
		c.Header("RF-Followup-Limit", "8")
		extraAvailable := max(0, rfExtraLimit-s.extraSpent-s.extraHeld)
		if s == &l.overflow {
			extraAvailable = 0
		}
		c.Header("RF-Followup-Remaining", strconv.Itoa(extraAvailable))
		c.Header("RF-Followup-Reset", reset)
	}
}
func (l *rfRequestLimiter) stateRetry() int {
	if len(l.expiries) > 0 {
		return ceilRFSeconds(l.expiries[0].expiry().Sub(l.now()))
	}
	return 1
}
func (l *rfRequestLimiter) retry(s *rfClientState) int {
	next := s.windowStart.Add(time.Minute)
	for _, r := range s.workflowRecords {
		if r.expiry().Before(next) {
			next = r.expiry()
		}
	}
	return ceilRFSeconds(next.Sub(l.now()))
}
func (l *rfRequestLimiter) workflowEvent(c *gin.Context, r *rfWorkflowRequest, event string, status int) {
	// Called with mu held: one consistent snapshot, no bearer token or peer address.
	id := ""
	remaining := 0
	expires := 0
	funding := "ordinary"
	if r.record != nil {
		sum := sha256.Sum256([]byte(r.record.id))
		id = hex.EncodeToString(sum[:8])
		remaining = r.record.remaining()
		expires = ceilRFSeconds(r.record.expiry().Sub(l.now()))
		if r.child && r.record.extraMask&(1<<r.index) != 0 {
			funding = "extra"
		}
	}
	class := "ordinary"
	if r.intent != "" {
		class = "root"
	}
	if r.child {
		class = "child"
	}
	retry := 0
	if status == 429 {
		retry = l.retry(r.state)
		if event == "client_busy" || event == "global_busy" {
			retry = 1
		}
	}
	l.logger.Info("RF budget policy", "rate_limit_class", "RF analysis", "request_id", r.requestID, "allowed", status >= 200 && status < 300, "remaining", max(0, l.requestsPerMinute-r.state.ordinarySpent-r.state.ordinaryHeld), "retry_after_seconds", retry, "policy", rfBudgetPolicy, "operation", c.Request.URL.Path, "classification", class, "client_key_hash", strconv.FormatUint(maphash.String(l.clientHashSeed, c.ClientIP()), 16), "event", event, "status", status, "workflow_hash", id, "funding", funding, "ordinary_available", l.requestsPerMinute-r.state.ordinarySpent-r.state.ordinaryHeld, "ordinary_held", r.state.ordinaryHeld, "extra_available", rfExtraLimit-r.state.extraSpent-r.state.extraHeld, "extra_held", r.state.extraHeld, "remaining_children", remaining, "expiry_seconds", expires)
}
func validRFWorkflowID(id string) bool {
	if len(id) != 32 {
		return false
	}
	for _, v := range id {
		if !(v >= '0' && v <= '9' || v >= 'a' && v <= 'f') {
			return false
		}
	}
	return true
}

// Return literals, never substrings backed by attacker-controlled URI/header buffers.
func workflowRoot(path string) string {
	switch path {
	case "/api/evaluate-network":
		return "/api/evaluate-network"
	case "/api/optimize-network":
		return "/api/optimize-network"
	case "/api/optimize-azimuth":
		return "/api/optimize-azimuth"
	}
	return ""
}
func workflowFamily(path string) (string, string) {
	switch path {
	case "/api/evaluate-network", "/api/optimize-network":
		return "network-maps-v1", "/api/simulate"
	case "/api/optimize-azimuth":
		return "azimuth-sector-v1", "/api/analyze-sector"
	}
	return "", ""
}

func (l *rfRequestLimiter) workflowMiddleware(apiKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		r := &rfWorkflowRequest{limiter: l, context: l.contextSnapshot(), auth: sha256.Sum256([]byte(apiKey)), requestID: l.requestSequence.Add(1)}
		intent, id, index := c.GetHeader("RF-Workflow"), c.GetHeader("RF-Workflow-ID"), c.GetHeader("RF-Workflow-Index")
		status, reason := 0, ""
		family, _ := workflowFamily(c.Request.URL.Path)
		for _, name := range []string{"RF-Workflow", "RF-Workflow-ID", "RF-Workflow-Index"} {
			values := c.Request.Header.Values(name)
			if len(values) > 1 || len(values) == 1 && values[0] == "" {
				status = 400
				reason = "malformed workflow metadata"
			}
		}
		if intent != "" && (intent != family || id != "" || index != "") || (id == "") != (index == "") {
			status = 400
			reason = "malformed workflow metadata"
		}
		childIndex, err := strconv.Atoi(index)
		if id != "" && (!validRFWorkflowID(id) || err != nil || childIndex < 0 || childIndex >= rfMaxChildren || strconv.Itoa(childIndex) != index) {
			status = 400
			reason = "invalid workflow ID or index"
		}
		l.mu.Lock()
		now := l.now()
		l.expireDue(now)
		r.admitted = now
		r.state = l.clientState(c.ClientIP(), now)
		l.resetState(r.state, now)
		if status == 0 && id != "" {
			record := l.workflows[id]
			validVersion := true
			if record != nil {
				version, endpoint := workflowFamily(record.root)
				validVersion = version != "" && record.protocol == version && record.endpoint == endpoint
			}
			switch {
			case l.workflowDisabled || record == nil || record.pending:
				status = 410
				reason = "workflow missing or expired"
			case record.owner != r.state || record.auth != r.auth || record.endpoint != c.Request.URL.Path:
				status = 403
				reason = "workflow owner or operation mismatch"
			case !validVersion:
				l.retire(record, "unsupported_version")
				status = 400
				reason = "unsupported workflow version"
			case childIndex >= record.count:
				status = 400
				reason = "invalid workflow index"
			case record.context != r.context.Identity:
				l.retire(record)
				status = 409
				reason = "stale workflow context"
			case record.used&(1<<childIndex) != 0:
				status = 409
				reason = "workflow slot already consumed"
			default:
				r.child = true
				r.index = childIndex
				r.record = record
				r.expected = record.hashes[childIndex]
				record.used |= 1 << childIndex
				if record.extraMask&(1<<childIndex) != 0 {
					r.state.extraHeld--
					r.state.extraSpent++
				} else {
					r.state.ordinaryHeld--
					r.state.ordinarySpent++
				}
				// No indexed record without a held obligation; the request owns its receipt.
				if record.remaining() == 0 {
					l.removeRecord(record)
				} else {
					if deadline, ok := c.Request.Context().Deadline(); ok && deadline.After(record.idle) {
						record.idle = deadline
					}
					heap.Fix(&l.expiries, record.heapIndex)
				}
				l.workflowEvent(c, r, "claim", 200)
			}
		}
		if !r.child && !l.ordinaryCharge(r.state) {
			status = 429
			reason = "RF analysis request budget exceeded; retry after the current rate-limit window"
		}
		if status == 0 && intent != "" {
			if l.workflowDisabled {
				status = 400
				reason = "workflow policy disabled"
			} else {
				r.intent = intent
			}
		}
		l.policyHeaders(c, r.state)
		retry := 0
		if status == 429 {
			retry = l.retry(r.state)
		}
		if status != 0 {
			l.workflowEvent(c, r, reason, status)
			l.scheduleExpiry()
			l.mu.Unlock()
			c.Header("Cache-Control", "no-store")
			if retry > 0 {
				c.Header("Retry-After", strconv.Itoa(retry))
			}
			c.AbortWithStatusJSON(status, gin.H{"error": reason})
			return
		}
		c.Set(rfWorkflowContextKey, r)
		if r.state.active >= l.perClientConcurrency {
			l.finishWorkflow(c, r, false)
			l.workflowEvent(c, r, "client_busy", 429)
			r.record = nil
			r.expected = [32]byte{}
			l.mu.Unlock()
			c.Header("Cache-Control", "no-store")
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(429, gin.H{"error": "another RF analysis is already running for this client"})
			return
		}
		r.state.active++
		if r.intent != "" {
			l.workflowEvent(c, r, "root_admitted", 200)
		}
		l.scheduleExpiry()
		l.mu.Unlock()
		var once sync.Once
		release := func() { once.Do(func() { l.mu.Lock(); r.state.active--; r.state.lastSeen = l.now(); l.mu.Unlock() }) }
		success := false
		defer func() {
			l.mu.Lock()
			l.finishWorkflow(c, r, success && c.Request.Context().Err() == nil && len(c.Errors) == 0)
			l.mu.Unlock()
			release()
		}()
		select {
		case l.slots <- struct{}{}:
			defer func() { <-l.slots }()
			c.Next()
			success = c.Writer.Status() >= 200 && c.Writer.Status() < 300 && !c.IsAborted()
		default:
			l.mu.Lock()
			l.workflowEvent(c, r, "global_busy", 429)
			l.mu.Unlock()
			c.Header("Cache-Control", "no-store")
			c.Header("Retry-After", "1")
			c.AbortWithStatusJSON(429, gin.H{"error": "RF analysis capacity is busy; retry shortly"})
		}
	}
}
func (l *rfRequestLimiter) removeRecord(r *rfWorkflow) {
	if r.heapIndex < 0 {
		return
	}
	heap.Remove(&l.expiries, r.heapIndex)
	delete(l.workflows, r.id)
	delete(r.owner.workflowRecords, r.id)
	r.owner.workflowCount--
}
func (l *rfRequestLimiter) retire(r *rfWorkflow, reason ...string) {
	if r.heapIndex < 0 {
		return
	}
	for i := 0; i < r.count; i++ {
		if r.used&(1<<i) == 0 {
			if r.extraMask&(1<<i) != 0 {
				r.owner.extraHeld--
			} else {
				r.owner.ordinaryHeld--
			}
			r.used |= 1 << i
		}
	}
	l.removeRecord(r)
	cause := "retired"
	if len(reason) > 0 {
		cause = reason[0]
	}
	sum := sha256.Sum256([]byte(r.id))
	l.logger.Info("RF workflow retired", "policy", rfBudgetPolicy, "event", cause, "workflow_hash", hex.EncodeToString(sum[:8]), "ordinary_held", r.owner.ordinaryHeld, "extra_held", r.owner.extraHeld)
}
func (l *rfRequestLimiter) expireDue(now time.Time) {
	for len(l.expiries) > 0 && !now.Before(l.expiries[0].expiry()) {
		l.retire(l.expiries[0], "expiry")
	}
}
func (l *rfRequestLimiter) scheduleExpiry() {
	next := time.Time{}
	if len(l.expiries) > 0 {
		next = l.expiries[0].expiry()
	}
	if l.expiryTimer != nil && next.Equal(l.expiryWake) {
		return
	}
	l.expiryEpoch++
	epoch := l.expiryEpoch
	if l.expiryTimer != nil {
		l.expiryTimer.Stop()
		l.expiryTimer = nil
	}
	l.expiryWake = next
	if next.IsZero() {
		return
	}
	delay := next.Sub(l.now())
	if delay < 0 {
		delay = 0
	}
	l.expiryTimer = time.AfterFunc(delay, func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		if epoch != l.expiryEpoch {
			return
		}
		l.expiryTimer = nil
		l.expireDue(l.now())
		l.scheduleExpiry()
	})
}
func (l *rfRequestLimiter) workflowPolicyEnabled() bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return !l.workflowDisabled
}
func (l *rfRequestLimiter) finishWorkflow(c *gin.Context, r *rfWorkflowRequest, success bool) {
	if r.pendingStop != nil {
		r.pendingStop()
	}
	if r.record == nil {
		return
	}
	record := r.record
	if !success || r.child && !r.verified || record.pending {
		l.retire(record)
		l.workflowEvent(c, r, "retire_failure", c.Writer.Status())
	} else if r.child && record.heapIndex >= 0 {
		record.idle = l.now().Add(time.Minute)
		heap.Fix(&l.expiries, record.heapIndex)
	}
	l.scheduleExpiry()
}
func prebookRFWorkflow(c *gin.Context, count int, parent any) bool {
	r := rfRequest(c)
	if r == nil || r.intent == "" {
		return true
	}
	l := r.limiter
	l.mu.Lock()
	defer l.mu.Unlock()
	defer l.scheduleExpiry()
	l.expireDue(l.now())
	if r.state == &l.overflow || l.workflowDisabled || count < 1 || count > rfMaxChildren {
		c.Header("Retry-After", strconv.Itoa(l.stateRetry()))
		c.AbortWithStatusJSON(503, gin.H{"error": "workflow state capacity unavailable"})
		l.workflowEvent(c, r, "state_capacity", 503)
		return false
	}
	e := min(count, rfExtraLimit-r.state.extraSpent-r.state.extraHeld)
	if count-e > l.requestsPerMinute-r.state.ordinarySpent-r.state.ordinaryHeld {
		l.policyHeaders(c, r.state)
		c.Header("Cache-Control", "no-store")
		c.Header("Retry-After", strconv.Itoa(l.retry(r.state)))
		c.AbortWithStatusJSON(429, gin.H{"error": "RF workflow child reservation budget exceeded"})
		l.workflowEvent(c, r, "reservation_shortage", 429)
		return false
	}
	random := l.capabilityRandom
	if random == nil {
		random = rand.Read
	}
	var bits [16]byte
	n, err := random(bits[:])
	id := hex.EncodeToString(bits[:])
	if n != len(bits) || err != nil || l.workflows[id] != nil {
		c.Header("Retry-After", strconv.Itoa(l.stateRetry()))
		c.AbortWithStatusJSON(503, gin.H{"error": "workflow state allocation unavailable"})
		return false
	}
	protocol, endpoint := workflowFamily(c.Request.URL.Path)
	record := &rfWorkflow{id: id, owner: r.state, auth: r.auth, context: r.context.Identity, root: workflowRoot(c.Request.URL.Path), protocol: protocol, endpoint: endpoint, count: count, admitted: r.admitted, absolute: r.admitted.Add(time.Duration(count+1) * time.Minute), pending: true, heapIndex: -1}
	record.idle = l.now().Add(time.Minute)
	if deadline, ok := c.Request.Context().Deadline(); ok {
		record.idle = deadline
	}
	data, err := json.Marshal(parent)
	if err != nil {
		c.AbortWithStatusJSON(500, gin.H{"error": "workflow identity unavailable"})
		return false
	}
	record.parent = sha256.Sum256(data)
	record.extraMask = uint8((1 << e) - 1)
	r.state.extraHeld += e
	r.state.ordinaryHeld += count - e
	r.state.workflowCount++
	if l.workflows == nil {
		l.workflows = make(map[string]*rfWorkflow)
	}
	l.workflows[id] = record
	if r.state.workflowRecords == nil {
		r.state.workflowRecords = make(map[string]*rfWorkflow)
	}
	r.state.workflowRecords[id] = record
	heap.Push(&l.expiries, record)
	r.record = record
	r.pendingStop = context.AfterFunc(c.Request.Context(), func() {
		l.mu.Lock()
		defer l.mu.Unlock()
		if record.pending {
			l.retire(record, "pending_cancel")
			l.scheduleExpiry()
		}
	})
	l.policyHeaders(c, r.state)
	l.scheduleExpiry()
	l.workflowEvent(c, r, "reserved", 200)
	return true
}

// Separate versioned authorization hashes preserve public scientific identities.
func rfChildDigest(input raytracer.StaticSimulationRequestInput, endpoint string, index int) ([32]byte, error) {
	effective := input.ToRequest()
	legacy := input
	legacy.RFProfile = nil
	data, err := json.Marshal(struct {
		Version           string
		Endpoint          string
		Index             int
		Effective, Legacy raytracer.StaticSimulationRequest
		Profile           *raytracer.CellRFProfileInput
	}{"rf-child-v1", endpoint, index, effective, legacy.ToRequest(), input.RFProfile})
	return sha256.Sum256(data), err
}
func verifyRFChild(c *gin.Context, input raytracer.StaticSimulationRequestInput) bool {
	r := rfRequest(c)
	if r == nil || !r.child {
		return true
	}
	digest, err := rfChildDigest(input, c.Request.URL.Path, r.index)
	l := r.limiter
	l.mu.Lock()
	defer l.mu.Unlock()
	if r.context.Identity != l.contextSnapshot().Identity {
		l.retire(r.record)
		c.AbortWithStatusJSON(409, gin.H{"error": "stale workflow context"})
		return false
	}
	if err != nil || digest != r.expected {
		l.retire(r.record)
		c.AbortWithStatusJSON(400, gin.H{"error": "workflow child input mismatch"})
		return false
	}
	r.verified = true
	return true
}
func issueRFWorkflow(c *gin.Context, children []raytracer.StaticSimulationRequestInput, identity string, runErr error) bool {
	r := rfRequest(c)
	if r == nil || r.intent == "" || runErr != nil {
		return true
	}
	l := r.limiter
	l.mu.Lock()
	defer l.mu.Unlock()
	record := r.record
	if record == nil || record.heapIndex < 0 || len(children) != record.count || c.Request.Context().Err() != nil || r.context.Identity != l.contextSnapshot().Identity {
		if record != nil {
			l.retire(record)
		}
		c.AbortWithStatusJSON(409, gin.H{"error": "workflow result context unavailable"})
		return false
	}
	for i, input := range children {
		digest, err := rfChildDigest(input, record.endpoint, i)
		if err != nil {
			l.retire(record)
			c.AbortWithStatusJSON(500, gin.H{"error": "workflow child identity unavailable"})
			return false
		}
		record.hashes[i] = digest
	}
	record.parent = sha256.Sum256(append(record.parent[:], []byte(identity)...))
	record.pending = false
	if r.pendingStop != nil {
		r.pendingStop()
	}
	record.idle = l.now().Add(time.Minute)
	heap.Fix(&l.expiries, record.heapIndex)
	l.scheduleExpiry()
	l.policyHeaders(c, r.state)
	c.Header("RF-Workflow-ID", record.id)
	c.Header("RF-Workflow-Remaining", strconv.Itoa(record.count))
	c.Header("RF-Workflow-Expires", strconv.Itoa(ceilRFSeconds(record.expiry().Sub(l.now()))))
	l.workflowEvent(c, r, "issued", 200)
	return true
}
func networkRFChildren(input raytracer.NetworkOptimizationRequestInput, result *raytracer.NetworkOptimizationResponse) []raytracer.StaticSimulationRequestInput {
	req := input.ToRequest()
	children := make([]raytracer.StaticSimulationRequestInput, len(req.Towers))
	angles := map[string]float64{}
	if result != nil {
		for _, t := range result.OptimizedTowers {
			angles[t.ID] = t.OptimalAzimuth
		}
	}
	for i, t := range req.Towers {
		angle := t.AzimuthDeg
		if result != nil {
			v, ok := angles[t.ID]
			if !ok {
				return nil
			}
			angle = v
		}
		children[i] = raytracer.StaticSimulationRequestInput{TowerLon: rfPointer(t.TowerLon), TowerLat: rfPointer(t.TowerLat), AzimuthDeg: rfPointer(angle), Rays: rfPointer(req.Rays), RadiusMeters: rfPointer(req.RadiusMeters), FrequencyGHz: rfPointer(req.FrequencyGHz), TxPowerDBm: rfPointer(req.TxPowerDBm), BeamWidthDeg: rfPointer(req.BeamWidthDeg), CalibrationOffsetDB: rfPointer(req.CalibrationOffsetDB), PropagationModelID: input.PropagationModelID, RFProfile: input.Towers[i].RFProfile}
	}
	return children
}
func workflowBuildings(c *gin.Context, fallback func() *raytracer.BuildingIndex) *raytracer.BuildingIndex {
	if r := rfRequest(c); r != nil && r.context.Buildings != nil {
		return r.context.Buildings
	}
	return fallback()
}
func (l *rfRequestLimiter) cleanupWorkflow(c *gin.Context) {
	id := c.GetHeader("RF-Workflow-ID")
	if !validRFWorkflowID(id) || c.GetHeader("RF-Workflow") != "" || c.GetHeader("RF-Workflow-Index") != "" {
		c.AbortWithStatusJSON(400, gin.H{"error": "invalid workflow cleanup metadata"})
		return
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.expireDue(l.now())
	record := l.workflows[id]
	if record == nil {
		c.Status(404)
		l.scheduleExpiry()
		return
	}
	auth, _ := c.Get("atom.rf.auth")
	if l.clients[c.ClientIP()] != record.owner || auth != record.auth {
		c.Status(403)
		return
	}
	l.retire(record)
	l.policyHeaders(c, record.owner)
	l.scheduleExpiry()
	c.Status(204)
}

// Used for explicit rollback, never a Cell-cap or budget-enlargement switch.
func (l *rfRequestLimiter) disableWorkflowPolicy() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.workflowDisabled = true
	for len(l.expiries) > 0 {
		l.retire(l.expiries[0])
	}
	for _, s := range l.clients {
		s.ordinarySpent = min(l.requestsPerMinute, s.ordinarySpent+s.extraSpent)
		s.extraSpent = 0
	}
	l.scheduleExpiry()
}
func rfPointer[T any](v T) *T { return &v }
