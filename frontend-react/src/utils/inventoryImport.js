import { resolveRFProfile, validateRFProfile } from "./rfProfile.js";

export const MAX_INVENTORY_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_INVENTORY_CELLS = 10_000;
export const MAX_INVENTORY_ID_BYTES = 128;

export function parseInventoryFile(text, fileName, settings, existingIDs = [], existingCellIDs = existingIDs) {
  if (typeof text !== "string" || new TextEncoder().encode(text).byteLength > MAX_INVENTORY_FILE_BYTES) {
    throw new Error(`Inventory file must be no larger than ${MAX_INVENTORY_FILE_BYTES / (1024 * 1024)} MiB.`);
  }
  const lowerName = String(fileName ?? "").toLowerCase();
  const records = lowerName.endsWith(".csv") ? parseCSV(text) : parseGeoJSON(text);
  if (records.length === 0) throw new Error("Inventory file contains no point cells.");
  if (records.length + existingIDs.length > MAX_INVENTORY_CELLS) throw new Error(`Inventory supports at most ${MAX_INVENTORY_CELLS.toLocaleString()} total cells.`);

  const used = new Set(existingIDs.map(String));
  const usedCellIDs = new Set(existingCellIDs.map(String));
  return records.map((record, index) => normalizeInventoryRecord(record, index, settings, used, usedCellIDs));
}

export function duplicateInventoryCell(tower, existingIDs) {
  const used = new Set(existingIDs.map(String));
  const id = uniqueID(`${tower.id}-copy`, used);
  return {
    ...structuredClone(tower),
    id,
    cellId: id,
    coordinates: [Number(tower.coordinates[0]) + 0.00015, Number(tower.coordinates[1]) + 0.0001],
    inventorySource: "duplicate",
    editable: true,
  };
}

function normalizeInventoryRecord(record, index, settings, used, usedCellIDs) {
  const properties = record.properties ?? record;
  const coordinates = record.coordinates ?? [field(properties, "longitude", "lon", "tower_lon"), field(properties, "latitude", "lat", "tower_lat")];
  const lon = Number(coordinates?.[0]);
  const lat = Number(coordinates?.[1]);
  if (!Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`Cell ${index + 1} has invalid longitude or latitude.`);
  }
  const requestedID = String(field(properties, "id", "cell_id", "cellId") ?? `imported-${index + 1}`).trim();
  if (!requestedID) throw new Error(`Cell ${index + 1} has an empty id.`);
  if (byteLength(requestedID) > MAX_INVENTORY_ID_BYTES) throw new Error(`Cell ${index + 1} id must be at most ${MAX_INVENTORY_ID_BYTES} UTF-8 bytes.`);
  const id = uniqueID(requestedID, used);
  const requestedCellID = String(field(properties, "cell_id", "cellId") ?? id).trim();
  if (!requestedCellID || byteLength(requestedCellID) > MAX_INVENTORY_ID_BYTES) throw new Error(`Cell ${requestedID} cell_id must be at most ${MAX_INVENTORY_ID_BYTES} UTF-8 bytes.`);
  const cellId = uniqueID(requestedCellID, usedCellIDs);
  const nestedProfile = properties.rf_profile && typeof properties.rf_profile === "object" && !Array.isArray(properties.rf_profile)
    ? properties.rf_profile
    : {};
  const profileFields = {
    networkTech: profileField(nestedProfile, properties, "network_tech", "networkTech", "radio_type", "radioType"),
    frequencyGHz: optionalNumber(profileField(nestedProfile, properties, "frequency_ghz", "frequencyGHz")),
    band: profileField(nestedProfile, properties, "band"),
    bandwidthMHz: optionalNumber(profileField(nestedProfile, properties, "bandwidth_mhz", "bandwidthMHz")),
    channelId: profileField(nestedProfile, properties, "channel_id", "channelId"),
    duplexMode: profileField(nestedProfile, properties, "duplex_mode", "duplexMode"),
    txPowerDbm: optionalNumber(profileField(nestedProfile, properties, "tx_power_dbm", "txPowerDbm")),
    antennaGainDbi: optionalNumber(profileField(nestedProfile, properties, "antenna_gain_dbi", "antennaGainDbi")),
    systemLossDb: optionalNumber(profileField(nestedProfile, properties, "system_loss_db", "systemLossDb")),
    radiusMeters: optionalNumber(profileField(nestedProfile, properties, "radius_m", "radiusMeters")),
    beamWidthDeg: optionalNumber(profileField(nestedProfile, properties, "beam_width", "beamWidthDeg")),
    antennaHeightM: optionalNumber(profileField(nestedProfile, properties, "antenna_height_m", "antennaHeightM")),
    mechanicalDowntiltDeg: optionalNumber(profileField(nestedProfile, properties, "mechanical_downtilt_deg", "mechanicalDowntiltDeg")),
    electricalDowntiltDeg: optionalNumber(profileField(nestedProfile, properties, "electrical_downtilt_deg", "electricalDowntiltDeg")),
    orientationDeg: optionalNumber(profileField(nestedProfile, properties, "orientation_deg", "orientationDeg")),
    horizontalPatternId: profileField(nestedProfile, properties, "horizontal_pattern_id", "horizontalPatternId"),
    verticalPatternId: profileField(nestedProfile, properties, "vertical_pattern_id", "verticalPatternId"),
    loadFactor: optionalNumber(profileField(nestedProfile, properties, "load_factor", "loadFactor")),
    reuseFactor: optionalNumber(profileField(nestedProfile, properties, "reuse_factor", "reuseFactor")),
    pci: optionalNumber(profileField(nestedProfile, properties, "pci")),
    receiverHeightM: optionalNumber(profileField(nestedProfile, properties, "receiver_height_m", "receiverHeightM")),
    receiverSensitivityDbm: optionalNumber(profileField(nestedProfile, properties, "receiver_sensitivity_dbm", "receiverSensitivityDbm")),
  };
  const rfProfile = resolveRFProfile({ rfProfile: compactDefined(profileFields) }, settings, index);
  const errors = validateRFProfile(rfProfile);
  if (Object.keys(errors).length) {
    const first = Object.values(errors)[0];
    throw new Error(`Cell ${requestedID}: ${first}`);
  }
  return {
    id,
    cellId,
    radioType: rfProfile.networkTech,
    isSimulated: Boolean(field(properties, "is_simulated", "isSimulated")),
    coordinates: [lon, lat],
    rfProfile,
    inventorySource: "import",
    editable: true,
  };
}

function parseGeoJSON(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Inventory GeoJSON is not valid JSON.");
  }
  if (parsed?.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Inventory GeoJSON must be a FeatureCollection.");
  }
  return parsed.features
    .filter((feature) => feature?.geometry?.type === "Point")
    .map((feature) => ({ properties: feature.properties ?? {}, coordinates: feature.geometry.coordinates }));
}

function parseCSV(text) {
  const rows = csvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());
  return rows.slice(1).filter((row) => row.some((value) => value.trim())).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  if (quoted) throw new Error("Inventory CSV contains an unterminated quoted value.");
  return rows;
}

function field(source, ...names) {
  for (const name of names) {
    if (source?.[name] !== undefined && source[name] !== "") return source[name];
  }
  return undefined;
}

function profileField(profile, properties, ...names) {
  return field(profile, ...names) ?? field(properties, ...names);
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function compactDefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function uniqueID(base, used) {
  let candidate = truncateUTF8(String(base), MAX_INVENTORY_ID_BYTES);
  let suffix = 2;
  while (used.has(candidate)) {
    const ending = `-${suffix}`;
    candidate = `${truncateUTF8(String(base), MAX_INVENTORY_ID_BYTES - byteLength(ending))}${ending}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function truncateUTF8(value, maximumBytes) {
  const characters = Array.from(value);
  while (characters.length && byteLength(characters.join("")) > maximumBytes) characters.pop();
  return characters.join("");
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).byteLength;
}
