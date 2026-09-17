# Concept 4G.1 pre-change antenna audit

Captured against `20807e3` before the production edits.

## Current RF path

`CellRFProfile` stores `tx_power_dbm`, `antenna_gain_dbi`, `system_loss_db`,
pattern IDs, beam width, orientation, mechanical/electrical downtilt, antenna
height, receiver height, and receiver sensitivity. The old `antenna_gain_dbi`
name is used as the per-cell absolute gain input, but the contract does not
call it explicitly conducted-TX plus boresight gain.

`EvaluatePropagationLink` is the common numeric propagation dispatch used by
direct point evaluation, ray terminals, received-signal surfaces, interference,
building-entry outdoor facade evaluation, and optimization scoring. The urban
model selects its UMa LOS/NLOS path loss and then adds the relative antenna
pattern attenuation. The legacy and research profiles use FSPL plus wall-event
loss. Optimization consumes the ray/surface path, so it does not maintain a
separate RF equation.

## Findings

1. The intended conducted transmit input is `tx_power_dbm`, but that semantic
   is not stated in the profile or API metadata.
2. `antenna_gain_dbi` is an absolute gain value, while horizontal and vertical
   pattern functions return relative attenuation. The distinction exists in
   comments but is not represented as a typed link ledger.
3. `PropagationPathTerms.EIRPDBm` currently equals
   `P_tx + G_tx - L_system + calibration`; it is therefore an effective
   transmit term, not pure boresight EIRP. `RFLinkBudgetTerms` has the same
   ambiguity.
4. System loss is subtracted before propagation and calibration is added. Both
   are numeric inputs, but their scope is not visible alongside the receiver
   result.
5. There is no receiver antenna gain field. Receiver sensitivity is only a
   threshold/termination policy and is not an implicit receiver gain.
6. There is no polarization-loss field. Polarization is therefore an explicit
   zero in the compatibility contract, not an unrecorded physical assumption.
7. `ideal-sector` and `omni` return zero relative pattern loss. `cosine-sector`
   uses `min(30, 12 * (abs(offset)/(beam_width/2))^2)`. The existing hard beam
   eligibility test clips non-omni sectors at the configured beam width.
8. `flat` has zero vertical attenuation. `panel-10deg` and `panel-20deg` use
   `min(30, 12 * ((depression_angle - (mechanical + electrical tilt))/beam)^2)`.
   The code implies positive tilt is positive downward because it is compared
   against a positive Tx-to-ground depression angle, but the sign convention is
   not documented to users.
9. Azimuth/orientation is normalized as `base azimuth + orientation`. Hard
   beam eligibility is repeated at the surface, ray, building-entry, and
   interference call sites instead of being returned by one antenna evaluator.
10. `propagationPatternTerms` duplicates the pattern and effective-transmit
    arithmetic used by `LinkBudgetTerms`; this is a drift risk even though both
    currently produce the same received-power number.
11. API responses expose the old profile fields and a high-level RF contract,
    but not a signed conducted-TX → EIRP → directional-EIRP → receiver ledger.
    The inventory UI exposes the old gain/system/pattern/tilt controls but no
    receiver gain or polarization control.

## Deliberate 4G.1 boundaries

The compatibility default remains 30 dBm conducted TX, 25 dBi absolute TX
gain, 0 dBi receiver gain, 0 dB polarization loss, 0 dB system loss, and 0 dB
calibration. No thermal-noise/sensitivity model change, array factor, MIMO or
beamforming model, UE orientation, fading, or optimizer objective is part of
this foundation. A validated tabulated vendor pattern is not present, so the
foundation keeps the deterministic analytic patterns and records any optional
reference element model separately from absolute gain.
