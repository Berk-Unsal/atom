import { platform } from "../platform/index.js";
import { sha256Hex, toUint8Array } from "./sha256.js";

const MAX_NATIVE_REPORT_BYTES = 64 * 1024 * 1024;
function nativeBytes(value) {
  const bytes = toUint8Array(value);
  if (!bytes.byteLength || bytes.byteLength > MAX_NATIVE_REPORT_BYTES) throw new Error("Report exports must contain between 1 byte and 64 MiB.");
  return new Uint8Array(bytes);
}
function reportFormat(metadata) {
  const type = String(metadata?.media_type ?? "").split(";")[0].toLowerCase();
  const format = ({ "text/html": "html", "text/markdown": "markdown", "image/svg+xml": "svg", "application/zip": "zip" })[type]
    || ({ html: "html", md: "markdown", svg: "svg", zip: "zip" })[String(metadata?.filename ?? "").split(".").at(-1).toLowerCase()];
  if (!format) throw new Error("This report format is not supported by native Save.");
  return format;
}

export function createReportDownloads(target = platform) {
  function downloadReportBytes(metadata, value) {
    if (target.capabilities.nativeReports) {
      const bytes = nativeBytes(value);
      return Promise.resolve().then(async () => target.reports.save({ format: reportFormat(metadata), name: metadata?.filename ?? "atom-report.html", bytes,
        sha256: metadata?.content_hash || await sha256Hex(bytes) }));
    }
    const blob = new Blob([value], { type: metadata?.media_type ?? "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = metadata?.filename ?? "atom-report";
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }
  function printReportHtml(html, { filename = "atom-report.pdf", mode = "pdf", metadata } = {}) {
    if (target.capabilities.nativeReports) {
      const bytes = nativeBytes(new TextEncoder().encode(html));
      return Promise.resolve().then(async () => target.reports.output({ mode, name: filename, bytes, sha256: metadata?.content_hash || await sha256Hex(bytes) }));
    }
    const reportWindow = window.open("", "_blank", "width=980,height=1100");
    if (!reportWindow) throw new Error("The report window was blocked. Please allow popups for this site.");
    reportWindow.document.write(html); reportWindow.document.close();
    void waitForReportDocument(reportWindow).then(() => { if (!reportWindow.closed) { reportWindow.focus(); reportWindow.print(); } });
    return reportWindow;
  }
  function openStoredHtmlReport(metadata, value, { mode = "pdf" } = {}) {
    if (target.capabilities.nativeReports) {
      // Send the verified original bytes directly; decoding/re-encoding would
      // change a retained UTF-8 BOM and invalidate its original content hash.
      const bytes = nativeBytes(value);
      return Promise.resolve().then(async () => target.reports.output({ mode, name: metadata?.filename ?? "atom-report.pdf", bytes,
        sha256: metadata?.content_hash || await sha256Hex(bytes) })).then(() => metadata);
    }
    printReportHtml(new TextDecoder().decode(value)); return metadata;
  }
  return { downloadReportBytes, printReportHtml, openStoredHtmlReport };
}
const downloads = createReportDownloads();
export const downloadReportBytes = (...args) => downloads.downloadReportBytes(...args);
export const printReportHtml = (...args) => downloads.printReportHtml(...args);
export const openStoredHtmlReport = (...args) => downloads.openStoredHtmlReport(...args);

async function waitForReportDocument(reportWindow) {
  const ready = [reportWindow.document.fonts?.ready];
  for (const image of Array.from(reportWindow.document.images ?? [])) {
    if (!image.complete) ready.push(new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    }));
  }
  // Old stored HTML can refer to unavailable assets; never wait indefinitely to print it.
  let timeout;
  await Promise.race([Promise.allSettled(ready), new Promise((resolve) => { timeout = reportWindow.setTimeout(resolve, 3000); })]);
  reportWindow.clearTimeout(timeout);
  await new Promise((resolve) => reportWindow.setTimeout(resolve, 0));
}
