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
sandboxed preload exposes only `getInfo()` and `openExternal(httpsURL)` through
an exact-main-frame checked bridge. File/report actions remain disabled until
their dedicated issues. Native dependencies remain outside the headless Go and
browser build graphs. API calls continue through the shared HTTP client and a
stable `app://atom` route; host-only per-launch credentials travel to the owned
dynamic-loopback child over inherited pipes. A non-secret client header prevents
passive asset requests from becoming API calls. Imported report HTML never gets
native capabilities; isolated native report handling is #156.

Checks:

```sh
npm test --prefix desktop
npm run test:native --prefix desktop
npm test --prefix frontend-react
npm run lint --prefix frontend-react
```

The native smoke requires a graphical session and a preceding local build. It
uses an isolated temporary profile, retains a screenshot under
`desktop/test-results`, and checks real renderer/HTTP/host/process behavior.
It does not qualify production packaging, RF accuracy, native file/print actions,
the full #150 restart contract or #151 security matrix. Follow
`docs/active-issues-goal-plan.md` for the remaining issue acceptance gates.

Known external dependency: the shared Stadia map tiles show authentication-error
images from the desktop origin without provider authorization. Native launch/RF
checks do not establish production basemap permission. #155 owns that decision;
this shell foundation does not hide the failure or claim a usable public map.

The bridge and protocol follow Electron's
[security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
and [session-specific protocol rules](https://www.electronjs.org/docs/latest/api/protocol).
