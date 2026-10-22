# A.T.O.M desktop D01 spike and Electron qualification

Status: **D01 (#148) qualification evidence recorded on macOS (arm64 and Intel) and Ubuntu 24.04 x86_64 (X11 and Wayland).** Gate 1 **passed: Electron accepted by the maintainer on 2026-10-22.** Gate 2 awaits maintainer acceptance; see [Gate 2 assessment](#gate-2-assessment). No downstream desktop issue (#149 onward) has started.
Run date: 2026-10-22 (Europe/Istanbul). Plan: [desktop-architecture-design-plan.md](desktop-architecture-design-plan.md).

## Outcome

1. **Wails v2 was rejected.** Wails v2.17.0 has no supported way to enforce top-level navigation on macOS or Linux. In the native WKWebView build, clicking the map's attribution link replaced the application with `https://leafletjs.com` and left no way back. The plan names this as a switch condition, and Electron with the same Go sidecar was accepted ([#148 decision comment](https://github.com/Berk-Unsal/atom/issues/148#issuecomment-6334742811)).
2. **Electron 44.7.0 (Chromium 152.0.7977.130) passed the D01 matrix on all four targets:** macOS arm64, macOS Intel, Ubuntu 24.04 X11 and Ubuntu 24.04 Wayland. It ran the committed frontend and the real Go sidecar and dataset, with real input. The details and limits are below.
3. **The Ubuntu sandbox needs packaging support.** As shipped by npm, Electron's sandbox aborts on Ubuntu 24.04 because AppArmor restricts unprivileged user namespaces. With an AppArmor profile that grants `userns` to the application binary, as other Chromium-based Ubuntu packages ship, it runs fully sandboxed. `--no-sandbox` was never accepted as a pass.

## Evidence boundary

| Item | Value |
| --- | --- |
| Code | Branch `spike/desktop-d01-qualification`, built on `b22b093`. It contains only the sidecar contract, the Electron spike and the branch-only workflow. It does not include the uncommitted report-redesign work. |
| Frontend | The committed `frontend-react` build, identical on every target. The macOS-only redesign print check used the working tree and is reported separately. |
| macOS arm64 | Apple M4, 10 cores, 24 GiB, macOS 27.0.1, local, with native dialogs driven through System Events (Accessibility granted). The full suite ran on an earlier commit of the branch. The final commit only changes Linux drivers, the EPIPE handling and the missing-sidecar check, and that check was rerun on arm64 after the fix. |
| macOS Intel | GitHub `macos-15-intel`: macOS 15.7.9, Intel i7-8700B, 4 vCPU, 14 GiB. |
| Ubuntu | GitHub `ubuntu-24.04`: Ubuntu 24.04.5 LTS, kernel 7.0 Azure, x86_64, AMD EPYC, 4 vCPU, 16 GiB, glibc 2.39. GNOME Mutter 46.2 as the X11 window manager on Xvfb, and as a headless Wayland compositor (1440×900 virtual monitor, no Xwayland, `--ozone-platform=wayland`). No GPU. |
| Toolchain | Go from `backend-go/go.mod`, Node 24 in CI (26.8.1 locally), Vite 6.4.3, playwright-core 1.61.1 with `chromiumSandbox: true` |
| Dataset | `ankara-open-planning@2026.07`. Buildings `d952a853…50fc`, towers `c460c254…3bd8`. 161,784 footprints, 451 cells. |
| CI runs | Workflow "Desktop D01 Electron qualification" at commit `7ec33e4`, final run [39770458447](https://github.com/Berk-Unsal/atom/actions/runs/39770458447) (earlier runs were diagnostic); evidence artifacts kept 30 days |
| Not covered | A physical GNOME desktop with a GPU and a full gnome-shell session; a clean-machine install; packaging and signing (D12–D14) |

These machines are not the plan's reference machine, so timings show behaviour and do not qualify budgets.

## Qualification matrix

| Check | macOS arm64 | macOS Intel | Ubuntu X11 | Ubuntu Wayland |
| --- | --- | --- | --- | --- |
| Renderer sandbox | default | default | AppArmor `userns` profile | AppArmor `userns` profile |
| Launch to plannable / sidecar ready (s) | 1.9 / 1.7 | 12.1–13.5 / 10.8–12.4 ¹ | 3.6–3.7 / 3.4 | 4.5–4.6 / 4.3 |
| Run Sector, Signal surface, rays (real clicks) | pass | pass | pass | pass |
| Select 8 Cells on the map, Evaluate Network | pass, 8 | pass, 8 | pass, 8 | pass, 8 |
| Results, Interference, Optimize, Pareto | pass, 5 solutions | pass, 5 | pass, 5 | pass, 5 |
| All 14 workspace drawers open | pass | pass | pass | pass |
| Keyboard reaches the primary RF action | pass | pass | pass | pass |
| 8-Cell scenario fingerprint | `network-dff886ed…` | identical | identical | identical |
| 4G/5G/6G capability matrix (36 entries) | as in the web app | identical | identical | identical |
| JSON, Blob, abort in flight | pass | pass | pass | pass |
| Navigation lock (attribution click, `location.assign`, `window.open`, iframe) | pass | pass | pass | pass |
| IndexedDB across relaunch with a new port | pass | pass | pass | pass |
| Report print/PDF against the A4 Chromium reference | 9 = 9 pages, 0 words missing | 9 = 9, 0 missing | 9 = 9, 0 missing | 9 = 9, 0 missing |
| Project export, HTML and Markdown report downloads | pass | pass | pass | pass |
| Native Save then Open, long Turkish path, same bytes and file identity | pass | pass | pass (Alt+S / Alt+O) | **not demonstrated**: headless Mutter did not deliver injected input |
| Second launch focuses the first window, no second sidecar | 0.18 s | 0.74 s | 0.17 s | 0.18 s |
| Sidecar SIGKILL → API 502, no RF replay | pass | pass | pass | pass |
| Missing or immediately exiting sidecar → window stays usable, 503 | pass | pass | pass | pass |
| Host SIGKILL → sidecar exits, no listener left | 1.6 s | 9.3 s | 3.1 s | 4.0 s |
| Vite HMR p95, CSS / JS module (20 warmed edits) | 130 / 119 ms | 170 / 120 ms | 23 / 5 ms | 25 / 6 ms |
| No uncaught page errors | pass | pass | pass | pass |

¹ Shared hosted Intel runner. The same steps took 7.2–8.3 s in earlier runs; the variance comes from the runner and points to no defect.

**4G/5G/6G.** The capability matrix reports `4g` and `5g` as supported everywhere. `6g-research` is unsupported for interference, measurement evaluation and site recommendation, and `research_only` for path profiles. That is the web product's existing matrix, reproduced exactly. The first #148 comment wrongly said every endpoint was supported.

**Print.** The isolated surface uses an in-memory session, JavaScript off, network cancelled and zero user-agent margins, and prints through `printToPDF` on A4. On macOS, the working-tree redesign reports (8 Cells and long identities, 9 and 11 pages) also matched the reference with Turkish text intact.

### Wails v2 (rejected), for the record

In WKWebView the following worked: JSON and Blob calls, abort, 8-Cell evaluation, Run Sector, tiles, IndexedDB across a port change, the single-instance lock, and the sidecar exiting about 0.5 s after host death. Navigation failed. `window.open` returns `null`, so `target="_blank"` links do nothing. A foreign page could send image GETs to `wails://wails/…` with no Origin, Referer or Fetch-Metadata headers. `runtime.WindowPrint` prints the main WebView, landscape with zero margins on macOS, and is `window.print()` on Linux. The compressed app was 16.8 MiB against Electron's 135.1 MiB on macOS arm64. Electron plus the default pack's buildings layer is about 146 MiB, inside the 250 MiB budget.

## Shared sidecar contract

`backend-go` gained an opt-in `--desktop-control` mode (`desktop_control.go`). The default web, Docker and CLI behaviour is unchanged.

- **Control pipes.** Inherited fd 3 carries the hello in, and its EOF means the host died. Inherited fd 4 carries lifecycle events out.
- **Hello.** The protocol version, a 256-bit token, a generation ID and the declared origins. The token never appears in arguments, environment, URLs or logs.
- **Listener.** The child binds and keeps `127.0.0.1:0`. It announces `listening`, `dataset`, `ready` and `stopped`.
- **Request checks.** Every request needs the exact listener Host, a declared Origin if one is present, and the token compared in constant time.
- **Shutdown.** The existing 30 s drain is reused.

Table-driven Go tests cover all of the above.

## Findings for downstream issues

1. **D03 (#150).** The page loads before the sidecar is ready, so the host must hold early API requests, bounded. Renderer aborts arrive at the protocol handler as a stream cancel, not through `Request.signal`.

   **The spike had an EPIPE bug.** If the sidecar exits before reading its hello, writing to the control pipe raises EPIPE. Without a listener on that stream, Electron blocks its main thread on a native "uncaught exception" dialog. On Linux that looked like a hung launch. Control-pipe errors are now handled, and a regression check covers missing and immediately exiting sidecar binaries.
2. **D04 (#151).** Custom-scheme requests carry no Origin or Fetch-Metadata headers. Keep the navigation lock, and also require a non-secret custom header on every `apiClient` call.
3. **D05 (#152).** Dev scripts must unset `ELECTRON_RUN_AS_NODE`, which VS Code terminals export. Vite on `127.0.0.1`, behind the same `app://atom` origin, kept HMR well under 1 s with no Vite change.

   Playwright adds `--no-sandbox` to Electron on Linux unless `chromiumSandbox: true` is set, so desktop tests must set it.
4. **D06/D07 (#153, #154).**
   - npm 11 no longer runs install scripts by default, so Electron's binary needs an explicit install step.
   - The macOS panels return paths in different forms: `/tmp` versus `/private/tmp`, and decomposed (NFD) Unicode on the Intel runner. "Same file" must be decided by file identity, not by string.
   - On macOS the panel runs out of process, so UI automation can only send keystrokes.
   - On Ubuntu, Return does not save in Electron's GTK Save dialog: the Save button is not the default response. In the Open dialog, Return closes it and Electron reports a cancel. Only the buttons (or Alt+S / Alt+O) complete them. Check this on a physical desktop and decide whether D07 needs a workaround or an upstream report.
   - On a real GNOME desktop, Electron may use the XDG desktop portal file chooser instead of in-process GTK. D07 must check which one appears.
5. **D08 (#155).** Stadia returns "401 Invalid Authentication" error tiles to the `app://atom` origin on every target, including locally. Its domain-based authentication only exempts `localhost`, and the desktop origin is not a registrable domain. The probe's "tiles loaded" count included these error images, which decode as valid PNGs; the console logged the 401 for every tile. Production desktop needs a provider credential arrangement or a visible OSM fallback. This confirms the plan's blocking question.
6. **D09 (#156).**
   - The committed "PDF / Print" path calls `window.open("")`. The navigation lock denies it, and the app shows "The report window was blocked". Desktop print must use the isolated surface.
   - Without a `will-download` handler, Electron opens its own Save dialog for every download.
   - `printToPDF` margins are numeric (inches) since Electron 21; `marginType` is ignored.
7. **D11 (#158).** Resident memory after 60 s idle:

   | Target | Total | Sidecar |
   | --- | --- | --- |
   | macOS arm64 | 1,404 MiB RSS | 722 MiB |
   | macOS Intel | 1,369 MiB RSS | 790 MiB |
   | Ubuntu X11 | 1,259 MiB PSS | 762 MiB |
   | Ubuntu Wayland | 1,241 MiB PSS | 729 MiB |

   The dataset index alone exceeds the ≤500 MiB budget with any shell. Revise the budget and report shell overhead separately.
8. **D14 (#161).**
   - Ship an AppArmor profile granting `userns` to the installed binary; a SUID `chrome-sandbox` is the fallback. As shipped by npm, Electron aborts with "SUID sandbox helper binary … not configured correctly".
   - The runner image already had every library Electron links against. Derive the `.deb` dependencies on a clean image instead.
   - Mutter 46 draws X11 decorations in a separate `mutter-x11-frames` client whose frame window has the same title, so window automation must select the client window by owner.

## Gate 2 assessment

The PASS conditions were evaluated as follows:

- **Critical workflows, navigation, auth, storage and print** pass on both OS families, in X11 and Wayland, on both macOS architectures.
- **HMR p95 is at most 1 s** everywhere.
- **Only supported APIs were used:** Electron, Playwright's Electron automation, and Mutter's RemoteDesktop API for Wayland input.
- **There is no product or framework fork.**

The remaining limits are environmental, not defects:

- Linux ran under GNOME Mutter on cloud VMs without a GPU and without a full gnome-shell session.
- The native Save/Open dialog was demonstrated on Ubuntu X11, not on Ubuntu Wayland. The headless compositor accepted Mutter RemoteDesktop sessions but delivered no injected keyboard or pointer input, even to a focused text field. A one-time manual Save/Open on a GNOME Wayland desktop closes this gap.
- No clean-machine install was tested; that is D12–D14.

Recommendation: accept Gate 2 for Electron after the one manual Wayland Save/Open check, and record the remaining limits in D11 and D14. That acceptance is a maintainer decision.

## Reproduce

- macOS, local: `ATOM_SPIKE_DIALOG_DRIVER=macos scripts/desktop-spike/qualify-electron.sh` after building `frontend-react`.
- Linux: `scripts/desktop-spike/linux-session.sh x11|wayland`.
- CI: push to `spike/desktop-d01-qualification`.
- Wails probe: `scripts/desktop-spike/build-wails.sh --probe` (working tree only).
