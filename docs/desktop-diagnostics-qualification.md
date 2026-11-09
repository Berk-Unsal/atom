# Desktop diagnostics qualification — 2026-11-09

This is scoped evidence for #157 on the accepted Electron host, based on #188.
It does not establish installer, signing, Intel Mac or Wayland support. The
independent macOS Go development-replacement budget remains open.

## Frozen local source

- Clean source: `54f32f24579252441fde8bf6f4cc16a8dc3010ee`.
- [Raw macOS result](assets/desktop-diagnostics-macos.json).
- Apple M4, darwin arm64; Node 24.22.2, Electron 44.10.2, Go 1.26.10.
- `scripts/desktop-build.sh` / `npm run build --prefix desktop` passed.
- `scripts/desktop-test.sh --diagnostics` passed on the clean source.
- 71 host tests passed, including bounded rotation, schema redaction, malicious
  file types/permissions, sink failure, explicit recovery and listener denial.
- Real-Go transport integration: ten pass, one other-OS-user case skipped on
  local macOS and retained in Ubuntu CI.
- Native RF smoke, hostile-content security and real unpacked-app durable
  storage/recovery tests passed with the implementation before freezing.
- Twenty documentation tests plus claim/HTML validation and whitespace checks
  passed. No frontend or RF source changes are made by this batch.

## Native cases

The suite uses the real sandboxed renderer, host filesystem and Go sidecar in
private profiles. It kills only its owned child, observes a logged failure,
then explicitly confirms Help → Restart planning service. Generation rotates.
It deliberately crashes its own renderer, explicitly selects Reload Workspace
and confirms a usable UI on the same recovered backend generation. No RF POST
is made by either recovery. Playwright treats the crashed Page as terminal;
post-reload checks await the actual recovered webContents instead.

The real native log directory becomes unwritable after launch; the next Open
Logs call moves logging to a unique private temporary directory and selects
that actual sink. A separate launch starts with an unwritable configured log
directory and likewise remains usable on fallback. Original directory modes
are preserved. Missing executable and invalid dataset cases leave a useful
renderer with fixed failure guidance and discoverable structured logs.

A disposable bootstrap captures the actual main startup-error dialog options
and chooses Quit for missing resources. It verifies Open Logs, Retry and Quit
choices and the absence of raw user paths. Real unpacked-app storage tests also
exercise malformed/newer settings and an unwritable config directory, preserving
all domain stores and exact settings bytes through explicit recovery.

Every produced diagnostic record is parsed and checked for private paths and
credential-bearing text. Log directories/files use 0700/0600. Release/debug
redaction and disk/quota/rotation failures use deterministic unit injection;
there is no claim of physically exhausting the disk. Debug adds only a byte
counter, never raw stderr. Both levels retain the same content boundary.

Native dialog responses and the system-file-manager call are automated. Tests
verify the precise directory passed to the native shell API, not the appearance
of the external file-manager UI. There is no telemetry or automatic upload.

## Platform gate

Both native CI targets run `--diagnostics` independently of earlier benchmark
failures. Ubuntu tests sandboxed Electron under the existing exact-binary
AppArmor arrangement and X11. Their results are required before claiming
cross-platform diagnostic qualification; existing spike evidence is not reused
as proof for this implementation.
