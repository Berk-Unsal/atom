# Concept 4H.1: Interference and Radio-Quality Contract

Concept 4H.1 makes the existing interference calculation auditable. It adds a
power ledger, explicit serving-cell and co-channel rules, radio-quality
semantics, deterministic scenario fingerprints, and failure diagnostics. The
canonical propagation surface and azimuth optimizer remain unchanged.

## Scope and non-claims

The endpoint supports deterministic 4G and 5G planning estimates. It is not a
UE measurement implementation, a scheduler, a conformance test, or a field
calibration result. LTE and NR measurement specifications define reference
signal/resource and time-window details that are not represented by the
planner. The API therefore names the modeled quantities and exposes the
approximations instead of presenting them as protocol measurements.

The current 140 GHz research profile remains outside this contract. It does
not receive validated LTE/NR RSRP, RSRQ, or SINR semantics.

## Power and resource basis

Propagation produces the final received carrier power:

```text
received_carrier_power_dbm = P_rx from the shared link evaluator
```

This is integrated over the configured carrier and is not called RSRP. For the
current LTE and NR planning presets, the deterministic reference-resource
conversion is:

```text
occupied_subcarriers = 12 * N_RB
reference_power_dbm = received_carrier_power_dbm
                      - 10 log10(occupied_subcarriers)
```

The implementation calls this a uniform full-carrier PSD/reference-resource
approximation. It does not model CRS/SSB symbol density, PBCH/CSI scaling,
DM-RS overhead, time averaging, scheduler allocation, or MIMO layers. Desired,
interference, and thermal-noise powers are converted to mW before summation.

The same reference-resource basis is used for serving power, loaded
co-channel power, and thermal noise. This avoids adding total-carrier power to
per-resource noise. RSSI is reconstructed over `12 * N_RB` occupied
subcarriers, and RSRQ uses the same planning basis:

```text
SINR = desired_reference_mW / (interference_reference_mW + noise_reference_mW)
RSSI_mW = 12 * N_RB * (desired + interference + noise)
RSRQ = N_RB * desired_reference_mW / RSSI_mW
```

The thermal-noise term is `kTB` at the serving preset's subcarrier spacing,
with the request noise figure. It is independent of receiver sensitivity.
Receiver sensitivity is the strict serving-cell admission gate:
`received_carrier_power_dbm > effective_receiver_sensitivity_dbm`. A finite
non-serving signal is still retained for co-channel interference summation
when its reference-resource power is above the numerical floor. Manual and
derived sensitivity modes, their bandwidth provenance, and their link margins
remain separate from SINR noise.

## Serving cell and interference eligibility

The default serving selection is the strongest eligible cell by modeled RSRP.
An optional `serving_cell_id` selects a specific eligible cell, even when it is
weaker than another eligible cell. This is intended for controlled what-if
diagnostics and is returned as `serving_selection_mode` and
`serving_selection_metric`.

An interferer must match the serving cell's technology, exact configured
`channel_id`, frequency, and bandwidth. A different channel is excluded; so
are different frequencies, different bandwidths, and unsupported combinations.
Adjacent-channel leakage, ACLR/ACS/ACIR, partial overlap, and selectivity are
not silently estimated. Each candidate records an exclusion reason such as
`outside_radius`, `antenna_ineligible`, `below_receiver_sensitivity`,
`below_numeric_floor`, `different_technology`, `different_channel`, `different_frequency`,
`different_bandwidth`, or `unsupported_configuration`. The ledger separates
`eligible` (finite, usable in-horizon propagation power for interference
evaluation) from `serving_eligible` (the strict receiver-sensitivity admission
test). Therefore `below_receiver_sensitivity` can coexist with a positive
`loaded_power_mw` for a non-serving co-channel interferer.

### Interference horizon

`outside_radius` means the sample is beyond that cell's effective
`rf_profile.radius_m`. This is the existing per-cell configured radius reused
as a finite interference-analysis horizon for compatibility. It bounds the
point admission and demand candidate search; the sample-grid envelope uses the
maximum effective cell radius. It is not a claim that physical RF power
becomes zero immediately beyond the radius, and it is unrelated to receiver
sensitivity. The response exposes the aligned
`interference_horizon_meters`, `interference_horizon_source`, and
`interference_horizon_semantics` fields. A dedicated larger propagation or
interference horizon is not introduced by Concept 4H.1.

The configured deterministic `load_factor` scales eligible interferer power in
the linear domain. The current API default remains `0.7` for compatibility;
there is no per-sample scheduler or dynamic load model. The serving signal is
the full modeled reference-resource power, consistent with the existing
calculation.

## API diagnostics

Each interference feature can expose:

- `serving_received_carrier_power_dbm`: raw propagation result before the
  reference-resource conversion;
- `desired_signal_power_mw`, `interference_power_mw`, and
  `thermal_noise_power_mw`: the linear-domain SINR ledger;
- `thermal_noise_dbm`, `interference_noise_bandwidth_hz`, and
  `noise_bandwidth_source`;
- `rsrp_kind`, `rsrp_conversion_id`, and the conversion description;
- serving-selection mode, interferer count, serviceability status, and failed
  threshold names;
- `power_ledger`: one entry per selected cell, including eligibility, raw and
  normalized power, load-scaled power, channel match, receiver threshold,
  separate serving eligibility, and exclusion reason.

Aggregate stats add the median SINR, serviceable fraction among signal samples,
and `outage_by_reason`. These are diagnostic/reporting outputs only. They do
not enter network objective scores, Pareto ranking, azimuth search, or
coverage reach.

## Serviceability policy

The current planning policy is explicit and inclusive at the boundary:

```text
serviceable = RSRP >= -110 dBm
           AND SINR >= 0 dB
           AND RSRQ >= -20 dB
```

These are A.T.O.M planning defaults, not operator acceptance criteria and not
receiver sensitivity. A sample returns individual failure reasons and a
combined status. A sample without an eligible carrier is `unavailable`; this
is distinct from a valid signal sample that fails one or more radio-quality
thresholds.

## References and applicability

The implementation metadata records the exact references inspected for the
planning labels:

- [3GPP TS 36.214 V18.1.0, Release 18](https://www.etsi.org/deliver/etsi_ts/136200_136299/136214/18.01.00_60/ts_136214v180100p.pdf), §§5.1.1, 5.1.3, 5.1.23, 5.1.24, and 5.2.2–5.2.3 for LTE RSRP/RSRQ/RS-SINR/RSSI and received-interference/noise definitions;
- [3GPP TS 38.215 V19.1.0, Release 19](https://www.etsi.org/deliver/etsi_ts/138200_138299/138215/19.01.00_60/ts_138215v190100p.pdf), §§5.1.1, 5.1.3, 5.1.5, and 5.1.21 for NR SS-RSRP/SS-RSRQ/SS-SINR/RSSI;
- [3GPP TS 36.211 V12.5.0](https://www.etsi.org/deliver/etsi_ts/136200_136299/136211/12.05.00_60/ts_136211v120500p.pdf), §6.2.3 for the LTE PRB's 12-subcarrier, 15 kHz resource basis;
- [3GPP TS 38.104 V18.10.0](https://www.etsi.org/deliver/etsi_ts/138100_138199/138104/18.10.00_60/ts_138104v181000p.pdf), §5.3.2 for the NR transmission-bandwidth/RB mappings used by the supported presets.

The references constrain vocabulary and resource relationships. They do not
turn this deterministic approximation into a standards-conforming measurement
engine.

## Determinism and compatibility

Every interference response carries `scenario_fingerprint` and
`scenario_schema_version`. The fingerprint canonically serializes RF inputs,
resolved per-cell profiles, selection policy, thresholds, channel rules, and
load/noise settings. It excludes timestamps, file paths, worker counts, and UI
state. Network optimization responses carry a related fingerprint that also
includes objective priorities and hard constraints.

The fingerprint and diagnostics are metadata additions. The propagation
evaluator, raw/building-entry surfaces, receiver-sensitivity separation, and
optimizer remain on their existing paths. Controlled tests cover no
interference, equal-power, weaker/stronger interferers, noise-dominated and
interference-dominated cases, channel exclusion, explicit weaker serving,
threshold boundaries, failure reasons, manual/derived sensitivity separation,
and fingerprint stability.

The pre-change audit is retained in
[`concept-4h1-pre-change-baseline.json`](concept-4h1-pre-change-baseline.json).
The post-change canonical record is retained in
[`concept-4h1-post-change-comparison.json`](concept-4h1-post-change-comparison.json).
