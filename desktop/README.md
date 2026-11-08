# Local desktop host

This is the production host foundation for #149. It launches the existing
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
Electron's application-data directory, separate from the future release profile.
Window geometry is bounded to available displays and recovered from a corrupt or
unwritable settings file. `ATOM_DESKTOP_TEST_PROFILE` selects an isolated absolute
profile for local native tests; packaged builds ignore that override.

React's `src/platform/index.js` selects browser or native capabilities. The
sandboxed preload exposes typed `getInfo()`, `openExternal(httpsURL)` and read-only
runtime snapshots/change notifications through an exact-main-frame checked
bridge. Runtime snapshots separate listener, dataset and loaded-renderer
readiness without exposing the PID, port, token, paths or stderr. Native file/report integrations remain gated by
their dedicated issues. Native dependencies remain outside the headless Go and
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

For a Vite-only UI, first stage the local Go/resources using the build command
above, then run the existing Vite source in one terminal and the host in another:

```sh
ATOM_DESKTOP_DEV=1 npm run dev --prefix frontend-react -- --host 127.0.0.1 --port 5173 --strictPort
ATOM_DESKTOP_DEV_SERVER=http://127.0.0.1:5173 npm start --prefix desktop
```

The development router accepts only that fixed loopback origin, serves the same
`app://atom` application and keeps API traffic on the private Go route. It works
without a staged `dist`; packaged builds ignore the development/test resource
overrides. The dev CSP's inline React preamble and loopback HMR socket are absent
from the production CSP. Automatic Go rebuilds and measured edit-loop budgets
remain #152 work.

Checks:

```sh
npm test --prefix desktop
npm run test:runtime --prefix desktop
npm run test:native --prefix desktop
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
actual file dialogs remain #154 qualification.

These checks do not qualify production packaging, RF accuracy, native file/print
actions. The security suite adds hostile origins, main/subframe navigation, popups, redirects, Chromium drag events, imported project text, stored report bytes and the isolated report surface; CI also requests the private API as another OS user without a token. Follow
`docs/active-issues-goal-plan.md` for the remaining issue acceptance gates.

Known external dependency: the shared Stadia map tiles show authentication-error
images from the desktop origin without provider authorization. Native launch/RF
checks do not establish production basemap permission. #155 owns that decision;
this shell foundation does not hide the failure or claim a usable public map.

The bridge and protocol follow Electron's
[security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
and [session-specific protocol rules](https://www.electronjs.org/docs/latest/api/protocol).
