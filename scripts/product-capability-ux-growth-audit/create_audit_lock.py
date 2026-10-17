"""Create the immutable pre-report lock for the product capability/UX/growth audit.

Run once from the repository root: python3 scripts/product-capability-ux-growth-audit/create_audit_lock.py
Refuses to overwrite an existing lock.
"""
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
LOCK = OUT / "audit-lock.json"

SOURCES = [
    "AGENTS.md", "VERSION", "README.md", "PRODUCT.md", "CHANGELOG.md",
    "planning/product-compass.md", "planning/future_plans.md",
    "docs/features.md", "docs/getting-started.md", "docs/terminology.md", "docs/modeling-limits.md", "docs/project-format.md",
    "docs/doc-sources.json",
    "frontend-react/src/App.jsx", "frontend-react/src/components/WorkspaceChrome.jsx", "frontend-react/src/components/workspaceTools.js",
    "frontend-react/src/components/ControlPanel.jsx", "frontend-react/src/components/MapCanvas.jsx", "frontend-react/src/components/ScenarioPanel.jsx",
    "frontend-react/src/components/ApplySolutionDialog.jsx", "frontend-react/src/components/RunHistoryPanel.jsx", "frontend-react/src/components/InventoryPanel.jsx",
    "frontend-react/src/components/MeasurementValidationPanel.jsx", "frontend-react/src/features/reports/ReportFeature.jsx",
    "frontend-react/src/hooks/useReportWorkflow.js", "frontend-react/src/utils/reportArtifact.js", "frontend-react/src/utils/reportExport.js",
    "frontend-react/src/utils/rfRecoveryMessage.js", "frontend-react/src/styles.css",
]


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def sha(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def main():
    if LOCK.exists():
        raise SystemExit(f"{LOCK} already exists; the audit lock is immutable")
    image = subprocess.run(["docker", "image", "inspect", "atom:product-audit-d076397", "--format", "{{.Id}}"], capture_output=True, text=True).stdout.strip()
    lock = {
        "schema_version": 1,
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "objective": "A.T.O.M product capability, UX and growth audit; read-only, no implementation, no GitHub mutation",
        "capture_note": "Captured after browser evidence collection began and before any report file was written. Tracked files are unchanged; the only untracked path is this audit directory.",
        "baseline": {
            "status_short": git("status", "--short"),
            "branch": git("branch", "--show-current"),
            "head": git("rev-parse", "HEAD"),
            "tree": git("rev-parse", "HEAD^{tree}"),
            "log_1": git("log", "-1", "--oneline"),
            "version": (ROOT / "VERSION").read_text().strip(),
            "describe": git("describe", "--tags", "--always"),
            "tracked_diff_stat": git("diff", "--stat"),
            "remotes": git("remote", "-v"),
        },
        "audited_runtime": {
            "image": "atom:product-audit-d076397",
            "image_id": image,
            "built_from": "repository Dockerfile at HEAD",
            "url": "http://127.0.0.1:18090",
            "api_meta_application_version": "0.12.3",
            "api_meta_build_commit": "unknown",
            "env": "docker-compose.yml atom service defaults (RF 2/1 concurrency, 20/min, 60 s deadline)",
            "note": "The pre-existing atom-app container (serves 0.12.2) was left untouched.",
        },
        "github_snapshot": {
            "latest_release": "v0.12.3 (2026-10-16T06:36:14Z)",
            "open_issues": [76, 78, 79, 81, 82, 86, 87, 88, 89, 90],
            "recent_merged_prs": [96, 95, 94, 93, 92, 91],
            "observation": "#76 remains open although PR #96 (explain network scores and Pareto choices) merged 2026-10-17.",
        },
        "authoritative_sources_sha256": {path: sha(path) for path in SOURCES},
        "allowed_writes": [
            "docs/product-capability-ux-growth-audit.md",
            "docs/product-capability-ux-growth-audit.json",
            "docs/doc-sources.json (two catalog entries for the files above only)",
            "scripts/product-capability-ux-growth-audit/**",
        ],
        "forbidden": [
            "product feature implementation", "screen redesign", "RF code or scoring changes", "API or persistence changes",
            "VERSION or CHANGELOG changes", "GitHub issue/PR/release mutation",
        ],
    }
    LOCK.write_text(json.dumps(lock, indent=2) + "\n")
    digest = hashlib.sha256(LOCK.read_bytes()).hexdigest()
    (OUT / "audit-lock.sha256").write_text(f"{digest}  audit-lock.json\n")
    print(digest)


if __name__ == "__main__":
    main()
