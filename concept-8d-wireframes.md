# Concept 8D — Workspace Wireframes

Wireframes are role/layout proposals only. They do not change the current shell or product components.

## 1. Propagation + inspected Cell

### 1600 desktop — push both panels

```text
+----------------------+------------------------------ MAP 832px ------------------------------+------------------+
| 88px stage rail       | Left task drawer · 360px      | Map / rays / toolbar / legend            | Inspector · 320px|
| Plan                  | Propagation                   |                                            | Cell 8414746      |
| Simulate               | Planning                      |                                            | 5G mmWave · 28GHz |
| Analyze                | Ray count / radius            |                                            | In cluster #2     |
| Review                 | Azimuth / beam width          |                                            | TX / azimuth / BW |
|                        | [Optimize] [Run Sector]       |                                            | CURRENT · Run ... |
|                        | Advanced ▸ Research ▸         |                                            | [Inventory]       |
|                        |                               |                                            | [Focus] [Path]    |
+----------------------+------------------------------+--------------------------------------------+------------------+
```

Inspector content is read-only. Values are resolved from the selected Cell and current plan; `CURRENT · Run ...` is shown only when the result relation is exact. The left task drawer remains intact.

### 1280 — one panel slot

```text
+----------------------+------------------------------- MAP 872px ------------------------------+------------------+
| 88px stage rail       | Propagation remains the current tool state                           | Inspector · 320px|
|                        |                                                                      | Cell 8414746      |
|                        |                                                                      | [Back to Prop.]   |
|                        |                                                                      | facts/actions     |
+----------------------+--------------------------------------------------------------+------------------+
```

The Propagation drawer is hidden while the inspector occupies the one panel slot. Its settings and open disclosure state are retained; **Back to Propagation** restores them. The map does not shrink between two fixed side panels.

### 390 phone — one sheet

```text
+--------------------------------------+
| Command bar                         |
|             Map                     |
|             useful visible strip     |
|--------------------------------------|
| Cell 8414746                    [×]  |
| 5G mmWave · In cluster #2            |
| 3–6 key facts                         |
| [Edit in Inventory] [Focus]          |
| Details / Provenance ▸               |
|--------------------------------------|
| Plan   Simulate   Analyze   Review    |
+--------------------------------------+
```

Use the existing bottom-sheet language. The inspector and tool chooser/drawer never compete; close/back behavior is explicit and details scroll inside the sheet.

## 2. Interference result + selected radio-quality sample

### 1600 desktop

```text
+----------------------+------------------------------ MAP 832px ------------------------------+------------------+
| Stage rail            | Interference task drawer        | Result layer + legend                  | Inspector · 320px|
| Analyze               | Network requirements            | SINR / RSRP / RSRQ                       | Sample sample-42 |
|                        | model controls                   | selected point                           | 12.4 dB SINR     |
|                        | [Analyze interference]           |                                            | -84 dBm RSRP     |
|                        | Advanced assumptions ▸            |                                            | Serving 8414746  |
|                        |                                   |                                            | Interferer ...   |
|                        |                                   |                                            | CURRENT · Run... |
|                        |                                   |                                            | [Focus cell]     |
+----------------------+-----------------------------------+--------------------------------------------+------------------+
```

Only values present in the selected feature are shown. The legend explains aggregate color bands; the inspector explains this point. Sample click does not run analysis or alter Plan selection.

### 1280 and phone

At 1280, sample detail uses the one panel slot and **Back to Interference** restores the task. At 390, it becomes the same one-at-a-time sheet; the result metric and source Run remain visible before secondary power terms.

## 3. Results + selected Pareto solution

Pareto remains inside Results; do not open the right inspector for a candidate.

```text
Results · CURRENT · Optimization Run 1c2224cb
Network optimization search

Optimization score                  Feasibility
65.5 / 100                           Satisfied

PRIMARY OBJECTIVES
Demand        Residential      Reach        Overlap
...           ...              ...          ...

More metrics ▸
Cell configuration changes ▸
Why this solution ▸

Solutions: Recommended · #1 · #2 · #3
Compare selected candidates
[Apply solution…]  [View Run]
```

The selected candidate does not become the current Plan, recommendation, or RF map ray source. Applying retains the exact Optimization Run and source Version. 1280/phone use the same Results drawer/sheet; objective summary precedes raw metric/configuration detail.

## 4. Plan > Scenarios

```text
Scenarios
Current draft · [Project / Scenario / Version context]

SCENARIO LIST
  Downtown baseline · Version 3 · Open
  Coverage variant · Version 2
  ...

CURRENT SCENARIO
Name / description
[Save Version]  [Duplicate]

VERSION HISTORY
Version 3 · timestamp · short change note · 2 Runs · 1 Report
Version 2 · timestamp · short change note

Selected Version 3
[Continue from Version] [Branch from here]
Details / Evidence ▸
Compare Versions ▸
```

Keep normal navigation/actions first. Fingerprints, long IDs and full evidence stay in Details. Selecting an old Version inspects history; Continue/Branch are explicit draft transitions.

## 5. RF Diagnostics internal subviews

```text
RF Diagnostics
Canonical actions
[Open current RF result] [Open vertical path profile]

Research / reference
Validation | Materials | Reflection

[Only the active research workflow mounts here]
```

The outer research boundary stays lazy. Each internal choice is one user goal at a time; selecting a label does not execute it. For chunk savings, subview modules load only when selected.

## 6. Run History master/detail

```text
Run History
Scope · Type · Status · Refresh

[Simulation] Scenario A · Version 3 · timestamp · Succeeded
[Optimization] Scenario B · Version 1 · timestamp · Succeeded

Select a row →

< Back to Runs
Optimization Run · short ID · HISTORICAL
Scenario / Version / created / source summary
Retained result summary
Public solutions ▸
Details / Provenance ▸
[Open source Version] [Run again] [Generate Report]
```

At narrow widths the selected detail replaces the list view; no nested two-column master/detail inside a 320px drawer. If the list is empty, one actionable empty state replaces both list and detail.

## 7. Data hierarchy

```text
Data
Planning data
Data quality             Good
Buildings                161,784
POI demand                 5,957
Residential               75,446
Dataset      Ankara Open Planning · 2026.07

Dataset details ▸
  Installed packs · QA · coverage · licenses · sources
Model details ▸
  model version · assumptions · applicability
Provenance ▸
  hashes · application version · source records
Measurements / calibration ▸
  Import · Evaluate · explicit Apply correction
Developer pack commands ▸
```

The figures illustrate hierarchy only. Preserve the repository’s actual values and QA; avoid equal-weight tiles for all metadata. Keep the CSV residual/global-bias correction here as a clearly named Measurements & calibration workflow because it can explicitly update the plan. RF Diagnostics campaign validation remains a separate evidence ledger and does not promote a model.

## Empty and stale states

```text
No saved Runs yet
Run a simulation or optimization to create one. [Open Plan]

STALE · Run 1c2224cb came from the earlier plan
The current plan has not been computed.
[Run current plan] [View Run]
```

Do not show “Choose a Run from history” beside “No saved Runs”. If the selected sample payload is unavailable after invalidation, say UNAVAILABLE and name its source; never replace it with current-looking values.
