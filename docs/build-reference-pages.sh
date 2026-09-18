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
build_page concept-4g1-antenna-link-budget.md concept-4g1-antenna-link-budget.html "Concept 4G.1 Antenna and Link Budget" "Model reference" \
  "Conducted-power and EIRP semantics, shared antenna evaluation, explicit link-budget terms, reference-pattern behavior, diagnostics, and compatibility evidence."
build_page concept-4g2-receiver-noise-sensitivity.md concept-4g2-receiver-noise-sensitivity.html "Concept 4G.2 Receiver Noise and Sensitivity" "Model reference" \
  "Deterministic thermal-noise-derived receiver thresholds, strict link usability, per-cell metadata, bandwidth semantics, integration boundaries, and canonical comparison evidence."
build_page concept-4h1-interference-radio-quality.md concept-4h1-interference-radio-quality.html "Concept 4H.1 Interference and Radio Quality" "Model reference" \
  "Inspectable received-carrier power, serving-cell selection, co-channel eligibility, resource normalization, thermal noise, planning radio-quality metrics, diagnostics, and deterministic fingerprints."
build_page concept-4h2-radio-quality-optimization.md concept-4h2-radio-quality-optimization.html "Concept 4H.2 Interference-Aware Optimization" "Model reference" \
  "An optional fixed-domain radio-quality objective for deterministic multi-cell optimization, with explicit denominator, horizon, policy, Pareto, compatibility, and performance semantics."
build_page bug-fixes.md bug-fixes.html "Bug-Fix Register" "Quality history" \
  "Prioritized confirmed defects, user impact, root causes, corrections, and regression evidence for A.T.O.M releases."
build_page ../CHANGELOG.md changelog.html "Changelog" "Release history" \
  "User-visible additions, changes, fixes, and release milestones generated from the canonical project changelog." false true

python3 build_search_index.py
