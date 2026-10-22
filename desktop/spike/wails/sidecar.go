package main

// Spike-grade supervisor for the bundled A.T.O.M API executable. It speaks the
// backend's --desktop-control protocol (backend-go/desktop_control.go): fd 3
// carries the hello and EOF-on-host-death, fd 4 carries lifecycle events.

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

const (
	sidecarStartupTimeout  = 30 * time.Second
	sidecarShutdownTimeout = 30 * time.Second
)

type sidecarEvent struct {
	Event        string `json:"event"`
	Protocol     int    `json:"protocol"`
	Generation   string `json:"generation"`
	Address      string `json:"address"`
	PID          int    `json:"pid"`
	Version      string `json:"application_version"`
	Commit       string `json:"build_commit"`
	ModelVersion string `json:"model_version"`
	Dataset      *struct {
		Ready   bool   `json:"ready"`
		ID      string `json:"id"`
		Version string `json:"version"`
		Error   string `json:"error"`
	} `json:"dataset"`
	Error string `json:"error"`
}

type sidecarConfig struct {
	Executable     string
	DatasetDir     string
	AllowedOrigins []string
	Stderr         io.Writer
}

type sidecar struct {
	Generation string
	Token      string
	Address    string
	Listening  sidecarEvent
	Dataset    sidecarEvent

	cmd     *exec.Cmd
	control *os.File
	exited  chan error
	once    sync.Once
}

func randomHex(bytes int) (string, error) {
	buffer := make([]byte, bytes)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}

func startSidecar(config sidecarConfig) (*sidecar, error) {
	token, err := randomHex(32)
	if err != nil {
		return nil, err
	}
	generation, err := randomHex(8)
	if err != nil {
		return nil, err
	}
	controlRead, controlWrite, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	eventsRead, eventsWrite, err := os.Pipe()
	if err != nil {
		controlRead.Close()
		controlWrite.Close()
		return nil, err
	}
	cmd := exec.Command(config.Executable, "--desktop-control")
	cmd.Env = curatedSidecarEnv(config.DatasetDir)
	cmd.Stdout = config.Stderr
	cmd.Stderr = config.Stderr
	cmd.ExtraFiles = []*os.File{controlRead, eventsWrite}
	if err := cmd.Start(); err != nil {
		controlRead.Close()
		controlWrite.Close()
		eventsRead.Close()
		eventsWrite.Close()
		return nil, fmt.Errorf("start sidecar: %w", err)
	}
	controlRead.Close()
	eventsWrite.Close()

	child := &sidecar{Generation: generation, Token: token, cmd: cmd, control: controlWrite, exited: make(chan error, 1)}
	go func() { child.exited <- cmd.Wait() }()

	hello, _ := json.Marshal(map[string]any{
		"protocol":        1,
		"token":           token,
		"generation":      generation,
		"allowed_origins": config.AllowedOrigins,
	})
	if _, err := controlWrite.Write(append(hello, '\n')); err != nil {
		child.kill()
		return nil, fmt.Errorf("send hello: %w", err)
	}
	if err := child.awaitReady(eventsRead); err != nil {
		child.kill()
		return nil, err
	}
	return child, nil
}

func curatedSidecarEnv(datasetDir string) []string {
	env := []string{"GIN_MODE=release", "ATOM_DATASET_DIR=" + datasetDir}
	for _, key := range []string{"HOME", "TMPDIR", "LANG"} {
		if value := os.Getenv(key); value != "" {
			env = append(env, key+"="+value)
		}
	}
	return env
}

func (child *sidecar) awaitReady(events io.ReadCloser) error {
	type result struct{ err error }
	done := make(chan result, 1)
	go func() {
		scanner := bufio.NewScanner(events)
		reported := false
		for scanner.Scan() {
			var event sidecarEvent
			if err := json.Unmarshal(scanner.Bytes(), &event); err != nil || event.Generation != child.Generation {
				if !reported {
					done <- result{errors.New("sidecar sent an unexpected control event")}
					reported = true
				}
				continue
			}
			switch event.Event {
			case "listening":
				if !strings.HasPrefix(event.Address, "127.0.0.1:") || event.PID != child.cmd.Process.Pid {
					done <- result{fmt.Errorf("sidecar identity mismatch: %s pid %d", event.Address, event.PID)}
					reported = true
					continue
				}
				child.Address = event.Address
				child.Listening = event
			case "dataset":
				child.Dataset = event
			case "ready":
				if !reported {
					done <- result{nil}
					reported = true
				}
			case "failed":
				if !reported {
					done <- result{fmt.Errorf("sidecar failed: %s", event.Error)}
					reported = true
				}
			}
		}
		if !reported {
			done <- result{errors.New("sidecar closed its control channel before ready")}
		}
	}()
	select {
	case r := <-done:
		return r.err
	case err := <-child.exited:
		child.exited <- err
		return fmt.Errorf("sidecar exited during startup: %v", err)
	case <-time.After(sidecarStartupTimeout):
		return errors.New("sidecar startup timed out")
	}
}

// Stop asks for a graceful drain, then closes the control pipe (the same
// signal a crashed host produces) and kills only this child after the ceiling.
func (child *sidecar) Stop() error {
	var stopErr error
	child.once.Do(func() {
		_, _ = child.control.Write([]byte(`{"command":"shutdown"}` + "\n"))
		_ = child.control.Close()
		select {
		case stopErr = <-child.exited:
		case <-time.After(sidecarShutdownTimeout):
			_ = child.cmd.Process.Kill()
			stopErr = errors.Join(errors.New("sidecar drain timed out"), <-child.exited)
		}
	})
	return stopErr
}

func (child *sidecar) kill() {
	child.once.Do(func() {
		_ = child.control.Close()
		_ = child.cmd.Process.Kill()
		<-child.exited
	})
}
