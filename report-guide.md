# Reading Planning Reports

Markdown and printable HTML use the same report model, quantities, interpretation and conditional sections. Start with **Decision summary**: it identifies the Scenario, saved Version or unsaved plan, source Runs, selected Cells, primary result and evaluation completeness. A score can exist after **Evaluate Network** without an optimization search. Standalone interference and the optimizer's radio-quality objective have separate status entries.

Continue through the report in this order:

1. **Planning map & Cells** ties stable numbered callouts to full Cell IDs and configured or recommended azimuths. Leader lines point to the true locations of co-located Cells. The schematic map shows at most 300 RF **segments**, sampled across Cells, with bounds from the full retained geometry. Sampling never changes KPIs. Its caption identifies the simulation source and warns when a locally reranked recommendation differs from that simulation. Markdown omits the SVG; a review package links its actual sibling map and HTML files.
2. **Network evaluation** explains quantities, denominators, the evaluation domain and configured priorities. A compatible recorded baseline enables before/after comparison; an evaluated configuration alone does not create one. Pareto alternatives and marginal Cell effects appear only when retained.
3. **RF configuration & receiver assumptions** records common fields once. A reference profile names how many Cells match it and lists lossless per-Cell deviations. Missing historical inputs say **Not recorded** instead of inheriting current defaults.
4. **Dataset, model & provenance** identifies the source computation separately from the application and report generator used for this export. Dataset-wide counts and pack QA describe the pack, not the selected network domain or physical accuracy.
5. **Engineering appendix** holds metric definitions, full source IDs, fingerprints, dataset hashes, receiver/model contracts and retained supporting evidence. Hashes establish identity or byte integrity, not physical validation.

Read the units before comparing figures:

| Report quantity | Meaning |
| --- | --- |
| Optimization score, `/100` | Normalized preference-weighted planning utility under the current priorities. It is not coverage percentage, probability, measured accuracy or confidence. Unavailable objectives are excluded from scoring. |
| Modeled demand weight served | Served weight divided by relevant weight. For example, six demand building entities can carry a total weight of 260; neither quantity is a population estimate. |
| Residential building entities served | Positive-residential building entities served out of the relevant entities whose footprints intersect the selected-Cell radius union. It is not residents or dwellings. |
| Normalized propagation reach | A ray-distance score, with up to 100 units per configured ray and distance normalization capped at the lesser of radius and 500 m. It is not meters or area coverage. |
| Served building entities | Building entities with best modeled building Rx strictly above the recorded building-service threshold; multipart footprint records can be separate entities. |
| Multi-Cell overlap | Share of served building entities served by multiple Cells. It does not establish interference performance. |
| Ray-endpoint Rx and obstruction | Terminal-ray diagnostics. Rays terminate at receiver sensitivity or the planning radius; low endpoint Rx and high building service can coexist because building service uses a different population and threshold. Network means retain the existing mean of per-Cell summaries. |

The interpretation uses recorded values and availability, without adding a grade. Rounded `100.0%` is described as **all** only when the recorded numerator equals the positive denominator. **Not evaluated**, **Not retained**, **Not recorded** and **Unavailable** identify different evidence boundaries; none is a zero result. In 6G research mode, unsupported interference remains unavailable. Optimizer radio quality uses its fixed sampled domain, including no-carrier samples as denominator failures; standalone interference has its own sampled and signal-only denominators.

For PDF export, use **A4 portrait**, default scale and the report's CSS margins, and turn **browser headers and footers off**. Current Chromium is the reference print path: it supports the report's running identity, generation time and **Page X of Y**. Other browsers or user print overrides may paginate differently or omit margin-box chrome. The in-app export/reopen path waits for document fonts and images before opening print; the self-contained HTML button invokes the browser's print command directly. The report remains selectable text; browser output is not a claim of PDF/UA conformance.

New report downloads share a name such as `ankara-plan-network-plan-2-v3-20261019-083612z-network-evaluation-report.html`, with matching Markdown/map stems and UTC time. All displayed generation dates use `YYYY-MM-DD HH:mm UTC`; legacy timestamps without a recorded zone remain unknown. Regeneration uses the current report generator, while downloading an already retained artifact preserves its original bytes, filename, timestamp and hash. A **Review package** collects existing saved-Version evidence locally and does not run RF or rebuild missing results.

