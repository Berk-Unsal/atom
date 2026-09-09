export const MAX_NETWORK_CELLS = 6;

export function normalizeNetworkSelection(ids, towers, limit = MAX_NETWORK_CELLS) {
  const availableIDs = new Set((towers ?? []).map((tower) => String(tower?.id ?? "")));
  const seen = new Set();
  const normalized = [];

  for (const id of Array.isArray(ids) ? ids : []) {
    const normalizedID = String(id ?? "");
    if (!normalizedID || !availableIDs.has(normalizedID) || seen.has(normalizedID)) {
      continue;
    }
    seen.add(normalizedID);
    normalized.push(normalizedID);
    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}

export function toggleNetworkSelection(ids, cellID, limit = MAX_NETWORK_CELLS) {
  const normalizedID = String(cellID ?? "");
  const current = [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id ?? "")).filter(Boolean))];
  if (!normalizedID) {
    return current;
  }
  if (current.includes(normalizedID)) {
    return current.filter((id) => id !== normalizedID);
  }
  if (current.length >= limit) {
    return current;
  }
  return [...current, normalizedID];
}

export function fanOutSelectionOffset(index, count) {
  if (count < 2) {
    return [0, 0];
  }
  const radius = Math.min(30, 12 + count * 2.5);
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  return [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)];
}
