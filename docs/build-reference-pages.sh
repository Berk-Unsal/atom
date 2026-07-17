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
build_page faq.md faq.html "Frequently Asked Questions" "Help and troubleshooting" \
  "Answers for setup, RF interpretation, performance, data, API access, and common operating problems."
build_page contributing.md contributing.html "Contributing" "Contributor guide" \
  "Repository structure, development setup, testing expectations, and contribution workflow for A.T.O.M."
build_page modeling-limits.md modeling-limits.html "Modeling Limits" "Confidence boundary" \
  "What the deterministic planning model includes, what it excludes, and how to interpret its outputs responsibly."
build_page bug-fixes.md bug-fixes.html "Bug-Fix Register" "Quality history" \
  "Prioritized confirmed defects, user impact, root causes, corrections, and regression evidence for A.T.O.M releases."
