# Desktop report qualification — 2026-11-09

This is scoped #156 evidence on the accepted Electron host, stacked on #189.
It does not establish physical printer, OS chooser UI, signed installation or
a complete support matrix. The independent macOS Go replacement budget remains
open in the prerequisite stack.

## Frozen local source

- Clean source: `672236869f9aaa6713bbd29aadd23855700d34b9`.
- [Raw macOS result](assets/desktop-reports-macos.json).
- Apple M4, darwin arm64; Node 24.22.2, Electron 44.10.2 and Go 1.26.10.
- Production desktop build, dataset validation and `scripts/desktop-test.sh --reports`
  passed on the clean source.
- 776 frontend tests, 92 host tests, frontend lint and build passed with the
  implementation. Existing project-file menu-scope, native RF smoke and
  hostile-content security regressions passed. The local keyboard activation
  restriction is not waived; strict keyboard CI remains in the parent.
- The real unpacked-app storage/upgrade/recovery suite passed on clean `c6fc562`
  before the drawer-only CSS/test refinement. Domain schemas did not change.
- Twenty documentation tests, claim/HTML validation and whitespace checks passed.

## Shared byte and user workflow checks

The suite copies the actual production UI dist into private resources, links
the existing Go/pack/icon/build identity and adds a test-only bundle of the
unchanged shared report code. No test module ships in production resources.
Fixed HTML/Markdown/SVG output passes through the real typed IPC, normal native
Save path and atomic writer with identical bytes and SHA-256. ZIP binary safety,
external conflicts and disk/quota failures have additional host regressions.
All native exports have a documented 64 MiB whole-file ceiling; larger output
is rejected without trimming or replacing retained evidence. The project-file
wrapper keeps its independent 16 MiB UTF-8/expanded/structural contract.

After one explicitly requested real Sector Run, the normal app controls save a
Version, retain/export Markdown, save PDF and export a self-verified review ZIP.
No export makes another RF request. The test compares saved Markdown to its
original retained bytes/hash. An actual unwritable destination preserves old
file bytes and the earlier artifact's bytes, hash and generation timestamp,
without opening a second chooser. Duplicate report outputs remain disabled
until their destination operation finishes.

Report definition persistence exposed a real compatibility bug: a domain
round-trip adds existing empty-profile/source-key inventory defaults, and
recovery autosave mistook that representation change for an input edit. Saved
Version comparison now applies only those same defaults on both sides. Tests
retain real RF profile and provenance-change detection. The native review ZIP
workflow passes after the repair; no RF math, identity format or schema changes.

## Real native PDF matrix

| Existing shared fixture | Native pages |
| --- | ---: |
| Single Cell | 7 |
| Optimized two Cells / before and after | 10 |
| Eight Cells | 9 |
| Eight Cells with profile deviations | 10 |
| Long identities/scenario and extended appendix | 11 |

These are the same illustrative presentation fixtures used by the browser
reference, with a Turkish project name. They are not physical RF validation
observations. Each actual native PDF is A4 portrait with selectable/tagged text,
source/generator details, complete Turkish text and Cell identities, expected
quantities/sections, horizontal text bounds and correct page/date footers. No
browser URL, loopback address or file path enters a printed page. Tags/outline
use Electron's experimental options, not a PDF/UA compliance assertion.

A sixth PDF renders hostile retained HTML; scripts, opener, privileged bridge,
frames and network remain blocked. The seventh comes from the normal product
Save PDF control after the real Run. All seven outputs were rendered through
Poppler and every page inspected, including long tables, profile differences,
lineage and the appendix. The product report UI was inspected at 1440 and 800px.
An internal drawer clipping defect was repaired with shrinkable grid tracks and
wrapped source actions; the native test now checks drawer content widths as well
as the viewport. PDF HTML/CSS remains shared with the browser.

While the isolated native PDF surface is held open, Quit keeps the main window
and runtime generation alive until the operation completes. A native Print
cancellation preserves evidence and opens no Save chooser. PDF output has a
30-second rendering deadline; load also uses the existing bounded surface.

## Automation and platform limits

Native dialog choices and the Print callback are automated. PDF rendering,
filesystem writes, shared repositories, the sandbox and the Go Run are real.
Callback automation does not qualify external print-dialog appearance or a
physical printer. Exact ownership checks cover both typed report operations;
the report renderer has no JavaScript, preload, Node, native bridge, opener,
persistent session or network authority. Retained HTML is never regenerated
implicitly after a write failure or missing artifact.

The accepted #148 framework decision selected Electron. Native CI therefore
qualifies that engine on macOS and Ubuntu X11 rather than claiming the original
issue's superseded WebKit/Wails assumption. Both CI report suites must pass
before cross-platform report qualification is claimed. Intel Mac, Wayland,
installed support, signing and redistribution retain their roadmap gates.
Existing Stadia denial tiles stay visible and are still a separate #155 gate.

Sources: [Electron Print/PDF API](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions),
[Electron Save dialogs](https://www.electronjs.org/docs/latest/api/dialog#dialogshowsavedialogwindow-options).

## Subsequent native CI result

Head `80722cb` passed both report suites in Quality run `42654106150`, clean
merge `3372dfe` (parents `82ab0f2`/`80722cb`). macOS artifact `13691388847` and
Ubuntu artifact `13691413815` retain all seven PDFs, structured results and UI
captures. Both targets preserve the 7/10/9/10/11 reference pagination and pass
the exact shared-byte, hostile HTML, normal controls, permission, cancellation,
Quit and no-RF checks. Strict project-file, storage, lifecycle/focus and security
suites also pass. The obsolete synchronous popup lifecycle fixture was updated
to await native Save cancellation; no OS dialog is left pending in that test.

Overall Quality remains 11/13: warm Go replacement measured macOS 6.177 s and
Ubuntu 6.178 s against the unchanged 5 s limit. Development-loop functional
cases, JSX/CSS p95 and host timing pass. This report feature evidence does not
waive the independent performance gate. The Stadia observation above describes
the frozen report source; subsequent #155 work uses the separately qualified
native OSM fallback.
