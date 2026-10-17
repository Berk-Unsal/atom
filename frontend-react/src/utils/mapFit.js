const METERS_PER_DEGREE_LATITUDE = 111_320;

/** Fit targets for Cells: each Cell position with the planning radius its result covers. */
export function fitTargetsForCells(cells = [], radiusFor = () => 0) {
  return cells
    .map((cell, index) => {
      const [lon, lat] = cell?.coordinates ?? [];
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
      const radius = Number(radiusFor(cell, index));
      return { lat, lon, radiusMeters: Number.isFinite(radius) && radius > 0 ? radius : 0 };
    })
    .filter(Boolean);
}

/** South-west / north-east bounds covering every target's planning radius, or null without targets. */
export function boundsForFitTargets(targets = []) {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const target of targets) {
    const latDelta = target.radiusMeters / METERS_PER_DEGREE_LATITUDE;
    const lonDelta = target.radiusMeters / (METERS_PER_DEGREE_LATITUDE * Math.max(Math.cos((target.lat * Math.PI) / 180), 0.01));
    south = Math.min(south, target.lat - latDelta);
    north = Math.max(north, target.lat + latDelta);
    west = Math.min(west, target.lon - lonDelta);
    east = Math.max(east, target.lon + lonDelta);
  }
  return Number.isFinite(south) ? [[south, west], [north, east]] : null;
}

/**
 * A fit request is applied once per version. Automatic fits (with `since`) yield to a user who moved
 * the map after the action started; manual fits (`since` null) always apply.
 */
export function shouldApplyFit(request, handledVersion, lastUserMoveAt) {
  if (!request?.version || request.version === handledVersion) return false;
  if (request.since === null || request.since === undefined) return true;
  return !(lastUserMoveAt > request.since);
}
