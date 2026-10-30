# Contributing

Start with an existing [GitHub issue](https://github.com/Berk-Unsal/atom/issues), or use the repository's bug and feature issue forms to describe a reproducible problem. Issues are the public discussion route. Check the issue's priority, prerequisites and acceptance criteria before starting; see the [product roadmap](product-roadmap-post-audit.md) and [desktop roadmap](desktop-architecture-design-plan.md) for context, and the live issue for current status.

This is the maintained contribution guide. The root [CONTRIBUTING.md](https://github.com/Berk-Unsal/atom/blob/main/CONTRIBUTING.md) and [README](https://github.com/Berk-Unsal/atom/blob/main/README.md) point here. Repository-specific coding instructions are in [AGENTS.md](https://github.com/Berk-Unsal/atom/blob/main/AGENTS.md).

## Choose a small change

1. Identify the issue's observable outcome and the files responsible for it. Confirm that required evidence or upstream work is available.
2. Create a branch, for example `git switch -c fix/issue-82-contribution-guide`.
3. Reproduce a bug with a focused regression test, make the smallest coherent fix, and run the affected tests first.
4. Run the applicable full checks below, update documentation and add user-visible changes under **Unreleased** in [CHANGELOG.md](https://github.com/Berk-Unsal/atom/blob/main/CHANGELOG.md).
5. Open a PR using the repository template. Explain the impact, link the issue, list actual validation commands/results, and include screenshots for UI changes. Mention any unrun check and its reason.

For an initial contribution, prefer bounded documentation, pure helpers or a clearly scoped workflow repair. RF equations, observation semantics, dataset provenance, optimizer objectives, request budgets, portable-project contracts and desktop security need maintainer review. A synthetic test or a successful run does not establish measured RF accuracy. Read [modeling limits](modeling-limits.md) before proposing RF changes; external evidence gates remain in force.

## Repository map and ownership boundaries

| Location | Responsibility | Useful starting point |
| --- | --- | --- |
| `backend-go/` | Gin routes, validation, jobs, dataset runtime and HTTP contracts | `main.go`, `server_lifecycle.go` and their tests |
| `backend-go/raytracer/` | Deterministic RF, geometry, spatial index and optimization | Focused implementation and table-driven tests |
| `frontend-react/src/components/` | React UI and interaction | Component plus `*.test.jsx` |
| `frontend-react/src/hooks/` | Workspace state and workflow orchestration | Relevant hook and workflow tests |
| `frontend-react/src/utils/` | Pure helpers and `*.test.js` | `projectStore.js` and `projectFileReliability.test.js` for portable files |
| `core-lab-adapter/` | Optional 5G-only Core Lab adapter | Separate Go module and tests |
| `data-pipeline/` | Dataset manifest, LFS data, pack generation and QA | Validate a pack before changing data assumptions |
| `docs/` | Markdown sources, generated reference HTML, search index and validators | Edit the source and rebuild generated pages |
| `examples/` | Importable portable projects and public fixtures | Keep legacy input-only files compatible |
| `desktop/spike/` | Disposable qualification probes | Evidence for desktop gates, not a production shell |

Keep API input validation at routes and preserve cancellation contexts. Use `gofmt` for Go, exported PascalCase names where appropriate, PascalCase component filenames, `use`-prefixed hooks and camelCase helpers. Prefer focused modules and pure utilities to expanding `App.jsx`. Preserve deterministic ordering and the existing 4G/5G/6G availability contract.

## Get a complete checkout

Install Git and Git LFS before cloning. Docker Engine with Compose or Docker Desktop is sufficient to run the full app; source development also needs Node.js **24 or newer** and the Go version declared in [backend-go/go.mod](https://github.com/Berk-Unsal/atom/blob/main/backend-go/go.mod) and [core-lab-adapter/go.mod](https://github.com/Berk-Unsal/atom/blob/main/core-lab-adapter/go.mod). CI reads those module files. Documentation and data tooling use Python **3.12** in CI.

```bash
git lfs install
git clone https://github.com/Berk-Unsal/atom.git
cd atom
git lfs pull
```

The Ankara building GeoJSON is about 111 MiB. A small file starting with `version https://git-lfs.github.com/spec/v1` is a pointer, not a usable dataset. Fetch its LFS object before building or validating the pack. Do not regenerate the dataset to work around a missing LFS download.

### Run the full app with Docker

From the repository root:

```bash
docker compose up --build -d atom
curl --fail http://localhost:8080/readyz
docker compose logs -f atom
```

Wait for `/readyz` to return success, then open `http://localhost:8080`. Readiness covers dataset and frontend assets; `/healthz` only checks liveness. Use `docker compose down` from the root to stop the app. Internet access is needed for the initial build and online basemap tiles. The optional Core Lab profile is documented in [Download and Use](download.html#core-lab).

### Develop with Go and Vite

Run these in separate terminals, each starting at the repository root:

```bash
# Terminal 1: existing Go HTTP API
cd backend-go
go mod download
go run .
```

```bash
# Terminal 2: shared React frontend
cd frontend-react
npm ci
npm run dev
```

Open `http://localhost:5173`. Vite proxies API traffic to port 8080. Check `http://localhost:8080/healthz` and `http://localhost:8080/api/meta` for the API/dataset, and verify that Vite serves the UI. In this split workflow `/readyz` can report missing frontend assets until `npm run build` creates `frontend-react/dist`; it is the combined-server readiness check, not a prerequisite for Vite HMR. A dataset error still needs fixing. Stop a competing Compose instance before reusing port 8080.

Validate the public pack from `backend-go`:

```bash
go run ./cmd/validate-dataset ../data-pipeline
```

### Set up documentation and Python tools

From the repository root, use a Python 3.12 virtual environment. Install the hash-pinned documentation lock without source builds or dependency re-resolution:

```bash
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install --require-hashes --only-binary=:all: -r docs/requirements.txt
```

Install **Pandoc 3.10 exactly**, the version required by `docs/build-reference-pages.sh` and the documentation workflows. Confirm `pandoc --version` before building; a newer version can change committed HTML. The build script rejects another version.

Only data-pipeline work needs the separate scientific/geospatial Python environment:

```bash
python -m pip install --require-hashes --only-binary=:all: -r data-pipeline/Requirements.txt
```

Direct dependency inputs are in the matching `.in` files. For an intentional dependency update, use `uv==0.12.0` and the lock-generation command recorded at the top of the relevant lockfile; commit the input and lock together. Do not edit hashes by hand.

## Choose focused checks, then full validation

Run the narrow regression test while editing. These examples use real existing tests and files:

```bash
# From frontend-react: portable-project helpers
npm test -- src/utils/projectFileReliability.test.js

# From backend-go: HTTP server lifecycle
go test . -run TestServeHTTPServerDrainsInflightRequestOnShutdown -count=1

# From the repository root: documentation builder tests
python3 -m unittest discover -s docs -p 'build_reference_pages_test.py'
```

Use the appropriate rows before opening a PR. Commands in a row run in the stated directory; a UI bug needs an interaction regression and relevant responsive browser checks. Frontend tests use **Vitest** with React Testing Library; browser workflows use **Playwright**.

| Change surface | Directory | Full checks |
| --- | --- | --- |
| React/UI/helpers | `frontend-react` | `npm run lint`, `npm test`, `npm run build`, `npm run audit:security` |
| Browser workflows | `frontend-react` | `npx playwright install --with-deps chromium`, then `npm run test:e2e` |
| Go API/RF | `backend-go` | `go vet ./...`, `go test -race ./...`, `go run ./cmd/validate-dataset ../data-pipeline` |
| Core Lab | `core-lab-adapter` | `go vet ./...`, `go test -race ./...` |
| Go vulnerability checks | Each affected Go module | `go install golang.org/x/vuln/cmd/govulncheck@v1.6.0`, then `govulncheck ./...` (ensure Go's bin directory is on PATH) |
| Python data tooling | Repository root | Install the data lock, import `geopandas, numpy, osmnx, pandas, shapely`, then `python -m compileall -q -x '/\.venv/' data-pipeline` |
| Documentation | Repository root | Run the documentation commands below |
| Version/policy/dependency metadata | Repository root | Run the consistency commands below |

The default Playwright suite uses its configured local Vite server and mocked API workflows. Real-backend qualification is separate; see [frontend-react/playwright.config.js](https://github.com/Berk-Unsal/atom/blob/main/frontend-react/playwright.config.js) and the `ATOM_REAL_E2E` tests. Default browser tests do not establish real-pack RF parity or native desktop compatibility.

### Documentation checks

Edit Markdown sources rather than generated reference HTML. The build mapping is in [docs/build-reference-pages.sh](build-reference-pages.sh). From the root, with the documentation environment active and Pandoc 3.10 on PATH:

```bash
sh docs/build-reference-pages.sh
node --check docs/assets/docs.js
node --check docs/assets/docs-theme.js
python3 -m unittest discover -s docs -p '*_test.py'
python3 docs/validate_claims.py
python3 docs/validate_docs.py
```

Commit the changed generated HTML, `docs/search-index.json` and any generated theme asset alongside source changes. Rebuilding a second time should leave those outputs unchanged. Preview locally with `python3 -m http.server 9000 --directory docs` and open `http://localhost:9000`. Link/asset and strict OpenAPI validation run in `validate_docs.py`.

### Consistency checks

From the repository root:

```bash
python3 scripts/versioning.py check
python3 scripts/check_runtime_versions.py
python3 scripts/check_supply_chain.py
python3 scripts/check_workflow_action_pins.py
python3 -m unittest scripts/check_supply_chain_test.py scripts/check_workflow_action_pins_test.py
python3 scripts/generate_policy.py --check
python3 -m unittest scripts/generate_policy_test.py
```

[Quality CI](https://github.com/Berk-Unsal/atom/blob/main/.github/workflows/quality.yml) is the full source of required gates, including dependency review and production container/SBOM vulnerability scans. Use it to check current pins and additional checks for the changed surface. Passing a focused test alone does not replace the affected CI jobs.

## Pull requests and releases

Use concise imperative Conventional Commit-style subjects such as `fix: preserve per-cell network azimuths` or `docs: clarify model limits`. Keep a PR scoped to a reviewable outcome. Include a regression for every bug fix and describe any change to compatibility or scientific assumptions explicitly.

[VERSION](https://github.com/Berk-Unsal/atom/blob/main/VERSION) is canonical. Normal contributor PRs record user-visible changes under **Unreleased**; they do not edit `main.go` version strings or publish tags. Maintainers prepare a release through [scripts/versioning.py](https://github.com/Berk-Unsal/atom/blob/main/scripts/versioning.py), update the release metadata/changelog together, check consistency, and create the matching `vX.Y.Z` tag. CI then publishes the configured images and release notes. See [release.yml](https://github.com/Berk-Unsal/atom/blob/main/.github/workflows/release.yml) for the release workflow.

For questions, proposals and blockers, use [GitHub Issues](https://github.com/Berk-Unsal/atom/issues). Share only public-safe logs and fixtures; omit private route recordings, credentials and operator data.
