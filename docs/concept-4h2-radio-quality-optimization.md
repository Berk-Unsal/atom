# Concept 4H.2: Interference-Aware Optimization

Concept 4H.2 makes the Concept 4H.1 radio-quality contract an optional soft
objective for network azimuth optimization. The purpose is to distinguish a
configuration with strong propagation reach but poor co-channel serviceability
from one with comparable reach and better radio quality. The objective is
planning evidence, not UE or standards-conformance testing.

## Why interference enters optimization

The existing propagation objectives measure served demand, residential
building reach, usable propagation reach, and overlap. Those quantities do not
fully describe a multi-cell network: several cells can deliver a carrier at a
point while their co-channel reference-resource powers reduce SINR and RSRQ.
4H.2 therefore adds the `radio_quality` objective without redefining demand,
residential service, building service, or the raw received-power map surface.

There is no MCS, throughput, scheduler, traffic, mobility, handover, load
balancing, or hard SINR constraint in this concept.

## Fixed evaluation domain

The objective uses the existing deterministic interference compatibility grid:

- `radio_quality_domain_source` is
  `interference_compatibility_grid_union`;
- the domain is the row-major union of each effective per-cell
  `rf_profile.radius_m` disk;
- the default requested and effective spacing is 40 m for the canonical
  scenario, with deterministic adaptive spacing only when the 3,000-sample
  cap requires it;
- points are generated before azimuth scoring and are independent of beam
  eligibility, received power, serviceability, candidate ranking, and Pareto
  membership;
- `radio_quality_domain_id`, sample count, spacing, description, source, and
  ordering are returned in optimization metadata.

This is a fixed sampled estimate, not a continuous-area integral. Baseline,
every candidate, Pareto solution, and one-cell counterfactual use the same
domain. The domain is therefore also stable during priority-only local
reranking.

## Denominator and serviceability

The raw objective fields are:

```text
radio_quality_total_samples
radio_quality_serviceable_samples
radio_quality_serviceable_fraction = serviceable / total
```

The fraction is clamped to `[0, 1]` and is used directly as the stable utility;
there is no candidate-set min/max normalization. A fixed-domain point with no
serving carrier is a failed `no_carrier` sample and remains in the denominator.
An unavailable model is different: it marks the objective unavailable,
excludes it from effective weights, and exposes a reason rather than silently
assigning zero utility.

The authoritative Concept 4H.1 planning policy is applied as one combined
rule:

```text
RSRP >= -110 dBm AND SINR >= 0 dB AND RSRQ >= -20 dB
```

The output records the policy ID, thresholds, serviceability rule, serving
selection mode/metric, co-channel rule, outage counts, and serving-cell
distribution. Diagnostics also include p10 and median SINR, RSRP, and RSRQ;
the secondary distributions are not separate objectives.

## Serving selection and interference horizon

Each sample uses automatic strongest eligible serving-cell selection by
RSRP. Receiver sensitivity gates serving eligibility only. Every finite
non-serving signal that passes geometry and antenna eligibility still enters
linear co-channel summation when technology, channel, frequency, bandwidth,
and measurement family match. Adjacent-channel leakage and partial-overlap
selectivity remain deferred.

The objective explicitly reports
`interference_horizon_mode=per_cell_effective_radius` and the Concept 4H.1
finite compatibility-horizon description. `outside_radius` means outside the
cell's configured effective radius; it is not a claim of physical zero RF
power. No universal or silently enlarged horizon is introduced, so results are
conditional on the declared finite horizon.

## Optimizer integration

`radio_quality` is a fifth objective ID with the user-facing label **Radio
quality**. Its description is: “Fraction of the fixed evaluation domain
meeting A.T.O.M's RSRP, SINR, and RSRQ planning thresholds.” Its configured
priority defaults to zero. When positive and supported, its fixed-domain
utility participates in the composite score, objective status, effective
weight, weighted contribution, recommendation ranking, and Pareto dominance.
Weights rank the Pareto frontier; they do not determine membership.

When the priority is zero, radio quality is not evaluated and is not a Pareto
dimension. Existing propagation-only candidate metrics, score, recommendation,
and Pareto frontier remain numerically unchanged. The canonical disabled run
retains the 4H.1 values: baseline normalized score `33.7894`, optimized
normalized score `41.1715`, recommendation
`70,20,130,160,290,110`, and six Pareto solutions.

The disabled run's post-4H.2 network fingerprint is
`network-def2ab8c875ff267a6e7969d297216f0`. It differs from a pre-4H.2
fingerprint because the canonical identity now records the radio-quality
schema, policy, domain, horizon, and disabled state; the RF candidate metrics,
score, recommendation, and Pareto membership remain unchanged.

If a completed run contains fixed-domain raw radio metrics, the frontend can
change priorities locally: effective weights, contributions, composite score,
and recommendation order are recomputed without another RF request. If those
raw metrics are absent, changing radio priority marks the objective
`not_evaluated`; it does not fabricate a metric.

## Shared hot-loop architecture

The backend prepares one radio-quality context per optimization request. It
resolves cell profiles, builds the fixed grid, and caches per-cell distance,
bearing, horizon membership, and path geometry/LOS classification. Candidate
evaluation then runs a compact loop:

```text
candidate azimuths
  -> antenna eligibility and directional link budget
  -> shared propagation link evaluator
  -> automatic serving selection
  -> co-channel linear interference plus thermal noise
  -> aggregate serviceability, outage, serving-cell, and percentile metrics
```

The optimizer does not call the public `/api/interference` endpoint per point
or candidate, and the hot loop does not allocate public ledgers, report rows,
or per-interferer explanatory strings. The detailed 4H.1 endpoint remains the
diagnostic ledger surface.

The optimizer-specific regression suite proves that multiple individually
sub-sensitivity co-channel interferers accumulate and that different-channel
cells do not contribute.

## Product surfaces

When evaluated, Concept 2A baseline/recommended comparison shows radio-quality
serviceability as a fraction and percentage-point delta. Concept 2B cards and
details show the compact serviceable fraction and can inspect p10/median SINR
through the retained raw metrics. Concept 2C evaluates the same fixed domain
for a baseline-reverted cell and exposes the conditional radio-quality
marginal effect. Concept 2D reports include sample count, serviceability,
p10/median SINR/RSRP/RSRQ, outage breakdown, policy thresholds, and horizon
assumptions. All surfaces remain quiet when the objective was not evaluated.

The marginal effect remains conditional, non-causal, non-additive, and
interaction-dependent. It does not claim that one cell caused a global SINR
change.

## Compatibility and technology boundaries

Demand served, residential served, building service, building-entry estimates,
and the raw signal surface retain their existing semantics. A building can be
propagation-served while its surrounding fixed-domain samples are
radio-quality-poor. Building-entry remains outdoor propagation plus entry loss
and receiver sensitivity; network interference is not added to indoor
serviceability.

The objective is supported for the existing 4G/5G interference presets,
including a controlled 2.6 GHz LTE case and the canonical 28 GHz NR case. The
research 140 GHz profile is intentionally unavailable with reason
`unsupported_radio_quality_model`; effective weights renormalize over the
remaining available objectives. No fake sub-THz SINR optimization is exposed.

The scenario fingerprint includes objective enablement and priorities, domain
version/source, sample cap and spacing, horizon semantics, policy thresholds,
co-channel rule, and load assumption. Presentation-only UI changes do not
change the fingerprint.

## Canonical enabled experiment

The explicit experiment used the non-default priority vector
`[demand=40, residential=20, coverage=20, overlap=10, radio_quality=10]`.
It used six Ankara cells at 28 GHz, a fixed domain of 1,556 samples, and the
declared 400 m per-cell horizon. The run was deterministic:

| Result | Baseline | Recommended |
| --- | ---: | ---: |
| Composite score | 20.1703 | 27.4234 |
| Served demand weight | 185 | 555 |
| Residential covered | 28 | 43 |
| Propagation reach | 16,013.3051 | 19,548.6910 |
| Overlap ratio | 9.8361% | 0% |
| Radio-quality serviceable | 181 / 1,556 (11.6324%) | 235 / 1,556 (15.1028%) |
| p10 SINR | -1.1648 dB | -22.8768 dB |
| Median SINR | 31.0914 dB | 31.6102 dB |

Outage counts remained denominator-complete. Baseline was
`no_carrier=1351`, `rsrp_failed=3`, `multiple_failures=21`; recommended was
`no_carrier=1272`, `rsrp_failed=9`, `multiple_failures=40`. No samples were
classified as `sinr_failed`, `rsrq_failed`, or
`unavailable_configuration` in those aggregates. The recommendation remained
`70,20,130,160,290,110`, so this experiment demonstrates a measurable
radio-quality improvement without claiming that a nonzero priority must alter
the winner. The enabled Pareto frontier contained 11 solutions.

Two retained Pareto representatives show a real trade-off:

- `70,20,130,160,290,110`: reach `19,548.6910`, radio quality `15.1028%`;
- `70,20,130,320,290,110`: reach `18,856.9876`, radio quality `15.2314%`.

The second has slightly lower propagation reach and slightly higher
radio-quality serviceability, so it is a useful trade-off representative; it
is not presented as universally preferable.

The enabled artifact is
[`concept-4h2-canonical-experiment.json`](concept-4h2-canonical-experiment.json).

## Sensitivity and limitations

4H.2 does not expose an alternate interference horizon: the result is
explicitly conditional on the current per-cell effective-radius compatibility
horizon. It also keeps the authoritative planning thresholds fixed under
`planning-default-v1`; no automatic “optimal” threshold selection is made.
Policy sensitivity is therefore a declared limitation rather than a hidden
tuning loop. A future diagnostic may compare explicitly labeled policies, but
it must not silently replace the planning defaults.

The sampled objective is not network-wide interference completeness, a traffic
or scheduler simulation, throughput/MCS prediction, UE measurement
conformance, indoor interference, adjacent-channel analysis, ACLR/ACS/ACIR,
CoMP, beam scheduling, or mobility behavior. Validate deployment decisions
with calibrated models, operator spectrum/load assumptions, and field data.

## Related references

- [Concept 4H.1 interference and radio quality](concept-4h1-interference-radio-quality.md)
- [Algorithms and RF physics](algorithms.md)
- [Modeling limits](modeling-limits.md)
- [OpenAPI contract](openapi.yaml)
