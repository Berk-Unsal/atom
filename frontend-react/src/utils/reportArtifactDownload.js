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
  const reportWindow = window.open("", "_blank", "width=980,height=1100");
  if (!reportWindow) throw new Error("The report window was blocked. Please allow popups for this site.");
  reportWindow.document.write(html);
  reportWindow.document.close();
  reportWindow.focus();
  reportWindow.setTimeout(() => reportWindow.print(), 350);
  return metadata;
}
