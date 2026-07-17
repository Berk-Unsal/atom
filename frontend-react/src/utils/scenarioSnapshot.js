export function selectScenarioArtifacts(planDirty, overrides, currentArtifacts) {
  if (Object.prototype.hasOwnProperty.call(overrides, "artifacts")) {
    return overrides.artifacts;
  }
  return planDirty ? null : currentArtifacts;
}
