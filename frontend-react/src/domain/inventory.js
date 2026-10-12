import { cloneDomainValue, createEntityId, deepFreeze } from "./identifiers.js";
import { contentFingerprint } from "./serialization.js";
import { normalizeProvenance } from "./provenance.js";

export const CLEAR_OVERRIDE = Object.freeze({ $clear: true });

export function clearOverride() {
  return { ...CLEAR_OVERRIDE };
}

export function isClearOverride(value) {
  return Boolean(value && typeof value === "object" && value.$clear === true);
}

export function createInventory(input = {}) {
  const now = input.created_at ?? input.createdAt ?? new Date().toISOString();
  return {
    inventory_id: input.inventory_id ?? input.inventoryId ?? createEntityId(),
    project_id: input.project_id ?? input.projectId ?? null,
    name: String(input.name ?? "Inventory").trim() || "Inventory",
    description: input.description ?? "",
    source_type: input.source_type ?? input.sourceType ?? "local",
    current_revision_id: input.current_revision_id ?? input.currentRevisionId ?? null,
    source_reference: cloneDomainValue(input.source_reference ?? input.sourceReference ?? null),
    created_at: now,
    updated_at: input.updated_at ?? input.updatedAt ?? now,
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
}

export function createInventoryCell(input = {}) {
  const coordinates = input.coordinates ?? [input.longitude, input.latitude];
  return {
    inventory_cell_id: input.inventory_cell_id ?? input.inventoryCellId ?? input.id ?? createEntityId(),
    source_key: input.source_key ?? input.sourceKey ?? input.id ?? null,
    cell_id: input.cell_id ?? input.cellId ?? input.id ?? null,
    radio_technology: input.radio_technology ?? input.radioTechnology ?? input.radioType ?? null,
    is_simulated: Boolean(input.is_simulated ?? input.isSimulated ?? false),
    coordinates: Array.isArray(coordinates) ? [coordinates[0], coordinates[1]] : null,
    rf_profile: cloneDomainValue(input.rf_profile ?? input.rfProfile ?? {}),
    antenna_pattern_reference: cloneDomainValue(input.antenna_pattern_reference ?? input.antennaPatternReference ?? null),
    inventory_source: input.inventory_source ?? input.inventorySource ?? "dataset",
    editable: input.editable !== false,
    provenance: cloneDomainValue(input.provenance ?? normalizeProvenance(input.inventory_source === "import" ? "imported" : "default")),
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
}

export function inventoryCellToLegacy(cell) {
  return {
    id: cell.inventory_cell_id,
    cellId: cell.cell_id,
    radioType: cell.radio_technology,
    isSimulated: cell.is_simulated,
    coordinates: cloneDomainValue(cell.coordinates),
    rfProfile: cloneDomainValue(cell.rf_profile),
    inventorySource: cell.inventory_source,
    editable: cell.editable,
    ...(cell.source_key ? { sourceKey: cell.source_key } : {}),
  };
}

export function createInventoryRevision(input = {}) {
  const cells = (input.cells ?? []).map((cell) => createInventoryCell(cell));
  const revision = {
    inventory_revision_id: input.inventory_revision_id ?? input.inventoryRevisionId ?? createEntityId(),
    inventory_id: input.inventory_id ?? input.inventoryId ?? createEntityId(),
    revision: Number.isSafeInteger(input.revision) && input.revision > 0 ? input.revision : 1,
    parent_revision_id: input.parent_revision_id ?? input.parentRevisionId ?? null,
    cells,
    provenance: cloneDomainValue(input.provenance ?? normalizeProvenance("default")),
    source_references: cloneDomainValue(input.source_references ?? input.sourceReferences ?? []),
    content_fingerprint: input.content_fingerprint ?? input.contentFingerprint ?? contentFingerprint(cells, "inventory-v1"),
    created_at: input.created_at ?? input.createdAt ?? new Date().toISOString(),
    change_summary: input.change_summary ?? input.changeSummary ?? "",
    metadata: cloneDomainValue(input.metadata ?? {}),
  };
  return deepFreeze(revision);
}

function mergeWithInheritance(defaultValue, inventoryValue, overrideValue, path, clearedPaths) {
  if (isClearOverride(overrideValue)) {
    clearedPaths.push(path);
    return undefined;
  }
  if (overrideValue === undefined) {
    if (inventoryValue === undefined) return cloneDomainValue(defaultValue);
    if (inventoryValue && typeof inventoryValue === "object" && !Array.isArray(inventoryValue)) {
      return mergeObjects(defaultValue, inventoryValue, undefined, path, clearedPaths);
    }
    return cloneDomainValue(inventoryValue);
  }
  if (overrideValue && typeof overrideValue === "object" && !Array.isArray(overrideValue)) {
    return mergeObjects(defaultValue, inventoryValue, overrideValue, path, clearedPaths);
  }
  return cloneDomainValue(overrideValue);
}

function mergeObjects(defaultValue, inventoryValue, overrideValue, path, clearedPaths) {
  const keys = new Set([
    ...Object.keys(defaultValue && typeof defaultValue === "object" ? defaultValue : {}),
    ...Object.keys(inventoryValue && typeof inventoryValue === "object" ? inventoryValue : {}),
    ...Object.keys(overrideValue && typeof overrideValue === "object" ? overrideValue : {}),
  ]);
  const result = {};
  for (const key of keys) {
    const child = mergeWithInheritance(
      defaultValue?.[key],
      inventoryValue?.[key],
      overrideValue?.[key],
      path ? `${path}.${key}` : key,
      clearedPaths,
    );
    if (child !== undefined) result[key] = child;
  }
  return result;
}

export function resolveInventoryCell(cell, override = {}, defaults = {}) {
  const source = createInventoryCell(cell);
  const sparse = override?.fields ?? override ?? {};
  const clearedFields = [];
  const resolved = mergeObjects(defaults, source, sparse, "", clearedFields);
  return {
    ...resolved,
    inventory_cell_id: source.inventory_cell_id,
    cell_id: resolved.cell_id ?? source.cell_id,
    cleared_fields: clearedFields,
  };
}

export function resolveInventoryRevision(inventoryRevision, overrides = {}, defaults = {}) {
  const revision = inventoryRevision ?? createInventoryRevision({ cells: [] });
  const overrideMap = overrides instanceof Map ? Object.fromEntries(overrides) : overrides;
  return revision.cells.map((cell) => resolveInventoryCell(
    cell,
    overrideMap?.[cell.inventory_cell_id] ?? overrideMap?.[cell.cell_id] ?? {},
    defaults,
  ));
}

export function validateInventoryRevision(revision) {
  const errors = [];
  if (!revision || typeof revision !== "object") return ["inventory revision is required"];
  if (!String(revision.inventory_revision_id ?? "").trim()) errors.push("inventory_revision_id is required");
  if (!String(revision.inventory_id ?? "").trim()) errors.push("inventory_id is required");
  if (!Number.isInteger(revision.revision) || revision.revision < 1) errors.push("revision must be a positive integer");
  if (!Array.isArray(revision.cells)) errors.push("cells must be an array");
  return errors;
}
