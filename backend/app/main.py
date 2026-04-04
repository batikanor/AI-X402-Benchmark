from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPORTS_DIR = PROJECT_ROOT / "reports"
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "benchmark.config.json"

RUN_LOCK = threading.Lock()
RUN_IN_PROGRESS = False
IDEMPOTENCY_CACHE: dict[str, dict[str, Any]] = {}
IDEMPOTENCY_TTL_SECONDS = 15 * 60


def _timeout_seconds() -> int:
    raw = os.getenv("BENCH_RUN_TIMEOUT_SECONDS", "300")
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("BENCH_RUN_TIMEOUT_SECONDS must be an integer") from exc
    return max(30, min(value, 1800))


def _cors_origins() -> list[str]:
    default = "http://localhost:3000,http://127.0.0.1:3000"
    raw = os.getenv("CORS_ALLOW_ORIGINS", default)
    origins = [item.strip() for item in raw.split(",") if item.strip()]
    return origins or ["http://localhost:3000"]

def _cors_origin_regex() -> str:
    return os.getenv(
        "CORS_ALLOW_ORIGIN_REGEX",
        r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    )


app = FastAPI(title="x402Bench API", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RunRequest(BaseModel):
    strict: bool = Field(default=False)


class RunResponse(BaseModel):
    ok: bool
    returnCode: int
    stdout: str
    stderr: str
    runId: str | None
    durationMs: int


class HealthResponse(BaseModel):
    status: str
    runInProgress: bool
    timeoutSeconds: int


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


def _cache_get(key: str) -> RunResponse | None:
    now = time.time()
    stale_keys = [item for item, entry in IDEMPOTENCY_CACHE.items() if now - entry["ts"] > IDEMPOTENCY_TTL_SECONDS]
    for stale in stale_keys:
        IDEMPOTENCY_CACHE.pop(stale, None)

    cached = IDEMPOTENCY_CACHE.get(key)
    if cached is None:
        return None
    return RunResponse(**cached["payload"])


def _cache_put(key: str, response: RunResponse) -> None:
    IDEMPOTENCY_CACHE[key] = {
        "ts": time.time(),
        "payload": response.model_dump(),
    }


def _start_run_or_raise() -> None:
    global RUN_IN_PROGRESS
    with RUN_LOCK:
        if RUN_IN_PROGRESS:
            raise HTTPException(status_code=409, detail="A benchmark run is already in progress.")
        RUN_IN_PROGRESS = True


def _finish_run() -> None:
    global RUN_IN_PROGRESS
    with RUN_LOCK:
        RUN_IN_PROGRESS = False


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", runInProgress=RUN_IN_PROGRESS, timeoutSeconds=_timeout_seconds())


@app.get("/api/v1/alignment")
def alignment() -> dict[str, Any]:
    return {
        "principles": [
            "idempotent API operations for duplicate-safe execution",
            "bounded execution timeouts and explicit failure modes",
            "serialized benchmark runs to avoid race conditions",
            "structured, auditable benchmark artifacts",
        ],
        "references": [
            "https://docs.hedera.com/hedera/sdks-and-apis/hedera-api/basic-types/transactionid",
            "https://docs.hedera.com/hedera/core-concepts/mirror-nodes",
            "https://docs.chain.link/data-feeds/developer-responsibilities",
            "https://docs.chain.link/chainlink-automation/concepts/best-practice",
            "https://developers.ledger.com/docs/clear-signing/for-dapps/get-started",
            "https://developers.ledger.com/docs/clear-signing/for-wallets",
            "https://eips.ethereum.org/EIPS/eip-712",
            "https://eips.ethereum.org/EIPS/eip-7730",
        ],
    }


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
def run_benchmark(payload: RunRequest, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> RunResponse:
    if idempotency_key:
        cached = _cache_get(idempotency_key)
        if cached is not None:
            return cached

    _start_run_or_raise()
    started = time.perf_counter()
    try:
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

        try:
            process = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                text=True,
                capture_output=True,
                check=False,
                timeout=_timeout_seconds(),
            )
        except subprocess.TimeoutExpired as timeout_error:
            duration_ms = int((time.perf_counter() - started) * 1000)
            response = RunResponse(
                ok=False,
                returnCode=124,
                stdout=(timeout_error.stdout or "").strip() if isinstance(timeout_error.stdout, str) else "",
                stderr=f"benchmark timed out after {_timeout_seconds()} seconds",
                runId=None,
                durationMs=duration_ms,
            )
            if idempotency_key:
                _cache_put(idempotency_key, response)
            return response

        latest = _latest_report()
        run_id = latest.stem if latest else None
        duration_ms = int((time.perf_counter() - started) * 1000)

        response = RunResponse(
            ok=process.returncode == 0,
            returnCode=process.returncode,
            stdout=process.stdout.strip(),
            stderr=process.stderr.strip(),
            runId=run_id,
            durationMs=duration_ms,
        )
        if idempotency_key:
            _cache_put(idempotency_key, response)
        return response
    finally:
        _finish_run()
