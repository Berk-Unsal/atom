export function pointInPolygon(point, polygon) {
  if (!Array.isArray(point) || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonCentroid(polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) {
    return null;
  }
  const totals = polygon.reduce(
    (accumulator, coordinate) => {
      accumulator.lon += Number(coordinate[0] ?? 0);
      accumulator.lat += Number(coordinate[1] ?? 0);
      return accumulator;
    },
    { lat: 0, lon: 0 },
  );
  return [totals.lon / polygon.length, totals.lat / polygon.length];
}

export function distanceToCentroid(tower, centroid) {
  if (!tower?.coordinates || !centroid) {
    return Number.POSITIVE_INFINITY;
  }
  const [towerLon, towerLat] = tower.coordinates;
  const [centroidLon, centroidLat] = centroid;
  const lonScale = Math.cos(((towerLat + centroidLat) / 2) * (Math.PI / 180));
  const dx = (towerLon - centroidLon) * lonScale;
  const dy = towerLat - centroidLat;
  return Math.sqrt(dx * dx + dy * dy);
}
