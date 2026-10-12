import { cloneDomainValue } from "./identifiers.js";
import { canonicalSerialize } from "./serialization.js";

export const SCENARIO_DIFF_SECTIONS = Object.freeze([
  { id: "cells", label: "Cells and enablement" },
  { id: "rf", label: "RF and propagation" },
  { id: "receiver", label: "Receiver assumptions" },
  { id: "interference", label: "Interference settings" },
  { id: "optimization", label: "Optimization policy" },
  { id: "dataset", label: "Dataset" },
  { id: "domain", label: "AOI and planning domain" },
]);

const SECTION_FIELDS = {
  rf: [["rf_affecting_settings", "RF settings"], ["propagation_selection", "Propagation model"]],
  receiver: [["receiver_assumptions", "Receiver assumptions"]],
  interference: [["interference_settings", "Interference settings"]],
  optimization: [["objective_constraints", "Objectives and constraints"], ["optimizer_configuration", "Optimizer configuration"]],
  dataset: [["dataset_references", "Dataset reference"], ["inventory_revision_id", "Inventory version"]],
  domain: [["selection_geometry", "AOI / selection geometry"], ["planning_mode", "Planning mode"]],
};

export function buildScenarioRevisionDiff(beforeRevision, afterRevision) {
  const before = normalizeRevision(beforeRevision);
  const after = normalizeRevision(afterRevision);
  const sections = SCENARIO_DIFF_SECTIONS.map((section) => {
    const items = section.id === "cells"
      ? cellDiffItems(before, after)
      : (SECTION_FIELDS[section.id] ?? []).flatMap(([field, label]) => valueDiffItems(field, label, before[field], after[field]));
    return { ...section, changed: items.length > 0, items };
  });
  const changedFields = sections.flatMap((section) => section.items.map((item) => item.path));
  return {
    changed: changedFields.length > 0,
    before: revisionIdentity(before),
    after: revisionIdentity(after),
    changed_fields: changedFields,
    sections,
    cell_changes: sections.find((section) => section.id === "cells")?.items ?? [],
    summary: summarizeDiff(sections),
  };
}

export function areScenarioRevisionsEqual(left, right) {
  return canonicalSerialize(normalizeRevision(left)) === canonicalSerialize(normalizeRevision(right));
}

function normalizeRevision(revision) {
  return cloneDomainValue(revision ?? {});
}

function revisionIdentity(revision) {
  return {
    scenario_revision_id: revision.scenario_revision_id ?? null,
    revision: revision.revision ?? null,
    created_at: revision.created_at ?? null,
    change_summary: revision.change_summary ?? "",
    parent_revision_id: revision.parent_revision_id ?? null,
    originating_run_id: revision.originating_run_id ?? null,
    originating_solution_id: revision.originating_solution_id ?? null,
  };
}

function cellDiffItems(before, after) {
  const beforeOverrides = before.overrides ?? {};
  const afterOverrides = after.overrides ?? {};
  const ids = new Set([
    ...(before.selected_cell_ids ?? []),
    ...(after.selected_cell_ids ?? []),
    ...(before.enabled_cell_ids ?? []),
    ...(after.enabled_cell_ids ?? []),
    ...Object.keys(beforeOverrides),
    ...Object.keys(afterOverrides),
  ].map(String));
  const items = [];
  const beforeEnabled = new Set((before.enabled_cell_ids ?? []).map(String));
  const afterEnabled = new Set((after.enabled_cell_ids ?? []).map(String));
  for (const id of [...ids].sort()) {
    const beforeFields = beforeOverrides[id]?.fields ?? beforeOverrides[id] ?? {};
    const afterFields = afterOverrides[id]?.fields ?? afterOverrides[id] ?? {};
    const changes = [];
    if (beforeEnabled.has(id) !== afterEnabled.has(id)) changes.push({ label: "Enablement", before: beforeEnabled.has(id), after: afterEnabled.has(id) });
    for (const field of [...new Set([...Object.keys(beforeFields), ...Object.keys(afterFields)])].sort()) {
      if (!equalValue(beforeFields[field], afterFields[field])) changes.push({ label: humanizeField(field), before: beforeFields[field] ?? null, after: afterFields[field] ?? null });
    }
    if (changes.length > 0) items.push({ path: `cells.${id}`, label: `Cell ${id}`, before: beforeFields, after: afterFields, changes });
  }
  if (!equalValue(before.selected_cell_id, after.selected_cell_id)) {
    items.push({ path: "selected_cell_id", label: "Primary selected cell", before: before.selected_cell_id ?? null, after: after.selected_cell_id ?? null });
  }
  if (!equalValue(before.selected_cell_ids, after.selected_cell_ids)) {
    items.push({ path: "selected_cell_ids", label: "Selected cells", before: before.selected_cell_ids ?? [], after: after.selected_cell_ids ?? [] });
  }
  return items;
}

function valueDiffItems(field, label, before, after) {
  if (equalValue(before, after)) return [];
  return [{ path: field, label, before: before ?? null, after: after ?? null }];
}

function equalValue(left, right) {
  return canonicalSerialize(left ?? null) === canonicalSerialize(right ?? null);
}

function summarizeDiff(sections) {
  const changed = sections.filter((section) => section.changed).map((section) => section.label);
  return changed.length > 0 ? changed : ["No input changes"];
}

function humanizeField(field) {
  return String(field).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
