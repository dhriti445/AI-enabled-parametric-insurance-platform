import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { useTranslation } from '../lib/useTranslation';
import { getUser } from '../lib/session';

// Feature matrix per plan — shown as demo before payment and on dashboard
const PLAN_FEATURES = {
  Basic: {
    color: 'slate',
    badge: '🌱 Basic',
    coverage: 'Rs.400/week',
    coverageHours: '40 hrs/week',
    monitors: ['🌧️ Rainfall detection'],
    payoutSpeed: 'Standard (T+1)',
    manualClaims: true,
    autoClaims: false,
    priorityPayout: false,
    curfewCoverage: false,
    aqiMonitoring: false,
    tempMonitoring: false,
    windMonitoring: false,
  },
  Standard: {
    color: 'brand',
    badge: '⭐ Standard',
    coverage: 'Rs.700/week',
    coverageHours: '56 hrs/week',
    monitors: ['🌧️ Rainfall', '💨 AQI / Air Quality', '🌡️ Temperature'],
    payoutSpeed: 'Fast (T+0)',
    manualClaims: true,
    autoClaims: true,
    priorityPayout: false,
    curfewCoverage: false,
    aqiMonitoring: true,
    tempMonitoring: true,
    windMonitoring: false,
  },
  Premium: {
    color: 'orange',
    badge: '🏆 Premium',
    coverage: 'Rs.1000/week',
    coverageHours: '72 hrs/week',
    monitors: ['🌧️ Rainfall', '💨 AQI', '🌡️ Temperature', '🚫 Curfew alerts', '💨 Wind speed'],
    payoutSpeed: 'Priority Instant',
    manualClaims: true,
    autoClaims: true,
    priorityPayout: true,
    curfewCoverage: true,
    aqiMonitoring: true,
    tempMonitoring: true,
    windMonitoring: true,
  },
};

function PlanDemoBanner({ planName, quote }) {
  const [open, setOpen] = useState(false);
  const f = PLAN_FEATURES[planName];
  if (!f) return null;

  const featureRow = (label, enabled) => (
    <div key={label} className="flex items-center gap-2 text-sm">
      <span className={enabled ? 'text-emerald-600' : 'text-slate-300'}>{enabled ? '✓' : '✗'}</span>
      <span className={enabled ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
    </div>
  );

  return (
    <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
      <div className="flex items-center justify-between">
        <p className="font-heading text-sm font-bold text-brand-900">
          {f.badge} — What you get with this plan
        </p>
        <button
          className="text-xs text-brand-700 underline"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide details' : 'See full demo'}
        </button>
      </div>

      {/* Always visible summary */}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-brand-800">
        <span>💰 Coverage: <strong>{f.coverage}</strong></span>
        <span>⏱️ Hours: <strong>{f.coverageHours}</strong></span>
        <span>⚡ Payout: <strong>{f.payoutSpeed}</strong></span>
        {quote && <span>📊 Your price: <strong>Rs.{quote.adjusted_weekly_price}/wk</strong></span>}
      </div>

      {/* Expanded demo */}
      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Disruption Monitoring</p>
            <div className="space-y-1">
              {featureRow('Rainfall / Storm', true)}
              {featureRow('AQI / Air Quality', f.aqiMonitoring)}
              {featureRow('Extreme Temperature', f.tempMonitoring)}
              {featureRow('Curfew / Section 144', f.curfewCoverage)}
              {featureRow('High Wind Speed', f.windMonitoring)}
            </div>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Claim & Payout Features</p>
            <div className="space-y-1">
              {featureRow('Manual claim with image proof', f.manualClaims)}
              {featureRow('Auto-claim on disruption trigger', f.autoClaims)}
              {featureRow('Priority fast-track payout', f.priorityPayout)}
              {featureRow('AI fraud / condition verification', true)}
              {featureRow('GPS location verification', true)}
            </div>
          </div>
          <div className="rounded-xl bg-white p-3 shadow-sm sm:col-span-2">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">How Auto-Payout Works</p>
            <ol className="space-y-1 text-xs text-slate-600 list-decimal list-inside">
              <li>AI monitors live weather & AQI for your city every hour</li>
              <li>When thresholds are breached, a disruption event is triggered</li>
              <li>Your claim is auto-created and fraud-checked instantly</li>
              <li>Payout is sent via {f.payoutSpeed === 'Priority Instant' ? 'priority UPI/Razorpay within seconds' : 'UPI/Razorpay within minutes'}</li>
              <li>You receive a notification — no action needed from you</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubscriptionPage() {
  const user = getUser();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [plans, setPlans] = useState({});
  const [recommendation, setRecommendation] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('Standard');
  const [selectedProvider, setSelectedProvider] = useState('UPI');
  const [allQuotes, setAllQuotes] = useState({});
  const [status, setStatus] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get('/subscriptions/plans'),
      api.get(`/subscriptions/recommendation/${user.user_id}`),
    ]).then(async ([planRes, recRes]) => {
      const fetchedPlans = planRes.data.plans;
      setPlans(fetchedPlans);
      setRecommendation(recRes.data);

      const planNames = Object.keys(fetchedPlans);
      const quoteResults = await Promise.all(
        planNames.map((name) =>
          api.get(`/subscriptions/pricing-preview/${user.user_id}`, { params: { plan_name: name } })
            .then((r) => [name, r.data.quote])
            .catch(() => [name, null])
        )
      );
      setAllQuotes(Object.fromEntries(quoteResults));

      if (!isInitialized) {
        setSelectedPlan(recRes.data.recommended_plan);
        setIsInitialized(true);
      }
    });
  }, [user?.user_id]);

  const dynamicQuote = allQuotes[selectedPlan] || null;
  const planRows = useMemo(() => Object.entries(plans), [plans]);

  const activatePlan = async () => {
    if (!user) return;
    setStatus(t('processingPayment'));
    try {
      const { data } = await api.post('/subscriptions/activate', {
        user_id: user.user_id,
        plan_name: selectedPlan,
        provider: selectedProvider,
      });
      setStatus(`${data.payment_status} via ${data.provider} (${data.payment_reference})`);
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (err) {
      setStatus(err.response?.data?.detail || 'Activation failed');
    }
  };

  return (
    <Layout title={t('weeklyPlans')} subtitle={t('weeklyPlansSubtitle')}>
      <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 p-6">
        <h2 className="font-heading text-xl font-bold text-blue-900">About Our Platform</h2>
        <p className="mt-2 text-sm text-blue-800">
          AI Parametric Insurance Platform provides <strong>zero-touch automated payouts</strong> for gig workers, daily laborers, and seasonal workers affected by disruptions like heavy rainfall, poor air quality, extreme heat, curfew alerts, and high winds.
        </p>
        <p className="mt-2 text-sm text-blue-800">
          How it works: Register with your location, choose a protection plan, and our AI continuously monitors live weather and environmental data. <strong>When a disruption is detected, automatic payouts are triggered instantly</strong>—no manual claims, no waiting.
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="font-heading text-xl font-bold text-brand-900">{t('aiRecommendation')}</p>
          <p className="mt-2 text-sm text-slate-600">Risk Tier: {recommendation?.risk_tier || user?.risk_tier}</p>
          <p className="mt-1 text-sm text-slate-600">Risk Score: {recommendation?.risk_score || user?.risk_score}</p>
          <p className="mt-4 rounded-xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-900">
            Suggested Plan: {recommendation?.recommended_plan || 'Standard'}
          </p>
          <p className="mt-2 text-xs text-slate-500">{recommendation?.reason}</p>
        </Card>
        <Card>
          <p className="font-heading text-xl font-bold text-brand-900">Coverage Snapshot</p>
          <p className="mt-2 text-sm text-slate-700"><strong>{user?.name}</strong> • <strong>{user?.location}</strong> • <strong>{user?.risk_tier} Risk Zone</strong></p>
          <div className="mt-4 space-y-2">
            <p className="text-xs text-slate-600">📍 <strong>Location-based monitoring:</strong> Weather, air quality, temperature, curfews, and wind patterns specific to {user?.location}</p>
            <p className="text-xs text-slate-600">⚡ <strong>Automatic payouts:</strong> Funds transfer within minutes of disruption detection</p>
            <p className="text-xs text-slate-600">🛡️ <strong>Fraud detection:</strong> AI-powered image verification and claim validation</p>
          </div>
          <p className="mt-4 text-sm font-semibold text-accent-700">Select a plan below and activate protection today.</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {planRows.map(([name, plan]) => {
          const planDetails = {
            Basic: {
              description: 'For occasional workers seeking minimal protection',
              features: ['Weekly coverage up to Rs.400', 'Rainfall detection', 'No medical emergency cover'],
            },
            Standard: {
              description: 'Most popular for daily workers in high-risk zones',
              features: ['Weekly coverage up to Rs.700', 'Rainfall + AQI + Temperature monitoring', 'Automated payouts on disruption'],
            },
            Premium: {
              description: 'Maximum protection for gig workers and daily laborers',
              features: ['Weekly coverage up to Rs.1000', 'Full disruption monitoring', 'Priority fast-track payouts', 'Curfew alert coverage'],
            },
          };
          const details = planDetails[name];
          const quote = allQuotes[name];
          const isSelected = selectedPlan === name;
          return (
            <button
              key={name}
              type="button"
              className={`w-full rounded-2xl border-2 bg-white p-5 shadow-soft transition hover:-translate-y-1 focus:outline-none ${
                isSelected
                  ? 'border-brand-500 ring-2 ring-brand-500'
                  : 'border-slate-200 hover:border-brand-300'
              }`}
              onClick={() => setSelectedPlan(name)}
            >
              <p className="font-heading text-lg font-bold text-brand-900">{name} Plan</p>
              <p className="mt-1 text-xs text-slate-500">{details.description}</p>
              <p className="mt-3 text-2xl font-extrabold text-slate-900">
                Rs.{quote ? quote.adjusted_weekly_price : plan.weekly_price}
                <span className="text-sm font-medium text-slate-500">/week</span>
              </p>
              {quote && (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  Delta: Rs.{quote.price_delta} | Discount: Rs.{quote.safe_zone_discount}
                </p>
              )}
              <ul className="mt-3 space-y-1">
                {details.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-1 text-brand-600">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg bg-brand-50 p-3">
        <p className="text-sm font-semibold text-brand-900">Selected Plan: <span className="text-lg">{selectedPlan}</span></p>
        {dynamicQuote && (
          <p className="mt-1 text-sm text-brand-900">
            Dynamic Premium: <strong>Rs.{dynamicQuote.adjusted_weekly_price}/week</strong> | Coverage Hours: <strong>{dynamicQuote.final_coverage_hours}</strong> ({dynamicQuote.extra_coverage_hours >= 0 ? '+' : ''}{dynamicQuote.extra_coverage_hours} weather-based)
          </p>
        )}
      </div>

      {/* Pre-payment feature demo */}
      <PlanDemoBanner planName={selectedPlan} quote={dynamicQuote} />

      <div className="mt-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <select className="input w-full sm:w-56" value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
          <option value="UPI">UPI Simulator</option>
          <option value="Razorpay">Razorpay Test Mode</option>
          <option value="Stripe">Stripe Sandbox</option>
        </select>
        <button className="btn-primary" onClick={activatePlan}>{t('activateProtection')}</button>
        <span className="text-sm font-medium text-slate-600">{status}</span>
      </div>
    </Layout>
  );
}
