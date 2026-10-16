import { MAX_PROJECT_FILE_BYTES } from "./projectStore.js";

const budgetReasons = new Map([
  [`Project file must be no larger than ${MAX_PROJECT_FILE_BYTES / (1024 * 1024)} MiB`, "The encoded portable file exceeds the 16 MiB size limit."],
  ["Project file ray expansion exceeds the resource budget", "Reconstructed ray data exceeds the decoded size or node budget."],
  ["Project file contains too many nested values", "The project exceeds the portable-file node budget."],
  ["Project file is nested too deeply", "The project exceeds the portable-file nesting-depth limit."],
  ["Project file contains an oversized string value", "A text value exceeds the portable-file string limit."],
  ["Project file contains an oversized array", "A list exceeds the portable-file array limit."],
  ["Project file contains an object with too many fields", "An object exceeds the portable-file field limit."],
]);

export function projectFileRecoveryReason(error) {
  return budgetReasons.get(error?.message) ?? null;
}
