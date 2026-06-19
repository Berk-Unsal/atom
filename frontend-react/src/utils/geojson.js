export function rxPowerColor(receivedPowerDbm) {
  if (receivedPowerDbm >= -85) {
    return "#10b981";
  }
  if (receivedPowerDbm >= -105) {
    return "#f59e0b";
  }
  return "#e11d48";
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
