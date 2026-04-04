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
- `GET /api/v1/dashboard`
- `GET /api/v1/runs/latest`
- `POST /api/v1/runs`
