# InSureWell — AI-Enabled Parametric Insurance Platform

> *Zero-touch income protection for India's 50 million gig workers.*

---

## 🌧️ Inspiration

India has over **50 million gig workers** — delivery partners on Swiggy, Zomato, Amazon, and Flipkart — who lose income every time it rains, floods, or a curfew is declared. They have no safety net. Traditional insurance requires paperwork, agents, waiting periods, and proof that most workers can't provide.

We asked a simple question: **what if insurance paid you before you even filed a claim?**

Parametric insurance — where payouts are triggered by measurable events (rainfall > 60mm, AQI > 250, temperature > 43°C) rather than assessed losses — has existed in agriculture for decades. We wanted to bring it to the gig economy, powered by AI, and make it accessible to workers earning ₹300–₹800 a day.

The name **InSureWell** reflects our belief: insurance should work *for* you, not against you.

---

## 🧠 What We Built

InSureWell is a full-stack AI parametric insurance platform with:

- **Automatic disruption detection** using live weather APIs (Open-Meteo, AQI feeds)
- **CLIP-based image verification** — OpenAI's vision-language model reads uploaded proof photos to detect rain, fire, flood, or smoke
- **Hybrid fraud detection** — Isolation Forest anomaly model + disaster-specific rule engine
- **Dynamic pricing** — Random Forest regressor adjusts weekly premiums based on live weather, AQI, and user risk score
- **Auto-payout** — when CLIP confidence ≥ 90%, claims are approved and paid instantly via UPI/Razorpay/Stripe simulation
- **Multilingual UI** — English, Hindi, Tamil, Bengali, Telugu, Kannada
- **Plan-aware dashboard** — features and claim limits enforced per plan (Basic/Standard/Premium)
- **Insurer control tower** — full analytics, fraud monitoring, claim review queue, disruption simulation lab

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)              │
│  Landing Page · Worker Dashboard · Insurer Dashboard     │
│  Subscription Plans · Profile · Multilingual (6 langs)  │
└────────────────────────┬────────────────────────────────┘
                         │ REST API
┌────────────────────────▼────────────────────────────────┐
│                  Backend (FastAPI + Python)               │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ CLIP ViT-B32 │  │ IsolationFor │  │ RandomForest  │  │
│  │ Image Verif. │  │ Fraud Detect │  │ Dynamic Price │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Open-Meteo   │  │ Payment Sim  │  │ Risk Engine   │  │
│  │ Weather API  │  │ UPI/Razorpay │  │ GPS Haversine │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ SQLAlchemy ORM
┌────────────────────────▼────────────────────────────────┐
│              PostgreSQL (Docker)                         │
│  Users · Subscriptions · Claims · Payouts · Goals        │
└─────────────────────────────────────────────────────────┘
```

---

## 📐 The Math Behind It

### Risk Scoring

Each worker gets a risk score $r \in [0, 1]$ at registration, computed from city-level proxies:

$$r = \frac{w_1 \cdot \text{rainfall\_avg} + w_2 \cdot \text{flood\_zone} + w_3 \cdot \text{aqi\_avg}}{\text{normalization\_constant}}$$

where $w_1 = 0.4$, $w_2 = 0.35$, $w_3 = 0.25$. Workers in Mumbai/Chennai/Kolkata get higher base scores due to monsoon exposure.

### Dynamic Pricing

The weekly premium $P$ is adjusted by a Random Forest regressor trained on synthetic weather-risk data:

$$P = \max\left(10,\ P_{\text{base}} + \Delta_{\text{model}} - D_{\text{safe\_zone}}\right)$$

where $\Delta_{\text{model}}$ is the model's predicted delta based on:

$$\mathbf{x} = [\text{risk\_score},\ \text{rainfall\_mm},\ \text{aqi},\ \text{temp\_c},\ \text{wind\_kmph},\ \text{flood\_zone\_score}]$$

### Fraud Detection

The condition verification score combines a core signal score with a disaster-specific penalty:

$$S_{\text{fraud}} = \min\left(1.0,\ S_{\text{core}} + P_{\text{disaster}}\right)$$

$$S_{\text{core}} = \sum_{i} \mathbb{1}[\text{signal}_i] \cdot 0.12 + \text{anomaly\_bonus}$$

where signals include GPS mismatch, duplicate claims, odd filing hour, and weather mismatch. The anomaly bonus (0.15) only fires when the Isolation Forest flags the pattern **and** at least 2 signals are active — preventing false positives.

### GPS Verification (Haversine)

Worker location is verified against their registered city using the Haversine formula:

$$d = 2r \arcsin\left(\sqrt{\sin^2\!\left(\frac{\Delta\phi}{2}\right) + \cos\phi_1\cos\phi_2\sin^2\!\left(\frac{\Delta\lambda}{2}\right)}\right)$$

A claim is flagged for GPS mismatch if $d \geq 30\ \text{km}$.

### CLIP Zero-Shot Classification

OpenAI CLIP computes cosine similarity between image embedding $\mathbf{v}$ and text prompt embeddings $\{\mathbf{t}_i\}$:

$$P(\text{class}_k \mid \text{image}) = \frac{\sum_{i \in k} \exp(\mathbf{v} \cdot \mathbf{t}_i / \tau)}{\sum_j \exp(\mathbf{v} \cdot \mathbf{t}_j / \tau)}$$

We use 8 prompts per class (rain, fire, flood, smoke, clear) and aggregate probabilities. Claims with confidence $\geq 0.90$ on a disaster class are **auto-approved and paid instantly**.

---

## 🛠️ How We Built It

### Backend — FastAPI + Python

We chose FastAPI for its async support, automatic OpenAPI docs, and Pydantic validation. The backend is structured as:

- `routes_auth.py` — registration, login, profile management
- `routes_claims.py` — manual claim submission with CLIP verification
- `routes_subscription.py` — plan management, dynamic pricing, dashboard
- `routes_triggers.py` — disruption monitoring, auto-claim generation
- `routes_admin.py` — insurer analytics, claim review, simulation lab

### ML Models

| Model | Purpose | Library |
|-------|---------|---------|
| CLIP ViT-B/32 | Image disaster classification | `transformers` |
| Isolation Forest | Fraud anomaly detection | `scikit-learn` |
| Random Forest Regressor | Dynamic premium pricing | `scikit-learn` |
| Haversine formula | GPS location verification | Pure Python |

### Frontend — React + Vite + Tailwind

The frontend uses React 18 with React Router v6. Key design decisions:

- **Pre-fetched plan quotes** — all 3 plan prices fetched in parallel on page load, so plan selection is instant (no 2s delay)
- **Plan-aware claim form** — conditions and max amounts enforced per plan on the frontend before API call
- **Dark landing page** — inspired by modern SaaS design with radial gradients, grid overlay, glow orbs, and shimmer text
- **Multilingual** — custom `useTranslation` hook with `localStorage` persistence and `window.dispatchEvent` for cross-component re-renders

### Database — PostgreSQL + SQLAlchemy

Schema: `users → subscriptions → claims → payouts`, with `disruption_events` and `notifications` as supporting tables. All relationships use SQLAlchemy's `Mapped` typed ORM.

---

## 🚧 Challenges We Faced

### 1. CLIP on Python 3.14

The pinned `scikit-learn==1.7.1` and `psycopg2-binary==2.9.10` had no wheels for Python 3.14. We had to install packages individually, upgrade psycopg2 to 2.9.11, and install scikit-learn from the latest compatible wheel. CLIP itself required `transformers` + `torch` which took ~300MB but worked cleanly once setuptools was installed first.

### 2. Fraud Score Always 80%+

The original fraud detector had three compounding bugs:
- `max(fraud_score, 1 - confidence)` forced every score to at least 0.5
- `anomaly_bonus = 0.35` fired for almost any input (IsolationForest trained on only 10 samples)
- Disaster penalty thresholds were too aggressive (rain claim penalised if live rainfall < 10mm — but it rains at 5mm too)

We rewrote the scoring: each binary signal adds 0.12 (max 0.48), anomaly bonus only fires with 2+ active signals, and disaster penalties only trigger on clear contradictions (image shows sunny weather but claiming flood).

### 3. Plan Selection Delay

Every time a user clicked a plan, a `useEffect` fired an API call to fetch the dynamic quote — causing a 2-second lag. Fixed by pre-fetching all 3 plan quotes in parallel on page load using `Promise.all`, storing them in a map, and switching instantly on click.

### 4. Language Switching Not Re-rendering

The `useTranslation` hook used `useCallback([], [])` to memoize `t()`, which meant the translation function never updated after a language change even though `setLang` triggered a re-render. Removing `useCallback` so `t` is a fresh function each render fixed it.

### 5. CORS and Port Conflicts

The frontend's `api.js` used `window.location.hostname` which resolved differently depending on browser — sometimes `localhost`, sometimes `127.0.0.1`. The backend CORS config only allowed `localhost:5173`. Fixed by hardcoding `127.0.0.1:8000` in `api.js` and adding both origins to CORS.

### 6. Best Days Always the Same

`suggest_extra_days` was called with hardcoded arrays `[0.5, 0.2, 0.7...]` every time, so it always returned the same two days regardless of the actual date. Fixed by anchoring to `datetime.utcnow().date()` and using day-of-week demand profiles + live weather API for today's risk score.

---

## 🚀 Running Locally

### Prerequisites
- Python 3.11+ (tested on 3.14)
- Node.js 18+
- Docker Desktop

### Backend

```bash
cd backend
python3 -m venv venv
venv/bin/pip install setuptools wheel
venv/bin/pip install psycopg2-binary
venv/bin/pip install -r requirements.txt
venv/bin/pip install torch transformers  # for CLIP
```

### Database

```bash
docker compose up -d
```

### Start Backend

```bash
cd backend
venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| Backend | FastAPI, Python 3.14, SQLAlchemy 2.0 |
| Database | PostgreSQL 16 (Docker) |
| ML | CLIP ViT-B/32, Isolation Forest, Random Forest |
| Weather | Open-Meteo API (free, no key required) |
| Payments | Mock gateway (UPI / Razorpay / Stripe simulation) |
| Auth | Session-based (localStorage) |
| Languages | English, Hindi, Tamil, Bengali, Telugu, Kannada |

---

## 👥 Team

Built at **DEVTrails 2026** — a 24-hour hackathon focused on AI for social impact.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
