## Context

Handing a decision to a reviewer currently means several separate downloads (report, project file, optional GIS files) that the reviewer must reassemble and trust.

## Problem

Report HTML/Markdown and the project file are downloaded separately, with no shared manifest tying them to one Version, dataset and model identity.

## Scope

**Class A — product-safe.** MVP:

- **Export review package** produces one local zip for the current saved Version containing the HTML report, Markdown report, project file, a map image and a `manifest.json` (file SHA-256 hashes, dataset/model identity, Version/Run lineage, limitations text).

## Acceptance criteria

- [ ] The package is generated locally from existing artifacts with no RF request (no-hidden-request test).
- [ ] The manifest's hashes match the contained files; its lineage matches the report source.
- [ ] Filenames follow the shareable-download naming rule.
- [ ] Unsaved drafts are refused with guidance to save a Version first.

## Non-goals

No hosted sharing, links or accounts. No cryptographic signing requirement. No new report content.

## Evidence / references

- [frontend-react/src/utils/reportExport.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/reportExport.js)
- [frontend-react/src/repository/artifactStore.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/repository/artifactStore.js)
- [frontend-react/src/components/WorkspaceChrome.jsx:L233-L248](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/WorkspaceChrome.jsx#L233-L248)

## Dependencies

Depends on #102 (naming and report content).

## Contributor notes

Suitability: **help wanted**. Rough effort: **M** (planning estimate, not a promise). Priority: **P3**. Semantic/scientific risk: **none — repackages existing provenance**.
