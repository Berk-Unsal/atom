## Context

The A.T.O.M v0.12.2 roadmap/contribution audit rechecked this against released source at `0310bd8`. This is a bounded follow-up; existing scientific and operational limits remain in force.

## Problem

OpenAPI 3.1 is now strictly valid, but /readyz 200/503 and /api/processes/batch-experiment 200 declare descriptions only. Strict schema validity cannot validate these actual JSON bodies or provide typed integration contracts.

## Scope

Describe the existing readiness and batch-process discovery response bodies in OpenAPI and add response-contract fixtures using the existing handlers. Keep this bounded to the two operational discovery endpoints.

## Acceptance criteria

- [ ] /readyz success and failure schemas match status/buildings/towers/frontend/dataset_error, preserving sanitized dependency errors.
- [ ] Batch-process discovery schema describes id, version, job_control_options, dimensions and max_runs exactly as returned today.
- [ ] Contract tests accept real handler outputs and reject missing/wrong-type required values; strict OpenAPI and local reference validation still pass.
- [ ] No response/status behavior, RF budget or experiment limits change, and these schemas do not imply a new RF evidence class.

## Non-goals

No repeat repair of the five resolved malformed Response Objects, new endpoint, entire Core Lab schema expansion, RF equation or runtime behavior changes.

## Evidence / references

- [docs/openapi.yaml:L14](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/openapi.yaml#L14)
- [docs/openapi.yaml:L506](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/openapi.yaml#L506)
- [backend-go/main.go:L630](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/main.go#L630)
- [backend-go/experiment_jobs.go:L431](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/backend-go/experiment_jobs.go#L431)
- [docs/v0.12.1-claim-reconciliation.md:L85](../blob/0310bd8dea2e807ea57696a1bc5b3e11286db39e/docs/v0.12.1-claim-reconciliation.md#L85)

## Dependencies

None in this backlog.

## Contributor notes

Suitability: **contributor-friendly**. Rough effort: **S** (planning estimate, not a promise). Priority: **P2**.

Use docs/openapi.yaml, docs/validate_openapi_test.py, readiness tests in backend-go/interference_route_test.go and experiment_jobs_test.go. Follow existing schema-test conventions; no deep RF expertise is required.
