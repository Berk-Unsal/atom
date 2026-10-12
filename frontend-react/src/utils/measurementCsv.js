const MAX_SAMPLES = 5000;
export const MAX_MEASUREMENT_CSV_BYTES = 2 * 1024 * 1024;

export async function readMeasurementCsvFile(file) {
  if (!file || typeof file.text !== "function" || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error("Measurement CSV file metadata is invalid");
  }
  if (file.size > MAX_MEASUREMENT_CSV_BYTES) {
    throw new Error(`Measurement CSV must be no larger than ${MAX_MEASUREMENT_CSV_BYTES / (1024 * 1024)} MiB`);
  }
  return parseMeasurementCsv(await file.text());
}

export function parseMeasurementCsv(text) {
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("Measurement CSV must include a header and at least one sample");
  }
  const aliases = { longitude: "lon", latitude: "lat", rsrp: "rsrp_dbm" };
  const headers = parseRow(lines[0]).map((value) => {
    const normalized = value.trim().toLowerCase();
    return aliases[normalized] ?? normalized;
  });
  if (new Set(headers).size !== headers.length) {
    throw new Error("Measurement CSV contains duplicate or aliased headers");
  }
  const required = ["id", "lon", "lat", "technology", "rsrp_dbm"];
  for (const header of required) {
    if (!headers.includes(header)) {
      throw new Error(`Measurement CSV is missing ${header}`);
    }
  }
  if (lines.length - 1 > MAX_SAMPLES) {
    throw new Error(`Measurement CSV is limited to ${MAX_SAMPLES} samples`);
  }
  const seen = new Set();
  return lines.slice(1).map((line, index) => {
    const values = parseRow(line);
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? ""]));
    const id = record.id;
    const lon = Number(record.lon);
    const lat = Number(record.lat);
    const rsrp = Number(record.rsrp_dbm);
    const technology = record.technology.toLowerCase();
    if (!id || seen.has(id)) throw new Error(`Row ${index + 2} has an empty or duplicate id`);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180 || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new Error(`Row ${index + 2} has invalid coordinates`);
    }
    if (!Number.isFinite(rsrp) || rsrp < -180 || rsrp > -20) {
      throw new Error(`Row ${index + 2} has invalid rsrp_dbm`);
    }
    if (technology !== "4g" && technology !== "5g") {
      throw new Error(`Row ${index + 2} technology must be 4g or 5g`);
    }
    seen.add(id);
    return { id, lon, lat, technology, rsrp_dbm: rsrp, cell_id: record.cell_id || undefined };
  });
}

function parseRow(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}
