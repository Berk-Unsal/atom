# A reproducible two-Cell planning comparison

Can changing only two planning Cells' azimuths serve more modeled demand without excessive duplicate service? This walkthrough records a baseline, a recommendation and an alternative with less overlap in a small Ankara area. It uses public planning inputs; measured real-world RF accuracy remains unestablished, and the result does not approve a deployment.

## Exact inputs and scope

Use a complete Git LFS checkout and the default `ankara-open-planning@2026.07` pack from [Getting Started](getting-started.md). Download the separate [two-Cell walkthrough project](https://raw.githubusercontent.com/Berk-Unsal/atom/main/examples/ankara-two-cell-walkthrough.atom-project.json) using the link's Save link as action, or use the file in your checkout. The legacy [first-use sample](https://raw.githubusercontent.com/Berk-Unsal/atom/main/examples/ankara-sample.atom-project.json) remains an input-only example; its first-run UI selects nearby Cells dynamically and is not this fixed comparison.

The walkthrough project contains two selected records and their complete planning RF profiles, dataset ID/version/hashes and priorities. It intentionally contains no computed results: import it and evaluate on the matching runtime.

| Planning record | API Cell ID | Longitude | Latitude | Baseline azimuth |
| --- | --- | --- | --- | --- |
| `LTE-26380` | `26380` | 32.8279 | 39.9279 | 90° |
| `LTE-26381` | `26381` | 32.8283 | 39.9270 | 90° |

These are OpenCellID-derived planning records, not verified physical sites or operator-authoritative RF identities. Coordinates identify the existing public pack records, not a new measurement campaign. Demand attributes are heuristic planning weights, not measured traffic or population.

The recorded run used A.T.O.M **0.13.0**, source **fc0f1e489110bbd30277c3454e4db95e0ca302d6**, Go **1.26.10** on macOS arm64, and model/version **urban_short_range**. Exact hashes and the complete canonical request are in the [recorded evidence](planning-walkthrough-evidence.json). Buildings SHA-256 is `d952a853b1146fe4e4136c2d8bac1b8e2c7152b33d78b0d9f82399350bfd50fc`; Cells SHA-256 is `c460c254d8748df52305d141b2f5e5147757a00b9d0581d8670084aa29ee3bd8`.

Keep these settings fixed throughout:

| Input | Value |
| --- | --- |
| Technology / frequency / bandwidth | 4G, 2.6 GHz, 20 MHz |
| Model | `urban_short_range` (3GPP UMa median outdoor planning) |
| Rays / radius / beam | 120 rays per Cell / 400 m / 120° |
| Conducted TX power / absolute TX gain | 30 dBm / 25 dBi |
| RX gain / system and polarization losses | 0 dBi / 0 dB each |
| TX height / RX height | 25 m / 1.5 m |
| Horizontal / vertical pattern | Ideal sector / flat |
| Mechanical and electrical tilt / pattern orientation | 0° each |
| Receiver sensitivity / calibration offset | Manual −115 dBm / 0 dB |
| Demand / residential / propagation reach / reduce overlap / radio quality priorities | 100 / 50 / 50 / 20 / 0 |
| Constraints / search | None / existing default coordinate search |

The fixture also freezes load 70%, reuse 1, channel CH-1, noise figure 7 dB and sample spacing 40 m. Radio quality is disabled in this optimization, so no SINR or throughput conclusion follows from those settings. Only azimuth changes; power, locations, heights, frequency and patterns remain fixed. The default bounded search and retained Pareto frontier do not prove a global optimum.

## Evaluate and preserve the baseline

1. Open the app at `http://localhost:8080` (Docker) or `http://localhost:5173` (Go + Vite). In the project menu, choose **Import** and select `ankara-two-cell-walkthrough.atom-project.json`. Import creates a separate project.
2. Check **Network** mode with **2 selected**. In **Inventory**, confirm the two records and their fixed per-Cell profiles. Do not replace them by drawing an area or opening the dynamic first-run sample.
3. In **Data**, confirm the dataset/version and model. Stop if the project shows **Dataset differs from this project**. Replacing a pack or accepting a different model makes the numeric example inapplicable.
4. Select **Evaluate Network**. Wait for **Ready**, then open **Results**. Record the baseline row below. The map rays show propagation; served buildings and overlap have their own populations and are not ray blockage percentages.
5. Choose **Save Version** to preserve the evaluated baseline. In **Plan → Scenarios**, give it a readable baseline name. Keep it available for comparison before changing the plan.

## Optimize and inspect the trade-off

1. Open **Simulate → Propagation → Advanced analysis**, check the five **Optimization priorities** above, and choose **Optimize Network**. This runs RF; changing priorities later only reranks the retained alternatives until you explicitly search again.
2. In **Results → Optimization**, choose **View comparison** to inspect **Baseline vs Recommended**. The recommended azimuths are **240° / 130°** in API Cell order `26380` / `26381`. Optimization loads these into the working draft; verify them before saving.
3. Open **Results → Solutions** and inspect the alternative **240° / 110°**, using **Show all** if necessary. Choose its point or row to inspect it; inspection alone does not apply it. Use the explicit apply action only if you want that plan in the draft.
4. Compare all three on the same domain and priorities:

| Metric | Baseline 90° / 90° | Recommended 240° / 130° | Alternative 240° / 110° |
| --- | ---: | ---: | ---: |
| Normalized optimization score (0–100) | 40.0089 | 81.4048 | 80.6990 |
| Served demand weight / relevant weight | 115 / 305 | 305 / 305 | 305 / 305 |
| Covered residential buildings | 167 | 338 | 327 |
| Overlapping buildings | 109 | 4 | 0 |
| Normalized propagation reach (reach-score units) | 13,418.6562 | 14,970.5508 | 14,559.8919 |

The recommendation gains **190 demand-weight units** and **171 residential buildings**, while removing **105 overlapping buildings**, relative to the baseline. Its score increases **41.3959 points**; that score is a weighted planning utility, not a coverage percentage or confidence level.

The zero-overlap alternative keeps all 305 demand-weight units but gives up **11 residential buildings** and about **410.66 normalized reach-score units** relative to the recommendation. It illustrates why the highest weighted score and minimum overlap need not select the same plan. The domain contains 601 relevant residential buildings; neither result means all homes or all outdoor locations are covered. Propagation reach is distance-normalized: each ray contributes up to 100 score units, capped at the lesser of its radius and 500 m. It is not metres, geographic area, user coverage or a path length between the Cells.

## Save the chosen plan and export review evidence

1. Choose the recommendation or explicitly apply the inspected alternative. Keep the baseline Version for comparison. Run **Evaluate Network** for the chosen current azimuths so the retained execution matches the exact plan you are saving, then choose **Save Version**. Read any stale/history notice before using a result.
2. Use **Results → Compare** to select the baseline and chosen saved evidence. Confirm matching dataset and model identity before interpreting deltas. A changed radius, frequency or priority is a different comparison.
3. Open the project menu and choose **Export**. Keep the `.atom-project.json` outside browser storage. Import it in a separate browser profile and confirm both preserved inputs/Versions. Imported IDs are remapped; provenance records the source identity. Historical results can remain readable without being a new live run, and some map layers require an explicit rerun.
4. In **Review → Report**, choose **Markdown** to generate and download a report from the chosen saved Version, or use **PDF / Print** and save the print output. These files are separate from project export. Choose **Review package** for a local ZIP containing both HTML and Markdown reports, the project and manifest. See the [report reader guide](report-guide.md) for lineage and A4 print settings.
5. A reviewer should receive the editable project plus a readable report/review package. Check the project/scenario/Version and any source Run, dataset/model, UTC timestamp, complete RF settings and the unestablished-accuracy boundary. A project file does not include the separate Run History database, generated report store or coverage surfaces.

## Reproduce the recorded API comparison

With the Go API already running on the matching pack, run from the repository root using Node 24 or newer:

```bash
node scripts/reproduce-planning-walkthrough.mjs http://localhost:8080 /tmp/atom-walkthrough-evidence
```

The script uses the same project importer and request builder as the frontend. It checks dataset hashes and model version, sends **two sequential RF requests** (Evaluate and Optimize), checks the recorded fingerprint and comparison, and writes `request.json`, `meta.json`, `baseline.json`, `optimization.json` and `summary.json` into the output directory. The recorded scenario fingerprint is `network-6fe95eaddbb92e9ba9a3bf0fa5384544`. These JSON files are execution evidence, not importable portable projects or UI reports.

No request is automatically retried. If the API is busy (`429`), wait for its `Retry-After` before rerunning. A changed dataset, model, fixture or result fails the comparison; keep the output and investigate instead of silently replacing the recorded values. This command verifies the API calculation; the UI steps above separately exercise preservation and reporting.
