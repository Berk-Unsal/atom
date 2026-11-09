# Desktop security boundary

This describes the Electron host in this directory, not the historical spike,
public installation support or the web/Docker server's deployment policy.

## Authority and transport

- Only the owned main frame at `app://atom/` or `/index.html`, without a query,
  receives the typed preload. Every IPC handler independently checks the sender,
  frame identity and document URL. Other documents, frames and windows cannot
  use it. There is no generic invoke, filesystem, process, destination or restart
  method. Native file and report operations will be added by #154/#156 with
  dialog-approved typed capabilities; this boundary does not grant a file path.
- The host creates a fresh 256-bit token and generation for each owned Go child.
  Credentials cross inherited control pipes and host-side HTTP headers only.
  The renderer knows a non-secret generation, never the token, PID or endpoint.
  No token is placed in URLs, argv, Vite configuration, browser storage or public
  endpoint files. Native requests also ignore browser API-base overrides and
  stay on the stable application route. Status/error snapshots omit private paths and stderr.
- Go authenticates every desktop HTTP method/path before CORS and handlers.
  Host must equal the actual ephemeral IPv4 loopback listener; a present Origin
  must exactly match the declared application origin. An absent Origin still
  needs the token. This denies unrelated users/processes as well as webpages;
  loopback and CORS are not authentication.
- `lib/routes.cjs` is the desktop API method/path vocabulary. New backend routes
  require an explicit native policy decision. Opaque feature IDs remain one
  decoded segment; job IDs use the real engine's identifier format. The proxy
  independently checks the current loopback address, credential and generation
  before forwarding. It never accepts a renderer destination or forwards its
  Cookie, Authorization, Origin, Host or transport token. Redirects fail closed.
- JSON, Blob and multi-request actions are generation-bound through body
  completion. RF cleanup uses an independent cancellation signal but retains
  the original action's generation; old capabilities never enter a replacement
  service. Work is not replayed automatically.

## Documents, navigation and network

The release router serves only the application entry document and bounded
`assets`/`icon` files under the real dist directory, including symlink checks.
Arbitrary/report HTML is never served as a trusted application document. CSP
allows bundled scripts, required inline Leaflet styles and explicit tile-image
origins. There is no release inline script, eval, wildcard connection or HMR
WebSocket permission. The fixed loopback Vite route and its React/HMR allowances
are local-development-only; packaged builds ignore development overrides.

The session gates requests by the owned WebContents and main frame. Direct
renderer loopback/file/foreign network requests, frames and objects are denied;
only approved tile origins can supply remote images. Chromium can create a
`srcdoc` frame without a network navigation: it inherits the strict script CSP,
has no preload, and cannot fetch scripts/API/assets through the main frame's
session authority. Untrusted HTML is never inserted in the application's DOM.

Native navigation handlers deny replacement, redirects, subframes, webviews
and new windows, while `navigateOnDragDrop` is disabled. Only the trusted main
document can offer HTTPS links to the system browser. A report or foreign
WebContents cannot turn navigation into `shell.openExternal`. All permission
requests/checks are denied.

`lib/report-surface.cjs` renders supplied HTML through a unique in-memory route
in a separate nonpersistent session. It has JavaScript disabled, a sandbox CSP,
no preload, opener, app protocol, storage authority or network allowance.
Only embedded data images/fonts and inline styling are available. Navigation,
downloads and permissions are denied. Input is bounded to the existing 64 MiB
artifact ceiling, loading is bounded, and closing removes its HTML handler.
This is the security foundation for #156, not an exposed Print/PDF action or a
claim of report pagination parity. The old shared popup path remains blocked;
retained bytes stay unchanged in their existing repository.

## Evidence

| Boundary | Checks |
| --- | --- |
| Routes/assets/IPC/session/CSP/destinations | `npm test --prefix desktop`; Go route-registration coverage plus traversal, symlink, origin, frame and destination cases. |
| Actual private API | `npm run test:runtime --prefix desktop`; all-method status/meta/API authentication, raw Host rebinding, token/Origin failures, credential rotation, private snapshots/argv, actual experiment create/read/cancel. CI also runs an unauthenticated request as OS user `nobody`. |
| Actual renderer/engine | `npm run test:native --prefix desktop`; real Sector/network Results, production and Vite-only startup, stale work/recovery, imported HTML-shaped project text, stored HTML through the shared artifact repository, script/frame/fetch/popup/top-level restrictions, native redirect and Chromium drag input, foreign preload denial and scriptless isolated reports. |
| Shared browser behavior | Frontend lint/Vitest/Playwright, normalized Run snapshots and unchanged Go tests remain in Quality CI. No Go transport/RF implementation is changed by this security batch. |

CI retains screenshots and `smoke.json`, `lifecycle.json`, `security.json` for
each native target. The drag test exercises Chromium input, not a physical OS
drag session. Browser file inputs and retained-byte storage are exercised;
native project/report dialogs remain their own work packages.

The issue referenced PR #63 as open; it was closed without merging on
2026-11-06. This work neither changes nor merges it and does not impose HTTPS
on the private authenticated loopback or existing local browser development.
Provider access/data redistribution, signing and clean-machine packaging are
separate gates in the issue plan. Existing Stadia authentication-error tiles do
not establish production basemap permission.

The implementation follows Electron's
[security checklist](https://www.electronjs.org/docs/latest/tutorial/security),
[native navigation events](https://www.electronjs.org/docs/latest/api/web-contents)
and [session request API](https://www.electronjs.org/docs/latest/api/web-request).


## Diagnostic records

The host persists only a fixed structured lifecycle schema. Native log events
never serialize raw exception messages, stderr, request URLs/bodies, projects,
reports, tokens or absolute user paths. Version/commit, platform/architecture,
generation, readiness flags, known failure codes and bounded counters are
allowlisted. Debug source builds add byte counts, not arbitrary message text.
Private in-memory stderr capture remains bounded and is never persisted or sent
to the renderer. The Open Logs action accepts no renderer path or IPC request;
it opens only the logger's actual current private directory. Rotation and
fallback reject symlinks, hardlinks, nonregular files and unsafe permissions.
The app never uploads logs or implicitly resets a failed storage directory.
