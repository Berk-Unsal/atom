export function downloadReportBytes(metadata, bytes) {
  const blob = new Blob([bytes], { type: metadata?.media_type ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = metadata?.filename ?? "atom-report";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function openStoredHtmlReport(metadata, bytes) {
  const html = new TextDecoder().decode(bytes);
  printReportHtml(html);
  return metadata;
}

/** The same local print path for newly generated and retained HTML. */
export function printReportHtml(html) {
  const reportWindow = window.open("", "_blank", "width=980,height=1100");
  if (!reportWindow) throw new Error("The report window was blocked. Please allow popups for this site.");
  reportWindow.document.write(html);
  reportWindow.document.close();
  void waitForReportDocument(reportWindow).then(() => {
    if (reportWindow.closed) return;
    reportWindow.focus();
    reportWindow.print();
  });
  return reportWindow;
}

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
