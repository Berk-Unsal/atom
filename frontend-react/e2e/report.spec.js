import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildPlanningReport, renderHtmlReport } from "../src/utils/reportExport.js";
import { reportInputs } from "../src/test/fixtures/reportFixtures.js";

const cases = [
  { name: "single-cell", options: { cells: 1, segments: 1000 }, single: true },
  { name: "two-cells-optimized", options: { cells: 2, optimized: true, segments: 2000 } },
  { name: "eight-cells", options: {} },
  { name: "eight-cells-heterogeneous", options: { heterogeneous: true } },
  { name: "eight-cells-long-identities", options: { longIds: true, longScenario: true, extendedAppendix: true } },
];

function fixture(entry) {
  const inputs = reportInputs(entry.options);
  if (entry.single) Object.assign(inputs, { planningMode: "single", selectedTower: inputs.selectedNetworkTowers[0], selectedNetworkTowers: [], networkOptimization: null });
  return buildPlanningReport(inputs);
}

test("the standalone report is readable, accessible and printable", async ({ page }, testInfo) => {
  const report = fixture(cases[2]);
  await page.setContent(renderHtmlReport(report));
  await expect(page.getByRole("heading", { name: "Decision summary", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const findings = await new AxeBuilder({ page }).analyze();
  expect(findings.violations).toEqual([]);
  await page.getByRole("button", { name: "Save as PDF" }).focus();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("report-screen.png"), fullPage: true });
});

test("the browser popup uses the shared print path and contains the complete report", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "Print delivery is checked once on the reference browser.");
  await page.route("**/__report-print-harness", (route) => route.fulfill({ contentType: "text/html", body: '<html lang="en"><title>Print delivery</title><button id="export">Open report</button></html>' }));
  await page.goto("/__report-print-harness");
  await page.evaluate(async (html) => {
    const { printReportHtml } = await import("/src/utils/reportArtifactDownload.js");
    document.getElementById("export").onclick = () => printReportHtml(html);
  }, renderHtmlReport(fixture(cases[2])));
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open report" }).click()]);
  await expect(popup.getByRole("heading", { name: "Decision summary", exact: true })).toBeVisible();
  await expect(popup.getByRole("heading", { name: "Engineering appendix", exact: true })).toBeAttached();
  await expect(popup).toHaveTitle(/ankara-engineering-review.*network-evaluation-report/);
  const bytes = await popup.pdf({ preferCSSPageSize: true, displayHeaderFooter: false, tagged: true });
  expect(bytes.toString("latin1")).toContain("/StructTreeRoot");
  await popup.close();
});

for (const entry of cases) test(`A4 PDF retains meaning and page boundaries: ${entry.name}`, async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-1440", "PDF pagination uses one pinned Chromium desktop reference.");
  const report = fixture(entry);
  await page.setContent(renderHtmlReport(report));
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.evaluate(() => document.fonts.ready);
  const bytes = await page.pdf({ path: testInfo.outputPath(`${entry.name}.pdf`), preferCSSPageSize: true, displayHeaderFooter: false, printBackground: true, tagged: true, outline: true });
  await testInfo.attach(`${entry.name}.pdf`, { body: bytes, contentType: "application/pdf" });
  expect(bytes.toString("latin1")).toContain("/StructTreeRoot");
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  const pdf = await loading.promise;
  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const sheet = await pdf.getPage(n);
      const viewport = sheet.getViewport({ scale: 1 });
      expect(viewport.width).toBeCloseTo(595.28, 0);
      expect(viewport.height).toBeCloseTo(841.89, 0);
      const content = await sheet.getTextContent();
      const items = content.items.filter((item) => item.str?.trim());
      const text = items.map((item) => item.str).join(" ");
      pages.push(text);
      expect(text).toContain(`Page ${n} of ${pdf.numPages}`);
      expect(text).toContain("Generated 2026-10-19 08:36 UTC");
      expect(text).not.toMatch(/about:blank|localhost|127\.0\.0\.1|file:\/\//);
      for (const item of items) {
        expect(item.transform[4], item.str).toBeGreaterThanOrEqual(41);
        expect(item.transform[4] + item.width, item.str).toBeLessThanOrEqual(555);
      }
      // Ordinary report headings must retain following content on their page.
      for (const section of report.view.sections) {
        const heading = items.find((item) => item.str === section.title);
        if (heading) expect(heading.transform[5], section.title).toBeGreaterThan(90);
      }
      const body = items.filter((item) => item.transform[5] > 50 && item.transform[5] < 790);
      expect(body.length, `Page ${n} should not strand a short section`).toBeGreaterThan(6);
    }
    expect(pages[0]).toContain("Decision summary");
    expect(pages[0]).toContain("Results are deterministic planning estimates");
    expect(pages[0]).toContain(entry.single ? "Mean ray-endpoint Rx" : "66.6 / 100");
    expect(pages.join(" ")).toContain("Engineering appendix");
    expect(pages.join(" ")).toContain("300 of");
    if (entry.options.optimized) expect(pages.join(" ")).toContain("Baseline vs Recommended");
    if (entry.options.heterogeneous) {
      expect(pages.join(" ")).toContain("7 of 8 Cells match");
      const deviationPage = pages.find((text) => text.includes("Cell-specific configuration / deviations"));
      expect(deviationPage).toContain("Cell 8414708");
      expect(deviationPage).toContain("Value instead of reference");
    }
    if (entry.options.longIds) for (const cell of report.view.cells) expect(pages.join(" ")).toContain(cell.id);
    if (entry.options.extendedAppendix) {
      expect(pages.filter((text) => text.includes("File SHA-256")).length).toBeGreaterThanOrEqual(2);
      expect(pages.join(" ")).toContain("fixture-layer-39.geojson");
    }
    await testInfo.attach("pdf-page-text.json", { body: JSON.stringify(pages, null, 2), contentType: "application/json" });
  } finally { await loading.destroy(); }
});
