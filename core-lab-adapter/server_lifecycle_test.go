package main

import (
	"io"
	"net"
	"net/http"
	"os"
	"testing"
	"time"
)

func TestServeHTTPServerDrainsInflightRequestOnShutdown(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		close(started)
		<-release
		_, _ = io.WriteString(w, "done")
	})}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	shutdown := make(chan os.Signal, 1)
	served := make(chan error, 1)
	go func() { served <- serveHTTPServer(server, listener, shutdown, time.Second) }()

	responseDone := make(chan error, 1)
	go func() {
		response, requestErr := http.Get("http://" + listener.Addr().String())
		if requestErr == nil {
			_, requestErr = io.ReadAll(response.Body)
			response.Body.Close()
		}
		responseDone <- requestErr
	}()
	<-started
	shutdown <- os.Interrupt
	select {
	case err := <-served:
		t.Fatalf("server returned before request drained: %v", err)
	case <-time.After(30 * time.Millisecond):
	}
	close(release)
	if err := <-responseDone; err != nil {
		t.Fatalf("in-flight request: %v", err)
	}
	if err := <-served; err != nil {
		t.Fatalf("serve: %v", err)
	}
}
