import { canonicalSerialize } from "../domain/serialization.js";
import { sha256HexSync } from "./sha256.js";
import { normalizePlanInventoryDefaults } from "./planInventoryDefaults.js";

// A pending edit must be dirty before the recovery autosave timer commits it.
// The native controller hashes the shared serialization after that flush.
export function pendingProjectFileRevision(project, livePlan) {
  if (!project) return null;
  const scenario = project.scenarios?.find((candidate) => candidate.id === project.activeScenarioId);
  const retained = project.draft?.plan ?? scenario?.plan ?? null;
  const live = canonicalSerialize(normalizePlanInventoryDefaults(livePlan));
  if (live === canonicalSerialize(normalizePlanInventoryDefaults(retained))) return null;
  return `pending:${sha256HexSync(new TextEncoder().encode(live))}`;
}
