# Cell, Sector, Site, and Tower Record

Use these terms to distinguish a planning object from a real telecom installation. A.T.O.M keeps the established API names such as `towers[]` for compatibility; those names do not certify that a record is a physical tower or an operator-owned asset.

## Planning Cell

A **Cell** is the planning record you select and configure in Inventory. It carries the coordinates, technology, carrier, antenna assumptions, and other per-cell inputs used by an analysis. The UI calls these objects Cells; existing API requests may expose them under names such as `towers[]`. A selected planning Cell is not, by itself, proof of a distinct physical installation.

## Sector

A **sector** is a directional planning view of radio coverage associated with a Cell, using settings such as azimuth and beam width. Several Cells or sectors may be planned at one location, for example to represent different directions. This describes the plan; it does not establish how many antennas or sectors are physically installed.

## Physical Site and Co-location

A **physical site** is a real place or structure where telecommunications equipment is installed. **Co-location** means multiple planned Cells are assigned to the same planned location. Matching or nearby coordinates can help represent co-location in a plan, but the dataset does not verify that equipment shares a real site, building, rooftop, or support structure.

A **site group** in A.T.O.M is a planning convenience: **Place site** adds several co-located Cells (by default three sectors at 0°, 120° and 240°) that move together. Each member remains an ordinary Cell in every analysis. A site group does not establish a physical site, shared antenna, feasibility, ownership, permitting or cost.

## Tower Record and Candidate

A **tower record** is an input feature from the active tower dataset. It supplies a location and dataset identifier for planning; it is not an operator inventory. The current tower locations are derived from OpenCellID-oriented source processing, as described under [Data Confidence](modeling-limits.html#data-confidence).

A **candidate** is a record surfaced for consideration by the planning workflow. Candidate status is not evidence of ownership, site availability, permission or permitting, cost, power, fiber, backhaul, rooftop access, or construction feasibility. Those items require independent verification before any real-world decision.

## Dataset Identity

Each active dataset pack has an identity and provenance. Saved scenarios stay bound to the dataset identity they used; switching packs can make results stale instead of silently reinterpreting them. See [Validated Dataset Packs](features.html#validated-dataset-packs) and [Modeling Limits](modeling-limits.html).

## Quick distinction

| Term | In A.T.O.M | What it does not establish |
|---|---|---|
| Cell | Configurable planning record used by an analysis | A verified physical cell or site |
| Sector | Directional coverage settings associated with a planned Cell | Installed antenna count or orientation |
| Site | Real-world equipment location | Verified by a dataset point alone |
| Tower record | Location feature supplied by a dataset | Ownership, operational status, or a tower structure |
| Candidate | Dataset record suggested for further planning | Feasibility, permission, cost, or availability |

For the model's broader data and scientific boundaries, see [Modeling Limits](modeling-limits.html).
