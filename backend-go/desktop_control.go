package main

// Desktop control mode is the opt-in sidecar contract between this API
// executable and a desktop host (docs/desktop-architecture-design-plan.md).
// The host starts the executable with --desktop-control and two inherited
// pipes: the control input carries one hello line from the host, and its EOF
// means the host is gone; the control output carries newline-delimited
// lifecycle events back to the host. The transport credential only travels on
// the control input, never in arguments, environment, URLs, or logs.

import (
	"bufio"
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"regexp"
	"sync"
	"syscall"
	"time"

	"ankara-5g-raytracer/raytracer"

	"github.com/gin-gonic/gin"
)

const (
	desktopControlFlag        = "--desktop-control"
	desktopProtocolVersion    = 1
	desktopTokenHeader        = "X-Atom-Desktop-Token"
	desktopTokenBytes         = 32
	desktopControlLineLimit   = 4096
	desktopHelloTimeout       = 10 * time.Second
	desktopListenAddress      = "127.0.0.1:0"
	desktopTransportRejection = "desktop transport authentication failed"
)

var desktopGenerationPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

type desktopHello struct {
	Protocol       int      `json:"protocol"`
	Token          string   `json:"token"`
	Generation     string   `json:"generation"`
	AllowedOrigins []string `json:"allowed_origins"`
}

type desktopCommand struct {
	Command string `json:"command"`
}

type desktopDatasetStatus struct {
	Ready   bool   `json:"ready"`
	ID      string `json:"id,omitempty"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}

type desktopEvent struct {
	Event        string                `json:"event"`
	Protocol     int                   `json:"protocol"`
	Generation   string                `json:"generation"`
	Address      string                `json:"address,omitempty"`
	PID          int                   `json:"pid,omitempty"`
	Version      string                `json:"application_version,omitempty"`
	Commit       string                `json:"build_commit,omitempty"`
	ModelVersion string                `json:"model_version,omitempty"`
	Dataset      *desktopDatasetStatus `json:"dataset,omitempty"`
	Error        string                `json:"error,omitempty"`
}

type desktopControl struct {
	hello      desktopHello
	token      []byte
	listenAddr string

	writeMu sync.Mutex
	events  io.Writer

	parentGone     chan struct{}
	parentGoneOnce sync.Once
}

// startDesktopControlFromArgs returns nil when desktop mode was not requested.
func startDesktopControlFromArgs(args []string) (*desktopControl, error) {
	if len(args) != 1 || args[0] != desktopControlFlag {
		return nil, nil
	}
	input, output, err := openDesktopControlPipes()
	if err != nil {
		return nil, err
	}
	return openDesktopControl(input, output, desktopHelloTimeout)
}

func openDesktopControl(input io.Reader, events io.Writer, timeout time.Duration) (*desktopControl, error) {
	reader := bufio.NewReaderSize(input, desktopControlLineLimit)
	type lineResult struct {
		line []byte
		err  error
	}
	received := make(chan lineResult, 1)
	go func() {
		line, err := readDesktopControlLine(reader)
		received <- lineResult{line, err}
	}()
	var line []byte
	select {
	case result := <-received:
		if result.err != nil {
			return nil, fmt.Errorf("read desktop hello: %w", result.err)
		}
		line = result.line
	case <-time.After(timeout):
		return nil, errors.New("read desktop hello: timed out")
	}
	hello, err := parseDesktopHello(line)
	if err != nil {
		return nil, err
	}
	token, _ := hex.DecodeString(hello.Token)
	control := &desktopControl{
		hello:      hello,
		token:      []byte(hex.EncodeToString(token)),
		events:     events,
		parentGone: make(chan struct{}),
	}
	go control.watchParent(reader)
	return control, nil
}

func readDesktopControlLine(reader *bufio.Reader) ([]byte, error) {
	line, err := reader.ReadSlice('\n')
	if errors.Is(err, bufio.ErrBufferFull) {
		return nil, errors.New("control line exceeds limit")
	}
	return line, err
}

func parseDesktopHello(line []byte) (desktopHello, error) {
	var hello desktopHello
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&hello); err != nil {
		return desktopHello{}, fmt.Errorf("decode desktop hello: %w", err)
	}
	if hello.Protocol != desktopProtocolVersion {
		return desktopHello{}, fmt.Errorf("unsupported desktop protocol %d", hello.Protocol)
	}
	token, err := hex.DecodeString(hello.Token)
	if err != nil || len(token) != desktopTokenBytes {
		return desktopHello{}, errors.New("desktop token must be 32 random bytes in hex")
	}
	if !desktopGenerationPattern.MatchString(hello.Generation) {
		return desktopHello{}, errors.New("desktop generation must be 1-64 letters, digits or hyphens")
	}
	for _, origin := range hello.AllowedOrigins {
		if !validDesktopOrigin(origin) {
			return desktopHello{}, fmt.Errorf("invalid desktop origin %q", origin)
		}
	}
	return hello, nil
}

func validDesktopOrigin(origin string) bool {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.Host == "*" {
		return false
	}
	return parsed.Path == "" && parsed.RawQuery == "" && parsed.Fragment == "" && parsed.User == nil
}

// watchParent treats EOF, a read error, or an explicit shutdown command on the
// control input as a request to stop. Unknown commands are logged and ignored.
func (control *desktopControl) watchParent(reader *bufio.Reader) {
	defer control.signalParentGone()
	for {
		line, err := readDesktopControlLine(reader)
		if err != nil {
			return
		}
		var command desktopCommand
		if json.Unmarshal(line, &command) == nil && command.Command == "shutdown" {
			return
		}
		log.Printf("desktop control: ignored unknown command")
	}
}

func (control *desktopControl) signalParentGone() {
	control.parentGoneOnce.Do(func() { close(control.parentGone) })
}

func (control *desktopControl) emit(event desktopEvent) {
	event.Protocol = desktopProtocolVersion
	event.Generation = control.hello.Generation
	data, err := json.Marshal(event)
	if err != nil {
		return
	}
	control.writeMu.Lock()
	defer control.writeMu.Unlock()
	// A failed write means the host is gone; control-input EOF drives shutdown.
	_, _ = control.events.Write(append(data, '\n'))
}

func (control *desktopControl) listen() (net.Listener, error) {
	listener, err := net.Listen("tcp4", desktopListenAddress)
	if err != nil {
		control.emit(desktopEvent{Event: "failed", Error: "listen failed"})
		return nil, err
	}
	control.listenAddr = listener.Addr().String()
	control.emit(desktopEvent{
		Event:        "listening",
		Address:      control.listenAddr,
		PID:          os.Getpid(),
		Version:      appVersion,
		Commit:       buildCommit,
		ModelVersion: modelVersion,
	})
	return listener, nil
}

func (control *desktopControl) announceDataset(pack *raytracer.DatasetPack, loadErr error) {
	status := desktopDatasetStatus{}
	if loadErr != nil || pack == nil {
		status.Error = "dataset unavailable"
	} else {
		status.Ready = pack.BuildingIndex != nil && pack.BuildingIndex.Len() > 0 && len(pack.Towers) > 0
		status.ID = pack.Manifest.ID
		status.Version = pack.Manifest.Version
	}
	control.emit(desktopEvent{Event: "dataset", Dataset: &status})
}

// requireDesktopTransport authenticates every request in desktop mode. The
// Host must name the exact loopback listener, a present Origin must be one the
// host declared, and the per-generation token must match. CORS is not
// authentication, so a request without Origin still needs the token.
func (control *desktopControl) requireDesktopTransport() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Host != control.listenAddr || !control.originAllowed(c.GetHeader("Origin")) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": desktopTransportRejection})
			return
		}
		supplied := []byte(c.GetHeader(desktopTokenHeader))
		if subtle.ConstantTimeCompare(supplied, control.token) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": desktopTransportRejection})
			return
		}
		c.Request.Header.Del(desktopTokenHeader)
		c.Next()
	}
}

func (control *desktopControl) originAllowed(origin string) bool {
	if origin == "" {
		return true
	}
	for _, allowed := range control.hello.AllowedOrigins {
		if origin == allowed {
			return true
		}
	}
	return false
}

func (control *desktopControl) serve(server *http.Server, listener net.Listener) error {
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	return control.serveUntilStopped(server, listener, signals, gracefulShutdownTimeout)
}

func (control *desktopControl) serveUntilStopped(server *http.Server, listener net.Listener, signals <-chan os.Signal, timeout time.Duration) error {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	shutdown := make(chan os.Signal, 1)
	go func() {
		select {
		case received := <-signals:
			shutdown <- received
		case <-control.parentGone:
			shutdown <- syscall.SIGTERM
		case <-ctx.Done():
		}
	}()
	control.emit(desktopEvent{Event: "ready"})
	err := serveHTTPServer(server, listener, shutdown, timeout)
	if err != nil {
		control.emit(desktopEvent{Event: "stopped", Error: "server stopped with an error"})
		return err
	}
	control.emit(desktopEvent{Event: "stopped"})
	return nil
}
