export const UNAVAILABLE_VALUE = "—";

export function printTable(title, rows) {
  return `<div><h2>${escapeHtml(title)}</h2><table><tbody>${rows
    .map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value ?? UNAVAILABLE_VALUE)}</td></tr>`)
    .join("")}</tbody></table></div>`;
}

export function formatNumber(value, digits = 1) {
  if (value === null || value === undefined) {
    return UNAVAILABLE_VALUE;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return UNAVAILABLE_VALUE;
  }
  return number.toLocaleString("en", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatCompactNumber(value) {
  if (value === null || value === undefined) {
    return UNAVAILABLE_VALUE;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return UNAVAILABLE_VALUE;
  }
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

export function markdownValue(value) {
  if (value === null || value === undefined || value === "") {
    return UNAVAILABLE_VALUE;
  }
  return String(value).replace(/\|/g, "\\|");
}

export function escapeHtml(value) {
  return String(value ?? UNAVAILABLE_VALUE)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
