# Concept 4D — Urban short-range propagation baseline

Concept 4D adds an explicit propagation-model boundary to A.T.O.M. The production default for 2.6 GHz and 28 GHz planning requests is `urban_short_range`; 140 GHz uses the explicitly research-only `research_sub_thz` profile. `legacy_fspl_walls` remains selectable for compatibility and side-by-side comparison.

Concept 4F.1 supersedes the 2D footprint-only LOS/NLOS branch described below for production `urban_short_range` links. The equations, applicability envelope, fallback policy, and legacy/research boundaries remain the same; read the [Concept 4F.1 height-aware obstruction note](concept-4f1-height-aware-obstruction.md) for the current classifier and height-evidence contract.

The pre-change Ankara result is preserved in [`concept-4d-pre-change-baseline.json`](concept-4d-pre-change-baseline.json). The post-change legacy-versus-urban run is recorded in [`concept-4d-canonical-comparison.json`](concept-4d-canonical-comparison.json). These are measurement artifacts, not goldens to rewrite.

## Selected model

The urban baseline is the 3GPP TR 38.901 UMa outdoor-to-outdoor median path-loss model, Table 7.4.1-1. It is a deterministic planning baseline, not a complete channel realization.

This choice is appropriate for the current A.T.O.M. inputs because the runtime knows frequency, 2D distance, and explicit Tx/Rx heights (the default is 25 m / 1.5 m), and it can classify a footprint path as LOS or NLOS. The current dataset does not provide trustworthy street width, street orientation, or a consistently usable building-height field. Those missing inputs make a site-specific urban canyon model a poor default without inventing environmental constants.

ITU-R P.1411 is retained as a documented comparison reference. It directly covers short-range outdoor propagation from 300 MHz to 100 GHz and has scenario-specific LOS/NLOS and building-entry material, but its urban NLOS methods need more site geometry than this baseline has. A.T.O.M. therefore does not claim P.1411 conformance here.

## Link contract

The shared abstraction is:

```text
PropagationModel
  ID()
  Description()
  Applicability(link context)
  Evaluate(link context) -> PropagationResult
```

`PropagationResult` reports the requested model, applied model, applicability reason/detail, fallback, LOS state, endpoint case, distance, received power, and decomposed path-loss terms. The response-level `rf_contract` repeats the model identity, formula, applicability envelope, LOS rule, fallback policy, and data limitations.

### `urban_short_range`

The model uses SI distances in metres, carrier frequency in GHz except where the breakpoint explicitly requires Hz, and base-10 logarithms. With `hE = 1 m`, `hBS` and `hUT` are the known equipment heights, `d2D` is footprint ground distance, and `d3D` is the slant distance:

```text
d3D = sqrt(d2D^2 + (hBS - hUT)^2)
dBP' = 4 (hBS - hE) (hUT - hE) fc_Hz / c
PL1 = 28.0 + 22 log10(d3D) + 20 log10(fc_GHz)
PL2 = 28.0 + 40 log10(d3D) + 20 log10(fc_GHz)
      - 9 log10((dBP')^2 + (hBS - hUT)^2)
PL_LOS = PL1 when d2D <= dBP', otherwise PL2
PL' = 13.54 + 39.08 log10(d3D) + 20 log10(fc_GHz)
      - 0.6 (hUT - 1.5)
PL_NLOS = max(PL_LOS, PL')
```

The link uses `PL_LOS` or `PL_NLOS` according to the shared classifier, then applies the configured absolute Tx/gain/system/calibration terms and relative antenna-pattern attenuation. It does not apply legacy FSPL or legacy wall-event loss in addition to the empirical NLOS formula.

The deterministic runtime envelope is `0.5 < fc < 100 GHz`, `10 m <= d2D <= 5000 m`, `10 m <= hBS <= 150 m`, and `1.5 m <= hUT < 13 m`. The receiver-height restriction keeps the `hE = 1 m` choice deterministic rather than sampling the standard's optional environment-height distribution.

### `legacy_fspl_walls`

The compatibility model retains the previous inspectable equation:

```text
P_rx = P_tx + G_tx - L_system + calibration
       - L_FSPL - L_building - A_pattern
```

`L_building` is the frequency-dependent wall-event term. This mode is the preferred fallback when the urban model is outside its documented scope.

### `research_sub_thz`

This mode is selected by default at 140 GHz and is explicitly research-only. It keeps the conservative planning profile available without implying that A.T.O.M. has a validated 140 GHz channel model. It is covered by safety fixtures and reports its research status in `rf_contract`.

## Geometry and endpoint rules

The classifier is shared by rays, surface cells, interference samples, and network scoring:

- Outdoor-to-outdoor with no 2D footprint boundary event: `LOS`.
- Outdoor-to-outdoor with one or more footprint boundary events: `NLOS`.
- Transmitter or receiver inside a footprint: an explicit indoor endpoint case, not outdoor NLOS.
- Missing footprint data or an unclassifiable path: `unknown`, which makes `urban_short_range` inapplicable.

The historical 2D rule above is retained here to explain the Concept 4D comparison artifact. Production urban links now use the Concept 4F.1 centerline roof rule and report explicit building-height provenance; legacy and research modes retain their historical numerical behavior.

Ray segmentation is representational. Every segment endpoint is evaluated from the physical endpoint distance and shared path classification; splitting a ray into 25 m GeoJSON segments cannot add propagation loss by itself.

## Engine integration

The same evaluator is used by single-cell rays, coverage surfaces, interference, and the network/optimizer paths that consume those signals. The path-profile workflow remains a separate point-to-point diagnostic model. Optimization objectives and weights are unchanged. Propagation reach remains sensitivity-based and is calculated from the same evaluated powers used for coverage. Interference uses those same carrier powers before its existing RB, load, noise, SINR, and RSRQ calculations.

When a requested urban link is inapplicable, the result records the reason and uses `legacy_fspl_walls`. No endpoint silently changes formula without an explainable fallback record. The 140 GHz mode never falls through to the urban formula.

## Canonical Ankara comparison

On the six-cell, 28 GHz Ankara scenario, the legacy mode reproduces the pre-change baseline exactly: network score `4,646,513.3`, 6 demand buildings, 28 residential buildings, 6 overlap buildings, and 16,013.3051 usable-reach score. The urban baseline produces `13,509,330.8`, 12 demand buildings, 82 residential buildings, 10 overlap buildings, and 18,330.7658 usable-reach score. The urban optimizer selects `[150, 300, 110, 300, 290, 100]` with score `32,568,641.7` and a 23-solution Pareto frontier; legacy selects `[70, 20, 130, 160, 290, 110]` with score `11,585,048.7` and a six-solution frontier.

The controlled ray comparison explains the direction of the change: at 100 m the legacy NLOS representative is `-106.6 dBm` after 60 dB of wall-event loss, while the urban NLOS representative is `-66.1 dBm` with zero legacy wall dB. The urban NLOS equation already represents outdoor obstruction statistically. Indoor endpoint segments remain explicit legacy fallbacks. Surface and interference distributions, including serviceability, are included in the comparison artifact.

The same artifact includes controlled near, medium, and radius-edge links at both 2.6 and 28 GHz. Those links report model, LOS state, complete path loss, received power, and urban-minus-legacy difference without reusing a production result as the expected value.

## References

- [ITU-R P.1411-13 — propagation data and prediction methods for short-range outdoor radiocommunication systems](https://www.itu.int/rec/R-REC-P.1411-13-202509-I/en)
- [3GPP TR 38.901 specification record](https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3173)
