const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createEntityId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export function isUUIDCompatibleIdentifier(value) {
  return typeof value === "string" && value.trim().length > 0 && (
    UUID_PATTERN.test(value.trim()) || value.trim().length <= 200
  );
}

export function requireIdentifier(value, field = "id") {
  if (!isUUIDCompatibleIdentifier(value)) {
    throw new Error(`${field} must be a non-empty UUID-compatible identifier`);
  }
  return String(value).trim();
}

export function deriveCompatibilityIdentifier(kind, sourceId) {
  const seed = `${String(kind)}:${String(sourceId)}`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${String(kind).replace(/[^a-z0-9_-]/gi, "-")}-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function cloneDomainValue(value) {
  if (value === undefined || value === null) return value;
  if (typeof globalThis.structuredClone === "function") return globalThis.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
