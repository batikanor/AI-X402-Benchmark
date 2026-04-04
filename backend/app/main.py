from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPORTS_DIR = PROJECT_ROOT / "reports"
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "benchmark.config.json"

app = FastAPI(title="x402Bench API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    strict: bool = False


class RunResponse(BaseModel):
    ok: bool
    returnCode: int
    stdout: str
    stderr: str
    runId: str | None


def _latest_report() -> Path | None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    candidates = [
        path
        for path in REPORTS_DIR.glob("*.json")
        if path.name != ".gitkeep" and path.is_file()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda file_path: file_path.stat().st_mtime)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _build_dashboard_payload(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("summary", {})
    scoring = report.get("scoring", {})
    metadata = report.get("metadata", {})
    scenarios = report.get("scenarios", [])

    failed = int(summary.get("failed", 0))
    successful = int(summary.get("successful", 0))
    total = int(summary.get("totalScenarios", 0))

    return {
        "project": {
            "name": "x402Bench Agentic Payments",
            "tagline": "Benchmarking AI-agent payment reliability across Hedera, Chainlink, and Ledger policy gates.",
            "sponsors": ["Hedera", "Chainlink", "Ledger"],
        },
        "latest": {
            "runId": metadata.get("runId"),
            "suite": metadata.get("suite"),
            "startedAt": metadata.get("startedAt"),
            "finishedAt": metadata.get("finishedAt"),
            "overallScore": scoring.get("overallScore", 0),
            "reliabilityScore": scoring.get("reliabilityScore", 0),
            "latencyScore": scoring.get("latencyScore", 0),
            "safetyScore": scoring.get("safetyScore", 0),
            "resilienceScore": scoring.get("resilienceScore", 0),
            "successful": successful,
            "failed": failed,
            "totalScenarios": total,
            "successRate": round((successful / total) * 100, 2) if total else 0,
            "failureRate": round(summary.get("failureRate", 0) * 100, 2),
            "retries": summary.get("retries", 0),
            "p95TotalMs": summary.get("latencyMs", {}).get("p95", {}).get("total", 0),
        },
        "scenarios": [
            {
                "id": item.get("id"),
                "name": item.get("name"),
                "status": item.get("status"),
                "durationMs": item.get("durationMs", {}).get("total", 0),
                "notes": item.get("notes", []),
            }
            for item in scenarios
        ],
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/runs/latest")
def latest_run() -> dict[str, Any]:
    latest = _latest_report()
    if latest is None:
        raise HTTPException(status_code=404, detail="No benchmark report found. Run the benchmark first.")
    return _load_json(latest)


@app.get("/api/v1/dashboard")
def dashboard() -> dict[str, Any]:
    latest = _latest_report()
    if latest is None:
        return {
            "project": {
                "name": "x402Bench Agentic Payments",
                "tagline": "Benchmarking AI-agent payment reliability across Hedera, Chainlink, and Ledger policy gates.",
                "sponsors": ["Hedera", "Chainlink", "Ledger"],
            },
            "latest": None,
            "scenarios": [],
        }
    report = _load_json(latest)
    return _build_dashboard_payload(report)


@app.post("/api/v1/runs", response_model=RunResponse)
def run_benchmark(payload: RunRequest) -> RunResponse:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    command = [
        "node",
        "src/cli.js",
        "run",
        "--config",
        str(DEFAULT_CONFIG),
        "--out",
        str(REPORTS_DIR),
    ]
    if payload.strict:
        command.append("--strict")

    process = subprocess.run(
        command,
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )

    latest = _latest_report()
    run_id = latest.stem if latest else None

    return RunResponse(
        ok=process.returncode == 0,
        returnCode=process.returncode,
        stdout=process.stdout.strip(),
        stderr=process.stderr.strip(),
        runId=run_id,
    )
