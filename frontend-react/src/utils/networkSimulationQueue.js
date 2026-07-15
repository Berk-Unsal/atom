export async function runNetworkSimulationQueue(towers, simulateTower) {
  const results = [];
  for (let index = 0; index < towers.length; index += 1) {
    results.push(await simulateTower(towers[index], index));
  }
  return results;
}
