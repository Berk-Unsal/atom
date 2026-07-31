export function profileChartGeometry(samples) {
  if (!samples.length) return { terrainAreaPath: "", buildingAreaPath: "", losPath: "", fresnelPath: "", dominant: null };
  const left = 42;
  const right = 704;
  const top = 12;
  const bottom = 202;
  const maxDistance = Math.max(...samples.map((sample) => Number(sample.distance_m) || 0), 1);
  const elevations = samples.flatMap((sample) => [
    Number(sample.terrain_elevation_m) || 0,
    Number(sample.obstruction_elevation_m) || 0,
    (Number(sample.line_of_sight_elevation_m) || 0) + (Number(sample.fresnel_radius_m) || 0) * 0.6,
    (Number(sample.line_of_sight_elevation_m) || 0) - (Number(sample.fresnel_radius_m) || 0) * 0.6,
  ]);
  const minimum = Math.min(...elevations);
  const maximum = Math.max(...elevations);
  const padding = Math.max((maximum - minimum) * 0.12, 2);
  const low = minimum - padding;
  const high = maximum + padding;
  const x = (sample) => left + ((Number(sample.distance_m) || 0) / maxDistance) * (right - left);
  const y = (value) => bottom - ((Number(value) - low) / Math.max(high - low, 1)) * (bottom - top);
  const linePath = (read) => samples.map((sample, index) => `${index ? "L" : "M"}${x(sample).toFixed(1)},${y(read(sample)).toFixed(1)}`).join(" ");
  const areaPath = (read) => `${linePath(read)} L${right},${bottom} L${left},${bottom} Z`;
  const upper = linePath((sample) => Number(sample.line_of_sight_elevation_m) + Number(sample.fresnel_radius_m) * 0.6);
  const lower = [...samples].reverse().map((sample) => `L${x(sample).toFixed(1)},${y(Number(sample.line_of_sight_elevation_m) - Number(sample.fresnel_radius_m) * 0.6).toFixed(1)}`).join(" ");
  const dominantSample = samples.reduce((worst, sample) => Number(sample.clearance_m) < Number(worst.clearance_m) ? sample : worst, samples[0]);
  return {
    terrainAreaPath: areaPath((sample) => sample.terrain_elevation_m),
    buildingAreaPath: areaPath((sample) => sample.obstruction_elevation_m),
    losPath: linePath((sample) => sample.line_of_sight_elevation_m),
    fresnelPath: `${upper} ${lower} Z`,
    dominant: Number(dominantSample.clearance_m) < 0 ? { x: x(dominantSample), y: y(dominantSample.obstruction_elevation_m) } : null,
  };
}
