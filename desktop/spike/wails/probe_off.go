//go:build !spikeprobe

package main

import (
	"context"
	"net/http"

	"github.com/wailsapp/wails/v2/pkg/logger"
)

const probeLogLevel = logger.ERROR

// Without -tags spikeprobe the probe is inert: no probe route, script or report.
type spikeProbe struct{}

func newSpikeProbe(*apiRouter) *spikeProbe                    { return &spikeProbe{} }
func (*spikeProbe) record(string, any)                        {}
func (*spikeProbe) sidecarReady(context.Context, *sidecar)    {}
func (*spikeProbe) domReady(context.Context)                  {}
func (*spikeProbe) flush()                                    {}
func (*spikeProbe) Middleware(next http.Handler) http.Handler { return next }
