# Desktop project-file qualification — 2026-11-09

This is scoped evidence for #154 on the accepted Electron host. It does not
qualify installed distribution, OS chooser UI, signing or the full platform
matrix. [PR #188](https://github.com/Berk-Unsal/atom/pull/188)'s independent
macOS development-loop timing shortfall remains open.

## Frozen local source

- Clean source: `bf0b1026de27ab28791f6b1bbf182c43e106146a`.
- [Raw macOS result](assets/desktop-project-files-macos.json).
- Apple M4, darwin arm64; Node 24.22.2, Electron 44.10.2, Go 1.26.10.
- Production desktop build and dataset validation passed.
- `node desktop/test/project-files.mjs --menu-only` passed in an isolated profile.
- 81 host and 766 frontend unit/workflow tests, frontend lint/build, real-Go
  integration (10 pass, other-OS-user case skipped locally), native RF smoke and
  hostile-content security checks passed. Ubuntu CI owns the other-user case.
- Documentation claim/HTML validation and 20 documentation tests passed.

## Exercised behavior

The real sandboxed renderer, shared importer/serializer, typed native IPC,
atomic filesystem operations, Chromium repositories and Go engine are used.
Native dialog responses are automated with controlled temporary paths; the
suite does not operate or claim to qualify the OS chooser itself.

Cancelled, invalid and oversized Open preserve the active project and completed
Sector result. Save captures a just-edited power input before the recovery timer
fires, emits schema 3 and creates neither an RF request nor a Version. Save
Version remains separate. Actual external file modification produces a conflict.
Cancelled Save As and an actual unwritable destination preserve the existing
bytes and association. Save As adopts its destination only after commit; Export
Copy retains the prior association and writes identical shared bytes.

Schema 1 and 2 sample imports round-trip through schema 3 and the browser's shared
parser with identical Scenario plans and requests. Temporary destinations include
Turkish characters, spaces and an em dash. Same-timestamp newer edits and writes
that fail before/after portable commit have additional unit regressions.

Keep Editing on dirty Quit retains the window, generation and child. Save Files
and Quit commits the renamed project then drains/reaps the owned API. An
unexpectedly destroyed window also drains the child without waiting on an
unavailable renderer. Native UI screenshots at 1440 and 800 pixels are retained
under `desktop/test-results/project-files*.png`; the test asserts no horizontal
overflow. Existing Stadia authentication-error tiles remain visible and gated
by #155.

## Keyboard and platform limits

This local session cannot activate the test application. The explicit
`--menu-only` diagnostic records native shortcut qualification as **false** and
uses the same native menu operation instead. It does not waive a CI assertion.
The default `scripts/desktop-test.sh --project-files` requires actual native
window focus and Electron key events before confirming Save. Both macOS and
Ubuntu X11 CI run that default suite, independently of earlier benchmark
failures. Their results are required before claiming keyboard qualification.

Real native chooser interaction, Ubuntu Wayland, Intel Mac, clean-machine
installation, packaging and signing retain their separate qualification gates.
No physical disk exhaustion is claimed: disk/quota/rename fault handling uses
unit injection, while the native permission case uses a real read-only temporary
directory. No user files, browser profile or RF formulas are changed.
