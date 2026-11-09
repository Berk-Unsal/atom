import { afterEach, describe, expect, it, vi } from "vitest";
import { createReportDownloads, openStoredHtmlReport, printReportHtml } from "./reportArtifactDownload.js";
import { sha256Hex } from "./sha256.js";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

function popup(fontsReady = Promise.resolve()) {
  const result = { document: { write: vi.fn(), close: vi.fn(), images: [], fonts: { ready: fontsReady } }, closed: false,
    focus: vi.fn(), print: vi.fn(), setTimeout, clearTimeout };
  vi.spyOn(window, "open").mockReturnValue(result);
  return result;
}

describe("local report printing", () => {
  it("native downloads send the original captured bytes, filename and hash through Save without a browser download", async () => {
    const save = vi.fn(async () => ({ canceled: true })); const output = vi.fn();
    const native = createReportDownloads({ capabilities: { nativeReports: true }, reports: { save, output } });
    const bytes = new Uint8Array([0x50, 0x4b, 0xff, 0]); const original = new Uint8Array(bytes);
    const metadata = Object.freeze({ filename: "Historical — çığ.zip", media_type: "application/zip", content_hash: await sha256Hex(bytes), generated_at: "2020-01-01T00:00:00Z" });
    const pending = native.downloadReportBytes(metadata, bytes); bytes.fill(0);
    await expect(pending).resolves.toEqual({ canceled: true });
    expect(save).toHaveBeenCalledWith({ format: "zip", name: metadata.filename, bytes: original, sha256: metadata.content_hash });
    expect(output).not.toHaveBeenCalled(); expect(metadata.generated_at).toBe("2020-01-01T00:00:00Z");
  });
  it("native printing preserves retained UTF-8 BOM bytes and does not open a privileged popup", async () => {
    const output = vi.fn(async () => ({ saved: true })); const open = vi.spyOn(window, "open");
    const native = createReportDownloads({ capabilities: { nativeReports: true }, reports: { output } });
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("<h1>Original Türkçe report</h1>")]);
    const metadata = Object.freeze({ filename: "old-report.html", content_hash: await sha256Hex(bytes) });
    await expect(native.openStoredHtmlReport(metadata, bytes, { mode: "print" })).resolves.toBe(metadata);
    expect(output).toHaveBeenCalledWith({ mode: "print", name: metadata.filename, bytes, sha256: metadata.content_hash });
    expect(open).not.toHaveBeenCalled();
  });
  it("native Save and Print failures reach the caller rather than triggering another operation", async () => {
    const error = Object.assign(new Error("Destination full"), { code: "file_disk_full" });
    const save = vi.fn(async () => { throw error; }); const output = vi.fn(async () => { throw error; });
    const native = createReportDownloads({ capabilities: { nativeReports: true }, reports: { save, output } });
    await expect(native.downloadReportBytes({ filename: "report.md" }, new TextEncoder().encode("Original"))).rejects.toBe(error);
    await expect(native.printReportHtml("<h1>Original</h1>")).rejects.toBe(error);
    expect(save).toHaveBeenCalledOnce(); expect(output).toHaveBeenCalledOnce();
  });
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
