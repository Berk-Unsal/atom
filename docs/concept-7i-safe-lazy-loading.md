# Concept 7I: safe feature loading

## What changed

The initial production graph used one JavaScript entry for the application. It included specialized research panels, experiment and Run History panels, Core Lab, and report rendering. This change gives those surfaces explicit dynamic-import boundaries so the map-first planning workspace does not download them before they are requested.

The cold entry went from **957,782 raw bytes / 262,186 gzip-9 bytes** to **769,861 raw bytes / 217,661 gzip-9 bytes**. That is **187,921 raw bytes (19.6%)** and **44,525 gzip-9 bytes (17.0%)** less initial JavaScript in this production build. Total generated JavaScript remains about the same: 957,782 bytes before and 966,129 after, including the extra per-file gzip overhead. The global stylesheet remains initial and grew by 746 raw bytes.

The Vite advisory remains: the 769.86 kB entry exceeds Vite's default 500 kB advisory. The warning threshold and build configuration were not changed. The goal was initial delivery reduction, not warning removal.

## What stays in the initial workspace

The initial entry retains React and the workspace shell, WorkspaceChrome, Project/Scenario/Version context, core hooks and repositories, ordinary Setup and Inventory, request/run lifecycle, results and optimization summaries, and Leaflet/react-leaflet. A.T.O.M opens directly into its map-first workspace. Leaflet stays eager because the map is part of the first useful screen.

The normal simulation and optimization result path also stays available. The implementation did not move result scores, recommendations, solution identities, or the ordinary Pareto summary behind the Experiments boundary. Path Profile and Advanced optimization controls remain eager inside their existing disclosure, including validation attention/focus behavior.

## Deferred surfaces

| Surface | Intentional trigger | Main emitted JavaScript |
| --- | --- | ---: |
| Propagation Research (Sub-THz and P.1411) | Open Research / reference under Simulate > Propagation | 26.6 kB raw |
| RF Diagnostics Research (measurement, material, reflection) | Open Research / reference under Analyze > RF Diagnostics | 43.2 kB raw |
| Experiments | Select Simulate > Experiments | 7.4 kB raw |
| Core Lab | Select Analyze > 5G Core | 5.0 kB raw |
| Run History display | Select Review > Run History | 13.4 kB raw |
| Report display | Select Review > Report | 9.5 kB raw |
| Report generator/export | Explicit export, regeneration, or Generate report from Run History | 86.7 kB raw |
| Report artifact builder | Persist or regenerate a Report | 2.2 kB raw |
| Stored artifact download helper | Download/open retained report bytes | 0.6 kB raw |

The figures are main chunk sizes; a first open can also request a small shared icon chunk. The research entries share a 447-byte `book-open` module, and Run History/Report share a 795-byte `refresh-cw` module. No per-button chunks or manual vendor chunking were added. All app CSS remains in one initial stylesheet.

Report generation has its own trigger. A user can start from a cold Run History view, generate a historical report, and reach the Report surface without first opening Review > Report. The production E2E path observes the renderer, artifact builder, and Report UI arriving only after the action. It makes one compute request for the initial Run; report generation adds no RF rerun.

## Loading, state and recovery

`LazyFeatureBoundary` starts `import()` from a local effect once the owning surface becomes active. Its fallback is a small `role="status"` message scoped to the feature. The map and other workspace surfaces stay mounted. There is no blanket startup prefetch or intent preload.

For Research disclosures, the first open mounts the feature. After that, collapsing the disclosure hides the loaded child instead of unmounting it, so transient input state survives collapse/reopen. A unit test and production browser workflow verify this for a Sub-THz value. Leaving the owning tool still follows the application's existing conditional mount behavior. Loaded JavaScript stays in the browser module cache; closing a feature does not unload it.

Propagation reference forms initialize some defaults from settings. Since lazy loading delays their first mount, App captures settings when the Propagation tool is entered and supplies that snapshot at first open. This retains the default values the formerly eager child would have derived at tool entry. RF request handlers, Run state, Scenario/Project state and artifact repositories remain owned by App/hooks and continue to arrive as current props.

An import failure produces a feature-local alert with a Reload application button. In Chromium, a failed module URL stayed failed when the same page called `import()` again, so the recovery action restarts the document before trying again. A production test aborts the Research chunk, reloads, and verifies the next request succeeds while the map stays available during the failure. Report-generation imports occur from event handlers rather than the feature boundary; their failures are caught and show the same reload recovery in Report or Run History.

No feature entry performs RF, persistence, storage, timer, or fetch work at import time. Work starts only through existing explicit actions. Module caching is code delivery; it is not a cache of Project, Scenario, Run, or result data.

## Measurement

The before and after builds used the same app, Node/npm/Vite/React versions, headless Chromium version, 1440x900 viewport, Vite production preview, five fresh contexts, and cold per-context cache. Before startup had one JavaScript request for the complete app entry. After startup has one request for the smaller entry; selected feature chunks were absent until their actions.

On this local machine the five-run median Setup visibility moved from 108 ms to 87 ms, and map visibility from 111 ms to 91 ms. Those timing samples are indicative only. The production preview had no backend running, so its initial API calls returned 500 and dataset-ready time was not measured. The timings do not prove dataset readiness or RF completion.

First-open observations on one local production page ranged from 54 to 76 ms for the selected UI surfaces. They are illustrative action-to-visible-feature measurements, not a latency budget or a claim about other hardware or networks. The reproducible evidence is the generated bytes and browser resource graph. The initial graph no longer contains the selected feature chunks, while explicit feature actions request them.

These results support reduced initial JavaScript transfer and parse work. They do not establish production CDN performance, mobile-device performance, cellular-network speed, or that frontend JavaScript is the dominant remaining startup cost. Dataset/backend readiness and map/data rendering were not isolated in the cold metric.

## State and behavior limits

The feature extraction did not change RF equations, request builders, optimizer inputs, scenario canonicalization, Run schemas, report source resolution, artifact storage schema, browser router, or backend interfaces. Existing 275 frontend tests, the responsive E2E suite, Go race tests and validation pass. The new production E2E coverage verifies feature request timing, local failure recovery, Research collapse/reopen, and historical report generation from Run History.

The report workflow verifies historical source Run/Version continuity and avoids a compute rerun. The suite does not capture a separate before/after golden comparison of arbitrary Report artifact hashes or a serialized representative Run snapshot. The feature matrix records this boundary. Likewise, Project/Scenario/profile transitions after every loaded feature were not exhaustively combined into a new Cartesian test; App continues to provide active workspace state, and existing workspace tests pass.

## Remaining cost and next phase

The initial JavaScript entry is still 770 kB raw and Vite still advises that it is larger than 500 kB. Its remaining code supports the core workspace, map, result/recommendation path and App orchestration. This phase did not find a further cohesive high-value split that would preserve immediate planning interaction without adding another delay to common results. More code splitting is not justified by the present evidence alone.

The next Concept 7J candidate is **Frontend Orchestrator / App.jsx Boundary Cleanup**. This phase needed a few presentation extractions from App.jsx, while most cross-tool state and lifecycle coordination still lives there. That is a separate architecture task and is not started here.

## Evidence files

- [Baseline build and cold-start graph](concept-7i-pre-change-baseline.json)
- [Module and import audit](concept-7i-module-inventory.json)
- [Split decisions](concept-7i-split-plan.json)
- [Before/after chunk map](concept-7i-chunk-map.json)
- [Feature loading contract](concept-7i-feature-load-matrix.json)
- [State continuity audit](concept-7i-state-continuity.json)
- [Initial load measurements](concept-7i-initial-load-metrics.json)
- [Test and validation evidence](concept-7i-test-evidence.json)
- [Post-change comparison](concept-7i-post-change-comparison.json)
