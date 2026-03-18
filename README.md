# AI Parametric Insurance Platform for Gig Workers

AI-powered full-stack platform for weekly income protection of delivery workers (Swiggy, Zomato, Amazon, etc.) against external disruptions such as heavy rain, high AQI, extreme heat, and curfew restrictions.

The implementation is a complete prototype covering the full parametric insurance lifecycle:

Register/Login -> AI risk profiling -> plan recommendation -> payment activation -> disruption monitoring -> auto/manual claims -> fraud screening -> payout simulation -> user/admin analytics.

## 1. Problem and System Goal

Gig workers are highly exposed to environmental and civic disruptions that can instantly reduce daily earnings. Traditional insurance claim cycles are slow and document-heavy.

This platform uses a parametric model where payouts are triggered by measurable events and system rules, reducing friction and enabling faster compensation.

## 2. Tech Stack and Why It Was Chosen

- Frontend: React + Tailwind CSS + Recharts
Reason: fast UI iteration, responsive dashboard patterns, and clean charting for worker/admin analytics.
- Backend: FastAPI (Python)
Reason: quick API development, typed request/response models, and clean service layering.
- Database: PostgreSQL (primary), SQLite fallback for local runs
Reason: SQL schema for relational insurance entities with easy local fallback.
- AI/ML: Scikit-learn + deterministic scoring logic
Reason: practical prototype approach combining interpretable risk rules with anomaly detection.
- Payments: Razorpay/Stripe simulated sandbox flow
Reason: realistic payout lifecycle without requiring real merchant account integration.

## 3. High-Level Architecture

### Frontend responsibilities

- Capture user registration/login and plan activation.
- Render worker dashboard metrics, claims, notifications, and suggestions.
- Render insurer admin analytics dashboard.
- Call backend APIs and maintain session in browser localStorage.

### Backend responsibilities

- Persist users, subscriptions, claims, disruptions, payouts, goals, notifications.
- Compute risk score and plan recommendation.
- Evaluate trigger conditions and auto-generate claims.
- Run fraud checks before payout.
- Produce worker/admin dashboard analytics.

### Data storage

- SQLAlchemy ORM models mapped to relational tables.
- `create_all` runs at startup to auto-create schema in configured DB.

## 4. Core Business Flow (Step by Step)

1. Worker registers with identity and location.
2. Backend computes risk score and risk tier.
3. Worker sees AI-recommended plan and activates weekly coverage.
4. Payment simulator returns successful transaction reference.
5. Trigger engine monitors disruption event inputs.
6. If disruption threshold is crossed, claims are auto-created for eligible subscribed workers in that location.
7. Fraud detector scores each claim.
8. Approved claims create payout records instantly.
9. Dashboard updates totals, claim history, and alerts.

## 5. Detailed Feature Implementation

### 5.1 Authentication and Role Assignment

Implemented in backend auth routes with simple role strategy:

- Register accepts name/email/phone/platform/location.
- Login accepts email or phone.
- Role assignment rule:
If email ends with `@insurer.com`, role is `admin`; otherwise role is `worker`.

Outcome:

- Worker users are redirected to subscription/dashboard flows.
- Admin users are redirected to insurer analytics panel.

### 5.2 AI Risk Profiling

Implemented in the risk service using normalized weighted factors:

- Rain factor from historical rainfall proxy.
- Flood factor from flood-zone proxy.
- AQI factor from pollution proxy.

Risk score formula:

score = 0.45 x rain_factor + 0.30 x flood_factor + 0.25 x aqi_factor

Risk tier mapping:

- score < 0.35 -> Low
- 0.35 to <0.65 -> Medium
- >= 0.65 -> High

Recommended premium mapping:

- Low -> Basic band
- Medium -> Standard band
- High -> Premium band

### 5.3 Plan Recommendation and Subscription Activation

Plan catalog is fixed in backend:

- Basic: Rs.20/week, Rs.400 coverage
- Standard: Rs.30/week, Rs.700 coverage
- Premium: Rs.40/week, Rs.1000 coverage

Activation logic:

- Existing active subscription is deactivated.
- New active subscription is created.
- Payment simulator returns reference and success status.
- Notification is created for activation.

### 5.4 Parametric Trigger Engine

Disruption event intake supports:

- rainfall_mm
- aqi
- temperature_c
- curfew_alert

Trigger conditions:

- rainfall_mm > 60
- aqi > 250
- temperature_c > 43
- curfew_alert is true

If any condition is true, event is marked triggered and reason text is stored.

### 5.5 Automatic Claims Processing

For each triggered event:

- System finds workers in matching location with active subscription.
- Estimated income loss is computed as min(coverage, 55% of coverage).
- Claim is auto-created with fraud score.
- Non-flagged claim automatically creates payout record.
- Notification is sent: disruption detected and payout processed.

### 5.6 Fraud Detection System

Hybrid implementation:

- Model: IsolationForest anomaly detector.
- Inputs: gps_mismatch, duplicate_claims, odd_claim_hour.
- Rule layer combines average signal intensity + anomaly bonus.
- Claims with fraud_score >= 0.65 are flagged.

Why hybrid:

- Pure ML with limited data can be unstable in prototype stage.
- Rules provide explainability and predictable behavior.

### 5.7 Manual Claim with Image Verification

Manual flow accepts:

- user_id
- estimated_income_loss
- image_filename

Image verification is mock but functional:

- Filename keyword heuristics represent simple classifier behavior.
- Returns accepted/rejected + confidence value.
- Fraud detector still runs for manual claims.
- Approved claims get payout simulation (Stripe sandbox label).

### 5.8 Smart Work Suggestion Engine

Weekly suggestion engine scores 7 days using:

- forecast weather risk (lower is better)
- demand trend (higher is better)

Day score:

day_score = (1 - risk) x 0.55 + demand x 0.45

Top 2 days are returned as best extra work days.

### 5.9 Goal Setting and Progress

Worker can set monthly income target.

Dashboard exposes:

- monthly target
- current progress
- remaining target amount
- suggested extra days (from smart suggestion engine)

### 5.10 Notification Pipeline

Notification records are created on:

- plan activation
- automatic payout events
- manual claim approval payout

Dashboard fetches latest notifications for quick worker visibility.

### 5.11 Admin Analytics Dashboard

Admin overview aggregates:

- total worker users
- active subscriptions
- total payouts
- loss ratio (total payout / total claimed)

Additional admin intelligence:

- fraud analytics list (high fraud-score users)
- risk-zone counts (Low/Medium/High)
- region-wise premium action recommendation based on average risk

## 6. Data Model (Main Entities)

- User: profile, location, risk score, risk tier, role.
- Subscription: plan, weekly price, weekly coverage, payment reference, active flag.
- DisruptionEvent: event metrics and trigger reason.
- Claim: estimated loss, status, fraud score, manual proof reference.
- Payout: amount, status, provider label, claim mapping.
- Goal: monthly target and progress.
- Notification: user-facing event messages.

Entity relationships are centered around `user_id` to connect subscriptions, claims, payouts, goals, and notifications.

## 7. API Surface (Feature Mapping)

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Subscription and Dashboard

- `GET /api/subscriptions/plans`
- `GET /api/subscriptions/recommendation/{user_id}`
- `POST /api/subscriptions/activate`
- `POST /api/subscriptions/goals`
- `GET /api/subscriptions/dashboard/{user_id}`

### Trigger and Auto-Claims

- `POST /api/triggers/monitor`

### Claims

- `GET /api/claims/user/{user_id}`
- `POST /api/claims/manual`

### Admin

- `GET /api/admin/overview`

Interactive docs: http://localhost:8000/docs

## 8. Frontend Pages and Their Behavior

### Login/Register page (`/`)

- Tabbed register/login UI.
- Register submits full profile.
- Login accepts email/phone.
- Role-based redirection (`/subscribe` for worker, `/admin` for admin).

### Subscription page (`/subscribe`)

- Displays available plans.
- Fetches AI recommendation for current user.
- Activates selected plan and simulates payment.
- Redirects to dashboard after success.

### Worker Dashboard (`/dashboard`)

- KPI cards and trend chart.
- Goal update form.
- Manual claim submission form.
- Disruption simulation action.
- Claims table and latest notifications.

### Admin Dashboard (`/admin`)

- Global platform KPIs.
- Fraud risk list.
- Risk-zone bar chart.
- Region-wise subscription optimization table.

## 9. Admin Login Clarification

Yes, admin login is implemented in current code.

Use either of these approaches:

1. Register a new user with email ending in `@insurer.com`.
2. Login with that same email or phone.

System behavior:

- Role is set to `admin` at registration time.
- Frontend redirects admin to `/admin` automatically.

## 10. Setup and Run

### Option A: PostgreSQL (recommended)

1. Start PostgreSQL:

```bash
docker compose up -d
```

2. Backend:

```bash
cd backend
copy .env.example .env
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

3. Frontend:

```bash
cd frontend
npm install
npm run dev
```

### Option B: SQLite fallback (when Docker is unavailable)

Create `backend/.env`:

```env
DATABASE_URL=sqlite:///./parametric.db
CORS_ORIGINS=["http://localhost:5173"]
```

Then run backend/frontend using same commands above.

## 11. URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

## 12. End-to-End Demo Checklist

1. Register worker account.
2. Confirm risk tier and recommendation.
3. Activate a weekly plan.
4. Trigger disruption from dashboard.
5. Verify claim and payout creation.
6. Submit manual claim with `flood-proof.jpg`.
7. Register admin account with `@insurer.com` email.
8. Open admin dashboard and review metrics.

## 13. Current Prototype Limits

- External weather/AQI/maps sources are mocked at logic level.
- Image verification is keyword/heuristic-based mock inference.
- Payment integration is simulated, not real gateway settlement.

Despite these limits, all modules are wired end-to-end with production-style architecture and can be upgraded to real integrations incrementally.
