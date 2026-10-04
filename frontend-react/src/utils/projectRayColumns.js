// Lossless file-only representation of retained ray features. Workspace/RF DTOs
// remain ordinary GeoJSON. Repeated values are represented once, never rounded.
const encoder = new TextEncoder();
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);

function nodeCount(value) {
  return 1 + (value && typeof value === "object"
    ? Object.values(value).reduce((total, child) => total + nodeCount(child), 0) : 0);
}

function packColumn(values) {
  const serialized = values.map((value) => JSON.stringify(value));
  if (serialized.every((value) => value === serialized[0])) return ["constant", values[0]];
  const dictionary = [...new Set(serialized)];
  const indexes = new Map(dictionary.map((value, index) => [value, index]));
  const options = [
    ["values", values],
    ["dictionary", dictionary.map((value) => JSON.parse(value)), serialized.map((value) => indexes.get(value))],
  ];
  // JSON's decimal number spelling round-trips IEEE-754 values exactly. A
  // bounded numeric vector avoids paying one parser node per repeated column
  // coordinate; no quantization, rounding or binary/platform dependency.
  if (values.every((value) => typeof value === "number" && Number.isFinite(value))) {
    const numbers = serialized.join(",");
    if (encoder.encode(numbers).byteLength <= 1024 * 1024) options.push(["numbers", numbers]);
  }
  if (values.every((value) => value && typeof value === "object"
    && Array.isArray(value) === Array.isArray(values[0]))) {
    const groups = new Map();
    values.forEach((value, index) => {
      const shape = JSON.stringify(Object.keys(value));
      if (!groups.has(shape)) groups.set(shape, { indexes: [], values: [] });
      groups.get(shape).indexes.push(index);
      groups.get(shape).values.push(value);
    });
    if (groups.size === 1) {
      const keys = Object.keys(values[0]);
      options.push([Array.isArray(values[0]) ? "arrays" : "objects", keys,
        keys.map((key) => packColumn(values.map((value) => value[key])))]);
    } else {
      options.push(["groups", [...groups.values()].map((group) => [group.indexes, packColumn(group.values)])]);
    }
  }
  return options.reduce((best, option) => nodeCount(option) < nodeCount(best) ? option : best);
}

export function packProjectRays(project) {
  // Match JSON's existing treatment of undefined/non-finite values and detach
  // the file representation from live scientific state.
  const packed = JSON.parse(JSON.stringify(project));
  for (const scenario of packed.scenarios) {
    visitFeatureCollections(scenario.artifacts, (geojson) => {
      if (Array.isArray(geojson.features) && geojson.features.length > 0) {
        geojson.features = { count: geojson.features.length, columns: packColumn(geojson.features) };
      }
    });
  }
  return packed;
}

function invalid() { throw new Error("Project file contains invalid ray columns"); }

function stats(value) {
  return { nodes: nodeCount(value), bytes: encoder.encode(JSON.stringify(value)).byteLength };
}

function sum(left, right) {
  return { nodes: left.nodes + right.nodes, bytes: left.bytes + right.bytes };
}

// Preflight the complete expansion before allocating a single decoded row.
function measureColumn(column, count) {
  if (!Array.isArray(column)) invalid();
  const [kind, data, extra] = column;
  if (kind === "numbers" && column.length === 2 && typeof data === "string") {
    const tokens = numberTokens(data, count);
    return { nodes: count, bytes: tokens.reduce((total, value) => total + stats(Number(value)).bytes, 0) };
  }
  if (kind === "constant" && column.length === 2) {
    const value = stats(data);
    return { nodes: value.nodes * count, bytes: value.bytes * count };
  }
  if (kind === "values" && column.length === 2 && Array.isArray(data) && data.length === count) {
    return data.reduce((total, value) => sum(total, stats(value)), { nodes: 0, bytes: 0 });
  }
  if (kind === "dictionary" && column.length === 3 && Array.isArray(data)
    && Array.isArray(extra) && extra.length === count) {
    const sizes = data.map(stats);
    return extra.reduce((total, index) => {
      if (!Number.isInteger(index) || index < 0 || index >= data.length) invalid();
      return sum(total, sizes[index]);
    }, { nodes: 0, bytes: 0 });
  }
  if ((kind === "objects" || kind === "arrays") && column.length === 3
    && Array.isArray(data) && Array.isArray(extra) && data.length === extra.length
    && new Set(data).size === data.length) {
    if (data.some((key, index) => typeof key !== "string" || unsafeKeys.has(key)
      || (kind === "arrays" && key !== String(index)))) invalid();
    if (data.length > (kind === "objects" ? 2_000 : 25_000)) invalid();
    const syntaxBytes = kind === "objects"
      ? data.reduce((total, key) => total + stats(key).bytes + 1, 0) : 0;
    return extra.reduce((total, child) => sum(total, measureColumn(child, count)), {
      nodes: count,
      bytes: count * (2 + syntaxBytes + Math.max(0, data.length - 1)),
    });
  }
  if (kind === "groups" && column.length === 2 && Array.isArray(data)) {
    const seen = new Set();
    const total = data.reduce((result, group) => {
      if (!Array.isArray(group) || group.length !== 2 || !Array.isArray(group[0]) || group[0].length === 0) invalid();
      for (const index of group[0]) {
        if (!Number.isInteger(index) || index < 0 || index >= count || seen.has(index)) invalid();
        seen.add(index);
      }
      return sum(result, measureColumn(group[1], group[0].length));
    }, { nodes: 0, bytes: 0 });
    if (seen.size !== count) invalid();
    return total;
  }
  invalid();
}

function unpackColumn(column, count) {
  const [kind, data, extra] = column;
  if (kind === "numbers") return numberTokens(data, count).map(Number);
  if (kind === "constant") return Array.from({ length: count }, () => structuredClone(data));
  if (kind === "values") return data;
  if (kind === "dictionary") return extra.map((index) => structuredClone(data[index]));
  if (kind === "groups") {
    const result = new Array(count);
    for (const [indexes, child] of data) {
      const values = unpackColumn(child, indexes.length);
      indexes.forEach((index, offset) => { result[index] = values[offset]; });
    }
    return result;
  }
  const columns = extra.map((child) => unpackColumn(child, count));
  return Array.from({ length: count }, (_, row) => kind === "arrays"
    ? columns.map((values) => values[row])
    : Object.fromEntries(data.map((key, index) => [key, columns[index][row]])));
}

function numberTokens(data, count) {
  // Count first so a comma bomb cannot allocate an unbounded split array.
  let items = 1;
  for (let index = 0; index < data.length; index += 1) if (data[index] === ",") items += 1;
  if (items !== count) invalid();
  const tokens = data.split(",");
  for (const token of tokens) {
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(token) || !Number.isFinite(Number(token))) invalid();
  }
  return tokens;
}

function visitFeatureCollections(value, visitor) {
  if (!value || typeof value !== "object") return;
  if (value.type === "FeatureCollection") {
    visitor(value);
    return;
  }
  for (const child of Object.values(value)) visitFeatureCollections(child, visitor);
}

export function measureProjectRayExpansion(project, { maxBytes, maxNodes }) {
  const budget = stats(project);
  const retained = [];
  for (const scenario of project.scenarios ?? []) {
    visitFeatureCollections(scenario.artifacts, (geojson) => {
      if (Array.isArray(geojson.features)) return;
      const packed = geojson.features;
      if (!packed || Object.keys(packed).length !== 2 || !Number.isInteger(packed.count)
        || packed.count < 1 || packed.count > 25_000) invalid();
      const expanded = measureColumn(packed.columns, packed.count);
      const encoded = stats(packed);
      budget.nodes += 1 + expanded.nodes - encoded.nodes;
      budget.bytes += 2 + Math.max(0, packed.count - 1) + expanded.bytes - encoded.bytes;
      retained.push({ geojson, packed });
    });
  }
  if (budget.bytes > maxBytes || budget.nodes > maxNodes) {
    throw new Error("Project file ray expansion exceeds the resource budget");
  }
  return retained;
}

export function unpackProjectRays(project, limits) {
  const retained = measureProjectRayExpansion(project, limits);
  for (const { geojson, packed } of retained) geojson.features = unpackColumn(packed.columns, packed.count);
  return project;
}
