export const REPOSITORY_ERROR_CODES = Object.freeze([
  "not_found",
  "run_not_found",
  "run_invalid",
  "run_persistence_failed",
  "run_storage_unavailable",
  "run_referenced",
  "run_input_stale",
  "invalid_entity",
  "serialization_failed",
  "persistence_failed",
  "incompatible_schema",
  "dataset_unavailable",
]);

export class RepositoryError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "RepositoryError";
    this.code = REPOSITORY_ERROR_CODES.includes(code) ? code : "persistence_failed";
    this.cause = options.cause;
    this.details = options.details ?? null;
  }
}

export function normalizeRepositoryError(error, fallbackCode = "persistence_failed") {
  if (error instanceof RepositoryError) return error;
  const message = error?.message ?? String(error ?? "Repository operation failed");
  const name = String(error?.name ?? "").toLowerCase();
  const code = name.includes("data") || /schema|unsupported/i.test(message)
    ? "incompatible_schema"
    : fallbackCode;
  return new RepositoryError(code, message, { cause: error });
}
