import { resolveRFProfile } from "./rfProfile.js";
import { networkTechnologyForFrequency } from "../generated/policy.js";

// Site groups keep co-located Cells together for placement and moving. Every member stays an ordinary Cell in every
// request; a group makes no shared-antenna, feasibility, ownership or cost claim.

export const DEFAULT_SITE_SECTOR_AZIMUTHS = Object.freeze([0, 120, 240]);
export const MAX_SITE_SECTORS = 6;

/** Parses "0, 120, 240" into normalized degrees, or returns an error for an unusable list. */
export function parseSectorAzimuths(text) {
  const parts = String(text ?? "").split(/[\s,;]+/).filter(Boolean);
  if (parts.length < 2 || parts.length > MAX_SITE_SECTORS) return { azimuths: null, error: `Enter 2 to ${MAX_SITE_SECTORS} sector azimuths, for example 0, 120, 240.` };
  const azimuths = [];
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value)) return { azimuths: null, error: `"${part}" is not an azimuth in degrees.` };
    azimuths.push(((value % 360) + 360) % 360);
  }
  if (new Set(azimuths).size !== azimuths.length) return { azimuths: null, error: "Each sector needs a different azimuth." };
  return { azimuths, error: "" };
}

function nextFreeId(prefix, used, start) {
  let counter = start;
  while (used.has(`${prefix}-${counter}`)) counter += 1;
  return `${prefix}-${counter}`;
}

/** N co-located Cells sharing one site group, one per sector azimuth. */
export function createSiteCells({ coordinates, azimuths = DEFAULT_SITE_SECTOR_AZIMUTHS, towers = [], settings }) {
  const used = new Set(towers.map((tower) => tower.id));
  const groupIds = new Set(towers.map((tower) => tower.siteGroupId).filter(Boolean));
  const siteGroupId = nextFreeId("site", groupIds, groupIds.size + 1);
  return azimuths.map((azimuth, index) => {
    const id = nextFreeId("manual", used, towers.length + 1 + index);
    used.add(id);
    return {
      id,
      cellId: id,
      radioType: networkTechnologyForFrequency(settings.frequencyGHz),
      isSimulated: true,
      coordinates: [coordinates[0], coordinates[1]],
      rfProfile: resolveRFProfile({}, settings, towers.length + index),
      inventorySource: "manual",
      editable: true,
      siteGroupId,
      sectorAzimuthDeg: azimuth,
    };
  });
}

export function siteGroupMembers(towers, siteGroupId) {
  return siteGroupId ? towers.filter((tower) => tower.siteGroupId === siteGroupId) : [];
}

/** Moves every member of the Cell's site group, or only that Cell when it has no group. */
export function moveCellOrSite(towers, towerId, coordinates) {
  const target = towers.find((tower) => tower.id === towerId);
  if (!target) return towers;
  return towers.map((tower) => (
    tower.id === towerId || (target.siteGroupId && tower.siteGroupId === target.siteGroupId)
      ? { ...tower, coordinates: [coordinates[0], coordinates[1]] }
      : tower
  ));
}

/** Copies one member's RF profile to the other members; each member keeps its own sector azimuth and identity. */
export function applyProfileToSite(towers, towerId) {
  const source = towers.find((tower) => tower.id === towerId);
  if (!source?.siteGroupId) return towers;
  return towers.map((tower) => (
    tower.siteGroupId === source.siteGroupId && tower.id !== source.id
      ? { ...tower, rfProfile: { ...source.rfProfile } }
      : tower
  ));
}

/** Ungrouping keeps every Cell, position and sector azimuth; only the group link is removed. */
export function ungroupSite(towers, siteGroupId) {
  return towers.map((tower) => {
    if (!siteGroupId || tower.siteGroupId !== siteGroupId) return tower;
    const next = { ...tower };
    delete next.siteGroupId;
    return next;
  });
}
