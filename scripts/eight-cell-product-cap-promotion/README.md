# Normal eight-Cell promotion validation

This tooling builds normal production source with the canonical max-eight policy. It applies no cap override. Historical six-cap/audit artifacts remain immutable and are verified by the final audit.

The frozen promotion lock defines all 37 phases, the W1/Profile A scope and release gates. `baseline.json` records the pre-promotion working tree, including the validated but uncommitted bounded-follow-up implementation. `cap-inventory.txt` and `contracts.json` distinguish product caps from independent/scientific/fixture values. `completion-audit.json` maps each phase to actual evidence. The report contains all 61 requested final items.

Raw fixtures, binaries, HTTP traces, kernel/resource counters, cancellation logs and screenshots are retained outside Git in `/tmp/atom-eight-cell-product-cap-promotion`. `raw-evidence.json` identifies the verified archive and its SHA index. Restore this archive at that path to inspect evidence. The final shipping image metadata identifies the normal Linux/arm64 Go1.26.6 CGO0 build; its production Go source hashes match the qualified cap-eight build.

Useful checks, from the repository root:

```sh
python3 scripts/generate_policy.py --check
/tmp/atom-persistence-docs-venv/bin/python scripts/eight-cell-product-cap-promotion/contracts.py
python3 -B scripts/eight-cell-product-cap-promotion/completion.py
```

`build.py` builds the normal shipping image. `runtime.py <fresh-label> final-smoke` confirms F28 and frozen science on a fresh Profile A container; `cancellation-only` verifies cancellation and subsequent same/other-client workflows. Container labels must be new so prior evidence is not overwritten. The observer mounts historical qualified helpers read-only. `checks.py` records quality commands and machine-verifies four named real E2Es with explicit opt-in and zero skips. `evidence.py` archives raw evidence; `report.py` renders the report only after completion passes.

The full matrix completed before an unrelated supplemental Building Entry probe used an input missing a historically included optimization field. Completed matrix rows were preserved and independently reverified; corrected supplemental science passed. Failed selector/launcher development probes are retained and excluded from final passing evidence.

No W2/W3, arbitrary deployment or dataset capacity claim is made. Persistence guards and independent Recommendation5/Measurement6 caps remain unchanged. No tag, release publication or push is performed.
