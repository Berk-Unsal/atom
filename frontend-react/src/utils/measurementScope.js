import { POLICY_LIMITS } from "../generated/policy.js";

export const MAX_MEASUREMENT_CELLS = POLICY_LIMITS.measurement_towers_max;

export function measurementCellLimitMessage(cellCount) {
  return cellCount > MAX_MEASUREMENT_CELLS
    ? `Measurement Validation accepts up to ${MAX_MEASUREMENT_CELLS} Cells. Select ${MAX_MEASUREMENT_CELLS} or fewer before evaluating residuals.`
    : "";
}
