# x402Bench Backend API

FastAPI service that orchestrates benchmark runs and exposes dashboard-ready responses.

## Run

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

- `GET /health`
- `GET /api/v1/alignment`
- `GET /api/v1/dashboard`
- `GET /api/v1/runs/latest`
- `POST /api/v1/runs`

## Runtime environment

- `BENCH_RUN_TIMEOUT_SECONDS` (default `300`, clamped `30..1800`)
- `CORS_ALLOW_ORIGINS` (comma-separated origin allow list)

## Safety controls

- Single active benchmark run at a time
- `Idempotency-Key` request header support on `POST /api/v1/runs`
- Explicit timeout failure mode (`returnCode=124`)
