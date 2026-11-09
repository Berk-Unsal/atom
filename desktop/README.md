# Local desktop host

This is the local Electron host developed through #149–#154. It launches the existing
`frontend-react` build and `backend-go` API. The D01 qualification selected
Electron 44.7.0; this host pins 44.10.2 to include the
[compromised-certificate mitigation](https://github.com/advisories/GHSA-jr5w-w6x2-84p9).
Native qualification of this production host is additive; the disposable host in
`spike/` remains historical evidence and is not imported by this host.

From a clone with Git LFS data, Node 24 and the Go version in `backend-go/go.mod`:

```sh
npm ci --prefix frontend-react
npm ci --prefix desktop
npm run build --prefix desktop
npm start --prefix desktop
```

The build stages generated assets, the unchanged Go executable, the local dataset
pack, the existing icon and root VERSION/build identity under `desktop/build`.
It does not create an installer, sign a binary or publish a dataset. The app
does not require the developer's current working directory when launched.
Development tooling itself still needs Node/Go. Packaged installation is later
work; Ubuntu's Electron sandbox policy must be configured by #161 before claiming
ordinary clean-machine installation. Do not disable the sandbox to bypass it.

The only window is resizable. Closing it quits the app and drains its owned
backend; a second launch focuses the existing window. Standard Edit/View/Window
menus and platform shortcuts work. About identifies root VERSION, commit,
Electron, OS and architecture. Local unsigned launches use `A.T.O.M-local` under
the native configuration/Application Support directory, separate from the release profile.
Window geometry is bounded to available displays and recovered from a corrupt
state file. Failed layout writes are reported. `ATOM_DESKTOP_TEST_PROFILE` selects an isolated absolute
profile for local native tests; packaged builds ignore that override.

React's `src/platform/index.js` selects browser or native capabilities. The
sandboxed preload exposes typed `getInfo()`, `openExternal(httpsURL)` and read-only
runtime snapshots/change notifications through an exact-main-frame checked
bridge. Runtime snapshots separate listener, dataset and loaded-renderer
readiness without exposing the PID, port, token or stderr. Typed project-file methods expose only dialog-approved file display paths and opaque receipts; report integrations remain gated by #156. Native dependencies remain outside the headless Go and
browser build graphs. API calls continue through the shared HTTP client and a
stable `app://atom` route; host-only per-launch credentials travel to the owned
dynamic-loopback child over inherited pipes. A non-secret client header prevents
passive asset requests from becoming API calls. Imported report HTML never gets
native capabilities. The host-only isolated report surface uses a separate temporary session, disabled scripts, no preload/opener/network and a bounded in-memory HTML route; #156 will connect user-approved Save/Print/PDF actions to it. See [the security boundary](SECURITY.md).

Choose **Help → Restart planning service…** for explicit recovery after a crash
or when restarting an active service. Cancel leaves the current process alone.
Confirm cancels in-flight work, drains/reaps the owned child within the existing
30-second ceiling and starts one replacement with a new credential and runtime
generation. Projects and completed Results stay in the window. Calculations are
not replayed. Closing the app wins any pending recovery and prevents a new child.

The shared HTTP client binds a user action to its original generation, checks
JSON/Blob bodies after consumption and rechecks the host before returning.
Late data and old workflow follow-ups cannot enter a replacement runtime. A late
Run-history database write remains historical without replacing the association
for a newer action, workspace or runtime. Domain serializers and RF outputs are
unchanged.

For development, install the same dependencies, then use one command:

```sh
scripts/desktop-dev.sh
# Optional isolated profile (private user-owned directory):
scripts/desktop-dev.sh --profile /absolute/path/to/atom-dev-profile
```

This starts the existing React/Vite source at `127.0.0.1:5173`, stages only the
manifest-declared pack and Go resources in a private temporary directory, and
opens the sandboxed app at `app://atom`. No frontend `dist`, installer, signing
credential or second React application is required. An occupied Vite port fails
before compiling; the command never takes over another server. Direct Vite HTTP
API/status requests return 403; the app's host injects credentials on the private
Go route. Ordinary browser Vite proxies remain unchanged outside desktop mode.

The first Go/toolchain build and dataset validation can be cold. Once the command
prints `ready`, JSX/CSS changes use Vite HMR without Go or packaging work. A Go
source/module edit, including `backend-go/raytracer`, compiles a candidate before
atomically replacing the runtime executable and requesting a generation change.
After a successful initial launch, failed compilation keeps the last good service. Superseded candidates are
removed rather than installed. A main/preload/host-library edit is syntax-checked
before the host drains and relaunches. Failed shell syntax keeps the last good
host too. In-flight calculations are cancelled safely and never replayed.
Changes during initial Go startup are remembered and applied before final ready.

Ctrl-C closes watchers, aborts owned compiler groups, drains the owned app/Go
child, closes Vite and removes temporary resources. The dev profile is retained
for the next session. It is separate from release, ordinary local-build and test
profiles: `~/Library/Application Support/A.T.O.M-dev` on macOS, or
`${XDG_DATA_HOME:-~/.local/share}/atom-dev/profile` on Linux (relative XDG overrides
are ignored). Existing profile directories must be user-owned and 0700. No
browser or release profile is migrated or reset. The release-storage test below qualifies an unpacked app separately from
installer/signing and clean-machine support.

Build identity is captured from root VERSION and commit when the command starts.
Changing VERSION stops the command with a restart instruction; restart after a
commit to refresh its identity. Changes to supervisor/build tooling itself also
require restarting the command. Developer inspection is used only by the private
test observer; the normal command opens no debugging listener or public control
endpoint. Packaged builds ignore dev resource/profile/control overrides.

Command modes:

| Command | Purpose |
| --- | --- |
| `scripts/desktop-dev.sh` | Source UI, HMR and supervised Go/shell edits; no dist needed. |
| `scripts/desktop-build.sh` | Unsigned local shared resources, including the production frontend dist. |
| `scripts/desktop-test.sh` | Host unit/contract checks. |
| `scripts/desktop-test.sh --runtime` | Real-Go transport/lifecycle cases after a local build. |
| `scripts/desktop-test.sh --native` | Production/Vite/security engine checks after a local build. |
| `scripts/desktop-test.sh --dev-loop` | Isolated-source development-loop qualification and timing; no staged dist. |
| `scripts/desktop-test.sh --storage` | Real unpacked-app persistence and recovery qualification. |
| `scripts/desktop-test.sh --project-files` | Native file workflow and focused keyboard qualification. |

Packaging is a separate #159/#161 work package; none of these commands produces
or publishes an installer. Web `npm run dev`, Go tests and Docker commands remain
independent. The dev CSP adds only the React preamble and fixed-loopback HMR
socket; these permissions are absent from release CSP.

Checks:

```sh
npm test --prefix desktop
npm run test:runtime --prefix desktop
npm run test:native --prefix desktop
npm run test:dev-loop --prefix desktop
npm test --prefix frontend-react
npm run lint --prefix frontend-react
```

The native smoke requires a graphical session and a preceding local build. It
uses an isolated temporary profile, retains a screenshot under
`desktop/test-results`, and checks real renderer/HTTP/host/process behavior.
It covers production and Vite-only startup, real Sector/network Results,
single-instance focus, explicit restart/cancellation, state retention, crash
recovery, abrupt host death, same-profile relaunch and a usable missing-sidecar
window. Runtime integration tests also reserve 8080,
verify bad binary/pack rejection, check credential/generation/port rotation and
parent-EOF listener cleanup. Tests use only their owned child PIDs and isolated
profiles/resources. Native dialog confirmation is stubbed for menu automation;
the project-file suite below separately exercises the approved-file workflow.

These checks do not qualify production packaging, RF accuracy or native print actions. The security suite adds hostile origins, main/subframe navigation, popups, redirects, Chromium drag events, imported project text, stored report bytes and the isolated report surface; CI also requests the private API as another OS user without a token. Follow
`docs/active-issues-goal-plan.md` for the remaining issue acceptance gates.

Known external dependency: the shared Stadia map tiles show authentication-error
images from the desktop origin without provider authorization. Native launch/RF
checks do not establish production basemap permission. #155 owns that decision;
this shell foundation does not hide the failure or claim a usable public map.

The bridge and protocol follow Electron's
[security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
and [session-specific protocol rules](https://www.electronjs.org/docs/latest/api/protocol).

The development-loop suite copies the tracked frontend/host/backend source into
a temporary Git fixture and shares installed dependencies/read-only input data.
It edits visible JSX and CSS (20 warmed samples each), never the working tree;
checks no Go build or host reload during HMR; and asserts p95 <=1 s, a warm Go
edit <=5 s and a shell edit <=10 s. It also verifies compilation failures, old
generation rejection, retained dev workspace on relaunch, startup cancellation
and occupied-port handling. Raw samples/reference hardware and an HMR screenshot
are retained as `dev-loop.json` and `dev-loop-hmr.png`. Native CI runs it on both
macOS and Ubuntu X11; timing evidence is scoped to the recorded hardware.

See the dated [development-loop qualification](../docs/desktop-dev-loop-qualification.md) for frozen local source, raw measurements and platform scope.

Development sidecars omit DWARF debug sections to reduce warm linking time. The
production build keeps its existing flags; use the standalone Go commands for
debugger sessions. Desktop Vite waits 50 ms for completed editor writes so a
Linux truncation notification cannot publish an incomplete stylesheet.
The supervisor supplies its captured VERSION/commit explicitly and disables
Go's redundant VCS subprocess probes for these development builds. The private
startup identity checks still require that exact version and commit.

## Native storage and recovery

The release host fixes both Electron `userData` and `sessionData` before ready,
uses a persistent default session and serves the same `app://atom` origin after
port changes, upgrades or relocation. Existing workspace, Run History and report
artifact repositories keep their IndexedDB names, versions and domain schemas;
localStorage fallback data stays in that same durable profile. Browser storage
is never imported, cleared or reset implicitly.

| Purpose | macOS release | Linux release |
| --- | --- | --- |
| Durable data / packs | `~/Library/Application Support/A.T.O.M` / `packs` | `${XDG_DATA_HOME:-~/.local/share}/atom` / `packs` |
| Chromium profile | data directory / `webview` | data directory / `webview` |
| Host configuration | data directory / `config` | `${XDG_CONFIG_HOME:-~/.config}/atom` |
| Host state | data directory / `state` | `${XDG_STATE_HOME:-~/.local/state}/atom` |
| Disposable HTTP cache | `~/Library/Caches/A.T.O.M` | `${XDG_CACHE_HOME:-~/.cache}/atom` |
| Logs | `~/Library/Logs/A.T.O.M` | state directory / `logs` |
| Disposable runtime | private unique OS temporary directory | private unique directory below a valid `XDG_RUNTIME_DIR`, or OS temporary directory |

Only absolute XDG overrides are accepted. A cache root that contains a durable
root is rejected before use. Native-owned directories must be user-owned 0700;
shared permissions, symlink leaves and unwriteable locations fail explicitly
without chmod'ing existing directories or selecting another profile. Host files
are 0600 and the host/child umask is 077. No installed application resource is a
write target. Local/test/dev profiles contain their own native data, config,
cache, state and runtime directories; packaged applications ignore all dev/test
profile, resource, Vite and control overrides.

`settings.json` is a bounded, versioned host-only record for preferences, dataset
registry entries and recent chosen-file associations. It holds no workspace,
Run inputs, credentials or report bytes. A unique exclusive sibling write,
fsync and atomic rename preserve the previous file on disk/quota/rename failure;
interrupted siblings are not replayed. Malformed, insecure or newer settings
stop startup with a recovery dialog. Back up the file and repair the indicated
permissions/settings or free disk space, then retry. No automatic reset,
downgrade or browser migration occurs. Window geometry is separate, recoverable
state; failed layout writes are reported without resetting domain stores.

Clear only the documented cache root or Electron's HTTP cache. Do not delete the
profile, site data or IndexedDB as a cache-cleanup operation: they contain work
and retained report bytes. GPU/shader implementation caches may also exist
inside Chromium's profile; the whole profile is never disposable. Quit the app
before external cleanup. Runtime scratch can be removed after an abnormal exit;
it contains no durable workspace. User-chosen project/report destinations are
associations, never redirected to cache, runtime or autosave locations. The
project menu identifies desktop autosave as recovery storage and recommends a
portable exported file for a separate backup. See the native project-file workflow below.

Run `scripts/desktop-test.sh --storage` after the local build. The suite constructs
a disposable unpacked application with a genuinely renamed executable (native
`app.isPackaged === true`, not a property mock), an isolated HOME/XDG environment,
read-only application resources and an independent cwd. A test-only bundle calls
the existing production repository contracts in real Chromium IndexedDB. It
checks workspace/Run History/artifact hashes and bytes plus localStorage across
relaunch, actual sidecar port changes, HTTP-cache eviction, resource relocation
and an explicit test-version Go/host upgrade. It retains native settings,
registry/recent associations and packs, and verifies private permissions.
macOS relocates the entire `.app`; Ubuntu relocates Resources while retaining
the exact AppArmor-qualified executable path. Installer, signing, arbitrary
Linux executable relocation and clean-machine qualification remain #159–#162.


## Native project files

File → Open Project, Save Project, Save Project As and Export Project Copy use
the same controller as the project menu. Cmd/Ctrl+O, Cmd/Ctrl+S,
Cmd/Ctrl+Shift+S and Cmd/Ctrl+Shift+E invoke those operations. Save captures the
current working inputs before the recovery timer fires; it creates no Version
and runs no RF request. Save Version continues to create a planning Version.

Open uses the existing shared importer, including schema 1/2 compatibility,
16 MiB file and expanded/structural limits, lineage and stale-result rules.
Rejected or cancelled Open leaves the active workspace and result in place.
An accepted import gets its own associated source path; normalization may make
it dirty until saved as schema 3. Save As changes that project's association
only after its write commits. Export writes an independent copy and keeps the
association. Unassociated projects use a Save dialog. Associations survive
relaunch as host metadata; the domain workspace stays in its existing repository.

Only native dialogs approve paths. The renderer cannot submit arbitrary file
paths or call generic filesystem APIs. Writes use an exclusive temporary sibling,
fsync and atomic rename, preserving the old file on precommit failure. A content
and identity fingerprint detects external edits before replacement; a conflict
asks the user to reopen or choose Save As. This is conflict detection, not an
exclusive cross-process file lock. Symlink leaves and nonregular files are
rejected. If bytes commit but association settings fail, the UI reports success
with a warning and retains the chosen path.

File status compares the exact shared serialized snapshot by SHA-256, marking
pending working inputs dirty immediately. Quit with dirty associated files
offers Keep Editing, Quit with Recovery, or Save Files and Quit. Cancellation,
failed writes and new edits keep the app open. Recovery-only projects retain
their existing autosave behavior. A portable project does not guarantee a full
copy of independent Run History or retained report artifact bytes; use explicit
report/review exports for those records.

Reproduce with a local build and `scripts/desktop-test.sh --project-files`. The
suite runs the real sandboxed renderer, shared parser/serializer, IPC, filesystem
and Go sidecar in private temporary directories. Dialog choices are automated
through stubbed Electron dialog responses; this does not qualify OS chooser UI.
The default suite requires actual window focus and injects native Electron key
events to verify Save. `node desktop/test/project-files.mjs --menu-only` is an
explicitly narrower local diagnostic when the session cannot activate windows;
it records keyboard qualification as false. CI never uses that option.
