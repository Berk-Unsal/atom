# Ankara 140 GHz measurement campaign gap specification

This is the minimum evidence package required before an Ankara campaign can enter Concept 4I.3 numeric validation. It is a field-capture specification, not a claim that the repository already contains these measurements.

Each observation must identify a campaign/version, site, Tx/Rx location pair, beam, timestamp, and exact carrier/bandwidth. Record WGS84 (or an explicitly declared CRS) coordinates, antenna phase-center heights, conducted Tx power, Tx/Rx cable losses, receiver calibration status, receiver floor/dynamic range, hardware and firmware IDs, antenna gain/pattern/beamwidth/pointing, polarization, and whether the value is received power, path loss, path gain, directional, isotropic-equivalent, or synthesized omni.

Record LOS/NLOS and its source, morphology, rooftop relation, street width/corner, roof/building intersections, wall events, terrain/vegetation, and any geometry reconstruction. Record temperature, pressure, humidity or water-vapour density, rain and fog with explicit known/unknown flags. Preserve raw quantity and processing notes so normalization can be audited.

Repeated beams at a location pair must retain `location_pair_id` and `beam_id`; correlated directional scans must not be treated as independent omni samples. Below-detection records should retain the detection limit and censoring status without an invented numeric path loss.

The campaign cannot be used for calibration until quantity semantics, antenna basis, cable/gain embedding, calibration state, geometry, and label provenance are complete. It cannot support promotion until deterministic spatial, site, and campaign holdouts meet the validation-count and trend gates recorded by the isolated endpoint.
