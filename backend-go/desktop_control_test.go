package main

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

const testDesktopToken = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

func testDesktopHelloLine(t *testing.T, mutate func(*desktopHello)) string {
	t.Helper()
	hello := desktopHello{
		Protocol:       desktopProtocolVersion,
		Token:          testDesktopToken,
		Generation:     "gen-1",
		AllowedOrigins: []string{"wails://wails"},
	}
	if mutate != nil {
		mutate(&hello)
	}
	data, err := json.Marshal(hello)
	if err != nil {
		t.Fatalf("marshal hello: %v", err)
	}
	return string(data) + "\n"
}

type lockedBuffer struct {
	mu   sync.Mutex
	data strings.Builder
}

func (buffer *lockedBuffer) Write(p []byte) (int, error) {
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	return buffer.data.Write(p)
}

func (buffer *lockedBuffer) events(t *testing.T) []desktopEvent {
	t.Helper()
	buffer.mu.Lock()
	defer buffer.mu.Unlock()
	var events []desktopEvent
	scanner := bufio.NewScanner(strings.NewReader(buffer.data.String()))
	for scanner.Scan() {
		var event desktopEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err != nil {
			t.Fatalf("decode event %q: %v", scanner.Text(), err)
		}
		events = append(events, event)
	}
	return events
}

func TestStartDesktopControlFromArgsIgnoresOtherModes(t *testing.T) {
	for _, args := range [][]string{nil, {"--resource-profile"}, {desktopControlFlag, "extra"}} {
		control, err := startDesktopControlFromArgs(args)
		if control != nil || err != nil {
			t.Fatalf("args %v: got control=%v err=%v, want desktop mode off", args, control, err)
		}
	}
}

func TestOpenDesktopControlValidatesHello(t *testing.T) {
	cases := []struct {
		name    string
		line    string
		wantErr string
	}{
		{"valid", testDesktopHelloLine(t, nil), ""},
		{"no origins", testDesktopHelloLine(t, func(h *desktopHello) { h.AllowedOrigins = nil }), ""},
		{"wrong protocol", testDesktopHelloLine(t, func(h *desktopHello) { h.Protocol = 2 }), "unsupported desktop protocol"},
		{"short token", testDesktopHelloLine(t, func(h *desktopHello) { h.Token = "abcd" }), "32 random bytes"},
		{"non-hex token", testDesktopHelloLine(t, func(h *desktopHello) { h.Token = strings.Repeat("zz", 32) }), "32 random bytes"},
		{"empty generation", testDesktopHelloLine(t, func(h *desktopHello) { h.Generation = "" }), "generation"},
		{"generation with path", testDesktopHelloLine(t, func(h *desktopHello) { h.Generation = "../x" }), "generation"},
		{"wildcard origin", testDesktopHelloLine(t, func(h *desktopHello) { h.AllowedOrigins = []string{"*"} }), "invalid desktop origin"},
		{"origin with path", testDesktopHelloLine(t, func(h *desktopHello) { h.AllowedOrigins = []string{"http://a.test/x"} }), "invalid desktop origin"},
		{"null origin", testDesktopHelloLine(t, func(h *desktopHello) { h.AllowedOrigins = []string{"null"} }), "invalid desktop origin"},
		{"unknown field", `{"protocol":1,"token":"` + testDesktopToken + `","generation":"g","extra":1}` + "\n", "unknown field"},
		{"not json", "hello\n", "decode desktop hello"},
		{"oversized", strings.Repeat("x", desktopControlLineLimit+10) + "\n", "exceeds limit"},
		{"eof before hello", "", "read desktop hello"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			control, err := openDesktopControl(strings.NewReader(tc.line), io.Discard, time.Second)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error = %v, want containing %q", err, tc.wantErr)
			}
			if control != nil {
				t.Fatal("control returned with error")
			}
		})
	}
}

func TestOpenDesktopControlTimesOutWithoutHello(t *testing.T) {
	reader, writer := io.Pipe()
	defer writer.Close()
	if _, err := openDesktopControl(reader, io.Discard, 20*time.Millisecond); err == nil || !strings.Contains(err.Error(), "timed out") {
		t.Fatalf("error = %v, want timeout", err)
	}
}

func TestDesktopControlParentEOFAndShutdownCommandStop(t *testing.T) {
	for _, tc := range []struct {
		name  string
		after func(*io.PipeWriter)
	}{
		{"eof", func(w *io.PipeWriter) { w.Close() }},
		{"shutdown command", func(w *io.PipeWriter) { io.WriteString(w, `{"command":"shutdown"}`+"\n") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			reader, writer := io.Pipe()
			defer writer.Close()
			go io.WriteString(writer, testDesktopHelloLine(t, nil))
			control, err := openDesktopControl(reader, io.Discard, time.Second)
			if err != nil {
				t.Fatalf("open: %v", err)
			}
			io.WriteString(writer, `{"command":"unknown"}`+"\n")
			select {
			case <-control.parentGone:
				t.Fatal("unknown command stopped the server")
			case <-time.After(20 * time.Millisecond):
			}
			go tc.after(writer)
			select {
			case <-control.parentGone:
			case <-time.After(time.Second):
				t.Fatal("parent loss was not observed")
			}
		})
	}
}

func TestRequireDesktopTransport(t *testing.T) {
	gin.SetMode(gin.TestMode)
	control := &desktopControl{
		hello:      desktopHello{AllowedOrigins: []string{"wails://wails"}},
		token:      []byte(testDesktopToken),
		listenAddr: "127.0.0.1:43210",
	}
	router := gin.New()
	router.Use(control.requireDesktopTransport())
	router.GET("/api/meta", func(c *gin.Context) {
		if c.GetHeader(desktopTokenHeader) != "" {
			t.Error("token header reached the handler")
		}
		c.Status(http.StatusNoContent)
	})
	cases := []struct {
		name   string
		host   string
		origin string
		token  string
		want   int
	}{
		{"authenticated without origin", "127.0.0.1:43210", "", testDesktopToken, http.StatusNoContent},
		{"authenticated declared origin", "127.0.0.1:43210", "wails://wails", testDesktopToken, http.StatusNoContent},
		{"missing token", "127.0.0.1:43210", "", "", http.StatusUnauthorized},
		{"wrong token", "127.0.0.1:43210", "", strings.Repeat("f", 64), http.StatusUnauthorized},
		{"token prefix", "127.0.0.1:43210", "", testDesktopToken[:63], http.StatusUnauthorized},
		{"dns rebinding host", "attacker.test:43210", "", testDesktopToken, http.StatusForbidden},
		{"localhost alias", "localhost:43210", "", testDesktopToken, http.StatusForbidden},
		{"other port", "127.0.0.1:8080", "", testDesktopToken, http.StatusForbidden},
		{"foreign origin", "127.0.0.1:43210", "https://attacker.test", testDesktopToken, http.StatusForbidden},
		{"vite origin not declared", "127.0.0.1:43210", "http://localhost:5173", testDesktopToken, http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/meta", nil)
			request.Host = tc.host
			if tc.origin != "" {
				request.Header.Set("Origin", tc.origin)
			}
			if tc.token != "" {
				request.Header.Set(desktopTokenHeader, tc.token)
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			if recorder.Code != tc.want {
				t.Fatalf("status = %d, want %d", recorder.Code, tc.want)
			}
		})
	}
}

func TestDesktopControlLifecycleEventsAndParentLossShutdown(t *testing.T) {
	reader, writer := io.Pipe()
	go io.WriteString(writer, testDesktopHelloLine(t, nil))
	events := &lockedBuffer{}
	control, err := openDesktopControl(reader, events, time.Second)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	listener, err := control.listen()
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if !strings.HasPrefix(listener.Addr().String(), "127.0.0.1:") || strings.HasSuffix(listener.Addr().String(), ":0") {
		t.Fatalf("listener address = %s, want allocated IPv4 loopback port", listener.Addr())
	}
	control.announceDataset(nil, os.ErrNotExist)

	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {})}
	served := make(chan error, 1)
	go func() { served <- control.serveUntilStopped(server, listener, make(chan os.Signal), time.Second) }()
	writer.Close()
	select {
	case err := <-served:
		if err != nil {
			t.Fatalf("serve: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("server kept running after the host control pipe closed")
	}

	got := events.events(t)
	wantOrder := []string{"listening", "dataset", "ready", "stopped"}
	if len(got) != len(wantOrder) {
		t.Fatalf("events = %+v, want %v", got, wantOrder)
	}
	for i, event := range got {
		if event.Event != wantOrder[i] || event.Protocol != desktopProtocolVersion || event.Generation != "gen-1" {
			t.Fatalf("event %d = %+v, want %s for gen-1", i, event, wantOrder[i])
		}
	}
	if got[0].Address != listener.Addr().String() || got[0].PID != os.Getpid() {
		t.Fatalf("listening event = %+v", got[0])
	}
	if got[1].Dataset == nil || got[1].Dataset.Ready || got[1].Dataset.Error != "dataset unavailable" {
		t.Fatalf("dataset event = %+v", got[1].Dataset)
	}
	if strings.Contains(events.data.String(), testDesktopToken) {
		t.Fatal("control events leaked the transport token")
	}
}
