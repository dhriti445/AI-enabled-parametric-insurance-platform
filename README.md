# AI Parametric Insurance Platform for Gig Workers

Full-stack prototype with:
- Frontend: React + Tailwind CSS
- Backend: FastAPI (Python)
- Database: PostgreSQL
- AI/ML: risk scoring + anomaly-based fraud checks

## Features implemented

- Login/Register for workers and insurer admin
- Weekly subscription plans (Basic/Standard/Premium)
- AI risk profiling and dynamic plan recommendation
- Parametric disruption trigger monitoring (rainfall/AQI/temp/curfew)
- Automatic claim generation + fraud score checks
- Instant payout simulation (Razorpay/Stripe sandbox style)
- Worker dashboard with stats, goal tracking, and smart work suggestions
- Manual claim submission with AI image verification (mock)
- Admin dashboard with fraud analytics, loss ratio, zone classification, premium optimization
- Notification-style updates and disruption-trigger alerts

## Quick start

### 1) Start PostgreSQL

```bash
docker compose up -d
```

### 2) Start backend

```bash
cd backend
copy .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3) Start frontend

```bash
cd frontend
npm install
npm run dev
```

Open:
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs

## Demo flow

1. Register worker account at `/`
2. Select recommended plan at `/subscribe`
3. Enter dashboard at `/dashboard`
4. Click `Simulate Disruption` to trigger auto-claims and payouts
5. Submit manual claim with proof filename like `flood-proof.jpg`
6. Create admin account by registering email ending with `@insurer.com` and open `/admin`
