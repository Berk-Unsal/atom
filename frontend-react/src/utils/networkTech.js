import { NETWORK_TECH_OPTIONS } from "../generated/policy.js";

export { NETWORK_TECH_OPTIONS } from "../generated/policy.js";

export function networkTechLabelForFrequency(frequencyGHz) {
  const option = NETWORK_TECH_OPTIONS.find((tech) => tech.frequencyGHz === frequencyGHz);
  return option?.label ?? `${frequencyGHz} GHz`;
}

export function is5GCoreFrequency(frequencyGHz) {
  return Number(frequencyGHz) === NETWORK_TECH_OPTIONS.find((technology) => technology.id === "5g")?.frequencyGHz;
}
