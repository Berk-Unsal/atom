# Project Overview

A.T.O.M is a local-first, open-source **deterministic urban RF planning and experimentation workspace**. It helps engineers and learners compare a small configured Cell plan, inspect the assumptions behind its estimates, and preserve the evidence for a planning decision.

## One planning question

For a chosen urban area: **does changing these Cells' azimuths serve the configured demand better, and what trade-offs does it create?**

1. Configure two to eight Cells using the active dataset and explicit radio assumptions.
2. Evaluate the baseline and inspect propagation and modeled co-channel interference.
3. Run bounded deterministic azimuth optimization.
4. Compare the recommendation with the baseline, inspect per-Cell explanations, and review discovered trade-offs.
5. Save an immutable Version and export retained project evidence or a separate planning report.

Start with [Getting Started](getting-started.md) or [Download and Use](download.html). This workflow compares planning hypotheses; it does not approve deployments or establish measured network performance.

## Who can use it today?

- **RF/RAN engineers and planning experimenters:** compare explicitly configured small urban networks, antenna directions, demand proxies and interference assumptions.
- **Telecom students and researchers:** inspect deterministic propagation, link budgets, objective trade-offs and isolated research/reference calculations.
- **Software engineers and contributors:** study and extend inspectable geospatial computation, bounded requests and reproducible local workflows.

The released tool does not validate vendor antenna hardware, implement beamforming arrays/codebooks, or provide operator inventory, traffic/capacity, mobility, permitting, cost or backhaul truth. Analytic antenna presets and configured azimuths are planning inputs.

## Current workflow limits

| Workflow | Released scope |
|---|---|
| Normal network evaluation and azimuth optimization | Two to eight selected Cells |
| Candidate recommendations | Up to five existing input Cells; known planning records, not approved sites |
| Measurement Validation | One to six selected 4G/5G Cells; up to 5,000 compatible RSRP samples |

These limits are independent. The eight-Cell operational qualification covers the frozen Ankara W1 workload on Profile A, not arbitrary settings, datasets, hardware or multiple instances. See the [qualification report](eight-cell-product-cap-promotion.md) for the exact historical envelope.

## Models and evidence

- **2.6 GHz and 28 GHz:** the default `urban_short_range` model implements a deterministic 3GPP UMa outdoor median path-loss subset, with height-aware LOS/NLOS classification, applicability checks and explicit legacy fallback.
- **Legacy compatibility:** `legacy_fspl_walls` remains selectable. Its wall-event heuristic is not added to empirical urban NLOS loss.
- **140 GHz:** `research_sub_thz` is research/reference only. Ordinary interference quality and measurement evaluation are unavailable for this profile.
- **Terrain and diffraction:** optional point-to-point path-profile diagnostics remain separate from canonical fast-network propagation.
- **Building entry:** representative facade-entry planning estimates do not establish indoor or whole-building coverage.

**Measured real-world propagation accuracy is not yet established.** Standards-based subsets, deterministic software checks, matching scientific hashes and operational qualification provide different kinds of evidence; none is field-accuracy validation. The real Ankara pilot parsed 53,005 raw rows but produced zero canonical observations because serving semantics remained unresolved. Exact transmitter/resource truth was unavailable, and no defensible canonical MAE/RMSE resulted. See [current measurement readiness](concept-6a1-readiness.json) and [modeling limits](modeling-limits.html).

## Data and computation

The bundled Ankara pack contains static OSM and OpenCellID-derived planning data. Geometry/hash validation checks structural usability and integrity; it does not establish complete coverage, surveyed antenna characteristics or current operator transmitter identities. POI/residential demand is a heuristic proxy, not measured subscriber traffic.

R-tree indexing, bounded workers and request-local reuse support the existing computation. Latency depends on selected Cells, geometry, radio settings, search policy and machine resources. No general sub-100 ms response or universal scaling guarantee is claimed. Other regions can be prepared as validated dataset packs; their data quality, model applicability and workload performance need separate review.

## Preserving a comparison

A working draft autosaves in the current browser. A saved Version records immutable planning inputs; retained Runs describe executions of those inputs. A portable project carries bounded Scenario/Version/embedded Run evidence and retained Scenario results. It excludes the separate Run History database, generated report files, coverage surfaces and transient view/Undo state. Download reports separately and review the [portable project contract](project-format.md) for limits.

## Product direction

Current capability is defined by [VERSION](../VERSION), the [capability reference](features.html) and the [changelog](changelog.html). Future functionality needs a concrete planning task, authoritative inputs and a declared evidence boundary. This overview does not promise new RF models, hardware validation, larger networks or commercial planning-suite equivalence.
