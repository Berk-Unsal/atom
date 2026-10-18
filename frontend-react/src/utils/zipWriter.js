// Minimal, dependency-free ZIP writer: STORE (no compression), UTF-8 names, CRC-32. Output is deterministic for the
// same files and timestamp, which keeps review packages reproducible.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time fields (local wall-clock semantics, two-second resolution) for a JS Date. */
function dosDateTime(date) {
  const value = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(Date.UTC(1980, 0, 1));
  const year = Math.min(Math.max(value.getUTCFullYear(), 1980), 2107);
  return {
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | Math.floor(value.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
  };
}

const UTF8_FLAG = 0x0800;
const MAX_ENTRY_BYTES = 0xffffffff;

/**
 * Builds a ZIP archive from [{ name, bytes }]. Names must be unique, relative and use "/" separators.
 * ZIP64 is not supported; each file and the archive must stay below 4 GiB.
 */
export function createZip(files, { modifiedAt = new Date(Date.UTC(1980, 0, 1)) } = {}) {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(modifiedAt);
  const seen = new Set();
  const entries = files.map(({ name, bytes }) => {
    if (typeof name !== "string" || !name || name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
      throw new Error(`Invalid ZIP entry name: ${name}`);
    }
    if (seen.has(name)) throw new Error(`Duplicate ZIP entry name: ${name}`);
    seen.add(name);
    // ArrayBuffer.isView also accepts byte arrays from another realm (for example a jsdom TextEncoder).
    const data = ArrayBuffer.isView(bytes) ? new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) : encoder.encode(String(bytes ?? ""));
    if (data.length > MAX_ENTRY_BYTES) throw new Error(`ZIP entry too large: ${name}`);
    return { nameBytes: encoder.encode(name), data, crc: crc32(data) };
  });

  const chunks = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_FLAG, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, entry.crc, true);
    local.setUint32(18, entry.data.length, true);
    local.setUint32(22, entry.data.length, true);
    local.setUint16(26, entry.nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), entry.nameBytes, entry.data);

    const header = new DataView(new ArrayBuffer(46));
    header.setUint32(0, 0x02014b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 20, true);
    header.setUint16(8, UTF8_FLAG, true);
    header.setUint16(10, 0, true);
    header.setUint16(12, time, true);
    header.setUint16(14, date, true);
    header.setUint32(16, entry.crc, true);
    header.setUint32(20, entry.data.length, true);
    header.setUint32(24, entry.data.length, true);
    header.setUint16(28, entry.nameBytes.length, true);
    header.setUint32(42, offset, true);
    central.push(new Uint8Array(header.buffer), entry.nameBytes);
    offset += 30 + entry.nameBytes.length + entry.data.length;
  }
  const centralSize = central.reduce((total, chunk) => total + chunk.length, 0);
  if (offset + centralSize > MAX_ENTRY_BYTES || entries.length > 0xffff) throw new Error("Review package is too large for a ZIP archive without ZIP64");
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...chunks, ...central, new Uint8Array(end.buffer)];
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

/** Reads back a STORE-only archive produced by createZip (used by tests and the manifest self-check). */
export function readZip(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let endOffset = archive.length - 22;
  while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) endOffset -= 1;
  if (endOffset < 0) throw new Error("Not a ZIP archive");
  const count = view.getUint16(endOffset + 10, true);
  let pointer = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let index = 0; index < count; index += 1) {
    if (view.getUint32(pointer, true) !== 0x02014b50) throw new Error("Corrupt ZIP central directory");
    const crc = view.getUint32(pointer + 16, true);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const name = decoder.decode(archive.subarray(pointer + 46, pointer + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const bytes = archive.subarray(start, start + size);
    if (crc32(bytes) !== crc) throw new Error(`CRC mismatch for ${name}`);
    files.push({ name, bytes });
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
