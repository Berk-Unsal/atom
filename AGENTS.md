# Repository Guidelines

## Project Structure & Module Organization

- `backend-go/`: Gin API, RF engines, spatial index, dataset runtime, and Go tests. Core RF code lives in `backend-go/raytracer/`.
- `core-lab-adapter/`: optional 5G Core Lab adapter.
- `frontend-react/`: React/Vite application. Components are in `src/components/`, workspace hooks in `src/hooks/`, and pure helpers plus tests in `src/utils/`.
- `data-pipeline/`: Ankara dataset pack, manifest, and generation scripts; large GeoJSON uses Git LFS.
- `docs/`: GitHub Pages documentation, OpenAPI contract, assets, and reference-page scripts.
- `examples/`: importable `.atom-project.json` sample projects.

## Build, Test, and Development Commands

Run commands from their directory:

```bash
cd frontend-react && npm run dev          # Vite UI at port 5173
cd frontend-react && npm run lint         # ESLint for source and browser tests
cd frontend-react && npm test             # Vitest unit/workflow suite
cd frontend-react && npm run build        # Production bundle
cd frontend-react && npm run test:e2e     # Playwright responsive workflows
cd backend-go && go vet ./... && go test -race ./...
cd core-lab-adapter && go vet ./... && go test -race ./...
cd backend-go && go run ./cmd/validate-dataset ../data-pipeline
docker compose up --build -d atom         # Full local app at localhost:8080
```

Build references with `sh docs/build-reference-pages.sh`, then run `python3 docs/validate_docs.py`. Check release metadata with `python3 scripts/versioning.py check`.

## Coding Style & Naming Conventions

Use `gofmt` for Go and the existing ESLint configuration for JavaScript/JSX. Go uses exported PascalCase types/functions and wrapped errors; React components use PascalCase filenames, hooks begin with `use`, and helpers use camelCase. Keep RF math deterministic, validate API inputs at routes, and preserve cancellation contexts. Prefer focused modules and pure utilities over expanding `App.jsx`.

## Testing Guidelines

Add a regression test with every bug fix. Use table-driven Go tests for validation and RF math; place React helper tests beside the helper as `*.test.js`, and interaction tests as `*.test.jsx`. Cover 4G/5G/6G availability, stale results, and deterministic ordering when relevant. Run the affected suite before full quality commands.

## Commit, Pull Request, and Release Guidelines

Use concise imperative Conventional Commit-style subjects, such as `fix: preserve per-cell network azimuths` or `docs: clarify model limits`. Keep commits scoped. PRs should explain impact, list validation commands, link an issue when available, and include screenshots for UI changes.

`VERSION` is canonical. Record user-visible changes under `Unreleased` in `CHANGELOG.md`; when releasing, update the version metadata and create the matching `vX.Y.Z` tag. CI validates consistency, publishes container images, and creates GitHub release notes.
