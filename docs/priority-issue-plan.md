# Priority issue execution plan

24 October 2026 · Repository `Berk-Unsal/atom` · Baseline `fc0f1e4` (0.13.0)

## Triage

The open GitHub backlog was read together with issue dependencies and the D01
qualification comments. Priority is taken from issue bodies; search results do
not expose labels reliably.

| Work | Priority | Next action |
| --- | --- | --- |
| #148 desktop compatibility | P1 | Native GNOME Wayland Open/Save remains unproved. Retain the gate; the committed spike report records the other qualification evidence. |
| #150, #151 desktop lifecycle/security | P1 | Follow #149 after #148 qualification. Do not promote the disposable spike into a production shell before its gate. |
| #155 desktop data/maps | P1 | Follow #153; production basemap access and permitted default-pack distribution also need evidence. |
| #160, #161 signing/Ubuntu distribution | P1 | Follow their shell/runtime/qualification/package prerequisites. |
| #87–#90 canonical field validation | P1 | External collector, transmitter, measurement-resource and reference-set evidence is missing. Keep accuracy/calibration readiness blocked. |
| #82 contribution setup | P2 | Independent and actionable. Repair the canonical guide and discoverability first. |
| #78 planning walkthrough | P2 | Independent and actionable. Add a fixed public-pack example and exercise baseline → optimization → preserved evidence. |

## Execution order

1. **#82:** add a root contribution entry and README link to one maintained
   `docs/contributing.md`; replace stale setup, invented examples, test and
   release instructions with the actual repository/CI commands. Include Git LFS,
   Vite readiness, Pandoc 3.10, hash-pinned Python dependencies and ownership
   boundaries.
2. **#78:** preserve the legacy settings-only sample; provide a separate bounded
   Ankara network fixture with explicit dataset identity and selected Cells.
   Record fixed inputs, evaluate and optimize against the real API, explain a
   measured baseline delta and trade-off, and document Version/project/report
   preservation. Add import/round-trip regression coverage.
3. Build reference pages and search index. Run documentation tests, link/OpenAPI
   and claim validation, version/policy checks, and the affected frontend tests.
   Exercise the public-pack walkthrough and report the actual result identity
   and limits. Record user-visible changes under Unreleased.
4. Deliver the scoped changes and validation for review. GitHub issues stay open
   until the changes land; no P1 evidence gate is satisfied by this work.

This plan does not authorize vendor contact, invented RF truth, a release or
acceptance of the remaining desktop qualification gap.

## Completed implementation and validation

- #82: root/README entry points now reach one maintained guide. Setup and
  commands were checked against source, package scripts and CI. Newcomer links
  reject missing/ignored local files. Hidden tool state is excluded from the
  documentation source inventory, with a regression fixture.
- #78: the separate two-Cell project preserves the legacy sample and pins
  public-pack records, hashes and full RF profiles. The shared request builder
  reproduced fingerprint `network-6fe95eaddbb92e9ba9a3bf0fa5384544`: score
  40.0089 → 81.4048, demand weight 115 → 305, residential buildings 167 → 338,
  overlap 109 → 4. A 240°/110° alternative retains demand and eliminates overlap
  while covering 11 fewer residential buildings than the recommendation.
- Actual browser exercise: import, evaluate, save baseline, optimize, inspect
  alternative, evaluate recommendation, save Version, export and reopen through
  the project importer, download Markdown and export the review ZIP. Its HTML,
  Markdown, project and map match all manifest SHA-256 hashes. Generated reports
  honestly retain their available source lineage, including no Run where absent.
- Frontend: 41 focused tests, lint and production build passed; all 734 tests
  passed on Node 24.22.1. The installed Node 26.12.1 caused the existing App
  workflow setup to fail at `window.localStorage.clear()`; no production or test
  implementation was changed to accommodate that runtime difference.
- Browser: the download-guide regression passed at 1440, 1024, 768 and 390 px,
  in light/dark themes, checking 14 px instructions/headings, white primary-hover
  text, no horizontal overflow and the walkthrough navigation. Review captures
  are in `docs/assets/planning-walkthrough/`.
- Documentation: Pandoc 3.10 regeneration, all 17 documentation tests, current
  claim checks and link/asset/OpenAPI validation passed (60 HTML pages, 43 API
  paths). VERSION, policy and supply-chain consistency passed. The actual Go
  lifecycle test and public dataset validator passed with Go 1.26.10.

The guide's small workflow text was raised to 14 px. The confirmed generic-hover
contrast false positive and table-wrapper padding false positive have local,
file-scoped detector ignores; the existing font is intentionally retained.
No blanket rule or file ignore was added. No RF implementation, request budget,
portable-file limit, desktop gate or release metadata was changed.

## CI security follow-up

The first PR run exposed two high-severity findings in the pre-existing frontend
development dependency lock: undici 7.30.0 (via jsdom) and zod 4.4.3 (via the React
Hooks ESLint plugin). Upstream advisories were checked; the compatible lockfile
updates are undici 7.30.1 and zod 4.6.7. No direct dependency range, runtime major
version or audit threshold was changed. A clean install, security audit (zero
vulnerabilities), lint, all 734 frontend tests and production build passed after
the updates for this separate remediation commit.
