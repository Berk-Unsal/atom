import { cloneDomainValue } from "./identifiers.js";

export const UI_ONLY_FIELDS = Object.freeze([
  "activeDrawer",
  "active_drawer",
  "activeRFTask",
  "active_rf_task",
  "activeResultsView",
  "active_results_view",
  "abortController",
  "abort_controller",
  "drawerMode",
  "drawer_mode",
  "drawerOpen",
  "drawer_open",
  "error",
  "errors",
  "fitRequestVersion",
  "hoveredCell",
  "hovered_cell",
  "hoveredCellId",
  "hovered_cell_id",
  "isLoading",
  "layerMenuOpen",
  "layerVisibility",
  "layer_visibility",
  "legendCollapsed",
  "loading",
  "mapViewport",
  "map_viewport",
  "notices",
  "openTabs",
  "open_tabs",
  "rayCache",
  "ray_cache",
  "ray_caches",
  "rayScope",
  "ray_scope",
  "requestCancellation",
  "request_cancellation",
  "selected_map_cell_id",
  "selected_map_object",
  "selectedMapCellId",
  "selectedMapObject",
  "signalSurfaces",
  "signal_surfaces",
  "temporaryRenderingVisibility",
  "temporary_rendering_visibility",
  "undoNotice",
  "viewport",
]);

const UI_ONLY_FIELD_SET = new Set(UI_ONLY_FIELDS);

export function stripUIState(value) {
  if (Array.isArray(value)) return value.map((item) => stripUIState(item));
  if (!value || typeof value !== "object") return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (UI_ONLY_FIELD_SET.has(key)) continue;
    result[key] = stripUIState(child);
  }
  return result;
}

export function containsUIOnlyState(value) {
  if (Array.isArray(value)) return value.some((item) => containsUIOnlyState(item));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => UI_ONLY_FIELD_SET.has(key) || containsUIOnlyState(child));
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalSerialize(value, { stripUI = false } = {}) {
  const source = stripUI ? stripUIState(value) : value;
  return JSON.stringify(canonicalize(source));
}

export function contentFingerprint(value, prefix = "domain-v1") {
  const serialized = canonicalSerialize(value, { stripUI: true });
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function cloneForPersistence(value) {
  return cloneDomainValue(canonicalize(value));
}

export function assertNoUIState(value, label = "domain input") {
  if (containsUIOnlyState(value)) throw new Error(`${label} contains UI-only state`);
  return value;
}
