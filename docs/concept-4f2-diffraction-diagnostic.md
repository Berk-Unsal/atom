# Concept 4F.2: Diffraction Reference And Diagnostic Model

Concept 4F.2 adds an isolated point-to-point diffraction diagnostic. It answers a deliberately narrow question:

> If this link were represented as free-space propagation plus explicit diffraction, what loss would the known obstruction geometry imply?

The result is comparative evidence, not a new network propagation branch. It does not modify `urban_short_range`, network optimization, received-signal surfaces, interference, or building-entry analysis.

## Reference basis

The implementation is a declared subset aligned with [ITU-R P.526-16 (11/2025)](https://www.itu.int/rec/R-REC-P.526-16-202511-I/en), section 4.1, Single knife-edge obstacle:

- Equation (26) supplies the signed knife-edge parameter:

  $$v = h\sqrt{\frac{2(d_1+d_2)}{\lambda d_1d_2}}$$

  `h` is the obstruction-top height above the straight Tx–Rx line. It is negative when the top is below that line. `d1` and `d2` are the distances from the edge to the two endpoints, and all quantities use self-consistent units.

- Equation (30) is the Fresnel-integral loss definition.
- Equation (31) is the implemented approximation for `v > -0.78`:

  $$J(v) = 6.9 + 20\log_{10}\left(\sqrt{(v-0.1)^2+1}+v-0.1\right)\ \mathrm{dB}$$

  At `v <= -0.78`, the diagnostic reports zero loss. A.T.O.M. records the exact equation as the reference basis but does not claim a full Fresnel-integral implementation.

The stable diagnostic identity is `p526-single-edge-v1`; the surrounding response remains under the isolated `path-profile-diagnostic-v1` RF contract. The preferred description is “P.526-aligned single-edge diagnostic,” not “P.526 propagation model.” P.526-16 states that the single-edge data are mainly for frequencies above 30 MHz; A.T.O.M. permits a mathematical 140 GHz research diagnostic but marks it research-only.

## Geometry contract

The response exposes a complete geometry ledger rather than only a final loss:

- Tx/Rx coordinates and configured Tx/Rx heights above ground
- absolute endpoint elevations, horizontal and slant distance
- terrain status and the missing-terrain assumption
- obstruction ID, logical ID, type, material, and height provenance
- absolute and relative obstruction height, along-path fraction and distance
- LOS-line height, `d1`, `d2`, clearance, first-Fresnel radius, and clearance ratio
- signed `v`, edge loss, edge availability, and selected-edge status

A flat-roof footprint is represented by its path interval boundaries. The entry and exit roof edges are separate deterministic knife-edge candidates; a zero-length tangent/contact is one contact candidate. The flat roof is not collapsed into an arbitrary center screen.

For multiple candidates, the current rule is:

1. retain every entry/exit candidate in path order;
2. discard candidates whose geometry is invalid or whose P.526 zero-loss guard applies;
3. select the available candidate with maximum `v`;
4. break exact ties by path distance, obstruction ID, then edge position.

This is a single-dominant-edge diagnostic. A production multi-edge calculation is deferred.

## Height and terrain semantics

Explicit diffraction requires evidence-backed obstruction geometry. `height` tags are `observed_tag`; `building:levels` is `derived_from_levels` using the existing 3 m-per-level conversion. The generic `default-3-storey`/9 m display fallback is `unavailable` evidence and never enters the `v` calculation. If an intersected footprint has only that fallback, the diagnostic is unavailable with `obstruction_height_unavailable`, even when canonical UMa remains conservatively NLOS.

When terrain is unavailable, known building edges can still be evaluated on the documented flat-ground relative-height datum. Missing terrain is never changed into measured zero elevation. Terrain-backed profile samples can produce terrain point candidates; a building candidate with invalid or missing terrain still carries the explicit terrain limitation.

Fresnel clearance remains geometry-only. `geometric_los`, `fresnel_clearance`, and `diffraction_diagnostic` are separate response concepts. A link can be geometric LOS while its 60% first-Fresnel clearance is a concern; that concern does not silently become canonical NLOS.

## Diagnostic result and canonical comparison

The diagnostic uses free-space path loss as its declared baseline:

```text
diagnostic propagation loss = FSPL + explicit single-edge loss
diagnostic Rx = configured Tx/gain/system/calibration/pattern terms
               − diagnostic propagation loss
```

The response exposes `fspl_db`, `diffraction_loss_db`, `diagnostic_total_path_loss_db`, and `diagnostic_rx_dbm`. If known geometry is unavailable, the loss and Rx fields are null rather than fake precision.

For an applicable 2.6 or 28 GHz outdoor link, the response also evaluates the canonical `urban_short_range` UMa result independently and exposes its path loss, Rx, and `diagnostic_minus_canonical_db`. These are two alternative modeling views:

```text
canonical:            UMa LOS/NLOS path loss
diagnostic:           FSPL + explicit P.526-aligned single-edge loss
```

`UMa NLOS + P.526 diffraction` is never calculated as the canonical result. A difference is not labeled “better” or “more accurate” without measurement evidence.

## Controlled and Ankara evidence

The independent reference corpus covers strongly negative `v`, the `-0.78` transition, `v = 0`, moderate and strong positive `v`, asymmetric geometry, 2.6 GHz, 28 GHz, and a 140 GHz research-only mathematical case. Controlled path fixtures cover below-line, roof contact, positive roof, near-Tx, near-Rx, midpoint, wide-roof entry/exit, multiple candidates, and unknown-height behavior through the backend diagnostic tests. The rounded fixture output is preserved in [`concept-4f2-controlled-fixtures.json`](concept-4f2-controlled-fixtures.json).

For the same 100 m flat-ground geometry with a 10 m signed obstruction height at the 45 m edge, the diagnostic gives `v = 8.3715` and `31.30 dB` at 2.6 GHz versus `v = 27.4724` and `41.67 dB` at 28 GHz. The `v` ratio is `sqrt(28 / 2.6) = 3.2817`; this is the expected wavelength scaling, not a claim about measured channel loss.

The canonical Ankara six-cell/432-path audit currently reports:

| Audit item | Count |
| --- | ---: |
| Diagnostic-eligible paths | 29 |
| Ineligible due to unknown height | 403 |
| One known candidate edge | 0 |
| Multiple known candidate edges | 153 |
| Geometric LOS paths | 29 |
| Paths blocked only by unknown-height footprints | 338 |

This means the current Ankara pack has no real known-height blocking link that can produce an available explicit diffraction result in that audited sample. The available paths are clear/no-footprint paths; controlled fixtures are therefore required to demonstrate known-height blocking and dominant-edge behavior. Height evidence remains 0.68% explicit, 3.07% levels-derived, and 96.25% fallback-only.

The full audit counts and representative eligible/unknown obstruction ledgers are preserved in [`concept-4f2-canonical-audit.json`](concept-4f2-canonical-audit.json). Paths with multiple known candidates are reported as audit evidence only; they do not trigger a multi-edge sum.

## Integration boundaries

The Path Profile panel presents the diagnostic reference, availability, selected edge, `v`, loss, diagnostic Rx, canonical UMa Rx, difference, and expandable obstruction ledger. It labels the result “Diagnostic only — not applied to network simulation.” The normal network-planning report does not include these fields.

Concept 4F.2 does not couple diffraction to:

- demand, residential, propagation reach, overlap, normalized scores, Pareto solutions, or recommended azimuths;
- canonical received-signal surfaces;
- canonical received powers used by SINR/RSRP/RSRQ interference;
- Concept 4E outdoor facade-entry power;
- `research_sub_thz` propagation at 140 GHz.

The diagnostic is sparse and on-demand through `/api/path-profile`; no network-wide diffraction precomputation is performed.

## Deferred work and limitations

P.526 section 4.3 double isolated edges and the broader multiple-edge methods are not promoted into production behavior. The current response records `multiple_edge_status: multi-edge deferred` and exposes all single-edge candidates so a later review can compare a sourced multi-edge method without inventing coefficients. Rounded obstacles, roof reflection, multipath, fading, DEM ingestion, indoor diffraction, and empirical rooftop-to-street replacement remain outside this concept.
