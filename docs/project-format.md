# Portable project format

Project files contain editable project inputs, saved Scenario Versions and retained Scenario result artifacts. They do not contain the separate local Run History database, generated report files, coverage surfaces, camera position, navigation stage, request state or Undo history. The existing workspace policy retains the five most recent Scenario artifact caches. Export does not remove any additional results.

## File versions and compatibility

New exports use `{ "schemaVersion": 3, "project": ... }`. The workspace IndexedDB schema remains **2**. Valid file versions **1 and 2** remain importable with their existing migration/copy behavior. Older applications cannot read v3 exports; use a version with v3 support to exchange new files.

Version 3 stores nonempty GeoJSON FeatureCollection `features` in retained Scenario artifacts as `{ "count": N, "columns": <column> }`. Empty feature arrays remain arrays. Ordinary workspace/API GeoJSON is unchanged; reconstruction restores the complete feature array, order, properties, geometry and number values.

## Lossless columns

A column represents N values. Tags have these exact JSON forms:

| Tag | Representation | Reconstruction |
| --- | --- | --- |
| `constant` | `["constant", value]` | N independent copies |
| `values` | `["values", values]` | Exactly N values |
| `numbers` | `["numbers", "number,number,..."]` | Exactly N finite JSON number tokens; JSON decimal spelling preserves IEEE-754 values without quantization |
| `dictionary` | `["dictionary", values, indexes]` | N validated dictionary indexes; independent object copies |
| `objects` | `["objects", keys, columns]` | N objects with unique safe keys and corresponding value columns |
| `arrays` | `["arrays", keys, columns]` | N arrays; keys must be sequential strings `"0"`, `"1"`, etc. |
| `groups` | `["groups", [[rowIndexes, column], ...]]` | Complete, disjoint row partition; restores original order and missing-field distinctions |

The encoder chooses the representation with the fewest encoded nodes at each column. JSON key order and array order remain stable. No data-dependent tolerances, rounding, lossy geometry simplification, changed fingerprints or new RF calculations are involved. Equivalent project state produces byte-identical exports; import intentionally creates new local identities and timestamps.

## Identity and provenance

Import creates a new project and new Scenario IDs. In v3 it also retains domain Version and embedded Run metadata, assigning independent local IDs and updating their internal links. `project.importProvenance` records `sourceProjectId` and the complete source-to-imported `identityMap`. Scientific request inputs, canonical input snapshots, fingerprints, result values, compute optimization run IDs, solution IDs, Pareto order and source timestamps inside evidence remain unchanged. References to external history not present in the file remain source references; the importer does not invent missing Runs.

The v1/v2 importer historically discarded project/Scenario domain metadata when making independent copies. This behavior is preserved for old files. v3 closes that provenance gap for new exports.

## Resource and error contract

The UI rejects files over **16 MiB** before reading their contents. The store independently checks UTF-8 bytes before parsing. All file versions retain the encoded JSON budget:

- depth 40;
- 250,000 nodes;
- 2,000 object keys;
- 25,000 elements per array;
- 1 MiB per string;
- 100 Scenarios;
- forbidden `__proto__`, `prototype` and `constructor` keys.

v3 additionally preflights the complete reconstructed project before allocating any decoded rows: **32 MiB** of compact logical JSON and **1,000,000 decoded nodes**. Reconstruction then rechecks depth, object/array/string bounds and result shapes. The decoded-node limit is separate from the unchanged 250,000-node encoded-file limit. A numeric-vector comma count is checked before splitting and every number token must be finite and valid JSON syntax.

Export checks both budgets too. A larger or more complex project fails explicitly with its limit reason; it does not download an artifact this importer would reject or silently remove scientific data. This is six-Cell reliability coverage, not a larger-network support guarantee or unbounded archival storage.

## Reproduction and validation

See [the persistence reliability audit](persistence-reliability-audit.md). `node scripts/persistence-reliability-audit.mjs` reproduces byte composition and timings from the compressed real UI export fixture. The dedicated browser workflow replays captured six-Cell backend responses through the ordinary Evaluate / Interference / Optimize / Save Version / Export / Import UI. Run it with:

```sh
cd frontend-react
npx playwright test e2e/persistence-reliability.spec.js --workers=2
```
