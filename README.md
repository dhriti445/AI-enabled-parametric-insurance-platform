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

## 14. Adversarial Defense and Anti-Spoofing Strategy

This section describes how the platform is designed to defend against coordinated GPS spoofing attacks where multiple workers attempt false disruption claims from safe locations.

### 14.1 The Differentiation: Genuine Stranding vs. Coordinated Spoofing

The system moves from single-signal verification to multi-signal trust scoring.

For each claim, a composite trust score is computed from four dimensions:

- Location Integrity Score
Compares claimed GPS with cell-tower region, IP geolocation bucket, and recent movement path continuity.
- Mobility Authenticity Score
Uses accelerometer/gyroscope motion fingerprints to confirm real travel behavior typical of delivery movement.
- Operational Consistency Score
Checks whether claim timing aligns with app open events, order lifecycle events, and historical delivery rhythm.
- Collective Anomaly Score
Detects whether many users in the same cluster are showing synchronized suspicious behavior.

Differentiation logic:

- Genuine stranded worker pattern:
High environmental trigger confidence, plausible movement history before disruption, and non-synchronized behavior with unrelated accounts.
- Spoofing actor pattern:
Low movement realism, inconsistent network-location evidence, repeated synthetic trajectories, and strong cluster correlation with other suspicious users.

### 14.2 The Data: Signals Beyond Basic GPS

To detect coordinated fraud rings, the platform should analyze the following data points in addition to latitude/longitude:

- Device and motion telemetry:
Accelerometer variance, gyroscope drift, heading changes, step/motion consistency, stationary spoof signatures.
- Trajectory physics checks:
Speed, acceleration, and impossible jumps between points (teleportation checks).
- Network-layer context:
Cell tower transitions, Wi-Fi SSID volatility, coarse IP geolocation consistency.
- Session and app integrity signals:
Foreground/background patterns, rooted/jailbroken device indicators, emulator signatures, mock-location flag indicators.
- Commerce and operations signals:
Order assignment timestamps, pickup/drop attempts, cancellations during disruption window, historical acceptance-completion behavior.
- Temporal pattern signals:
Claim bursts in short windows, repeated timing templates, suspicious hour clustering across many accounts.
- Graph and community signals:
Shared device fingerprints, repeated network overlap, social/cluster similarity across flagged claimants.
- External corroboration signals:
Weather severity confidence, hyperlocal disruption source confidence, municipal alert confidence.

Recommended feature families for modeling:

- Individual anomaly features (per worker)
- Cohort anomaly features (per location and time bucket)
- Ring-correlation features (graph centrality, shared-risk links)

### 14.3 Detection Pipeline (Implementation Blueprint)

Stage 1: Hard validity checks

- Reject impossible trajectories instantly.
- Reject claims from devices failing integrity baseline (high-confidence emulator/mock-location indicators).

Stage 2: Real-time risk scoring

- Run ensemble model combining gradient boosted fraud classifier + unsupervised anomaly score.
- Produce claim risk score from 0 to 1.

Stage 3: Ring detection

- Build hourly interaction graph from shared attributes (device/network/path/timing).
- Detect dense suspicious subgraphs and propagate risk score to linked claims.

Stage 4: Decision policy

- Low risk: Auto-approve.
- Medium risk: Hold for soft verification.
- High risk: Escalate to enhanced review and delayed payout.

### 14.4 UX Balance: Protect Honest Workers While Blocking Abuse

The system must avoid punishing honest workers who experience real connectivity drops during severe weather.

Balanced handling policy:

- Soft-hold window for uncertain claims:
Instead of immediate rejection, hold payout briefly and request lightweight corroboration.
- Progressive evidence requests:
Ask for minimal extra proof first (recent order timeline, in-app route trace), then only request stronger proof if risk remains high.
- Human-review only for high-impact edge cases:
Manual adjudication is used when model confidence is low and payout amount is significant.
- Explainable outcomes:
Show user-safe reason categories such as inconsistent movement trace or high cluster anomaly, without exposing anti-fraud internals.
- Appeals and recovery path:
Flagged workers can submit additional evidence and receive SLA-based re-evaluation.
- Reputation smoothing:
Single anomaly does not permanently penalize user trust. Trust score decays back to baseline with normal behavior.

### 14.5 Proposed Decision Thresholds

- 0.00 to 0.34: Approve automatically.
- 0.35 to 0.64: Conditional hold, request extra contextual proof, then auto-resolve.
- 0.65 to 1.00: Escalate to anti-fraud queue and defer payout execution.

Thresholds should be tuned weekly using false-positive and false-negative review outcomes.

### 14.6 Monitoring and Governance Metrics

To ensure anti-spoofing controls stay fair and effective, track:

- Fraud capture rate
- False positive rate
- Average claim decision latency
- Honest-worker appeal success rate
- Cluster attack detection lead time
- Payout leakage prevented

### 14.7 Integration Path with Current Prototype

This repository already has claim scoring and fraud status flow. The anti-spoofing upgrade can be phased without breaking existing APIs:

- Extend fraud feature vector to include motion, network, and session integrity features.
- Add ring-detection micro-batch job that enriches claim risk before final decision.
- Introduce claim status states: `SoftHold`, `EscalatedReview`, `Revalidated`.
- Add worker-facing appeal endpoint and admin triage queue view.

This creates a resilient, multi-layer defense that addresses large coordinated spoofing attacks while preserving fast payouts for legitimate workers.
