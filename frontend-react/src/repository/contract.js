export const REPOSITORY_CONTRACT_VERSION = "local-domain-repository-v1";

export const REPOSITORY_OPERATIONS = Object.freeze([
  "listProjects",
  "getProject",
  "saveProject",
  "listScenarios",
  "getScenario",
  "saveScenario",
  "getScenarioRevision",
  "saveScenarioRevision",
  "getInventory",
  "getInventoryRevision",
  "saveInventoryRevision",
  "listRuns",
  "getRun",
  "saveRun",
  "saveReportDefinition",
  "getReportDefinition",
]);

export function implementsRepositoryContract(repository) {
  return REPOSITORY_OPERATIONS.every((operation) => typeof repository?.[operation] === "function");
}
