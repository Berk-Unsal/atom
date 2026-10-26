# Documentation landing-page legibility follow-up

26 October 2026 · Baseline `0d60057` · User-authorized follow-up to #166.

The established documentation face, weights, colors and hierarchy stay in place.
The Read surface uses 16px prose (existing 66–70ch limits) and 14px secondary
labels, captions, workflow instructions and footer text. The prior secondary scale
included 10.88–11.52px content. Roles remain distinct through weight, color and
spacing; no new font or asset is needed.

Scope is the landing page's main guidance, footer and search-panel text. Shared
navigation and other documentation pages keep their existing layout. Reference titles and descriptions
stack inside each existing link so longer text can wrap at tablet widths. Workflow
instructions use 1.5 line height. Use rem units so user font settings can scale.

Verify all four existing viewports and both themes: prose/secondary computed size,
reference/workflow overflow, page width, contrast and existing theme/navigation
behavior. Inspect desktop and mobile workflow/reference screenshots in one batch,
fix any actual defects together, then confirm once. Run the type detector against
the final landing page, regenerate reference/search pages and run docs validation.
No RF, content claims, report storage, runtime or historical capture changes.

Verification passed: 40 documentation-theme checks across 1440/1024/768/390px
and both themes, 20 docs tests, claim/link/OpenAPI/VERSION checks, and frontend
lint. The final type scan reports zero findings; no tiny-text suppression was
added. Inspection of desktop/mobile workflow and reference captures found the
larger text and wrapping readable. The committed [desktop](assets/home-legibility/desktop-light.png)
and [mobile](assets/home-legibility/mobile-dark.png) examples come directly from
the Playwright workflow-section captures; they show the proposed CSS on the
current landing-page content. Shared app/RF source is unchanged.
