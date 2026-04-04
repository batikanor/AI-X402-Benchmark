from __future__ import annotations

import json
import os
import re
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
LLM_RESULTS_DIR = PROJECT_ROOT / "llm_bench" / "results"
LLM_SUITE_PATH = PROJECT_ROOT / "llm_bench" / "suite.json"
LLM_SCRIPT_PATH = PROJECT_ROOT / "scripts" / "run_ollama_llm_benchmark.mjs"

MODEL_NAME_REGEX = re.compile(r"^[A-Za-z0-9._:/-]+$")

RUN_LOCK = threading.Lock()
RUN_IN_PROGRESS = False
LLM_RUN_LOCK = threading.Lock()
LLM_RUN_IN_PROGRESS = False

IDEMPOTENCY_CACHE: dict[str, dict[str, Any]] = {}
LLM_IDEMPOTENCY_CACHE: dict[str, dict[str, Any]] = {}
IDEMPOTENCY_TTL_SECONDS = 15 * 60


def _load_dotenv() -> None:
    env_path = PROJECT_ROOT / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        os.environ.setdefault(key, value.strip())


_load_dotenv()


def _timeout_seconds() -> int:
    raw = os.getenv("BENCH_RUN_TIMEOUT_SECONDS", "300")
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("BENCH_RUN_TIMEOUT_SECONDS must be an integer") from exc
    return max(30, min(value, 1800))


def _llm_timeout_seconds() -> int:
    raw = os.getenv("LLM_BENCH_RUN_TIMEOUT_SECONDS", "2400")
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("LLM_BENCH_RUN_TIMEOUT_SECONDS must be an integer") from exc
    return max(60, min(value, 7200))


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


app = FastAPI(title="x402Bench API", version="1.2.0")
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


class LlmRunRequest(BaseModel):
    models: list[str] = Field(min_length=2, max_length=6)
    runsPerTask: int = Field(default=1, ge=1, le=3)
    maxTokens: int = Field(default=1024, ge=64, le=4096)
    temperature: float = Field(default=0.1, ge=0, le=1)


class RunResponse(BaseModel):
    ok: bool
    returnCode: int
    stdout: str
    stderr: str
    runId: str | None
    durationMs: int


class HealthResponse(BaseModel):
    status: str
    workflowRunInProgress: bool
    llmRunInProgress: bool
    workflowTimeoutSeconds: int
    llmTimeoutSeconds: int


def _latest_report(directory: Path) -> Path | None:
    directory.mkdir(parents=True, exist_ok=True)
    candidates = [
        path
        for path in directory.glob("*.json")
        if path.name != ".gitkeep" and path.is_file()
    ]
    if not candidates:
        return None
    return max(candidates, key=lambda file_path: file_path.stat().st_mtime)


def _latest_workflow_report() -> Path | None:
    return _latest_report(REPORTS_DIR)


def _latest_llm_report() -> Path | None:
    return _latest_report(LLM_RESULTS_DIR)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_workflow_config() -> dict[str, Any]:
    if not DEFAULT_CONFIG.exists():
        return {}
    try:
        return _load_json(DEFAULT_CONFIG)
    except (json.JSONDecodeError, OSError):
        return {}


def _load_llm_suite() -> dict[str, Any]:
    if not LLM_SUITE_PATH.exists():
        return {}
    try:
        return _load_json(LLM_SUITE_PATH)
    except (json.JSONDecodeError, OSError):
        return {}


def _non_empty(value: str | None) -> bool:
    return bool(value and value.strip())


def _integration_status(config: dict[str, Any]) -> dict[str, Any]:
    integrations = config.get("integrations", {}) if isinstance(config, dict) else {}

    hedera_cfg = integrations.get("hedera", {}) if isinstance(integrations.get("hedera"), dict) else {}
    hedera_mode = str(hedera_cfg.get("mode") or os.getenv("HEDERA_MODE", "relay"))
    hedera_relay_url = str(hedera_cfg.get("relayUrl") or os.getenv("HEDERA_RELAY_URL", ""))
    hedera_configured = (
        _non_empty(os.getenv("HEDERA_OPERATOR_ID")) and _non_empty(os.getenv("HEDERA_OPERATOR_KEY"))
        if hedera_mode == "sdk"
        else _non_empty(hedera_relay_url)
    )

    chainlink_cfg = integrations.get("chainlink", {}) if isinstance(integrations.get("chainlink"), dict) else {}
    chainlink_mode = str(chainlink_cfg.get("mode") or os.getenv("CHAINLINK_MODE", "webhook"))
    chainlink_webhook = str(chainlink_cfg.get("webhookUrl") or os.getenv("CHAINLINK_WEBHOOK_URL", ""))
    chainlink_configured = True if chainlink_mode == "cli" else _non_empty(chainlink_webhook)

    ledger_cfg = integrations.get("ledger", {}) if isinstance(integrations.get("ledger"), dict) else {}
    ledger_mode = str(ledger_cfg.get("mode") or os.getenv("LEDGER_MODE", "external_approver"))
    ledger_approver = str(ledger_cfg.get("approverUrl") or os.getenv("LEDGER_APPROVER_URL", ""))
    ledger_configured = True if ledger_mode == "ledger_hw" else _non_empty(ledger_approver)

    service_probe_cfg = integrations.get("serviceProbe", {}) if isinstance(integrations.get("serviceProbe"), dict) else {}
    service_probe_url = str(service_probe_cfg.get("url") or os.getenv("SERVICE_PROBE_URL", ""))
    service_probe_configured = _non_empty(service_probe_url)

    parts = {
        "hedera": {
            "mode": hedera_mode,
            "configured": hedera_configured,
            "reason": "ready" if hedera_configured else ("set HEDERA_OPERATOR_ID/HEDERA_OPERATOR_KEY" if hedera_mode == "sdk" else "set HEDERA_RELAY_URL"),
        },
        "chainlink": {
            "mode": chainlink_mode,
            "configured": chainlink_configured,
            "reason": "ready" if chainlink_configured else ("cli mode selected" if chainlink_mode == "cli" else "set CHAINLINK_WEBHOOK_URL"),
        },
        "ledger": {
            "mode": ledger_mode,
            "configured": ledger_configured,
            "reason": "ready" if ledger_configured else ("ledger hardware mode selected" if ledger_mode == "ledger_hw" else "set LEDGER_APPROVER_URL"),
        },
        "serviceProbe": {
            "configured": service_probe_configured,
            "reason": "ready" if service_probe_configured else "set integrations.serviceProbe.url or SERVICE_PROBE_URL",
        },
    }
    parts["isFullyConfigured"] = bool(
        parts["hedera"]["configured"]
        and parts["chainlink"]["configured"]
        and parts["ledger"]["configured"]
        and parts["serviceProbe"]["configured"]
    )
    return parts


def _workflow_definition() -> dict[str, Any]:
    config = _load_workflow_config()
    suite = config.get("suite", {}) if isinstance(config.get("suite"), dict) else {}
    scenarios = config.get("scenarios", []) if isinstance(config.get("scenarios"), list) else []
    integration_status = _integration_status(config)

    return {
        "name": "Agentic payments workflow benchmark",
        "whatIsBenchmarked": "Policy gate, orchestration, settlement, and service probe reliability for payment scenarios.",
        "mocked": False,
        "suiteId": suite.get("id"),
        "suiteName": suite.get("name"),
        "scenarioCount": len(scenarios),
        "integrationStatus": integration_status,
        "statusNote": (
            "All integrations are configured; workflow run is non-mocked and integration-ready."
            if integration_status.get("isFullyConfigured")
            else "Some integrations are not configured. Run still executes but will fail fast where endpoints/keys are missing."
        ),
    }


def _llm_suite_tasks() -> list[dict[str, str]]:
    suite = _load_llm_suite()
    tasks = suite.get("tasks", []) if isinstance(suite.get("tasks"), list) else []
    return [
        {
            "id": str(task.get("id", "")),
            "name": str(task.get("name", "")),
        }
        for task in tasks
    ]


def _list_ollama_models() -> list[str]:
    try:
        process = subprocess.run(
            ["ollama", "list"],
            text=True,
            capture_output=True,
            check=False,
            timeout=15,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return []

    if process.returncode != 0:
        return []

    lines = [line.strip() for line in process.stdout.splitlines() if line.strip()]
    if len(lines) <= 1:
        return []

    models: list[str] = []
    for line in lines[1:]:
        parts = line.split()
        if parts:
            models.append(parts[0])

    seen: set[str] = set()
    unique: list[str] = []
    for model in models:
        if model not in seen:
            seen.add(model)
            unique.append(model)
    return unique


def _recommended_models(models: list[str]) -> list[str]:
    if not models:
        return []

    def score(model: str) -> int:
        lower = model.lower()
        if any(token in lower for token in ["embed", "llava", "vision"]):
            return -100

        value = 0
        if any(token in lower for token in ["instruct", "chat", "e4b", "it"]):
            value += 6
        if any(token in lower for token in ["gemma", "qwen", "mistral", "phi", "deepseek"]):
            value += 4

        size_match = re.search(r"(\d+)\s*b", lower)
        if size_match:
            size_b = int(size_match.group(1))
            if size_b <= 8:
                value += 6
            elif size_b <= 14:
                value += 3
            elif size_b >= 24:
                value -= 8

        return value

    ordered = sorted(models, key=lambda item: (score(item), item), reverse=True)
    filtered = [item for item in ordered if score(item) > -100]
    base = filtered if filtered else ordered
    return base[:3]


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
        "benchmarkDefinition": {
            "workflow": _workflow_definition(),
            "llm": {
                "name": "Local Ollama model benchmark",
                "whatIsBenchmarked": "Decision quality and latency across policy/triage prompts from llm_bench/suite.json.",
                "mocked": False,
            },
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


def _build_llm_dashboard_payload(report: dict[str, Any]) -> dict[str, Any]:
    models = _list_ollama_models()
    suite = _load_llm_suite()
    tasks = _llm_suite_tasks()

    if not report:
        return {
            "track": {
                "name": "Local Ollama model benchmark",
                "mocked": False,
                "runtime": "local_ollama",
                "suiteName": suite.get("name"),
                "suitePath": str(LLM_SUITE_PATH),
                "tasks": tasks,
            },
            "availableModels": models,
            "recommendedModels": _recommended_models(models),
            "latest": None,
            "models": [],
        }

    meta = report.get("meta", {})
    summary_rows = report.get("summary", {}).get("models", [])

    return {
        "track": {
            "name": "Local Ollama model benchmark",
            "mocked": False,
            "runtime": "local_ollama",
            "suiteName": meta.get("suiteName") or suite.get("name"),
            "suitePath": str(LLM_SUITE_PATH),
            "tasks": tasks,
        },
        "availableModels": models,
        "recommendedModels": _recommended_models(models),
        "latest": {
            "runId": meta.get("runId"),
            "startedAt": meta.get("startedAt"),
            "finishedAt": meta.get("finishedAt"),
            "taskCount": meta.get("taskCount", 0),
            "runsPerTask": meta.get("runsPerTask", 0),
            "models": meta.get("models", []),
        },
        "models": [
            {
                "model": row.get("model"),
                "avgLatencyMs": row.get("avgLatencyMs", 0),
                "p95LatencyMs": row.get("p95LatencyMs", 0),
                "avgCoveragePct": row.get("avgCoveragePct", 0),
                "successRatePct": row.get("successRatePct", 0),
            }
            for row in summary_rows
        ],
    }


def _cache_get(cache: dict[str, dict[str, Any]], key: str) -> RunResponse | None:
    now = time.time()
    stale_keys = [item for item, entry in cache.items() if now - entry["ts"] > IDEMPOTENCY_TTL_SECONDS]
    for stale in stale_keys:
        cache.pop(stale, None)

    cached = cache.get(key)
    if cached is None:
        return None
    return RunResponse(**cached["payload"])


def _cache_put(cache: dict[str, dict[str, Any]], key: str, response: RunResponse) -> None:
    cache[key] = {
        "ts": time.time(),
        "payload": response.model_dump(),
    }


def _start_run_or_raise() -> None:
    global RUN_IN_PROGRESS
    with RUN_LOCK:
        if RUN_IN_PROGRESS:
            raise HTTPException(status_code=409, detail="A workflow benchmark run is already in progress.")
        RUN_IN_PROGRESS = True


def _finish_run() -> None:
    global RUN_IN_PROGRESS
    with RUN_LOCK:
        RUN_IN_PROGRESS = False


def _start_llm_run_or_raise() -> None:
    global LLM_RUN_IN_PROGRESS
    with LLM_RUN_LOCK:
        if LLM_RUN_IN_PROGRESS:
            raise HTTPException(status_code=409, detail="An LLM benchmark run is already in progress.")
        LLM_RUN_IN_PROGRESS = True


def _finish_llm_run() -> None:
    global LLM_RUN_IN_PROGRESS
    with LLM_RUN_LOCK:
        LLM_RUN_IN_PROGRESS = False


def _extract_run_id_from_stdout(stdout: str) -> str | None:
    text = stdout.strip()
    if not text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None
    run_id = payload.get("runId")
    return str(run_id) if run_id else None


def _validate_models_or_raise(models: list[str], available_models: list[str]) -> list[str]:
    normalized = [item.strip() for item in models if item and item.strip()]
    unique: list[str] = []
    seen: set[str] = set()
    for model in normalized:
        if model in seen:
            continue
        seen.add(model)
        unique.append(model)

    if len(unique) < 2:
        raise HTTPException(status_code=422, detail="At least two models are required for comparison.")

    for model in unique:
        if not MODEL_NAME_REGEX.fullmatch(model):
            raise HTTPException(status_code=422, detail=f"Invalid model name: {model}")

    if available_models:
        missing = [model for model in unique if model not in available_models]
        if missing:
            raise HTTPException(status_code=422, detail=f"Models not found in local Ollama: {', '.join(missing)}")

    return unique


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        workflowRunInProgress=RUN_IN_PROGRESS,
        llmRunInProgress=LLM_RUN_IN_PROGRESS,
        workflowTimeoutSeconds=_timeout_seconds(),
        llmTimeoutSeconds=_llm_timeout_seconds(),
    )


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
    latest = _latest_workflow_report()
    if latest is None:
        raise HTTPException(status_code=404, detail="No benchmark report found. Run the benchmark first.")
    return _load_json(latest)


@app.get("/api/v1/dashboard")
def dashboard() -> dict[str, Any]:
    latest = _latest_workflow_report()
    if latest is None:
        return {
            "project": {
                "name": "x402Bench Agentic Payments",
                "tagline": "Benchmarking AI-agent payment reliability across Hedera, Chainlink, and Ledger policy gates.",
                "sponsors": ["Hedera", "Chainlink", "Ledger"],
            },
            "benchmarkDefinition": {
                "workflow": _workflow_definition(),
                "llm": {
                    "name": "Local Ollama model benchmark",
                    "whatIsBenchmarked": "Decision quality and latency across policy/triage prompts from llm_bench/suite.json.",
                    "mocked": False,
                },
            },
            "latest": None,
            "scenarios": [],
        }
    report = _load_json(latest)
    return _build_dashboard_payload(report)


@app.post("/api/v1/runs", response_model=RunResponse)
def run_benchmark(payload: RunRequest, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> RunResponse:
    if idempotency_key:
        cached = _cache_get(IDEMPOTENCY_CACHE, idempotency_key)
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
                _cache_put(IDEMPOTENCY_CACHE, idempotency_key, response)
            return response

        latest = _latest_workflow_report()
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
            _cache_put(IDEMPOTENCY_CACHE, idempotency_key, response)
        return response
    finally:
        _finish_run()


@app.get("/api/v1/llm/models")
def llm_models() -> dict[str, Any]:
    models = _list_ollama_models()
    return {
        "runtime": "local_ollama",
        "mocked": False,
        "models": models,
        "recommendedModels": _recommended_models(models),
    }


@app.get("/api/v1/llm/runs/latest")
def llm_latest_run() -> dict[str, Any]:
    latest = _latest_llm_report()
    if latest is None:
        raise HTTPException(status_code=404, detail="No LLM benchmark report found. Run the LLM benchmark first.")
    return _load_json(latest)


@app.get("/api/v1/llm/dashboard")
def llm_dashboard() -> dict[str, Any]:
    latest = _latest_llm_report()
    if latest is None:
        return _build_llm_dashboard_payload({})
    report = _load_json(latest)
    return _build_llm_dashboard_payload(report)


@app.post("/api/v1/llm/runs", response_model=RunResponse)
def run_llm_benchmark(payload: LlmRunRequest, idempotency_key: str | None = Header(default=None, alias="Idempotency-Key")) -> RunResponse:
    if idempotency_key:
        cached = _cache_get(LLM_IDEMPOTENCY_CACHE, idempotency_key)
        if cached is not None:
            return cached

    available_models = _list_ollama_models()
    models = _validate_models_or_raise(payload.models, available_models)

    _start_llm_run_or_raise()
    started = time.perf_counter()

    try:
        LLM_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        command = [
            "node",
            str(LLM_SCRIPT_PATH),
            "--suite",
            str(LLM_SUITE_PATH),
            "--outdir",
            str(LLM_RESULTS_DIR),
            "--models",
            ",".join(models),
            "--runs-per-task",
            str(payload.runsPerTask),
            "--max-tokens",
            str(payload.maxTokens),
            "--temperature",
            str(payload.temperature),
        ]

        try:
            process = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                text=True,
                capture_output=True,
                check=False,
                timeout=_llm_timeout_seconds(),
            )
        except subprocess.TimeoutExpired as timeout_error:
            duration_ms = int((time.perf_counter() - started) * 1000)
            response = RunResponse(
                ok=False,
                returnCode=124,
                stdout=(timeout_error.stdout or "").strip() if isinstance(timeout_error.stdout, str) else "",
                stderr=f"llm benchmark timed out after {_llm_timeout_seconds()} seconds",
                runId=None,
                durationMs=duration_ms,
            )
            if idempotency_key:
                _cache_put(LLM_IDEMPOTENCY_CACHE, idempotency_key, response)
            return response

        stdout = process.stdout.strip()
        run_id = _extract_run_id_from_stdout(stdout)
        if not run_id:
            latest = _latest_llm_report()
            run_id = latest.stem if latest else None

        duration_ms = int((time.perf_counter() - started) * 1000)
        response = RunResponse(
            ok=process.returncode == 0,
            returnCode=process.returncode,
            stdout=stdout,
            stderr=process.stderr.strip(),
            runId=run_id,
            durationMs=duration_ms,
        )
        if idempotency_key:
            _cache_put(LLM_IDEMPOTENCY_CACHE, idempotency_key, response)
        return response
    finally:
        _finish_llm_run()
