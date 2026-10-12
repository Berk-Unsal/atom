import { cloneDomainValue } from "./identifiers.js";

export const PROVENANCE_VALUES = Object.freeze([
  "user_configured",
  "imported",
  "measured",
  "derived",
  "assumed",
  "default",
  "generated",
  "validated",
]);

export function normalizeProvenance(value, fallback = "user_configured") {
  if (typeof value === "string" && PROVENANCE_VALUES.includes(value)) return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return cloneDomainValue(value);
  }
  return fallback;
}

export function provenanceRecord(value, fallback = "user_configured") {
  return { source: normalizeProvenance(value, fallback) };
}

export function isProvenanceValue(value) {
  return PROVENANCE_VALUES.includes(value);
}
