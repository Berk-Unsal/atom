export const NETWORK_TECH_OPTIONS = [
  { label: "4G LTE", frequencyGHz: 2.6 },
  { label: "5G mmWave", frequencyGHz: 28 },
  { label: "6G Sub-THz", frequencyGHz: 140 },
];

export function networkTechLabelForFrequency(frequencyGHz) {
  const option = NETWORK_TECH_OPTIONS.find((tech) => tech.frequencyGHz === frequencyGHz);
  return option?.label ?? `${frequencyGHz} GHz`;
}

export function is5GCoreFrequency(frequencyGHz) {
  return Number(frequencyGHz) === 28;
}
