#!/bin/sh
set -eu

DOCS_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$DOCS_DIR"

build_page() {
  source_file=$1
  output_file=$2
  page_title=$3
  eyebrow=$4
  summary=$5
  api_page=${6:-false}
  changelog_page=${7:-false}

  pandoc "$source_file" \
    --from=gfm \
    --to=html5 \
    --standalone \
    --template=assets/reference-template.html \
    --lua-filter=assets/reference-links.lua \
    --toc \
    --toc-depth=2 \
    --mathml \
    --metadata title="$page_title" \
    --metadata eyebrow="$eyebrow" \
    --metadata summary="$summary" \
    --metadata source="$source_file" \
    --metadata api_page="$api_page" \
    --metadata changelog_page="$changelog_page" \
    --output="$output_file"
}

build_page api.md api.html "API Reference" "Public interfaces" \
  "Request contracts, response shapes, validation behavior, overload handling, and examples for integrating with A.T.O.M." true
build_page algorithms.md algorithms.html "Algorithms and RF Physics" "Model reference" \
  "The deterministic propagation, geometry, optimization, and radio-quality methods behind A.T.O.M results."
build_page features.md features.html "Capabilities" "Product reference" \
  "A structured inventory of planning modes, analyses, map evidence, reports, and supported radio technologies."
build_page visualization.md visualization.html "Reading Propagation Maps" "Visual interpretation" \
  "How to interpret sector rays, frequency-dependent attenuation, coverage evidence, and the current map layers."
build_page deployment.md deployment.html "Deployment" "Operations guide" \
  "Container, reverse-proxy, readiness, capacity, scaling, and production-hardening guidance for A.T.O.M."
build_page dataset-pack-studio.md dataset-pack-studio.html "Dataset Pack Studio" "Local data tooling" \
  "Inspect, repair, reproject, package, validate, install, and safely switch arbitrary-region A.T.O.M dataset packs."
build_page faq.md faq.html "Frequently Asked Questions" "Help and troubleshooting" \
  "Answers for setup, RF interpretation, performance, data, API access, and common operating problems."
build_page contributing.md contributing.html "Contributing" "Contributor guide" \
  "Repository structure, development setup, testing expectations, and contribution workflow for A.T.O.M."
build_page modeling-limits.md modeling-limits.html "Modeling Limits" "Confidence boundary" \
  "What the deterministic planning model includes, what it excludes, and how to interpret its outputs responsibly."
build_page concept-4e-building-entry.md concept-4e-building-entry.html "Concept 4E Building Entry" "Model reference" \
  "Deterministic facade-entry estimates, standard-derived O2I scenarios, material evidence, API behavior, and canonical audit."
build_page concept-4f1-height-aware-obstruction.md concept-4f1-height-aware-obstruction.html "Concept 4F.1 Height-Aware Obstruction" "Model reference" \
  "Deterministic centerline roof obstruction, height provenance, conservative unknown-height behavior, terrain metadata, and canonical audit."
build_page concept-4f2-diffraction-diagnostic.md concept-4f2-diffraction-diagnostic.html "Concept 4F.2 Diffraction Diagnostic" "Model reference" \
  "P.526-aligned single-edge diffraction reference math, obstruction ledgers, known-height applicability, canonical comparison, and diagnostic boundaries."
build_page concept-4f3a-spatial-evidence-foundation.md concept-4f3a-spatial-evidence-foundation.html "Concept 4F.3A Spatial Evidence Foundation" "Data evidence" \
  "DTM/DSM semantics, vertical-datum gates, windowed raster sampling, building base and roof evidence, external-height matching, provenance ledgers, Ankara readiness, and the 4F.3B promotion gate."
build_page concept-4f3a1-external-height-source.md concept-4f3a1-external-height-source.html "Concept 4F.3A.1 External Height Pilot" "Data evidence" \
  "Bounded Microsoft GlobalMLBuildingFootprints acquisition, Ankara input QA, normalized height evidence, deterministic matching, agreement metrics, and a measured 4F.3B promotion decision."
build_page concept-4f3a2-gba-height-source.md concept-4f3a2-gba-height-source.html "Concept 4F.3A.2 GBA.Height Ankara Pilot" "Data evidence" \
  "Official GlobalBuildingAtlas GBA.Height acquisition, license and semantic audit, windowed footprint sampling, agreement metrics, precedence comparison, readiness impact, and a measured 4F.3B NO-GO decision."
build_page concept-4g1-antenna-link-budget.md concept-4g1-antenna-link-budget.html "Concept 4G.1 Antenna and Link Budget" "Model reference" \
  "Conducted-power and EIRP semantics, shared antenna evaluation, explicit link-budget terms, reference-pattern behavior, diagnostics, and compatibility evidence."
build_page concept-4g2-receiver-noise-sensitivity.md concept-4g2-receiver-noise-sensitivity.html "Concept 4G.2 Receiver Noise and Sensitivity" "Model reference" \
  "Deterministic thermal-noise-derived receiver thresholds, strict link usability, per-cell metadata, bandwidth semantics, integration boundaries, and canonical comparison evidence."
build_page concept-4h1-interference-radio-quality.md concept-4h1-interference-radio-quality.html "Concept 4H.1 Interference and Radio Quality" "Model reference" \
  "Inspectable received-carrier power, serving-cell selection, co-channel eligibility, resource normalization, thermal noise, planning radio-quality metrics, diagnostics, and deterministic fingerprints."
build_page concept-4h2-radio-quality-optimization.md concept-4h2-radio-quality-optimization.html "Concept 4H.2 Interference-Aware Optimization" "Model reference" \
  "An optional fixed-domain radio-quality objective for deterministic multi-cell optimization, with explicit denominator, horizon, policy, Pareto, compatibility, and performance semantics."
build_page concept-4i1-140ghz-audit.md concept-4i1-140ghz-audit.html "Concept 4I.1 140 GHz Applicability Audit" "Scientific audit" \
  "A read-only audit of the 140 GHz research planning profile, authoritative reference applicability, independent atmospheric and material terms, transferability, and the future roadmap."
build_page concept-4i2a-atmospheric-reference.md concept-4i2a-atmospheric-reference.html "Concept 4I.2A Atmospheric Reference" "Scientific reference" \
  "An opt-in, non-canonical Sub-THz atmospheric component ledger using P.525-5, P.676-13, P.838-3, and local-fog P.840-9 terms."
build_page concept-4i2b-p1411-reference.md concept-4i2b-p1411-reference.html "Concept 4I.2B P.1411 Candidate Reference" "Scientific reference" \
  "Applicability-gated ITU-R P.1411-13 Table 4 candidate rows, 140 GHz envelopes, provenance, median-only statistics, isolated comparisons, and Ankara readiness."
build_page concept-4i3-measurement-validation.md concept-4i3-measurement-validation.html "Concept 4I.3 Measurement Validation" "Scientific validation" \
  "Versioned measurement campaigns, quantity semantics, reference-model adapters, deterministic calibration and spatial holdouts, evidence readiness, and the Ankara measurement gap."
build_page concept-4i4-material-facade-reference.md concept-4i4-material-facade-reference.html "Concept 4I.4 Material and Facade Reference" "Scientific reference" \
  "An isolated ITU-R P.2040-4 homogeneous slab ledger with explicit electrical properties, TE/TM coefficients, applicability, numerical stability, controlled fixtures, and non-combined heuristic comparison."
build_page concept-4i5a-reflection-audit.md concept-4i5a-reflection-audit.html "Concept 4I.5A Specular Reflection Audit" "Scientific audit" \
  "A read-only 140 GHz single-bounce specular reflection audit covering image geometry, path spreading, P.2040 coefficient composition, facade evidence, roughness, visibility, Ankara readiness, and a gated 4I.5B contract."
build_page concept-4i5b-specular-reflection-reference.md concept-4i5b-specular-reflection-reference.html "Concept 4I.5B Specular Reflection Reference" "Scientific reference" \
  "An isolated single-bounce image-source reference with explicit finite-facade geometry, P.2040 TE/TM interface or slab coefficients, visibility, Fresnel and far-field evidence, and a non-combined reflected-path link budget."
build_page bug-fixes.md bug-fixes.html "Bug-Fix Register" "Quality history" \
  "Prioritized confirmed defects, user impact, root causes, corrections, and regression evidence for A.T.O.M releases."
build_page ../CHANGELOG.md changelog.html "Changelog" "Release history" \
  "User-visible additions, changes, fixes, and release milestones generated from the canonical project changelog." false true

python3 build_search_index.py
