# Backend - AI Parametric Insurance Platform

## Run locally

1. Create and activate virtual environment.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Copy env:

```bash
copy .env.example .env
```

4. Start API:

```bash
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs
