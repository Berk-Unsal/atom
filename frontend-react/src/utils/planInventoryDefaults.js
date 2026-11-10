// Domain metadata round-trips make these existing Cell defaults explicit.
// Compare their equivalent representations without mutating retained input
// or hiding actual profile, source identity, provenance or coordinate edits.
export function normalizePlanInventoryDefaults(plan) {
  if (!Array.isArray(plan?.inventory)) return plan;
  return { ...plan, inventory: plan.inventory.map((cell) => cell && typeof cell === "object"
    ? { ...cell, rfProfile: cell.rfProfile ?? {}, sourceKey: cell.sourceKey ?? cell.id }
    : cell) };
}
