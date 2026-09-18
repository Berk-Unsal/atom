# Concept 4G.2: Receiver Noise, Sensitivity, and Link Quality

Status: implemented as a deterministic planning foundation. This note defines
the receiver contract added after [Concept 4G.1 antenna and link budget](concept-4g1-antenna-link-budget.md).
The implementation preserves the legacy manual threshold by default and adds
an opt-in noise-derived threshold. It does not turn A.T.O.M into a UE/PHY
simulator or a conformance implementation.

The implementation audit is recorded in
[`concept-4g2-receiver-noise-audit.md`](concept-4g2-receiver-noise-audit.md).
The generated comparison artifacts are
[`concept-4g2-pre-change-baseline.json`](concept-4g2-pre-change-baseline.json),
[`concept-4g2-receiver-comparison.json`](concept-4g2-receiver-comparison.json),
and [`concept-4g2-canonical-receiver-comparison.json`](concept-4g2-canonical-receiver-comparison.json).

## Contract summary

Receiver sensitivity is resolved once for each effective cell profile and is
returned as `receiver_threshold`. The normalized profile retains the legacy
`receiver_sensitivity_dbm` field, but the selected mode determines which value
is used:

| Mode | Effective threshold | Required inputs | Default |
|---|---|---|---|
| `manual` | The configured `receiver_sensitivity_dbm` | `receiver_sensitivity_dbm` | `-115 dBm` |
| `derived` | Thermal noise floor plus required SNR and receiver margin | `receiver_noise_bandwidth_hz`, `receiver_noise_figure_db`, `receiver_required_snr_db`, `receiver_margin_db` | Opt-in; profile defaults are 100 MHz, 7 dB, 3 dB, and 0 dB |

The threshold is per cell, not a single request-wide number. Network,
interference, recommendation, measurement, surface, building-entry, path
profile, and report responses carry either the effective-cell threshold or the
selected threshold plus its provenance. The manual mode is the compatibility
default for existing requests.

## Derived receiver equation

The derived mode uses a rounded engineering reference of `-174 dBm/Hz` at
`290 K`. For a receiver noise-equivalent bandwidth `B_noise` in hertz:

```text
N0(T)       = -174 + 10 log10(T / 290)                         dBm/Hz
Nthermal    = N0(T) + 10 log10(B_noise)                       dBm
Nfloor      = Nthermal + NF                                   dBm
Sensitivity = Nfloor + RequiredSNR + ReceiverMargin           dBm
RxMargin    = ReceivedPower - Sensitivity                      dB
```

The current evaluator uses `T = 290 K`, so the normal derived expression is:

```text
Sensitivity = -174 + 10 log10(B_noise_Hz) + NF_dB
              + RequiredSNR_dB + ReceiverMargin_dB
```

All terms after the logarithm are dB quantities. A higher noise bandwidth,
noise figure, required SNR, or receiver margin raises the threshold and makes
the receiver requirement stricter. A carrier or ray is usable only when:

```text
received_power_dbm > effective_receiver_sensitivity_dbm
```

Equality is not usable. `receiver_link_margin_db` is the signed difference
between raw received power and the effective threshold. It is a receiver
decision margin, not a statistical fading margin, penetration allowance, or
calibration correction.

The first-principles basis is the SI Boltzmann constant and thermal-noise
relation `kTB`; the implementation deliberately uses the rounded `-174 dBm/Hz`
convention for deterministic compatibility. See [NIST's kelvin and Boltzmann
constant reference](https://www.nist.gov/si-redefinition/kelvin/kelvin-boltzmann-constant),
[NIST SP 330 section 2](https://www.nist.gov/pml/special-publication-330/sp-330-section-2),
and the receiver-noise discussion in [ETSI TR 103 688 Annex E](https://www.etsi.org/deliver/etsi_tr/103600_103699/103688/01.01.01_60/tr_103688v010101p.pdf).
Those references support the physical basis; A.T.O.M's selected default SNR,
margin, and bounds are project planning inputs, not a 3GPP UE sensitivity
claim.

## Bandwidth and noise semantics

`receiver_noise_bandwidth_hz` is an independent noise-equivalent bandwidth.
It is not automatically replaced with occupied bandwidth, resource-block
bandwidth, SCS, load, or co-channel interference power.

The response reports `receiver_noise_bandwidth_source` as either:

- `explicit_receiver_noise_bandwidth_hz` when the cell profile supplies an
  explicit bandwidth; or
- `channel_bandwidth_approximation` when the profile derives the noise
  bandwidth from its channel bandwidth.

The approximation is visible and deterministic. In `manual` mode, the
receiver noise inputs remain profile metadata for future/explicit selection,
but no thermal-noise, noise-figure, SNR, or margin term is evaluated and the
threshold response reports `noise_bandwidth_source: not_applicable`.

Interference has a different bandwidth meaning. LTE/NR SCS and resource-element
presets still determine the per-RE thermal noise used by the RSRP/SINR/RSRQ
engine. The shared thermal-noise arithmetic now serves both calculations, but
the sensitivity evaluator uses the receiver bandwidth while interference uses
the selected SCS/resource-element bandwidth. Receiver sensitivity is not added
as a second SINR noise term.

The supported policy bounds are intentionally explicit: manual sensitivity is
`-180` to `-20 dBm`; derived noise bandwidth is `1` Hz to `2 GHz`; noise
figure is `0` to `20 dB`; required SNR and receiver margin are each bounded to
`-100` to `100 dB`. Inputs are finite and validated before RF execution.

## Integration semantics

The same resolved threshold object is reused by all relevant evaluators:

1. Static rays test the threshold at ray start, wall events, and segment-end
   crossings. Usable reach, terminal metadata, demand coverage, and
   optimization use the strict comparison.
2. Building entry compares the low-loss and high-loss indoor endpoint powers
   with the effective receiver threshold. Outdoor building service remains a
   separate strict `raw P_rx > -100 dBm` rule. Geometry can continue to be
   accounted for after receiver termination so this independent building
   service rule is not accidentally hidden by a stricter receiver threshold.
3. Coverage surfaces retain raw received-power values, including values below
   sensitivity. Sensitivity changes only the threshold metadata and the
   `below_sensitivity` statistic; NoData still means radius or beam geometry
   exclusion.
4. Interference admits a carrier only when its raw carrier power is strictly
   above that cell's receiver threshold. It then computes RSRP, SINR, and RSRQ
   with the existing per-RE noise and co-channel power equations. Its
   serviceability thresholds remain `RSRP >= -110 dBm`, `SINR >= 0 dB`, and
   `RSRQ >= -20 dB`.
5. Link-budget and path-profile diagnostics expose the mode, effective
   threshold, and signed receiver link margin alongside the existing RF ledger.

The threshold is resolved outside hot segment loops and is serialized with
assumptions and applicability text. No per-ray logging or stochastic behavior
was added. Receiver sensitivity does not include fast fading, shadow-fading
draws, penetration, clutter, rain, atmospheric loss, system loss,
calibration, or network interference; those remain separate model terms.

## API and UI contract

Request profiles accept these fields in snake case, with per-cell overrides
where the endpoint supports `towers[]`:

```json
{
  "receiver_sensitivity_mode": "derived",
  "receiver_noise_bandwidth_hz": 100000000,
  "receiver_noise_figure_db": 7,
  "receiver_required_snr_db": 3,
  "receiver_margin_db": 0
}
```

`receiver_noise_bandwidth_source` is response provenance and is read-only in
the OpenAPI contract. A derived response includes the noise density, thermal
noise, noise figure, noise floor, required SNR, margin, bandwidth source,
assumptions, and applicability. A manual response includes the direct
threshold and manual assumptions, without presenting unused derived numbers
as if they were evaluated.

The Inventory panel exposes mode and the corresponding fields. Propagation,
surface, building-entry, interference, and path-profile inspectors show the
effective threshold and link margin where relevant. Reports show detailed
noise inputs only when the first effective cell is in derived mode and include
the RF contract's receiver scope, equation, and noise semantics.

## Canonical evidence

The controlled matrix covers 4G at 2.6 GHz and 5G at 28 GHz with 5, 20, and
100 MHz receiver bandwidths, multiple noise figures, required SNR values, and
receiver margins. It records 18 derived cases against a manual `-115 dBm`
baseline. Independent fixtures cover 1 Hz, 1 MHz, 20 MHz, and 100 MHz noise
arithmetic, temperature scaling, strict threshold boundaries, heterogeneous
per-cell profiles, propagation margins, raw surfaces, building entry, and
interference noise separation.

The real Ankara six-cell comparison uses the existing compatibility scenario:

| Result | Manual compatibility | Derived (`100 MHz`, `NF=7 dB`, `SNR=3 dB`, `margin=0 dB`) |
|---|---:|---:|
| Effective threshold | `-115 dBm` | `-84 dBm` |
| Baseline demand / residential | `185 / 28` | `185 / 28` |
| Optimized demand / residential | `555 / 43` | `555 / 48` |
| Optimized reach | `19,548.6910 m` | `15,465.0539 m` |
| Optimized score | `41.1715` | `38.9407` |
| Pareto frontier | `6` | `5` |
| Recommended azimuths | `[70, 20, 130, 160, 290, 110]` | `[70, 20, 140, 280, 290, 110]` |

The threshold rises by `31 dB`; optimized demand is unchanged, optimized
residential coverage increases by five units in this deterministic scenario,
reach decreases by `4,083.6371 m`, the score decreases by `2.2308`, and the
frontier loses one solution. These are scenario evidence, not universal
performance predictions.

The building-entry comparison has 1,488 relevant buildings and 698 candidate
cell-link evaluations. Outdoor building service stays at 521 for both modes
because it uses the independent `-100 dBm` rule. Low/high entry serviceability
changes from `521/194` in manual mode to `48/16` in derived mode because those
indoor endpoint powers are tested against the effective receiver threshold.

The raw surface grid is invariant: 107 valid cells, minimum `-447.9 dBm`,
maximum/center `-33.8 dBm`. Only the below-sensitivity count changes, from 13
to 44. The canonical interference run keeps 264 serviceable samples (17%) in
both modes, but carrier admission changes the aggregate signal sample and
distribution. This is expected and is not evidence that sensitivity is an
extra SINR noise term. A focused regression test separately confirms that
close-in RSRP/SINR/RSRQ values remain unchanged when only the receiver
threshold mode changes.

The pre-change artifact also records the accepted real-backend Playwright
baseline (`36` tests: `27` passed and `9` skipped), canonical optimization,
building-entry, height-audit, surface, and interference evidence. The
canonical comparison test is gated by `ATOM_DATASET_DIR` and writes its JSON
artifact only when explicitly requested.

## Boundaries

This concept supplies a transparent noise-floor and receiver-usability
foundation. It does not select MCS, derive throughput, model coding gain,
implement UE measurement behavior, perform link adaptation, simulate dynamic
scheduling, or validate an operator hardware sensitivity specification. It
does not make the existing 140 GHz `research_sub_thz` profile a validated
6G receiver model. Fading, blockage statistics, indoor depth, propagation
calibration, and full PHY quality remain future or externally validated work.

See [modeling limits](modeling-limits.md), [API reference](api.md), and the
[OpenAPI contract](openapi.yaml) for the current runtime boundary.
