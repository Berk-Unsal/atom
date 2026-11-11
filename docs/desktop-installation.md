# Desktop installation and manual updates

Status: installation instructions prepared for #162. **Public desktop downloads are not enabled.** The existing browser/container release remains available. Internal unsigned packages and signed candidates are qualification artifacts. Only the [release gate record](https://github.com/Berk-Unsal/atom/blob/codex/atom-desktop-release/desktop/release-gates.json) can authorize their exact final bytes for public promotion after review.

## Targets and downloads

The proposed MVP targets are macOS 14 or later on Apple silicon and Intel, and updated Ubuntu 24.04 LTS on x86_64 under GNOME X11 and Wayland. Minimum-OS clean-machine qualification remains required; newer hosted runners do not establish the minimum baseline. Windows, other Linux distributions and a universal macOS binary are deferred.

When approved desktop assets exist, use the repository's matching `vVERSION` [GitHub release](https://github.com/Berk-Unsal/atom/releases). Root `VERSION` identifies the desktop, browser, API and CLI; the app's About information also includes its source commit, Electron version, OS and architecture. Choose `darwin-arm64` for Apple silicon, `darwin-x64` for Intel or `linux-x64` for Ubuntu. Match the file's SHA-256 to `atom-VERSION-desktop-SHA256SUMS` on that same release. Runtime SBOM, license index, complete notices and qualification receipts accompany each target.

## macOS

Open the architecture-matching `.dmg`, drag **A.T.O.M** to **Applications**, eject the disk image, then launch A.T.O.M from Applications. The final app and DMG must have passed Developer ID, notarization, stapling and downloaded/quarantined clean-machine checks. Installation and normal use do not require Node, Go, Docker or a terminal. OS rejection of a purported approved download is a qualification failure to report with its version and checksum.

To update, save portable project files, quit A.T.O.M, download the next approved matching-architecture DMG and replace the application in Applications. Do not run a second copy from the mounted image. The stable application identity and user-data location preserve the native workspace across manual updates. There is no automatic updater.

To uninstall, quit and remove A.T.O.M from Applications. Project/report files and the user profile remain in place. Archive work before explicitly deleting user data; deleting the application is separate from deleting work.

## Ubuntu

Open the approved `atom-VERSION-linux-x64.deb` in the desktop's graphical package installer and install its declared dependencies when prompted. Launch **A.T.O.M** from the applications menu. Updated Ubuntu repositories supply runtime libraries and portal services; Node, Go, Docker and development packages are not runtime prerequisites. The package installs its own narrowly scoped AppArmor user-namespace profile and uses Chromium's sandbox.

For a manual update, save portable projects, quit the app and open the next approved `.deb` in the same package installer. Remove the application through the package manager when uninstalling. Removal and purge preserve native user data and project/report files. The automated previous-package-version fixture verifies apt/dpkg upgrade dispatch; actual graphical installation and migration from any future released version need their own qualification.

## First launch and saved work

Use the bundled default planning pack through the normal Data controls. The [data review](desktop-data-redistribution-review.md) records its exact hashes, upstream notices and simulated LTE-as-5G planning fallback. Repository presence does not establish operator inventory or physical RF accuracy. Public packaging remains blocked until that exact pack is approved.

Choose **Run Sector** explicitly to calculate. Network evaluation and optimization remain explicit existing workflows; restoring a workspace, changing a dataset or exporting a report does not replay RF work. Use the File menu to open or save portable projects; automatic workspace recovery is separate from a portable project file. See the shared [project-format guide](project-format.md) and [report guide](report-guide.md) for formats, provenance and export behavior. File associations are deferred.

Added packs can be copied into managed native storage or deliberately referenced at their existing path. Referenced packs must remain accessible after restart; a missing pack requires explicit locate/recovery. Built-in resources stay read-only. Data validation/recovery does not silently substitute a different pack or reset saved work.

## Native files and diagnostics

| Purpose | macOS | Ubuntu defaults |
| --- | --- | --- |
| Workspace / managed packs | `~/Library/Application Support/A.T.O.M/` | `~/.local/share/atom/` |
| Host settings | `~/Library/Application Support/A.T.O.M/config/` | `~/.config/atom/` |
| Window / state | `~/Library/Application Support/A.T.O.M/state/` | `~/.local/state/atom/` |
| Logs | `~/Library/Logs/A.T.O.M/` | `~/.local/state/atom/logs/` |
| Disposable cache | `~/Library/Caches/A.T.O.M/` | `~/.cache/atom/` |

Ubuntu honors absolute XDG base-directory overrides. The durable renderer workspace is under `webview/` in the data directory; managed packs are under `packs/`. Runtime sockets/credentials are temporary and are never project settings. Use Help diagnostics to inspect the current runtime and reveal logs. Logs rotate with bounded size and redaction. Keep project/report files in locations you select; clearing cache is not a workspace reset. Future-schema or unwritable settings require explicit recovery.

## Network and offline boundaries

The embedded Go planning service runs privately on the local machine. Bundled or already-present packs, saved work and RF overlays do not require a remote planning API. Normal interactive basemap requests use attributed OSM Standard with application identification and normal HTTP caching; tile service availability is best-effort. Denied/offline tiles leave planning controls and overlays available, with explicit Retry. There is no prefetch or offline basemap distribution. Stadia needs an approved desktop authentication decision and is not granted a localhost exemption. See [the data/provider review](desktop-data-redistribution-review.md).

## Development and local unsigned packages

Use the repository-selected Go version from `backend-go/go.mod` and Node 24. From the repository root, install frontend and desktop dependencies with `npm ci --prefix frontend-react` and `npm ci --prefix desktop`. `npm run dev --prefix desktop` runs the native Vite/Go development loop. `npm run build --prefix desktop` stages local production resources; `npm run start --prefix desktop` launches those resources. The development profile is separate (`A.T.O.M-local`). Existing browser and container commands remain in [getting started](getting-started.md).

From a committed clean native checkout, `npm run package --prefix desktop` assembles an explicitly internal unsigned bundle; macOS also accepts `-- --dmg`. On updated native Ubuntu, `npm run package:deb --prefix desktop` creates an internal `.deb`. These commands do not publish, sign or approve distribution. Protected candidate/signing/publication workflows are documented in [release qualification](desktop-release-qualification.md).
