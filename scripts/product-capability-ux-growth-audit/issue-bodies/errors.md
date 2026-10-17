## Context

A.T.O.M is local-first, so new users often run a frontend without a reachable backend or enter out-of-range values. The rate-limit message is already a good model ("RF request budget reached. Try again in about 17 seconds."); other failures are not.

## Problem

Observed in a browser walkthrough of a local build of current main (`d076397`, VERSION 0.12.3) on 17 October 2026. Failures were injected with request interception.

- **Backend unreachable:** the Setup drawer shows only **"Failed to fetch"**, the command bar reads **"Single · Cell No tower"**, the primary action is disabled, and there is no retry.
- **RF 500:** the message is the raw **"internal error"**.
- **Invalid input** (Conducted TX power 99 dBm, valid 0–60): the field shows no error state or `aria-invalid`, the primary becomes disabled **"Resolve setup issues"**, and the map prompt says **"Fix 1 invalid selected cell profile in Inventory"** although the value was entered in Setup.

## Scope

- Map known failure classes (network unreachable, 5xx, invalid JSON) to cause, recovery and a Retry action for startup data loads; keep server-provided validation text where it is user-safe.
- Invalid numeric inputs show an inline message and `aria-invalid`.
- The invalid-setup prompt names and opens the tool that owns the invalid field.

## Acceptance criteria

- [ ] With the backend unreachable, the UI names the API origin it tried, explains the likely cause and offers Retry; no "No tower" placeholder text appears.
- [ ] A 5xx RF response shows a recovery message plus server detail; 429 behavior is unchanged.
- [ ] Out-of-range numeric fields show inline errors and `aria-invalid=true`; fixing the value clears both.
- [ ] The setup prompt routes to Setup or Inventory according to where the invalid value lives.
- [ ] Interception tests cover unreachable, 500 and 429 (existing), plus an invalid-field interaction test.

## Non-goals

No automatic retries, no changes to RF request accounting or rate limits, no backend error-format change.

## Evidence / references

- [frontend-react/src/App.jsx:L499-L560](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L499-L560) — startup loads
- [frontend-react/src/utils/apiClient.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/apiClient.js)
- [frontend-react/src/utils/rfRecoveryMessage.js](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/utils/rfRecoveryMessage.js) — existing 429 pattern
- [frontend-react/src/components/ControlPanel.jsx:L376-L410](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/components/ControlPanel.jsx#L376-L410) — numeric fields
- [frontend-react/src/App.jsx:L2765-L2771](../blob/d0763974e2b5b68c209fda5c680cdfd8b1bdde2a/frontend-react/src/App.jsx#L2765-L2771) — misdirected prompt

## Dependencies

None. Open PR #63 also edits `apiClient.js` (HTTPS base-URL assertion); rebase rather than overlap.

## Contributor notes

Suitability: **help wanted**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**. Semantic/scientific risk: **none**.
