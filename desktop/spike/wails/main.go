package main

import (
	"context"
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// frontend-dist is a staged copy of frontend-react/dist made by
// scripts/desktop-spike-wails.sh; it is never committed.
//
//go:embed all:frontend-dist
var embeddedAssets embed.FS

// Wails v2 serves the app from wails://wails on macOS and Linux.
var appOrigins = []string{"wails://wails"}

func main() {
	executable, err := os.Executable()
	if err != nil {
		log.Fatalf("resolve executable: %v", err)
	}
	executableDir := filepath.Dir(executable)
	datasetDir := os.Getenv("ATOM_SPIKE_DATASET_DIR")
	if datasetDir == "" {
		datasetDir = filepath.Join(executableDir, "..", "Resources", "data-pipeline")
	}
	assets, err := fs.Sub(embeddedAssets, "frontend-dist")
	if err != nil {
		log.Fatalf("frontend assets: %v", err)
	}

	router := newAPIRouter(appOrigins)
	probe := newSpikeProbe(router)
	var child *sidecar

	err = wails.Run(&options.App{
		Title:     "A.T.O.M (Wails spike)",
		Width:     1440,
		Height:    900,
		MinWidth:  1024,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: assetserver.ChainMiddleware(probe.Middleware, router.Middleware),
		},
		BindingsAllowedOrigins: "wails://wails",
		LogLevel:               probeLogLevel,
		LogLevelProduction:     probeLogLevel,
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId: "org.atom.desktop.wails-spike",
			OnSecondInstanceLaunch: func(options.SecondInstanceData) {
				probe.record("second_instance_focused", true)
			},
		},
		OnStartup: func(ctx context.Context) {
			child, err = startSidecar(sidecarConfig{
				Executable:     filepath.Join(executableDir, "atom-api"),
				DatasetDir:     datasetDir,
				AllowedOrigins: appOrigins,
				Stderr:         os.Stderr,
			})
			if err != nil {
				log.Printf("sidecar startup failed: %v", err)
				probe.record("sidecar_error", err.Error())
				runtime.Quit(ctx)
				return
			}
			router.switchTo(child)
			probe.sidecarReady(ctx, child)
		},
		OnDomReady: func(ctx context.Context) { probe.domReady(ctx) },
		OnShutdown: func(context.Context) {
			if child != nil {
				if stopErr := child.Stop(); stopErr != nil {
					log.Printf("sidecar stop: %v", stopErr)
				}
				probe.record("sidecar_exit", child.cmd.ProcessState.String())
			}
			probe.flush()
		},
	})
	if err != nil {
		log.Fatalf("wails: %v", err)
	}
}
