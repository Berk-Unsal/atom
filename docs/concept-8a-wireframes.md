# Concept 8A navigation wireframes

These are structural sketches for Concept 8B, not visual redesigns.

## Option A — Rail flyout (selected)

~~~text
Default desktop
┌─────────────────────────────────────────────────────────────────────────────┐
│ A.T.O.M │ Workspace: Project / Scenario / Version │ RF │ State │ Run Sector │
├─────────┬──────────────────────────┬───────────────────────────────────────┤
│ Plan    │ Setup                 [×]│                                       │
│ Simulate│ Mode, RF, selection      │                                       │
│ Analyze │                           │                 MAP                   │
│ Review  │                           │                                       │
│         │                           │                                       │
└─────────┴──────────────────────────┴───────────────────────────────────────┘

Analyze chooser open
┌─────────┬───────────────────────┬─────────────────────────────────────────┐
│ Plan    │ Setup              [×]│                                         │
│ Simulate│                       │                  MAP                    │
│ Analyze◀├─ Analyze tools ───────┤                                         │
│ Review  │  Interference       ! │                                         │
│         │  RF Diagnostics  ●    │                                         │
│         │  Building entry       │                                         │
│         │  5G Core              │                                         │
│         ├───────────────────────┤                                         │
│         │ Active tool content   │                                         │
└─────────┴───────────────────────┴─────────────────────────────────────────┘

The chooser is a temporary overlay over the drawer edge. It never pushes,
resizes, routes away from, or replaces the map. Unavailable tools remain
visible with an explanation and cannot be selected.
~~~

## Option B — Expandable rail

~~~text
┌────────────────────┬───────────────────┬──────────────────────────────────┐
│ Plan               │ Setup          [×]│                                  │
│   Setup            │                  │                                  │
│   Inventory        │                  │                MAP               │
│ Simulate           │                  │                                  │
│ Analyze            │                  │                                  │
│ Review             │                  │                                  │
└────────────────────┴───────────────────┴──────────────────────────────────┘
~~~

This keeps siblings visible, but expands the rail to roughly 208–248 px if it
reflows the page. An overlay version has the same temporary map occlusion as
Option A.

## Option C — Stage rail plus current-tool dropdown

~~~text
┌─────────────────────────────────────────────────────────────────────────────┐
│ A.T.O.M │ Project / Scenario / Version │ RF │ Status │ Run Sector            │
├─────────┬──────────────────────────┬───────────────────────────────────────┤
│ Plan    │ Inventory  [tool list ▾] │                                       │
│ Simulate│ Local cells and profiles │                 MAP                   │
│ Analyze │                          │                                       │
│ Review  │                          │                                       │
└─────────┴──────────────────────────┴───────────────────────────────────────┘
~~~

This removes the row but leaves tool selection in the drawer header rather than
making the rail own both levels.

## Option D — Two-column chooser

~~~text
┌─────────┬─────────────────────┬────────────────┬──────────────────────────┐
│ Plan    │ Setup               │               │                          │
│ Simulate│ Simulate tools      │ Propagation   │          MAP             │
│ Analyze │ Analyze tools       │ Interference  │                          │
│ Review  │ Review tools        │ RF Diagnostics│                          │
└─────────┴─────────────────────┴────────────────┴──────────────────────────┘
~~~

This is explicit but covers more of the map and introduces a larger transient
navigation surface.

## Narrow layouts for Option A

~~~text
768 px tablet
┌────────────────────────────────────────────────────────────────┐
│ compact workspace / RF / result status / action                │
├──────┬────────────────────┬────────────────────────────────────┤
│Plan  │ current tool       │                                    │
│Sim   │                    │             MAP                    │
│Analy │                    │                                    │
│Review│                    │                                    │
│      │ tool chooser floats over drawer edge when opened         │
└──────┴────────────────────┴────────────────────────────────────┘

390 px phone
┌──────────────────────────────────┐
│ A.T.O.M · Workspace · RF · State │
├──────────────────────────────────┤
│                                  │
│                MAP               │
│                                  │
├──────────────────────────────────┤
│ Current tool title          [×]  │
│ focused controls / action        │
├──────────────────────────────────┤
│ Plan       Simulate Analyze Review│
└──────────────────────────────────┘

On tap of a stage, the existing bottom-sheet footprint temporarily shows the
stage’s named tools. Selecting one returns to its focused tool sheet. This is
not page routing and must preserve map inspection and basic actions.
~~~

