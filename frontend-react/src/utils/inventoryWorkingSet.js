import { resolveRFProfile, validateRFProfile } from "./rfProfile.js";

export const INVENTORY_PAGE_SIZE = 50;
const VIEWPORT_EDGE_EPSILON = 1e-10;

const DEFAULT_INVENTORY_SESSION = Object.freeze({
  scope: null,
  query: "",
  technology: "",
  viewportSnapshot: null,
  visibleLimit: INVENTORY_PAGE_SIZE,
  selectedForEditing: [],
  bulkStage: null,
  batchFields: {},
  batchValues: {},
  browseScrollTop: 0,
});

export function createInventorySession() {
  return {
    ...DEFAULT_INVENTORY_SESSION,
    selectedForEditing: [],
    batchFields: {},
    batchValues: {},
  };
}

export const SAFE_INVENTORY_BATCH_FIELDS = [
  { key: "txPowerDbm", label: "Conducted TX power", unit: "dBm", step: "0.1" },
  { key: "radiusMeters", label: "Radius", unit: "m", step: "1" },
  { key: "beamWidthDeg", label: "Beam width", unit: "°", step: "1" },
];

export function resolveNetworkWorkingSet(towers = [], selectedIDs = []) {
  const byID = new Map((towers ?? []).map((tower) => [String(tower?.id ?? ""), tower]));
  const seen = new Set();
  const ordered = [];
  for (const id of Array.isArray(selectedIDs) ? selectedIDs : []) {
    const normalizedID = String(id ?? "");
    const tower = byID.get(normalizedID);
    if (!tower || seen.has(normalizedID)) continue;
    seen.add(normalizedID);
    ordered.push(tower);
  }
  return ordered;
}

export function isPointInViewport(coordinates, bounds) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !isValidViewportBounds(bounds)) return false;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return false;
  if (latitude < bounds.south - VIEWPORT_EDGE_EPSILON || latitude > bounds.north + VIEWPORT_EDGE_EPSILON) return false;

  const west = Number(bounds.west);
  const rawEast = Number(bounds.east);
  if (rawEast - west >= 360) return true;
  const east = rawEast < west ? rawEast + 360 : rawEast;
  const normalizedLongitude = normalizeLongitude(longitude);
  const firstWorldCopy = Math.floor((west - normalizedLongitude) / 360) - 1;
  const lastWorldCopy = Math.ceil((east - normalizedLongitude) / 360) + 1;
  for (let worldCopy = firstWorldCopy; worldCopy <= lastWorldCopy; worldCopy += 1) {
    const candidateLongitude = normalizedLongitude + worldCopy * 360;
    if (candidateLongitude >= west - VIEWPORT_EDGE_EPSILON && candidateLongitude <= east + VIEWPORT_EDGE_EPSILON) return true;
  }
  return false;
}

export function captureViewportSnapshot(towers = [], bounds) {
  if (!isValidViewportBounds(bounds)) return null;
  return {
    bounds: {
      west: Number(bounds.west),
      east: Number(bounds.east),
      south: Number(bounds.south),
      north: Number(bounds.north),
    },
    cellIds: (towers ?? [])
      .filter((tower) => isPointInViewport(tower.coordinates, bounds))
      .map((tower) => String(tower.id)),
  };
}

export function resolveViewportSnapshot(towers = [], snapshot) {
  const byID = new Map((towers ?? []).map((tower) => [String(tower?.id ?? ""), tower]));
  const seen = new Set();
  const resolved = [];
  for (const id of snapshot?.cellIds ?? []) {
    const normalizedID = String(id ?? "");
    const tower = byID.get(normalizedID);
    if (!tower || seen.has(normalizedID)) continue;
    seen.add(normalizedID);
    resolved.push(tower);
  }
  return resolved;
}

export function viewportBoundsEqual(left, right) {
  if (!isValidViewportBounds(left) || !isValidViewportBounds(right)) return false;
  return (
    roundViewportCoordinate(normalizeLongitude(left.west)) === roundViewportCoordinate(normalizeLongitude(right.west))
    && roundViewportCoordinate(normalizeLongitude(left.east)) === roundViewportCoordinate(normalizeLongitude(right.east))
    && roundViewportCoordinate(left.south) === roundViewportCoordinate(right.south)
    && roundViewportCoordinate(left.north) === roundViewportCoordinate(right.north)
  );
}

export function searchInventory(towers = [], { query = "", technology = "" } = {}, settings) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedTechnology = normalizeSearchText(technology);
  if (!normalizedQuery && !normalizedTechnology) return [];

  const matches = [];
  (towers ?? []).forEach((tower, index) => {
    const displayID = String(tower?.cellId ?? tower?.id ?? "");
    const internalID = String(tower?.id ?? "");
    if (normalizedTechnology && resolveRFProfile(tower, settings, index).networkTech !== normalizedTechnology) return;

    let relevance = 0;
    if (normalizedQuery) {
      const normalizedDisplayID = normalizeSearchText(displayID);
      const normalizedInternalID = normalizeSearchText(internalID);
      if (normalizedDisplayID === normalizedQuery || normalizedInternalID === normalizedQuery) relevance = 0;
      else if (normalizedDisplayID.startsWith(normalizedQuery)) relevance = 1;
      else if (normalizedInternalID.startsWith(normalizedQuery)) relevance = 2;
      else if (normalizedDisplayID.includes(normalizedQuery)) relevance = 3;
      else if (normalizedInternalID.includes(normalizedQuery)) relevance = 4;
      else return;
    }
    matches.push({ tower, relevance });
  });

  matches.sort((left, right) => left.relevance - right.relevance
    || compareCellIdentifiers(left.tower.cellId ?? left.tower.id, right.tower.cellId ?? right.tower.id)
    || compareCellIdentifiers(left.tower.id, right.tower.id));
  return matches.map(({ tower }) => tower);
}

export function sliceInventoryPage(cells = [], limit = INVENTORY_PAGE_SIZE) {
  return (cells ?? []).slice(0, Math.max(0, limit));
}

export function applyInventoryBatchPatch(towers = [], settings, selectedIDs = [], changes = {}) {
  const ids = [...new Set((Array.isArray(selectedIDs) ? selectedIDs : []).map((id) => String(id ?? "")).filter(Boolean))];
  const fields = Object.keys(changes ?? {});
  if (ids.length < 2) return { ok: false, error: "Select at least two Cells for editing." };
  if (!fields.length) return { ok: false, error: "Enable and enter at least one field." };
  if (fields.some((key) => !SAFE_INVENTORY_BATCH_FIELDS.some((field) => field.key === key))) {
    return { ok: false, error: "This batch includes a field that is not available for multi-edit." };
  }

  const selectedIDSet = new Set(ids);
  const selectedIndexes = new Map();
  (towers ?? []).forEach((tower, index) => {
    const id = String(tower?.id ?? "");
    if (selectedIDSet.has(id)) selectedIndexes.set(id, index);
  });
  if (ids.some((id) => !selectedIndexes.has(id))) {
    return { ok: false, error: "One or more selected Cells are no longer available." };
  }

  for (const id of ids) {
    const index = selectedIndexes.get(id);
    const tower = towers[index];
    const currentProfile = resolveRFProfile(tower, settings, index);
    const errors = validateRFProfile({ ...currentProfile, ...changes });
    const invalidChangedField = fields.find((key) => errors[key]);
    if (invalidChangedField) {
      const label = SAFE_INVENTORY_BATCH_FIELDS.find((field) => field.key === invalidChangedField)?.label ?? invalidChangedField;
      return { ok: false, error: `Cannot apply ${label} to every selected Cell: ${errors[invalidChangedField]}` };
    }
  }

  const selectedIDsSet = new Set(ids);
  const nextTowers = (towers ?? []).map((tower) => {
    if (!selectedIDsSet.has(String(tower?.id ?? ""))) return tower;
    return {
      ...tower,
      rfProfile: { ...(tower.rfProfile ?? {}), ...changes },
      editable: true,
      inventorySource: tower.inventorySource === "dataset" ? "project override" : tower.inventorySource,
    };
  });
  return { ok: true, towers: nextTowers, selectedIDs: ids, changedFields: fields };
}

function isValidViewportBounds(bounds) {
  if (!bounds || ![bounds.west, bounds.east, bounds.south, bounds.north].every((value) => Number.isFinite(Number(value)))) return false;
  return Number(bounds.south) <= Number(bounds.north);
}

function normalizeLongitude(value) {
  const longitude = Number(value);
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

function roundViewportCoordinate(value) {
  return Number(Number(value).toFixed(6));
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function compareCellIdentifiers(left, right) {
  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  return leftText.localeCompare(rightText, "en", { numeric: true, sensitivity: "base" })
    || leftText.localeCompare(rightText);
}
