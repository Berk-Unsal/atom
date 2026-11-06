# A.T.O.M desktop D01 spike and Electron qualification

Status: **D01 (#148) complete. Gate 2 accepted by the maintainer on 2026-11-05** after the [native-dialog follow-up](#native-dialog-follow-up-2026-11-05) and clean implementation checks; see the [acceptance record](https://github.com/Berk-Unsal/atom/issues/148#issuecomment-6666037247). Gate 1 selected Electron on 2026-10-22. Qualification covers macOS arm64/Intel and Ubuntu 24.04 x86_64 X11/Wayland within the evidence boundaries below. No downstream desktop implementation has started; the existing #149 is now unblocked.
Original run date: 2026-10-22; native-dialog follow-up: 2026-11-05 (Europe/Istanbul). Plan: [desktop-architecture-design-plan.md](desktop-architecture-design-plan.md).

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
| Native Save then Open, long Turkish path, same bytes and file identity | pass | pass | pass (Alt+S / Alt+O); portal follow-up below | originally not demonstrated; **pass via the GTK portal in the follow-up below** |
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
- **Only supported APIs were used:** Electron, Playwright's Electron automation, and GTK's AT-SPI interface for the native portal follow-up. The original Mutter input-injection attempt did not qualify the dialogs.
- **There is no product or framework fork.**

The remaining limits are environmental, not defects:

- Linux ran under GNOME Mutter on cloud VMs without a GPU and without a full gnome-shell session.
- The follow-up qualifies the real GTK desktop portal on both native backends. A different portal backend, a full GNOME Shell session and GPU hardware remain outside this cloud-runner evidence; installed-runtime qualification belongs to D14.
- No clean-machine install was tested; that is D12–D14.

**Accepted on 2026-11-05.** The maintainer approved Gate 2 conditional on no unresolved implementation issues. Before recording acceptance, PR #182 was checked at `8e7e5a6`: all 12 checks passed, it was mergeable, and no review findings or unresolved threads were reported. The [acceptance record](https://github.com/Berk-Unsal/atom/issues/148#issuecomment-6666037247) closes #148 and unblocks the existing #149. The remaining limits and memory-budget review stay with D11/D14; this is D01 qualification acceptance, not public desktop release qualification.

## Native dialog follow-up: 2026-11-05

The earlier failure was an automation gap. Mutter accepted RemoteDesktop calls but did not deliver their input to the chooser. AT-SPI inspection of Chromium's in-process GTK chooser also cannot establish the result: [Chromium explicitly disables GTK's ATK bridge during initialization](https://chromium.googlesource.com/chromium/src/+/152.0.7977.130/ui/gtk/gtk_ui.cc#338).

The new runner starts a real `xdg-desktop-portal` and `xdg-desktop-portal-gtk` in a private D-Bus/Mutter session. Electron discovers that supported portal normally. An AT-SPI driver restricted to the owned GTK portal process operates the native Save, Select and Cancel controls. It checks the selected exported filename explicitly; GTK's single-file portal labels its accept button **Select**. No dialog response, file read/write, portal service or RF output is mocked.

Both Ubuntu 24.04 x86_64 backends demonstrate:

- Export a real project with a Turkish name from the shared React application and real Go sidecar.
- Save through the native chooser into nested directories with Turkish characters and a long filename.
- Select that file through the native Open chooser; compare device/inode identity and SHA-256 with the original exported bytes.
- Cancel Save without creating a file; cancel Open without returning a file or altering the previously saved bytes.
- Keep the Chromium renderer sandbox enabled. Wayland uses `GDK_BACKEND=wayland`, `--ozone-platform=wayland`, Mutter `--no-x11`, and no `DISPLAY`.

The session uses a private configuration/runtime directory, a binary-specific AppArmor user-namespace profile and explicit cleanup of the document portal's private FUSE mount. It does not change the machine-wide user-namespace restriction. The original macOS evidence remains the 2026-10-22 qualification; this follow-up adds Linux evidence rather than claiming a new macOS run.

The [full follow-up validation run](https://github.com/Berk-Unsal/atom/actions/runs/42080840639) passed on both backends at commit `e884c1e` (shared product version 0.13.1, Electron 44.7.0 / Chromium 152.0.7977.130, Mutter 46.2, FileChooser portal version 3). The retained outputs were also inspected for the assertions below; a green process exit alone is insufficient for the observational probes. [PR #182](https://github.com/Berk-Unsal/atom/pull/182) retains the harness changes.

| Follow-up check | Ubuntu X11 | Ubuntu Wayland |
| --- | --- | --- |
| All 13 workflow steps, including 8-Cell Evaluate/Optimize and native dialogs | pass | pass |
| Native project bytes saved and reopened | 4,053,710 | 4,053,722 |
| Native same device/inode and SHA-256 as its own exported source | pass | pass |
| Path length, including Turkish directories and filename | 244 characters | 244 characters |
| Cancel Save creates no file; Cancel Open returns no file; existing bytes unchanged | pass | pass |
| A4 Electron PDF versus Chromium reference | 15 = 15 pages; 0 missing reference words; tagged; Turkish preserved | same |
| HMR p95 CSS / JS module, 20 warmed samples each | 25 / 6 ms; no full reload | 19 / 5 ms; no full reload |
| JSON, Blob, abort, 36-entry availability matrix, navigation restrictions | pass | pass |
| IndexedDB marker survives new sidecar ports; second launch owns one sidecar | pass | pass |
| Child crash → 502; missing/exiting child → usable window and 503; parent death removes listener | pass | pass |
| Native session cleanup, including the private document-portal FUSE mount | pass | pass |

The project hashes are `9a5f915e608a0119a30ef99e1f3354ba89f77d1141c5f9a264155e5ad9eb9817` (X11) and `8a38f4060ec22cf9661d2c763159ca4223a63047513c07be98a0b4ede2082ce5` (Wayland). Independent exports contain different timestamps/identities; each native round trip is compared with its own original bytes, not with the other machine's export. Total idle PSS was 1,233 / 1,292 MiB, still above the old 500 MiB proposal; D11's budget review remains necessary. These hosted machines do not qualify reference-hardware timing or memory budgets.

The workflow uploads the platform, portal version, native action trace, file identity/hash results and full-suite outputs for 90 days. `--dialogs-only` results explicitly mark all omitted RF/report/lifecycle/HMR steps as skipped, so they cannot be mistaken for a full qualification.

## Reproduce

- macOS, local: `ATOM_SPIKE_DIALOG_DRIVER=macos scripts/desktop-spike/qualify-electron.sh` after building `frontend-react`.
- Linux native dialogs: `scripts/desktop-spike/dialog-session.sh wayland dialogs` (or `x11`). Install the pinned frontend/Electron dependencies and the Ubuntu packages listed in `.github/workflows/desktop-native-dialogs.yml` first; the script needs `sudo` for the temporary AppArmor profile.
- Full Linux suite: `scripts/desktop-spike/dialog-session.sh wayland full` (or `x11`), with the pinned Playwright Chromium reference installed as in the workflow.
- CI: the **Desktop native dialogs** workflow, with `suite=dialogs|full`; full is the default for manual runs. The original `spike/desktop-d01-qualification` branch and `linux-session.sh` remain historical harnesses using the earlier raw input drivers.
- Wails probe: `scripts/desktop-spike/build-wails.sh --probe` (working tree only).
