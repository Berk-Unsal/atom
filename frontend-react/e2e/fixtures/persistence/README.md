# Six-Cell persistence regression data

These gzip files hold actual six-Cell backend response captures from the preceding network-capacity audit, with 28 GHz / 120 rays / 400 m settings. They exercise the production browser workflows without RF timing variation or changing the six-Cell selection limit. They are replay data, not simulated padding or invented oversized results.

`workspace.json` is input-only, containing six actual Ankara Cells in deterministic order. `inventory.json.gz` contains those six Cells. The Evaluate and Optimize workflows each have six exact simulation follow-up responses. `manifest.json` records source capture paths, byte sizes and SHA-256 hashes.

`six-cell-v2.atom-project.json.gz` is the **actual 31,156,171-byte UI download** produced before this repair: Evaluate → Interference → Optimize → Save Version → Export. It fails the old byte and node budgets. Keeping it compressed avoids checking in a 30+ MB JSON file; test code decompresses it locally. The old importer never accepted this oversized v2 file. The new unit regression re-exports its full logical project as v3 and verifies complete science/Version equality.

The browser acceptance workflow additionally retains interference after Optimize and creates a second Version. No production code reads these fixtures.
