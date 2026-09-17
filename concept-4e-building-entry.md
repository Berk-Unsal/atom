# Concept 4E — Building entry and penetration estimation

Concept 4E is a bounded analysis for the question: “What is the estimated
signal immediately inside a representative building facade?” It is available
at 2.6 GHz and 28 GHz. It does not turn the building dataset into an indoor
radio map, a floor/room model, or a whole-building coverage claim. The 140 GHz
`research_sub_thz` profile remains outside this concept.

## Boundary and no-double-counting rule

Concept 4E evaluates a two-stage link:

1. Use the Concept 4D `urban_short_range` UMa outdoor LOS/NLOS median baseline
   from the serving cell to a representative facade point.
2. Subtract one standard O2I external-wall entry term at a receiver placed at
   zero indoor depth immediately inside that facade.

The facade target is not treated as an outdoor wall event. Outdoor-to-outdoor
NLOS already uses the Concept 4D empirical NLOS formula, so Concept 4E does
not add the legacy per-wall loss to that outdoor baseline. The response reports
`outdoor_wall_loss_db: 0` for this reason. The entry term is applied once,
separately, as `low_loss` and `high_loss` scenarios.

There is no interior-room, floor, interior-wall, reflection, fast-fading,
building-height, or whole-building inference. The receiver height is the
configured per-cell receiver height. The result is one deterministic estimate
per selected building, served by the strongest eligible cell under the
low-loss scenario; the response retains both scenario powers.

## Standard-derived loss model

The reference is [3GPP TR 38.901 V19.4.0, §7.4.3.1](https://www.etsi.org/deliver/etsi_tr/138900_138999/138901/19.04.00_60/tr_138901v190400p.pdf),
“O2I building penetration loss.” The standard writes the O2I path loss as:

```text
PL = PL_b + PL_tw + PL_in + X_sigma
```

where `PL_b` is the basic outdoor path loss, `PL_tw` is external-wall loss,
`PL_in` is depth-dependent indoor loss, and `X_sigma` is penetration shadowing.
Concept 4E uses the deterministic median (`X_sigma = 0`) and sets
`d2D-in = 0 m`, so `PL_in = 0 dB`. Its implemented link budget is therefore:

```text
P_outdoor_facade = Concept 4D UMa LOS/NLOS received power
P_low_inside     = P_outdoor_facade - PL_tw_low
P_high_inside    = P_outdoor_facade - PL_tw_high
```

For 28 GHz, the standard material terms are evaluated with `f` in GHz:

```text
L_glass     = 2 + 0.2 f
L_IRRglass = 25.4 + 0.11 f
L_concrete = 5 + 4 f
```

The two reference compositions are:

```text
PL_tw_low  = 5 - 10 log10(0.3 * 10^(-L_glass/10)
                           + 0.7 * 10^(-L_concrete/10))
PL_tw_high = 5 - 10 log10(0.7 * 10^(-L_IRRglass/10)
                           + 0.3 * 10^(-L_concrete/10))
```

At 28 GHz these evaluate to `17.8287874527 dB` and `35.0290195972 dB`.
At 2.6 GHz the implementation uses the standard’s UMa/UMi single-frequency
backward-compatibility value from Table 7.4.3-3: `PL_tw = 20 dB` and
`PL_in = 0.5 * d2D-in`. Because Concept 4E fixes indoor depth at zero, its
low/high API scenarios are equal at 2.6 GHz (`20 dB` each). The standard’s
reference sigmas are exposed as metadata, but no random draw is sampled.

The standard’s material composition is a simulation parameter dependent on
metal-coated glass, regional market, and deployment scenario. A.T.O.M. does
not invent that mapping from a generic OSM building type. Known tags are
returned as optional evidence only; they never select one profile
automatically. If material evidence is absent or not defensibly mapped, both
profiles remain in the response and `selected_entry_profile` is `unknown`.

## Geometry and deterministic selection

The backend evaluates one HTTP request containing the selected cell RF profiles
and the building filter. It then:

- sorts cells and footprints by stable ID;
- selects footprints inside the effective per-cell radius union, unless an
  explicit `building_ids` filter is supplied;
- obtains a representative interior point from the polygon centroid when it
  is inside, then a vertex average, then a deterministic 15×15 interior grid;
- finds the first true outside-to-inside crossing from the cell to that point;
- rejects invalid polygons, tangent-only contacts, boundary-only points, and
  unclassifiable outdoor paths;
- classifies blockers before the target facade as outdoor LOS/NLOS and excludes
  the target building from the blocker test;
- evaluates the Concept 4D outdoor baseline and applies the two entry losses.

The response identifies the point sources and includes the facade coordinate,
outdoor LOS state, outdoor received power, both entry losses, both just-inside
powers, serviceability flags, material evidence, and limitations for each
building. The `-100 dBm` building-service threshold and each cell’s receiver
sensitivity are reported separately; they are not interchangeable.

Geometry regression fixtures cover rectangular, concave, multipart/decomposed,
centroid-outside, invalid, and tangent cases. GeoJSON holes are not inferred
as interior rooms: the existing runtime footprint representation uses outer
rings, and Concept 4E makes no claim beyond the selected representative
facade point.

## API

`POST /api/building-entry-analysis` accepts the network-shaped RF defaults and
one to six selected cells. The request is batched; it does not issue one HTTP
request per building.

```json
{
  "towers": [
    {
      "id": "cell-28-a",
      "tower_lon": 32.8541,
      "tower_lat": 39.9208,
      "azimuth": 45,
      "rf_profile": {
        "schema_version": 1,
        "network_tech": "5g",
        "propagation_model": "urban_short_range",
        "frequency_ghz": 28,
        "band": "n257",
        "bandwidth_mhz": 100,
        "channel_id": "NR-634666",
        "duplex_mode": "tdd",
        "tx_power_dbm": 30,
        "antenna_gain_dbi": 17,
        "system_loss_db": 2,
        "radius_m": 400,
        "beam_width": 120,
        "antenna_height_m": 25,
        "receiver_height_m": 1.5,
        "receiver_sensitivity_dbm": -115
      }
    }
  ],
  "rays": 72,
  "radius_m": 400,
  "frequency_ghz": 28,
  "tx_power_dbm": 30,
  "beam_width": 120,
  "calibration_offset_db": 0,
  "residential_only": false,
  "building_ids": []
}
```

The endpoint returns `model`, `applicability`, `summary`, per-building
`results`, per-cell summaries, effective profiles, `rf_contract`, and
`diagnostics`. `diagnostics.http_requests_required` is `1`; the frontend
stores the response under an RF-derived source key containing effective cell
profiles, coordinates, azimuths, dataset revision, and filters.

Concept 4E results are invalidated when frequency, power, beam, antenna/RF
profile, azimuth, selected cells, tower inventory, or dataset revision
changes. Optimization priorities alone do not invalidate them because they do
not change the RF payload. A successful azimuth/network optimization does
invalidate the prior entry result because it changes effective RF state.
The analysis is diagnostic/reporting output only; it is not an optimizer
objective, constraint, score term, or candidate-site coupling.

## Data audit

The active Ankara Open Planning Dataset is version `2026.07`. Its manifest
contains 451 towers and 161,626 building GeoJSON features; the runtime index
contains 161,784 outer-ring footprints after multipart decomposition. Dataset
validation reported zero invalid, repaired, or dropped building geometries.

The material audit scans `building:material`, `facade:material`, `material`,
and `roof:material`. The canonical Ankara pack contains no usable material
metadata in those fields, so Concept 4E reports 0 known and 100% unknown for
that pack. Building type and residential/demand attributes remain useful for
filtering and weighting, but they do not become material composition.

## Canonical six-cell Ankara audit

The gated regression fixture uses the existing six-cell 28 GHz Ankara network
scenario, with deterministic repeated execution and the active dataset. The
following values are from the measured run on 17 September 2026. The analyzed
building domain is `summary.relevant_buildings`, which includes all selected
relevant footprints. `summary.relevant_residential_buildings` is a subset used
for residential reporting; it is not the denominator for the all-building
service rows. A service numerator includes only buildings with an applicable,
valid facade estimate that meets the relevant threshold; unsupported buildings
remain in the denominator but cannot enter the numerator.

| Metric | Result |
|---|---:|
| Analyzed buildings (all relevant footprints) | 1,488 |
| Residential buildings (subset) | 899 |
| Valid facade estimates | 675 / 1,488 |
| Outdoor service — all buildings | 675 / 1,488 |
| Low-loss entry — all buildings | 675 / 1,488 |
| High-loss entry — all buildings | 253 / 1,488 |
| Low-loss served demand weight | 2,175.000 |
| High-loss served demand weight | 440.000 |
| Material-known / material-unknown | 0 / 1,488 |
| Unsupported/no eligible serving cell | 813 |
| Invalid geometry | 0 |
| Candidate cell-link evaluations | 698 |
| Analysis runtime (observed) | 34.8 ms |
| HTTP requests required | 1 |

### Unsupported reason breakdown

The unsupported count is derived from the implementation applicability status,
not from a free-text interpretation. The canonical breakdown is:

| Applicability reason | Count | Share of unsupported | Representative building |
|---|---:|---:|---|
| `no_eligible_serving_cell` | 813 | 100.00% | `feature-104140` |

There were no `invalid_geometry` records in this run. The dominant status is an
intentional aggregate result for buildings where no selected cell produced a
valid eligible facade baseline under the configured radius/beam contract; it is
not evidence that invalid geometry or a propagation-model fallback was hidden.

Representative ledger rows from the same run:

| Case | Building | Serving cell | Outdoor facade Rx | Low-loss Rx | High-loss Rx |
|---|---|---|---:|---:|---:|
| Strong facade signal | `feature-7237` | `LTE-35104` | -33.620 dBm | -51.448 dBm | -68.649 dBm |
| Near threshold | `feature-9613` | `LTE-313110` | -79.950 dBm | -97.778 dBm | -114.979 dBm |
| Low-loss pass / high-loss fail | `feature-101294` | `LTE-35877` | -87.441 dBm | -105.269 dBm | -122.470 dBm |

No known-material row or both-scenarios-fail row occurred among the selected
canonical targets; those are intentionally reported as absent rather than
fabricated examples. Repeating the fixture produced identical summaries,
results, and cell summaries.

The complete low-loss-pass/high-loss-fail ledger for `feature-101294` is:

| Field | Value |
|---|---|
| Serving cell | `LTE-35877` |
| Representative facade point | lon `32.852901154309`, lat `39.924769672379` |
| Outdoor facade Rx | `-87.441 dBm` |
| Low-loss entry | `17.829 dB` → `-105.269 dBm`, serviceable |
| High-loss entry | `35.029 dB` → `-122.470 dBm`, not serviceable |
| Receiver threshold | `-115.000 dBm` |
| Material evidence | unavailable; normalized material `unknown`; not used to select a profile |
| Model / applicability | `urban_short_range`; `applicable` — representative facade entry estimate at zero indoor depth |
| Geometry metadata | indoor depth `0.0 m`; outdoor wall loss `0.0 dB`; outdoor LOS state `nlos` |

## Scope of future refinement

The current contract intentionally stops at a representative facade entry
estimate. A later concept could add explicit floor/room geometry, material
survey evidence, interior depth distributions, or calibrated regional
composition parameters. Those additions would require a new model contract;
they must not be inferred by silently extending Concept 4E.
