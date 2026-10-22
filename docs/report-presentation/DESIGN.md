---
name: A.T.O.M Report Presentation
description: Implemented visual conventions for generated planning reports.
colors:
  planning-green: "#205843"
  planning-green-hover: "#153e2e"
  paper: "#fff"
  screen-ground: "#edf1ef"
  report-ink: "#172b25"
  supporting-ink: "#344b42"
  section-rule: "#bdcbc4"
  strong-rule: "#8fa69a"
  table-rule: "#d8e1dc"
  table-heading-ink: "#263e33"
  table-heading-ground: "#f4f6f4"
  status-ground: "#f1f4f2"
  map-ground: "#f8faf9"
  keyboard-focus: "#426d97"
  constraint-failure: "#8c2435"
typography:
  display:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "23pt"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15pt"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "11pt"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "11pt"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "9.5pt"
    fontWeight: 400
    lineHeight: 1.5
  metric:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "20pt"
    fontWeight: 700
    lineHeight: 1.2
  table:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "10pt"
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "9pt"
    fontWeight: 400
    lineHeight: 1.45
spacing:
  table-inset: "8px"
  metric-inset: "12px"
  mobile-inset: "20px"
  metric-column-gap: "22px"
  section-inset: "24px"
  profile-column-gap: "28px"
components:
  print-button:
    backgroundColor: "{colors.planning-green}"
    textColor: "{colors.paper}"
    padding: "10px 16px"
  print-button-hover:
    backgroundColor: "{colors.planning-green-hover}"
  report-header:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.report-ink}"
    padding: "20px 0 22px"
  completeness-state:
    backgroundColor: "{colors.status-ground}"
    textColor: "{colors.report-ink}"
    padding: "1px 5px"
  primary-result:
    textColor: "{colors.report-ink}"
    typography: "{typography.metric}"
    padding: "12px 0 17px"
  parameter-table:
    textColor: "{colors.report-ink}"
    typography: "{typography.table}"
    width: "100%"
  rf-profile-group:
    textColor: "{colors.report-ink}"
    typography: "{typography.label}"
  map-callout:
    backgroundColor: "{colors.paper}"
---

# Design System: A.T.O.M Report Presentation

## Overview

**Creative North Star: "The engineering record"**

This scoped Read surface presents existing planning results as a selectable, offline document. Dark green type, white paper, thin rules and aligned quantities keep long technical evidence readable. Identity and evaluation state precede results; configuration, provenance and exact references follow in the shared report order.

This specification covers generated HTML and its Markdown counterpart. It does not define the application workspace or replace the product identity in `PRODUCT.md`. The implemented authority is [reportHtml.js](../../frontend-react/src/utils/reportHtml.js), [reportMap.js](../../frontend-react/src/utils/reportMap.js), [reportModel.js](../../frontend-react/src/utils/reportModel.js) and [reportMarkdown.js](../../frontend-react/src/utils/reportMarkdown.js). The [reader guide](../report-guide.md) explains quantity meanings, filenames and export settings.

**Key Characteristics:**

- Flat paper with a compact identity header and ruled quantitative summary.
- Neutral, written evaluation states and explicit units or denominators.
- Narrow RF tables, stable Cell numbers and source-aware map captions.
- System fonts, inline vector geometry and no shipping raster assets.

## Colors

The report uses one green accent with near-white grounds and green-tinted text and rules; the frontmatter records the literal source values. Sidecar tonal ramps are documentation previews, not additional production colors.

### Primary

Planning green marks the header rule, scenario title, print action and selection. Its darker hover variant belongs to the print action.

### Neutral

Paper is the document ground; screen ground surrounds it only on screen. Report ink carries reading text and values. Supporting ink carries identity, labels and notes. Section, strong and table rules separate chapters, results and rows. Table headings and evaluation states use their own pale grounds. Map ground separates the SVG from the page. Keyboard focus uses a blue outline; constraint failure has a distinct rose text treatment.

**The Evidence Color Rule.** Evaluation completeness is written in neutral text. Map colors retain their RF, gap and SINR meanings from the renderer; the report accent must not replace those scientific encodings or imply a result grade.

## Typography

Arial with Helvetica and generic sans-serif fallbacks supplies every document role. No downloaded font or font synthesis is required. The frontmatter contains the desktop hierarchy; results and tables use tabular numerals.

Scenario text is a subordinate green line (16pt, line-height 1.3); identity is smaller (10pt). Interpretation receives a modest increase (11.5pt, line-height 1.55) and a reading measure of 75ch. KPI labels reserve 2.8em of height and a 24ch measure; their qualifiers remain smaller (8.5pt). Table headings use bold type (9pt); RF group tables use 9.5pt and appendix tables use 9pt.

Print body text is 10.5pt. Running chrome is 8pt, with the scenario/Version line at 7.5pt. At the mobile breakpoint, the document title becomes 20pt, scenario text 14pt and primary results 18pt.

## Layout

The desktop paper is centered at a maximum width of 940px with 44px vertical and 52px horizontal padding. The screen-only action row sits above it. The header has a three-pixel green top rule; chapters use thin rules and consistent vertical spacing. Primary results form three equal columns, completeness forms two, and RF groups form two balanced columns.

At screen widths of 720px or less, paper margins disappear and padding becomes 26px vertically and 20px horizontally. KPIs use two columns; completeness and RF groups stack into one. Cell tables can scroll horizontally with a 480px minimum width. IDs longer than 36 characters switch the registry to per-Cell records; record headings can wrap on mobile. Other tables keep fixed layout and wrap their content.

Portrait A4 uses CSS margins of 18mm vertically and 15mm horizontally. Print removes the action row and screen frame. A retained map starts a new page; other chapters flow. The running top line identifies A.T.O.M plus scenario/Version, and the bottom line carries generation time and Page X of Y. The running scenario is shortened to 42 Unicode code points while full identity remains in the body.

**The Fragmentation Rule.** Keep headings with following content, section leads together, figures intact, and RF profile groups together. Keep table rows, Cell records, tables of at most 16 rows and deviation records of at most 16 rows intact. The first deviations heading belongs to its first Cell record. Longer tables may span pages with repeated headers; print captions move above the table. Paragraphs and list items request three orphans and three widows. Limitations stay together without forcing a dedicated page.

Reference captures used Chromium 149.0.7827.55, A4, CSS margins, default scale and disabled native browser headers/footers. Single-Cell, optimized two-Cell, eight-Cell, heterogeneous-profile and long-identity cases were inspected. Browser print produces the PDF; PDF.js is a development-only verifier. Other engines and print overrides can change pagination or margin-box support.

## Elevation & Depth

The report has no shadows, gradients or animated transitions. White paper against the screen ground establishes the outer frame; rules and pale table/status grounds establish structure within it. Printing removes that outer frame.

## Shapes

Document surfaces, tables, status labels and the print button have square corners. One-pixel rules provide most boundaries. The vector map uses circular numbered callouts; straight leaders connect offset labels to true projected Cell anchors. Leaders render above the scientific layers and below the numbered callouts.

## Components

### Identity and print control

The header contains the full report title, scenario, project, source lineage, source context and UTC generation time. The print control sits outside the document. It uses a filled green button, darker hover and a visible three-pixel focus outline with a three-pixel offset. It disappears in print. The in-app export/reopen path waits for fonts and images before printing; the standalone HTML button invokes native print directly.

### Completeness and primary results

Completeness is a semantic description list with pale neutral labels, not success/failure badges. Preserve the differences between Evaluated, Not evaluated, Not retained in source, Not recorded and Unavailable. Primary results use a second description list with a thin top rule per metric, a stable label position, a large value and a smaller qualifier when needed.

### Tables and RF profiles

Tables are flat, full width and border-collapsed, with left-aligned cells and fine horizontal rules. Desktop cells use seven-pixel vertical and eight-pixel horizontal padding; dense RF, appendix and print rows reduce vertical padding to five pixels. Table containers have visible keyboard focus. Common or reference RF fields use narrow Parameter/Value tables; reference profiles include scope, followed by lossless per-Cell deviations.

### Planning map and Cell registry

The responsive inline SVG uses a 720 by 460 viewBox and stays with its caption in print. Stable numbers link callouts, the registry and RF configuration. Only labels move to avoid overlap; anchor positions retain their geographic meaning. The caption records retained geometry, sampling and source alignment, including layer-only or differently simulated evidence. Markdown carries the caption and omission note; package links appear only when companion files exist.

## Do's and Don'ts

### Do:

- **Do** keep this specification scoped to generated report presentation.
- **Do** preserve the shared report model's order, conditional content, written states and exact identity.
- **Do** show units and denominators beside the quantities they qualify.
- **Do** keep sampling, configuration alignment and missing evidence explicit in map captions.
- **Do** preserve selectable text, system fonts and vector maps for offline output.

### Don't:

- **Don't** turn evaluation states or the /100 planning utility into a physical validation or confidence grade.
- **Don't** infer missing historical RF inputs from current defaults or substitute dataset-wide denominators.
- **Don't** use color as the sole carrier of scientific or availability meaning.
- **Don't** promote these document conventions into application-wide design tokens.
- **Don't** promise identical pagination across browsers or treat browser printing as PDF/UA certification.
