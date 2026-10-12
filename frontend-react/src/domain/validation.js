import { validateDatasetReference } from "./dataset.js";
import { validateInventoryRevision } from "./inventory.js";
import { validateProjectEntity } from "./project.js";
import { validateScenarioRevision } from "./scenario.js";
import { validateRun } from "./run.js";

export const DOMAIN_ERROR_CODES = Object.freeze({
  invalid_entity: "invalid_entity",
  incompatible_schema: "incompatible_schema",
});

export function validateEntity(kind, entity) {
  const validators = {
    dataset_reference: validateDatasetReference,
    inventory_revision: validateInventoryRevision,
    project: validateProjectEntity,
    run: validateRun,
    scenario_revision: validateScenarioRevision,
  };
  const validator = validators[kind];
  if (!validator) return [`No validator registered for ${kind}`];
  return validator(entity);
}

export function assertValidEntity(kind, entity) {
  const errors = validateEntity(kind, entity);
  if (errors.length > 0) {
    const error = new Error(`${kind} is invalid: ${errors.join("; ")}`);
    error.code = DOMAIN_ERROR_CODES.invalid_entity;
    error.details = errors;
    throw error;
  }
  return entity;
}

export const validateProject = validateProjectEntity;
export const validateInventory = validateInventoryRevision;
export const validateScenario = validateScenarioRevision;
