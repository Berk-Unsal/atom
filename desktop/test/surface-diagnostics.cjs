"use strict";
const { createHash } = require("node:crypto");
function description(value) {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? { type: "missing" } : { type: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
    bytes: Buffer.byteLength(encoded), sha256: createHash("sha256").update(encoded).digest("hex") };
}
function changeSummary(before, after, maximum = 30) {
  const changed = [];
  function compare(left, right, path = "") {
    if (changed.length >= maximum || JSON.stringify(left) === JSON.stringify(right)) return;
    if (left && right && typeof left === "object" && typeof right === "object") {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) compare(left[key], right[key], `${path}/${key}`);
    } else changed.push({ path: path.slice(0, 300), before: description(left), after: description(right) });
  }
  compare(before, after); return changed;
}
module.exports = { changeSummary };
