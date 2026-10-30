import { afterEach, describe, expect, it, vi } from "vitest";
import { openStoredHtmlReport, printReportHtml } from "./reportArtifactDownload.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function popup(fontsReady = Promise.resolve()) {
  const result = { document: { write: vi.fn(), close: vi.fn(), images: [], fonts: { ready: fontsReady } }, closed: false,
    focus: vi.fn(), print: vi.fn(), setTimeout, clearTimeout };
  vi.spyOn(window, "open").mockReturnValue(result);
  return result;
}

describe("local report printing", () => {
  it("waits for fonts and the document rather than printing on a fixed early delay", async () => {
    vi.useFakeTimers();
    let ready;
    const result = popup(new Promise((resolve) => { ready = resolve; }));
    printReportHtml("<!doctype html><title>Report</title>");
    await vi.advanceTimersByTimeAsync(400);
    expect(result.print).not.toHaveBeenCalled();
    ready();
    await vi.runAllTimersAsync();
    expect(result.print).toHaveBeenCalledTimes(1);
  });

  it("prints retained bytes without replacing their content or metadata", async () => {
    vi.useFakeTimers();
    const result = popup();
    const metadata = { filename: "old-report.html", generator_version: "atom-report-generator-v1" };
    const html = "<!doctype html><h1>Original retained report</h1>";
    expect(openStoredHtmlReport(metadata, new TextEncoder().encode(html))).toBe(metadata);
    expect(result.document.write).toHaveBeenCalledWith(html);
    await vi.runAllTimersAsync();
    expect(result.print).toHaveBeenCalledTimes(1);
  });

  it("explains a blocked print window", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(() => printReportHtml("<h1>Report</h1>")).toThrow(/allow popups/);
  });
});
