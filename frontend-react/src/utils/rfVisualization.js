export const RAY_SCOPE_ALL = "all";
export const RAY_SCOPE_SELECTED = "selected";
export const RAY_SCOPE_HIDDEN = "hidden";

export function cellIDForTower(tower) {
  const value = tower?.cellId ?? tower?.id;
  return value === null || value === undefined || value === "" ? null : String(value);
}

export function rayFeatureCellID(feature, cellIDsByIndex = []) {
  const properties = feature?.properties ?? {};
  const directID = properties.cell_id
    ?? properties.cellId
    ?? properties.network_tower_id
    ?? properties.tower_id
    ?? properties.towerId;
  if (directID !== null && directID !== undefined && directID !== "") return String(directID);
  const index = Number(properties.network_tower_index);
  if (Number.isInteger(index) && cellIDsByIndex[index] !== null && cellIDsByIndex[index] !== undefined) {
    return String(cellIDsByIndex[index]);
  }
  return null;
}

export function filterRayFeatures(
  features,
  { scope = RAY_SCOPE_ALL, selectedCellId = null, defaultCellId = null, cellIDsByIndex = [] } = {},
) {
  const safeFeatures = Array.isArray(features) ? features : [];
  if (scope === RAY_SCOPE_HIDDEN) return [];
  if (scope !== RAY_SCOPE_SELECTED) return safeFeatures;
  const targetID = selectedCellId === null || selectedCellId === undefined || selectedCellId === ""
    ? defaultCellId
    : selectedCellId;
  if (targetID === null || targetID === undefined || targetID === "") return [];
  const normalizedTarget = String(targetID);
  return safeFeatures.filter((feature) => rayFeatureCellID(feature, cellIDsByIndex) === normalizedTarget
    || (!rayFeatureCellID(feature, cellIDsByIndex) && defaultCellId !== null && String(defaultCellId) === normalizedTarget));
}
