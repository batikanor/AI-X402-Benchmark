from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPORTS_DIR = PROJECT_ROOT / "reports"
DEFAULT_CONFIG = PROJECT_ROOT / "config" / "benchmark.config.json"
LLM_RESULTS_DIR = PROJECT_ROOT / "llm_bench" / "results"
LLM_SUITE_PATH = PROJECT_ROOT / "llm_bench" / "suite.json"
LLM_SCRIPT_PATH = PROJECT_ROOT / "scripts" / "run_ollama_llm_benchmark.mjs"
READINESS_RESULTS_DIR = PROJECT_ROOT / "readiness_bench" / "results"
READINESS_SCRIPT_PATH = PROJECT_ROOT / "scripts" / "run_llm_readiness_benchmark.mjs"
READINESS_SUITE_PATH = PROJECT_ROOT / "readiness_bench" / "suite.json"
READINESS_DEFAULT_DOCS_PACK_PATH = PROJECT_ROOT / "readiness_bench" / "docs_cache" / "default_docs_pack.json"

MODEL_NAME_REGEX = re.compile(r"^[A-Za-z0-9._:/-]+$")
ENV_NAME_REGEX = re.compile(r"^[A-Z_][A-Z0-9_]*$")
MODEL_PARAM_REGEX = re.compile(r"parameters\s+([0-9]+(?:\.[0-9]+)?)B", re.IGNORECASE)
NAME_PARAM_REGEX = re.compile(r"([0-9]+(?:\.[0-9]+)?)b", re.IGNORECASE)
DEFAULT_HOSTED_READINESS_MODELS = [
    "openai/gpt-5.4-mini",
    "openai/gpt-5.4-nano",
    "qwen/qwen3-8b",
    "qwen/qwen2.5-coder-7b-instruct",
    "meta-llama/llama-3.1-8b-instruct",
    "google/gemma-2-9b-it",
]

RUN_COND = threading.Condition()
RUN_IN_PROGRESS = False
LLM_RUN_COND = threading.Condition()
LLM_RUN_IN_PROGRESS = False
READINESS_RUN_COND = threading.Condition()
READINESS_RUN_IN_PROGRESS = False

IDEMPOTENCY_CACHE: dict[str, dict[str, Any]] = {}
LLM_IDEMPOTENCY_CACHE: dict[str, dict[str, Any]] = {}
READINESS_IDEMPOTENCY_CACHE: dict[str, dict[str, Any]] = {}
IDEMPOTENCY_TTL_SECONDS = 15 * 60
MODEL_PARAM_CACHE: dict[str, float | None] = {}


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


def _readiness_timeout_seconds() -> int:
    raw = os.getenv("READINESS_BENCH_RUN_TIMEOUT_SECONDS", "3600")
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("READINESS_BENCH_RUN_TIMEOUT_SECONDS must be an integer") from exc
    return max(120, min(value, 7200))


def _workflow_join_wait_seconds() -> int:
    raw = os.getenv("WORKFLOW_JOIN_WAIT_SECONDS", "").strip()
    if not raw:
        return _timeout_seconds() + 30
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("WORKFLOW_JOIN_WAIT_SECONDS must be an integer") from exc
    return max(10, min(value, 3600))


def _llm_join_wait_seconds() -> int:
    raw = os.getenv("LLM_JOIN_WAIT_SECONDS", "").strip()
    if not raw:
        return _llm_timeout_seconds() + 30
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("LLM_JOIN_WAIT_SECONDS must be an integer") from exc
    return max(30, min(value, 10800))


def _readiness_join_wait_seconds() -> int:
    raw = os.getenv("READINESS_JOIN_WAIT_SECONDS", "").strip()
    if not raw:
        return _readiness_timeout_seconds() + 30
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError("READINESS_JOIN_WAIT_SECONDS must be an integer") from exc
    return max(60, min(value, 10800))


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
    models: list[str] = Field(min_length=2, max_length=8)
    runsPerTask: int = Field(default=1, ge=1, le=3)
    maxTokens: int = Field(default=1024, ge=64, le=4096)
    temperature: float = Field(default=0.1, ge=0, le=1)


class ReadinessRunRequest(BaseModel):
    models: list[str] = Field(min_length=2, max_length=8)
    runtime: str = Field(default="openai_compat")
    apiBaseUrl: str | None = Field(default=None, max_length=1024)
    apiKeyEnv: str = Field(default="OPENAI_API_KEY", max_length=64)
    docsPackPath: str | None = Field(default=None, max_length=2048)
    docsTopK: int = Field(default=0, ge=0, le=2000)
    requireCitations: bool = Field(default=False)
    runsPerScenario: int = Field(default=1, ge=1, le=3)
    maxTokens: int = Field(default=512, ge=64, le=4096)
    temperature: float = Field(default=0.1, ge=0, le=1)
    promptOverride: str | None = Field(default=None, max_length=20000)


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
    readinessRunInProgress: bool
    workflowTimeoutSeconds: int
    llmTimeoutSeconds: int
    readinessTimeoutSeconds: int


class ChainlinkWebhookRequest(BaseModel):
    runId: str
    scenarioId: str
    workflowInput: dict[str, Any] = Field(default_factory=dict)


class LedgerApproverRequest(BaseModel):
    runId: str
    scenarioId: str
    amountUsd: float
    challenge: str | None = None


class ServiceProbeRequest(BaseModel):
    runId: str
    scenarioId: str
    txHash: str | None = None
    workflowId: str | None = None


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


def _latest_readiness_report() -> Path | None:
    return _latest_report(READINESS_RESULTS_DIR)


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


def _load_readiness_suite() -> dict[str, Any]:
    if not READINESS_SUITE_PATH.exists():
        return {}
    try:
        return _load_json(READINESS_SUITE_PATH)
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
            "reason": "ready" if chainlink_configured else ("CRE CLI mode selected (set CHAINLINK_CLI_PATH/CHAINLINK_CRE_ACTION)" if chainlink_mode == "cli" else "set CHAINLINK_WEBHOOK_URL"),
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
        "name": "Payment workflow reliability benchmark",
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
    return base[:6]


def _parse_model_param_from_name(model: str) -> float | None:
    values = [float(item) for item in NAME_PARAM_REGEX.findall(model)]
    if not values:
        return None
    return max(values)


def _model_param_size_billions(model: str) -> float | None:
    if model in MODEL_PARAM_CACHE:
        return MODEL_PARAM_CACHE[model]

    value: float | None = None
    try:
        process = subprocess.run(
            ["ollama", "show", model],
            text=True,
            capture_output=True,
            check=False,
            timeout=12,
        )
        if process.returncode == 0:
            match = MODEL_PARAM_REGEX.search(process.stdout)
            if match:
                value = float(match.group(1))
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        value = None

    if value is None:
        value = _parse_model_param_from_name(model)

    MODEL_PARAM_CACHE[model] = value
    return value


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
            "name": "x402Bench Payment Reliability",
            "tagline": "Benchmarking payment workflow reliability across Hedera, Chainlink, and Ledger policy gates.",
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


def _readiness_definition(report: dict[str, Any] | None = None) -> dict[str, Any]:
    config = _load_workflow_config()
    readiness_suite = _load_readiness_suite()
    cases = readiness_suite.get("cases", []) if isinstance(readiness_suite.get("cases"), list) else []
    release = readiness_suite.get("release", {}) if isinstance(readiness_suite.get("release"), dict) else {}
    meta = report.get("meta", {}) if isinstance(report, dict) and isinstance(report.get("meta"), dict) else {}
    docs_meta = meta.get("docs", {}) if isinstance(meta.get("docs"), dict) else {}
    prompt_meta = meta.get("prompt", {}) if isinstance(meta.get("prompt"), dict) else {}
    default_docs_available = READINESS_DEFAULT_DOCS_PACK_PATH.exists()
    docs_modes_raw = docs_meta.get("modes")
    docs_modes = docs_modes_raw if isinstance(docs_modes_raw, list) else []
    docs_modes = [str(item) for item in docs_modes if str(item) in {"with_docs", "without_docs"}]
    if not docs_modes:
        docs_modes = ["with_docs", "without_docs"] if default_docs_available else ["without_docs"]
    integration_status = _integration_status(config)
    runtime_used = str(meta.get("runtime") or "openai_compat")

    return {
        "name": "LLM readiness for payment workflows",
        "whatIsBenchmarked": (
            "How accurately a model makes payment-policy decisions (allow/block, approval gate, risk level, and required controls), "
            "plus whether eligible scenarios complete real execution across Chainlink orchestration, Hedera settlement, and Ledger checks, "
            "measured both with official-doc context and without doc context."
        ),
        "mocked": False,
        "suiteName": readiness_suite.get("name", "x402Bench Readiness Suite"),
        "suiteVersion": readiness_suite.get("version", "1.0"),
        "suiteReleaseName": release.get("name"),
        "suiteReleaseVersion": release.get("version"),
        "suiteReleaseUpdatedAt": release.get("updatedAt"),
        "suitePath": str(READINESS_SUITE_PATH),
        "scenarioCount": len(cases),
        "runtimeUsed": runtime_used,
        "supportedRuntimes": ["openai_compat"],
        "docs": {
            "defaultPackAvailable": default_docs_available,
            "defaultPackPath": str(READINESS_DEFAULT_DOCS_PACK_PATH) if default_docs_available else None,
            "enabled": "with_docs" in docs_modes,
            "modes": docs_modes,
            "name": docs_meta.get("name"),
            "version": docs_meta.get("version"),
            "sourceCount": docs_meta.get("sourceCount", 0),
            "topK": docs_meta.get("topK", 0),
            "requireCitations": False,
        },
        "prompt": {
            "overrideEnabled": bool(prompt_meta.get("overrideEnabled", False)),
            "overridePreview": prompt_meta.get("overridePreview"),
        },
        "integrationStatus": integration_status,
        "statusNote": (
            "Local integration fallbacks are auto-wired for API-triggered runs. "
            "Set explicit sponsor endpoints for production-realistic validation."
            if integration_status.get("isFullyConfigured")
            else "Not all explicit integration URLs are configured. API-triggered runs auto-wire local integration endpoints."
        ),
    }


def _scenario_templates() -> list[dict[str, Any]]:
    readiness_suite = _load_readiness_suite()
    cases = readiness_suite.get("cases", []) if isinstance(readiness_suite.get("cases"), list) else []

    templates: list[dict[str, Any]] = []
    for case in cases:
        if not isinstance(case, dict):
            continue
        scenario = case.get("scenario", {}) if isinstance(case.get("scenario"), dict) else {}
        payment = scenario.get("payment", {}) if isinstance(scenario.get("payment"), dict) else {}
        expected = case.get("expected", {}) if isinstance(case.get("expected"), dict) else {}
        challenge_targets = case.get("challengeTargets", []) if isinstance(case.get("challengeTargets"), list) else []
        templates.append(
            {
                "id": str(case.get("id") or scenario.get("id") or ""),
                "name": str(case.get("name") or scenario.get("name") or ""),
                "executionMode": str(case.get("executionMode") or "real"),
                "payment": {
                    "amountUsd": float(payment.get("amountUsd", 0) or 0),
                    "amountHbar": float(payment.get("amountHbar", 0) or 0),
                    "recipientAccountId": str(payment.get("recipientAccountId") or ""),
                    "destinationCountry": str(payment.get("destinationCountry") or ""),
                },
                "workflowInput": scenario.get("workflowInput", {}),
                "retryPolicy": scenario.get("retryPolicy", {}),
                "context": case.get("context", {}),
                "expected": {
                    "decision": str(expected.get("decision") or ""),
                    "approvalRequired": expected.get("approvalRequired"),
                    "priority": str(expected.get("priority") or ""),
                    "riskLevel": str(expected.get("riskLevel") or ""),
                    "requiredControls": expected.get("requiredControls", []),
                },
                "requiredSources": case.get("requiredSources", []),
                "representativeRationale": str(case.get("representativeRationale") or ""),
                "challengeTargets": [
                    {
                        "sponsor": str(item.get("sponsor") or ""),
                        "challenge": str(item.get("challenge") or ""),
                    }
                    for item in challenge_targets
                    if isinstance(item, dict)
                ],
            }
        )
    return templates


def _normalize_doc_mode(value: Any) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in {"with_docs", "without_docs"} else "with_docs"


def _rows_with_params(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        model_name = str(row.get("model", ""))
        enriched.append(
            {
                **row,
                "paramsBillions": _model_param_size_billions(model_name),
            }
        )
    return enriched


def _build_model_comparisons(models_by_doc_mode: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    by_model: dict[str, dict[str, Any]] = {}
    for mode in ("with_docs", "without_docs"):
        for row in models_by_doc_mode.get(mode, []):
            model = str(row.get("model", ""))
            if not model:
                continue
            if model not in by_model:
                by_model[model] = {
                    "model": model,
                    "paramsBillions": row.get("paramsBillions"),
                    "withDocs": None,
                    "withoutDocs": None,
                    "deltaOverallScore": None,
                    "deltaDecisionAccuracyPct": None,
                    "deltaWorkflowSuccessRatePct": None,
                    "deltaDocsGroundingRatePct": None,
                }
            key = "withDocs" if mode == "with_docs" else "withoutDocs"
            by_model[model][key] = row
            if by_model[model].get("paramsBillions") is None and row.get("paramsBillions") is not None:
                by_model[model]["paramsBillions"] = row.get("paramsBillions")

    comparisons = list(by_model.values())
    for entry in comparisons:
        with_docs = entry.get("withDocs")
        without_docs = entry.get("withoutDocs")
        if isinstance(with_docs, dict) and isinstance(without_docs, dict):
            entry["deltaOverallScore"] = round(
                float(with_docs.get("overallScore", 0)) - float(without_docs.get("overallScore", 0)),
                2,
            )
            entry["deltaDecisionAccuracyPct"] = round(
                float(with_docs.get("decisionAccuracyPct", 0)) - float(without_docs.get("decisionAccuracyPct", 0)),
                2,
            )
            entry["deltaWorkflowSuccessRatePct"] = round(
                float(with_docs.get("workflowSuccessRatePct", 0)) - float(without_docs.get("workflowSuccessRatePct", 0)),
                2,
            )
            entry["deltaDocsGroundingRatePct"] = round(
                float(with_docs.get("docsGroundingRatePct", 0)) - float(without_docs.get("docsGroundingRatePct", 0)),
                2,
            )

    def _comparison_sort_key(item: dict[str, Any]) -> tuple[float, float, str]:
        with_docs = item.get("withDocs") if isinstance(item.get("withDocs"), dict) else {}
        without_docs = item.get("withoutDocs") if isinstance(item.get("withoutDocs"), dict) else {}
        primary = float(with_docs.get("overallScore", without_docs.get("overallScore", -1)))
        secondary = float(with_docs.get("decisionAccuracyPct", without_docs.get("decisionAccuracyPct", -1)))
        model = str(item.get("model", ""))
        return (-primary, -secondary, model)

    return sorted(comparisons, key=_comparison_sort_key)


def _build_readiness_dashboard_payload(report: dict[str, Any]) -> dict[str, Any]:
    meta = report.get("meta", {}) if isinstance(report.get("meta"), dict) else {}
    latest_models_raw = meta.get("models") if isinstance(meta.get("models"), list) else []
    latest_models = [str(item).strip() for item in latest_models_raw if str(item).strip()]
    models = latest_models if latest_models else DEFAULT_HOSTED_READINESS_MODELS
    recommended_models = models[:]
    definition = _readiness_definition(report)
    templates = _scenario_templates()

    if not report:
        return {
            "project": {
                "name": "x402Bench LLM Readiness",
                "tagline": "One benchmark: model decision correctness plus real payment workflow execution.",
                "sponsors": ["Hedera", "Chainlink", "Ledger"],
            },
            "track": definition,
            "availableModels": models,
            "recommendedModels": recommended_models,
            "latest": None,
            "models": [],
            "modelsByDocMode": {
                "with_docs": [],
                "without_docs": [],
            },
            "modelComparisons": [],
            "results": [],
            "scenarios": templates,
        }

    summary = report.get("summary", {}) if isinstance(report.get("summary"), dict) else {}
    model_rows = summary.get("models", []) if isinstance(summary.get("models"), list) else []
    by_mode_raw = summary.get("byDocMode", {}) if isinstance(summary.get("byDocMode"), dict) else {}
    models_by_doc_mode: dict[str, list[dict[str, Any]]] = {"with_docs": [], "without_docs": []}
    for mode_key, rows in by_mode_raw.items():
        mode = _normalize_doc_mode(mode_key)
        if isinstance(rows, list):
            models_by_doc_mode[mode] = _rows_with_params(rows)
    if not models_by_doc_mode["with_docs"] and not models_by_doc_mode["without_docs"] and model_rows:
        fallback_mode = "with_docs" if bool(meta.get("docs", {}).get("enabled", True)) else "without_docs"
        models_by_doc_mode[fallback_mode] = _rows_with_params(model_rows)

    primary_model_rows = (
        models_by_doc_mode["with_docs"]
        or models_by_doc_mode["without_docs"]
        or _rows_with_params(model_rows)
    )

    raw_results = report.get("results", []) if isinstance(report.get("results"), list) else []

    trimmed_results = []
    for item in raw_results:
        if not isinstance(item, dict):
            continue
        llm = item.get("llm", {}) if isinstance(item.get("llm"), dict) else {}
        doc_mode = _normalize_doc_mode(
            item.get("docMode")
            or ("with_docs" if bool((item.get("docs") or {}).get("enabled")) else "without_docs")
        )
        trimmed_results.append(
            {
                "model": item.get("model"),
                "docMode": doc_mode,
                "caseId": item.get("caseId"),
                "caseName": item.get("caseName"),
                "executionMode": item.get("executionMode"),
                "scenarioId": item.get("scenarioId"),
                "scenarioName": item.get("scenarioName"),
                "attempt": item.get("attempt"),
                "expected": item.get("expected", {}),
                "llm": {
                    "parseOk": llm.get("parseOk"),
                    "decision": llm.get("decision"),
                    "approvalRequired": llm.get("approvalRequired"),
                    "priority": llm.get("priority"),
                    "riskLevel": llm.get("riskLevel"),
                    "requiredControls": llm.get("requiredControls", []),
                    "citations": llm.get("citations", []),
                    "reason": llm.get("reason"),
                    "latencyMs": llm.get("latencyMs", 0),
                    "error": llm.get("error"),
                    "rawOutputPreview": (str(llm.get("rawOutput", ""))[:400]).strip(),
                },
                "docs": item.get("docs", {}),
                "evaluation": item.get("evaluation", {}),
                "executionGateFailures": item.get("executionGateFailures", []),
                "workflow": item.get("workflow", {}),
                "totalLatencyMs": item.get("totalLatencyMs", 0),
            }
        )

    return {
        "project": {
            "name": "x402Bench LLM Readiness",
            "tagline": "One benchmark: model decision correctness plus real payment workflow execution.",
            "sponsors": ["Hedera", "Chainlink", "Ledger"],
        },
        "track": definition,
        "availableModels": models,
        "recommendedModels": recommended_models,
        "latest": {
            "runId": meta.get("runId"),
            "startedAt": meta.get("startedAt"),
            "finishedAt": meta.get("finishedAt"),
            "scenarioCount": meta.get("scenarioCount", meta.get("caseCount", 0)),
            "runsPerScenario": meta.get("runsPerScenario", 0),
            "runtime": meta.get("runtime", "openai_compat"),
            "suiteName": meta.get("suiteName", definition.get("suiteName")),
            "suiteVersion": meta.get("suiteVersion", definition.get("suiteVersion")),
            "models": meta.get("models", []),
            "docs": meta.get("docs", {}),
            "docsModes": definition.get("docs", {}).get("modes", ["with_docs"]),
            "totalEvaluations": summary.get("totalEvaluations", 0),
        },
        "models": primary_model_rows,
        "modelsByDocMode": models_by_doc_mode,
        "modelComparisons": _build_model_comparisons(models_by_doc_mode),
        "results": trimmed_results,
        "scenarios": templates,
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


def _start_run_or_join(timeout_seconds: int) -> str:
    global RUN_IN_PROGRESS
    with RUN_COND:
        if not RUN_IN_PROGRESS:
            RUN_IN_PROGRESS = True
            return "started"

        deadline = time.monotonic() + timeout_seconds
        while RUN_IN_PROGRESS:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return "timeout"
            RUN_COND.wait(timeout=remaining)

        return "joined"


def _finish_run() -> None:
    global RUN_IN_PROGRESS
    with RUN_COND:
        RUN_IN_PROGRESS = False
        RUN_COND.notify_all()


def _start_llm_run_or_join(timeout_seconds: int) -> str:
    global LLM_RUN_IN_PROGRESS
    with LLM_RUN_COND:
        if not LLM_RUN_IN_PROGRESS:
            LLM_RUN_IN_PROGRESS = True
            return "started"

        deadline = time.monotonic() + timeout_seconds
        while LLM_RUN_IN_PROGRESS:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return "timeout"
            LLM_RUN_COND.wait(timeout=remaining)

        return "joined"


def _finish_llm_run() -> None:
    global LLM_RUN_IN_PROGRESS
    with LLM_RUN_COND:
        LLM_RUN_IN_PROGRESS = False
        LLM_RUN_COND.notify_all()


def _start_readiness_run_or_join(timeout_seconds: int) -> str:
    global READINESS_RUN_IN_PROGRESS
    with READINESS_RUN_COND:
        if not READINESS_RUN_IN_PROGRESS:
            READINESS_RUN_IN_PROGRESS = True
            return "started"

        deadline = time.monotonic() + timeout_seconds
        while READINESS_RUN_IN_PROGRESS:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return "timeout"
            READINESS_RUN_COND.wait(timeout=remaining)

        return "joined"


def _finish_readiness_run() -> None:
    global READINESS_RUN_IN_PROGRESS
    with READINESS_RUN_COND:
        READINESS_RUN_IN_PROGRESS = False
        READINESS_RUN_COND.notify_all()


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


def _validate_models_or_raise(
    models: list[str],
    available_models: list[str],
    *,
    require_available: bool = True,
    source_label: str = "local Ollama",
) -> list[str]:
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

    if require_available and available_models:
        missing = [model for model in unique if model not in available_models]
        if missing:
            raise HTTPException(status_code=422, detail=f"Models not found in {source_label}: {', '.join(missing)}")

    return unique


def _self_base_url(request: Request) -> str:
    configured = os.getenv("X402BENCH_SELF_BASE_URL", "").strip()
    if configured:
        return configured.rstrip("/")
    return str(request.base_url).rstrip("/")


def _subprocess_env_with_local_integrations(request: Request) -> tuple[dict[str, str], str]:
    base_url = _self_base_url(request)
    env = dict(os.environ)
    env.setdefault("CHAINLINK_WEBHOOK_URL", f"{base_url}/api/v1/integrations/chainlink/webhook")
    env.setdefault("LEDGER_APPROVER_URL", f"{base_url}/api/v1/integrations/ledger/approver")
    env.setdefault("SERVICE_PROBE_URL", f"{base_url}/api/v1/integrations/service-probe")
    return env, base_url


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        workflowRunInProgress=RUN_IN_PROGRESS,
        llmRunInProgress=LLM_RUN_IN_PROGRESS,
        readinessRunInProgress=READINESS_RUN_IN_PROGRESS,
        workflowTimeoutSeconds=_timeout_seconds(),
        llmTimeoutSeconds=_llm_timeout_seconds(),
        readinessTimeoutSeconds=_readiness_timeout_seconds(),
    )


@app.post("/api/v1/integrations/chainlink/webhook")
def chainlink_webhook(payload: ChainlinkWebhookRequest) -> dict[str, Any]:
    priority = str(payload.workflowInput.get("priority", "standard")).lower()
    simulated_delay_ms = 120 if priority == "critical" else (90 if priority == "high" else 60)
    time.sleep(simulated_delay_ms / 1000)

    return {
        "workflowId": f"{payload.runId}-{payload.scenarioId}-wf",
        "status": "completed",
        "provider": "local-chainlink-webhook",
        "latencyMs": simulated_delay_ms,
        "receivedInput": payload.workflowInput,
    }


@app.post("/api/v1/integrations/ledger/approver")
def ledger_approver(payload: LedgerApproverRequest) -> dict[str, Any]:
    approval_id = f"ledger-approval-{payload.runId}-{payload.scenarioId}"
    return {
        "approved": True,
        "approvalId": approval_id,
        "approverRef": "local-ledger-policy-gate",
        "amountUsd": payload.amountUsd,
        "challenge": payload.challenge,
    }


@app.post("/api/v1/integrations/service-probe")
def service_probe(payload: ServiceProbeRequest) -> dict[str, Any]:
    if not payload.txHash or not payload.workflowId:
        raise HTTPException(status_code=400, detail="Missing txHash or workflowId")

    return {
        "status": "ok",
        "checkedAtEpochMs": int(time.time() * 1000),
        "runId": payload.runId,
        "scenarioId": payload.scenarioId,
        "txHash": payload.txHash,
        "workflowId": payload.workflowId,
        "provider": "local-x402-service-probe",
    }


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
                "name": "x402Bench Payment Reliability",
                "tagline": "Benchmarking payment workflow reliability across Hedera, Chainlink, and Ledger policy gates.",
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


@app.get("/api/v1/readiness/runs/latest")
def readiness_latest_run() -> dict[str, Any]:
    latest = _latest_readiness_report()
    if latest is None:
        raise HTTPException(status_code=404, detail="No readiness benchmark report found. Run the readiness benchmark first.")
    return _load_json(latest)


@app.get("/api/v1/readiness/dashboard")
def readiness_dashboard() -> dict[str, Any]:
    latest = _latest_readiness_report()
    if latest is None:
        return _build_readiness_dashboard_payload({})
    return _build_readiness_dashboard_payload(_load_json(latest))


@app.post("/api/v1/readiness/runs", response_model=RunResponse)
def run_readiness_benchmark(
    payload: ReadinessRunRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> RunResponse:
    if idempotency_key:
        cached = _cache_get(READINESS_IDEMPOTENCY_CACHE, idempotency_key)
        if cached is not None:
            return cached

    runtime = payload.runtime.strip().lower()
    if runtime != "openai_compat":
        raise HTTPException(status_code=422, detail="runtime must be openai_compat")

    api_key_env = payload.apiKeyEnv.strip().upper()
    if not ENV_NAME_REGEX.fullmatch(api_key_env):
        raise HTTPException(
            status_code=422,
            detail="apiKeyEnv must be a valid environment variable name (A-Z, 0-9, underscore).",
        )

    models = _validate_models_or_raise(
        payload.models,
        [],
        require_available=False,
        source_label="OpenAI-compatible provider",
    )
    if any(str(model).lower().startswith("ollama:") for model in models):
        raise HTTPException(
            status_code=422,
            detail="ollama:* model tags are disabled for readiness runs. Use hosted OpenAI-compatible model IDs.",
        )

    started = time.perf_counter()
    run_state = _start_readiness_run_or_join(_readiness_join_wait_seconds())
    if run_state == "timeout":
        duration_ms = int((time.perf_counter() - started) * 1000)
        latest = _latest_readiness_report()
        response = RunResponse(
            ok=False,
            returnCode=409,
            stdout="",
            stderr=(
                "A readiness benchmark run is already in progress. "
                "Please wait for the current run to finish, then refresh."
            ),
            runId=latest.stem if latest else None,
            durationMs=duration_ms,
        )
        if idempotency_key:
            _cache_put(READINESS_IDEMPOTENCY_CACHE, idempotency_key, response)
        return response

    if run_state == "joined":
        latest = _latest_readiness_report()
        duration_ms = int((time.perf_counter() - started) * 1000)
        response = RunResponse(
            ok=True,
            returnCode=0,
            stdout="Joined an in-progress readiness run and returned the latest completed result.",
            stderr="",
            runId=latest.stem if latest else None,
            durationMs=duration_ms,
        )
        if idempotency_key:
            _cache_put(READINESS_IDEMPOTENCY_CACHE, idempotency_key, response)
        return response

    try:
        READINESS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
        subprocess_env, base_url = _subprocess_env_with_local_integrations(request)
        subprocess_env["X402BENCH_LOG_LEVEL"] = os.getenv("X402BENCH_API_RUN_LOG_LEVEL", "warn")
        command = [
            "node",
            str(READINESS_SCRIPT_PATH),
            "--config",
            str(DEFAULT_CONFIG),
            "--suite",
            str(READINESS_SUITE_PATH),
            "--outdir",
            str(READINESS_RESULTS_DIR),
            "--models",
            ",".join(models),
            "--runtime",
            runtime,
            "--api-key-env",
            api_key_env,
            "--docs-top-k",
            str(payload.docsTopK),
            "--require-citations",
            "false",
            "--doc-modes",
            "with_docs,without_docs",
            "--runs-per-scenario",
            str(payload.runsPerScenario),
            "--max-tokens",
            str(payload.maxTokens),
            "--temperature",
            str(payload.temperature),
            "--integration-base-url",
            base_url,
        ]
        if payload.apiBaseUrl and payload.apiBaseUrl.strip():
            command.extend(["--api-base-url", payload.apiBaseUrl.strip()])
        if payload.docsPackPath and payload.docsPackPath.strip():
            command.extend(["--docs-pack", payload.docsPackPath.strip()])
        elif READINESS_DEFAULT_DOCS_PACK_PATH.exists():
            command.extend(["--docs-pack", str(READINESS_DEFAULT_DOCS_PACK_PATH)])
        if payload.promptOverride and payload.promptOverride.strip():
            command.extend(["--prompt-override", payload.promptOverride.strip()])

        try:
            process = subprocess.run(
                command,
                cwd=PROJECT_ROOT,
                env=subprocess_env,
                text=True,
                capture_output=True,
                check=False,
                timeout=_readiness_timeout_seconds(),
            )
        except subprocess.TimeoutExpired as timeout_error:
            duration_ms = int((time.perf_counter() - started) * 1000)
            response = RunResponse(
                ok=False,
                returnCode=124,
                stdout=(timeout_error.stdout or "").strip() if isinstance(timeout_error.stdout, str) else "",
                stderr=f"readiness benchmark timed out after {_readiness_timeout_seconds()} seconds",
                runId=None,
                durationMs=duration_ms,
            )
            if idempotency_key:
                _cache_put(READINESS_IDEMPOTENCY_CACHE, idempotency_key, response)
            return response

        stdout = process.stdout.strip()
        run_id = _extract_run_id_from_stdout(stdout)
        if not run_id and process.returncode == 0:
            latest = _latest_readiness_report()
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
            _cache_put(READINESS_IDEMPOTENCY_CACHE, idempotency_key, response)
        return response
    finally:
        _finish_readiness_run()


@app.post("/api/v1/runs", response_model=RunResponse)
def run_benchmark(
    payload: RunRequest,
    request: Request,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> RunResponse:
    if idempotency_key:
        cached = _cache_get(IDEMPOTENCY_CACHE, idempotency_key)
        if cached is not None:
            return cached

    started = time.perf_counter()
    run_state = _start_run_or_join(_workflow_join_wait_seconds())
    if run_state == "timeout":
        raise HTTPException(
            status_code=409,
            detail=f"A workflow benchmark run is already in progress and did not finish within {_workflow_join_wait_seconds()} seconds.",
        )
    if run_state == "joined":
        latest = _latest_workflow_report()
        duration_ms = int((time.perf_counter() - started) * 1000)
        response = RunResponse(
            ok=True,
            returnCode=0,
            stdout="Joined an in-progress workflow run and returned the latest completed result.",
            stderr="",
            runId=latest.stem if latest else None,
            durationMs=duration_ms,
        )
        if idempotency_key:
            _cache_put(IDEMPOTENCY_CACHE, idempotency_key, response)
        return response

    try:
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        subprocess_env, _ = _subprocess_env_with_local_integrations(request)
        subprocess_env["X402BENCH_LOG_LEVEL"] = os.getenv("X402BENCH_API_RUN_LOG_LEVEL", "warn")
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
                env=subprocess_env,
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

    started = time.perf_counter()
    run_state = _start_llm_run_or_join(_llm_join_wait_seconds())
    if run_state == "timeout":
        raise HTTPException(
            status_code=409,
            detail=f"An LLM benchmark run is already in progress and did not finish within {_llm_join_wait_seconds()} seconds.",
        )
    if run_state == "joined":
        latest = _latest_llm_report()
        duration_ms = int((time.perf_counter() - started) * 1000)
        response = RunResponse(
            ok=True,
            returnCode=0,
            stdout="Joined an in-progress LLM run and returned the latest completed result.",
            stderr="",
            runId=latest.stem if latest else None,
            durationMs=duration_ms,
        )
        if idempotency_key:
            _cache_put(LLM_IDEMPOTENCY_CACHE, idempotency_key, response)
        return response

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
