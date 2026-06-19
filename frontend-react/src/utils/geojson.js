export function rxPowerColor(receivedPowerDbm, blocked) {
  if (blocked) {
    return "rgba(185, 28, 28, 0.8)";
  }
  if (receivedPowerDbm >= -70) {
    return "rgba(22, 163, 74, 0.85)";
  }
  if (receivedPowerDbm >= -95) {
    return "rgba(234, 179, 8, 0.85)";
  }
  return "rgba(217, 119, 6, 0.8)";
}

export function simulationToFeatureCollection(simulation) {
  const features = [];
  for (const towerSimulation of simulation?.towers ?? []) {
    const [lon, lat] = towerSimulation.tower.location.coordinates;
    features.push({
      type: "Feature",
      properties: {
        cellId: towerSimulation.tower.cellId,
        radioType: towerSimulation.tower.radioType,
        isSimulated: towerSimulation.tower.isSimulated,
      },
      geometry: {
        type: "Point",
        coordinates: [lon, lat],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
