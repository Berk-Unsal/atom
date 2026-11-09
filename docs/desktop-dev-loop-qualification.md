# Desktop development-loop qualification — 2026-11-09

This is dated evidence for #152 on the production-host development path. It is
not installer, signing, release-storage, report-print or complete platform
qualification. The implementation uses the accepted Electron host and the same
React/Go source as the browser product.

## Frozen source and reference

- Source: `5bc56d496e1d2bd97f258783d4aa91de07a67377`, clean before the test.
- Raw evidence: [desktop-dev-loop-macos.json](assets/desktop-dev-loop-macos.json).
- Hardware: Apple M4, 10 logical CPUs,
  24 GiB RAM; darwin/arm64, kernel 27.2.0.
- Runtime: Node v24.22.2, Electron 44.10.2;
  the repository-selected Go command reports `go1.26.10 darwin/arm64`.
- The temporary Git fixture has its own build commit, recorded separately as
  `fixture_build_commit`. `source_commit` identifies the actual copied source.

## Measurements

| Visible edit / reconnect | Observed | Initial budget | Outcome |
| --- | ---: | ---: | --- |
| JSX, 20 warmed samples | p95 110.5 ms | <=1000 ms | Pass |
| CSS, 20 warmed samples | p95 108.3 ms | <=1000 ms | Pass |
| Small warm Go edit | 2998.2 ms | <=5000 ms | Pass |
| Warm host-source edit | 2853.7 ms | <=10000 ms | Pass |

Three warmups precede each set of 20 JSX/CSS samples. p95 uses nearest rank.
Go and shell rows are one timed successful warm edit each, not percentile or
universal hardware claims. Timing starts before the source-file write. Go ends
at the new runtime-ready receipt and is followed by HTTP checks; shell timing
also waits for the new renderer's Run Sector control. The initial toolchain and
pack build is separate from these warm measurements.

## Method and acceptance evidence

`scripts/desktop-test.sh --dev-loop` copies tracked frontend/host/backend files
into a temporary Git fixture, shares installed dependencies and read-only input
data, and uses a dedicated private profile. It does not copy ignored local
credentials/settings, modify the working tree's source or create a second
product frontend. Both source and staged-resource `dist` directories are absent.

The suite changes the visible brand JSX in the actual WorkspaceChrome component
and the visible command-bar border in the actual stylesheet, through Vite and
`app://atom`. It observes rendered changes and a persistent renderer sentinel.
The API generation, host launch count and Go-build count stay unchanged through
all 40 samples; no installer/production frontend build is invoked. The retained
`dev-loop-hmr.png` screenshot shows both modified elements before restoration.

The same native run verifies:

- Invalid Go syntax preserves the same ready generation and owned API PID;
  the authenticated app API still responds. A repaired source compiles before
  atomic executable replacement; the new generation responds and old requests
  get 409. Calculations are not replayed.
- Invalid host syntax preserves the existing host; a valid edit drains/relaunches
  it and retains the saved development workspace. A complete command relaunch
  with the same dev profile also retains that workspace.
- An edit during the initial build is remembered and applied before final ready.
  A VERSION change during initial compilation stops cleanly with a restart
  instruction instead of launching an inconsistent build.
- Ctrl-C and startup cancellation reap all observed supervisor-owned process
  groups. Runtime scratch is removed. The persistent dev profile is retained.
- An occupied 5173 listener remains owned by the test blocker; startup fails
  before a Go build. Vite HTTP API/status paths do not forward to port 8080;
  the native host remains the only authenticated API proxy.

The inherited development-control protocol is off in packaged/non-Vite hosts,
accepts only restart/quit, and does not serialize the Sidecar's private return
record. Queue tests cover coalescing, superseded candidates and shutdown.
Frontend HMR disposal removes its native subscription and cancels old work
without an RF retry. Existing browser Vite/Docker/API commands remain separate.

## Native scope and remaining qualification

The local production RF smoke and hostile-content/security suite pass. The full
local lifecycle suite's actual-focus assertion remained failing: a separate
probe reported the app inactive even before a second launch, while a system
notification process was frontmost. Inspection of that protected system process
was blocked by computer-use safety rules. No focus assertion is skipped or
mocked. The host now explicitly activates a hidden/minimized macOS app on a
user-requested second launch, and the test waits for actual native focus.

The additive Quality matrix must pass the unchanged strict lifecycle/focus
checks and the complete development-loop suite on macOS 15 arm64 and Ubuntu
24.04 x86_64/X11 before ready-for-review status. CI artifacts retain their own
raw source identity, hardware, samples and screenshots. Those results are
separate from this local dated record; this record does not imply Wayland,
Intel Mac, older macOS, clean-machine installation or a universal performance
budget. #158/#159/#161 retain the wider qualification work.

Stadia authentication-error tiles remain visible in the test UI. Successful
HMR/API work is not production basemap authorization; #155 owns that gate.

## Reproduction

```sh
npm ci --prefix frontend-react
npm ci --prefix desktop
scripts/desktop-test.sh --dev-loop
```

Use a graphical session and Node/Go versions pinned by the repository. Ubuntu's
sandboxed graphical setup is in the native Quality job; do not disable the
sandbox. The normal dev command is documented in [desktop/README](../desktop/README.md).
Electron documents application activation separately from window visibility in
[app.focus](https://www.electronjs.org/docs/latest/api/app#appfocusoptions).
