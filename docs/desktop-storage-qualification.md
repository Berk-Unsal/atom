# Desktop durable-storage qualification — 2026-11-09

This dated #153 record concerns the existing repository stores in an unpacked
Electron release host. It does not qualify installers, signing, full desktop
file dialogs, production map authorization or a public platform support matrix.

## Frozen local evidence

- Clean source: `fc15ec7040cd6bce1c8d436d28aede4106c9b700`.
- [Raw macOS result](assets/desktop-storage-macos.json).
- Apple M4 / darwin arm64, kernel 27.2.0; Node 24.22.2,
  Electron 44.10.2 and repository-selected Go 1.26.10.
- `npm run build --prefix desktop` and
  `scripts/desktop-test.sh --storage` passed.
- Sixty host unit tests, 752 frontend tests, frontend lint, production build,
  manifest validation and documentation checks passed locally.

The suite copies the real Electron runtime into a disposable application,
renames its executable and updates its own macOS bundle metadata. The native
`app.isPackaged` check is true; no property mock or force-packaged flag is used.
Every application resource is read-only during launches, HOME/XDG paths are
isolated, and cwd is a separate directory. Packaged profile/resource/Vite/control
overrides are deliberately supplied and ignored. Relative XDG runtime input is
ignored. The host resolves native data/config/cache/log/state/runtime paths.

A test-only bundle invokes the unchanged production workspace/LocalRepository,
Run History and artifact-store contracts in real Chromium IndexedDB. The test
saves a Unicode-named workspace, a terminal Run, report metadata and HTML bytes,
and localStorage, then compares all values and the report content hash after:

1. A renderer reload and ordinary application relaunch.
2. HTTP-cache clearing and removal of only the native cache root while stopped.
3. Occupying the prior sidecar port and observing a different actual port and
   generation behind the same `app://atom` origin.
4. Relocating the entire macOS `.app` and replacing the Go/host build identity
   with `0.13.2-storage-test` (a test version, not a release/version bump).

Native preferences, dataset registry, recent-file associations and a pack marker
survive. A file outside the native data/profile/cache roots keeps its chosen
path and exact bytes. This does not stand in for the native Save/Open workflow
owned by #154. The shared project menu identifies desktop autosave as recovery
storage and recommends a portable export for a separate backup.

The test then writes a newer settings schema and makes the config directory
unwritable. Each actual host startup takes its explicit recovery path without
resetting the settings, changing permissions or deleting domain stores. The
native recovery dialog's options are captured and its dismissal automated;
its message/detail are asserted. Restoring the original settings/permissions
allows the same repository data to load again.

Directory permissions are 0700 and host settings/state files 0600. Unit fault
injection separately covers ENOSPC, EDQUOT, failed rename, interrupted sibling
writes, malformed/oversized/newer settings, symlink leaves and shared directory
permissions; it verifies exact preservation of the last-good settings. This is
fault-injection evidence, not a claim of physically filling the local disk.

## Scope and reproduction

Both native storage suites passed on head `c8e3323b82df0a86106e353994a8dd01a0b8da70`
in Quality run `42600219098`, test merge
`8a0eed5ad529e6d60a54250a95c62a2d96e468f6` (parents `984c28a`/`c8e3323`).
Artifacts `13664778755` (macOS) and `13665741440` (Ubuntu) retain their raw results.
[PR #188](https://github.com/Berk-Unsal/atom/pull/188) remains draft: overall
12/13 checks passed, with macOS warm Go replacement at 5.93 s against the
unchanged 5 s development-loop limit. Its functional cases passed; this measured
performance shortfall is not waived by passing storage checks.
Ubuntu relocates the Resources tree while keeping its AppArmor-qualified binary
path fixed; arbitrary executable relocation, installed upgrade/uninstall,
Wayland, Intel Mac and signed/quarantined bundles retain their roadmap gates.
The local suite is not a clean-machine installation test. Existing browser data
is never migrated, reset or used as a fixture. No workspace/domain schema changes
or second project database are introduced.

See [native storage paths and recovery](../desktop/README.md#native-storage-and-recovery)
for directory tables and cache-cleanup boundaries. Reproduce with the existing
frontend/desktop dependencies, the local desktop build and `--storage` in a
sandboxed graphical session. The Quality workflow documents Ubuntu's exact
AppArmor rules; no test disables the sandbox.
