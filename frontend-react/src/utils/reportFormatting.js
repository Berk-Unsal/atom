export function printTable(title, rows) {
  return `<div><h2>${escapeHtml(title)}</h2><table><tbody>${rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value ?? "n/a")}</td></tr>`)
    .join("")}</tbody></table></div>`;
}

export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "n/a";
  }
  return number.toLocaleString("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatCompactNumber(value) {
  if (value === null || value === undefined) {
    return "n/a";
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "n/a";
  }
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

export function markdownValue(value) {
  if (value === null || value === undefined || value === "") {
    return "n/a";
  }
  return String(value).replace(/\|/g, "\\|");
}

export function escapeHtml(value) {
  return String(value ?? "n/a")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
