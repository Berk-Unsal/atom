export function pointInPolygon(point, polygon) {
  if (!Array.isArray(point) || !Array.isArray(polygon) || polygon.length < 3) {
    return false;
  }

  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    if (pointOnSegment(point, polygon[j], polygon[i])) {
      return true;
    }
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointOnSegment([x, y], [startX, startY], [endX, endY]) {
  const epsilon = 1e-10;
  const crossProduct = (x - startX) * (endY - startY) - (y - startY) * (endX - startX);
  if (Math.abs(crossProduct) > epsilon) {
    return false;
  }
  return x >= Math.min(startX, endX) - epsilon
    && x <= Math.max(startX, endX) + epsilon
    && y >= Math.min(startY, endY) - epsilon
    && y <= Math.max(startY, endY) + epsilon;
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

export function selectNearestTowers(towers, polygon, limit) {
  const centroid = polygonCentroid(polygon);
  const candidates = Array.isArray(towers) ? towers : [];
  const sorted = [...candidates].sort((left, right) => {
    const distanceDifference = distanceToCentroid(left, centroid) - distanceToCentroid(right, centroid);
    return distanceDifference || String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
  });
  return Number.isFinite(limit) ? sorted.slice(0, Math.max(0, limit)) : sorted;
}
