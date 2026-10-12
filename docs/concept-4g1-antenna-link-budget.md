# Concept 4G.1 — Antenna and Link-Budget Realism Foundation

Concept 4G.1 makes A.T.O.M's antenna and link-budget semantics explicit while
preserving the existing compatibility profiles by default. It is a contract
foundation, not a full beamforming, receiver, or channel-model implementation.

## Audit conclusion

The pre-change audit is preserved in
[`concept-4g1-antenna-audit.md`](concept-4g1-antenna-audit.md), with machine-
readable compatibility evidence in
[`concept-4g1-pre-change-baseline.json`](concept-4g1-pre-change-baseline.json).
The existing implementation treated `tx_power_dbm` as conducted power and
`antenna_gain_dbi` as absolute TX gain, then applied relative pattern loss,
system loss, calibration, and propagation loss. Its `eirp_dbm`-named value was
actually an effective transmit term that already included system loss and
calibration. Receiver gain and polarization mismatch were not represented and
therefore were implicitly `0 dBi` and `0 dB`.

The compatibility sector presets use one hard beam for both ray emission and
eligibility. `ideal-sector` and `omni` have zero relative attenuation;
`cosine-sector` uses the existing capped quadratic attenuation. The panel
vertical presets use the same capped quadratic form around the geometric
depression angle. Mechanical and electrical tilt were already summed by the
analytic path, but their coordinate/sign convention was not part of the API
contract.

## Canonical link budget

The authoritative signed ledger is:

```text
P_rx = P_tx_conducted
     + G_tx_boresight
     - A_tx_pattern
     + G_rx
     - L_system
     - L_polarization
     + calibration
     - L_propagation
     - L_building
```

The building term is zero when the selected outdoor path crosses no footprint
wall events; the legacy wall-event, building-entry, or diagnostic calculation
may populate it. Propagation loss is produced by the selected propagation
model; antenna code does not contain UMa or FSPL equations. The implementation
exposes the intermediate EIRP values:

```text
EIRP_boresight   = P_tx_conducted + G_tx_boresight
EIRP_directional = EIRP_boresight - A_tx_pattern
```

System loss, polarization loss, and calibration remain separate signed ledger
terms. The historical `eirp_dbm`/`EIRPDBm` field remains available as an
effective-transmit compatibility alias (`EIRP_boresight - L_system +
calibration`); it is not conducted power and is not the new boresight EIRP.

## Field contract

| Field | Contract |
|---|---|
| `tx_power_dbm` | Conducted transmitter output before antenna gain; default compatibility value is 30 dBm. |
| `tx_antenna_gain_dbi` | Preferred absolute TX boresight gain. |
| `antenna_gain_dbi` | Stable legacy alias for the absolute TX boresight gain; both names are normalized on responses. |
| `tx_pattern_attenuation_db` | Non-negative relative attenuation from boresight, never another gain. |
| `rx_antenna_gain_dbi` | Scalar receiver gain, added exactly once; default is 0 dBi. No receiver orientation or receiver pattern is inferred. |
| `system_loss_db` | Aggregate non-propagation implementation loss such as feeder, connector, or implementation margin. It does not include pattern, propagation, building, or polarization loss. |
| `polarization_loss_db` | Explicit deterministic mismatch loss, subtracted exactly once; default is 0 dB. It is not inferred from antenna names or randomized. |
| `calibration_offset_db` | Global deterministic prediction correction; positive values raise predicted received power. It is not antenna gain or measured EIRP. |
| `propagation_loss_db` | Loss returned by the selected propagation model. |
| `building_loss_db` | Explicit legacy wall-event, building-entry, or diagnostic loss when applicable; otherwise zero. |

The API accepts both TX gain field names for migration safety. The frontend
uses the preferred name when available and emits both aliases for compatibility.
The new receiver and polarization fields are optional and default to zero, so
an old profile reproduces its previous numerical interpretation without a
silent receiver gain or polarization penalty.

## Existing analytic pattern contracts

All pattern evaluation goes through `EvaluateAntennaLink` and
`EvaluateAntennaPattern` in `backend-go/raytracer/antenna_evaluator.go`.
Absolute gain is supplied by the profile; the evaluator returns relative
attenuation and eligibility only.

| Pattern | Relative attenuation | Eligibility and limitations |
|---|---|---|
| `ideal-sector` | 0 dB | Hard eligible inside the configured horizontal beam; no sidelobe or backlobe. |
| `cosine-sector` | `min(30, 12 * (abs(offset)/(beam_width/2))²)` dB | Same hard beam eligibility; the formula is an analytic planning preset. |
| `omni` | 0 dB | Full-azimuth eligibility; no elevation-dependent receiver or hardware pattern. |
| `flat` | 0 dB vertical attenuation | Horizontal behavior comes from the selected horizontal preset. |
| `panel-10deg` | `min(30, 12 * (vertical_offset/10)²)` dB | Analytic vertical cut; no array factor. |
| `panel-20deg` | `min(30, 12 * (vertical_offset/20)²)` dB | Analytic vertical cut; no array factor. |

For analytic patterns, horizontal and vertical attenuation are added as
relative terms and capped by their existing per-cut limit. The compatibility
hard beam remains a geometric eligibility gate; an outside-sector ray is not
converted into a finite sidelobe contribution.

## Reference single-element pattern

`3gpp-single-element` is an optional, non-default reference pattern based on
[3GPP TR 38.901 V19.4.0](https://www.etsi.org/deliver/etsi_tr/138900_138999/138901/19.04.00_60/tr_138901v190400p.pdf), §7.3, Table 7.3-1. The reference uses the documented
65° `phi_3dB`/`theta_3dB` cut parameters and a 30 dB maximum attenuation cap;
with the table's quadratic `12 * (offset/parameter)²` form, the 3 dB point is
at a 32.5° offset. Horizontal and vertical relative losses are combined with
`min(30 dB, A_horizontal + A_vertical)`. It evaluates finite attenuation over
the full azimuth, including rear directions, and therefore does not use the
compatibility hard-sector gate.

This is deliberately a bounded single-element shape. It is not a 3GPP array
model, beamforming/codebook model, MIMO model, measured/vendor diagram,
sidelobe database, frequency-interpolated hardware pattern, or validated
140 GHz antenna model. The configured absolute TX gain remains the user's
antenna assumption and is not derived from the reference cut.

No tabulated-pattern upload or interpolation contract is exposed in 4G.1. A
future tabulated foundation must define bounded numeric samples, boresight
normalization, sign/range validation, periodic azimuth handling, linear
interpolation, duplicate rejection, and explicit horizontal/vertical
combination before it becomes a user-facing option.

## Coordinate and tilt conventions

- Azimuth is degrees clockwise from north, normalized to `[0, 360)`.
- `orientation_deg` is added to the request/tower base azimuth.
- A link's horizontal offset is the signed shortest difference between its
  bearing and the effective antenna azimuth.
- Ground distance is the horizontal transmitter-to-receiver distance used by
  the existing analytic vertical calculation.
- The receiver depression angle is
  `atan2(antenna_height - receiver_height, ground_distance)`.
- Vertical offset is `depression_angle - (mechanical_downtilt +
  electrical_downtilt)`.
- Positive mechanical downtilt points the boresight downward toward the
  receiver plane. Mechanical and electrical tilt remain separate fields even
  though current deterministic patterns use their sum; no electrical-array
  beam steering is implied.

## Shared integration and diagnostics

The shared evaluator is used by direct propagation, segmented rays, coverage
surfaces, network/optimization scoring, interference carrier formation,
building-entry outdoor facade links, and the isolated path-profile and
diffraction diagnostics. Propagation receives the evaluated directional TX and
receiver terms, then returns model-specific path loss. This prevents each
consumer from implementing a different gain, tilt, or beam rule.

Inspectable response ledgers use `RFLinkBudgetTerms` and include:

```text
tx_power_dbm
tx_antenna_gain_dbi / antenna_gain_dbi
boresight_eirp_dbm
tx_pattern_attenuation_db
directional_eirp_dbm
rx_antenna_gain_dbi
system_loss_db
polarization_loss_db
calibration_offset_db
propagation_loss_db
building_loss_db
received_power_dbm
```

The Path Profile panel shows the signed ledger without dumping pattern tables.
Ray, interference, building-entry, and diffraction responses expose the ledger
where the corresponding result has a link-level diagnostic. Diffraction stays
diagnostic-only under the Concept 4F.2 boundary and never feeds canonical
network RF, surfaces, interference, optimization, or building-entry service
classification.

## Independent fixtures and compatibility evidence

`antenna_evaluator_test.go` uses expected values calculated in the tests rather
than calling the production evaluator to generate fixtures. It covers:

- conducted power plus absolute gain and the separate boresight/directional
  EIRP ledger;
- system-loss, calibration, receiver-gain, and polarization-loss signs;
- preferred/legacy TX gain aliases and normalized wire output;
- analytic cosine, ideal-sector, omni, hard-edge, and cap behavior;
- positive mechanical downtilt and vertical panel alignment;
- 3GPP reference boresight, horizontal 3-dB point, rear direction, combined
  attenuation/cap, and full-azimuth behavior;
- propagation carrying the same signed antenna ledger.

The pre-change canonical compatibility artifact records the six-cell Ankara
28 GHz run, representative 2.6/28 GHz links, surface/interference/building
entry counts, height audit, optimization scores, recommended azimuth tuple,
Pareto size, and runtime. The gated post-change canonical compatibility run
reproduces the same legacy-profile values: baseline score 33.7894, optimized
score 41.1715, optimized azimuths `[70, 20, 130, 160, 290, 110]`, and Pareto
frontier size 6. The new reference pattern is opt-in and is compared separately
in the [pattern comparison artifact](concept-4g1-antenna-pattern-comparison.json);
it is not tuned or made the silent default.

## Scope and deferred work

4G.1 does not add receiver thermal-noise-derived sensitivity, modulation/coding,
CQI/MCS, throughput, arrays, massive MIMO, beamforming codebooks, dynamic beam
selection, UE orientation, stochastic polarization, fast fading, Doppler,
scheduling, adjacent-channel effects, or optimizer objectives for antenna
choice. The existing 140 GHz profile remains research-only and may use the
compatibility analytic presets; this reference cut does not validate sub-THz
hardware.

Concept 4G.2 can build on this contract for more realistic beam/array and
receiver/channel behavior. It must retain the explicit term ledger and avoid
reinterpreting conducted power, absolute gain, or calibration as one another.
