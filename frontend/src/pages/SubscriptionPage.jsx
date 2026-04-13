import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { getUser } from '../lib/session';

export default function SubscriptionPage() {
  const user = getUser();
  const navigate = useNavigate();
  const [plans, setPlans] = useState({});
  const [recommendation, setRecommendation] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState('Standard');
  const [selectedProvider, setSelectedProvider] = useState('UPI');
  const [dynamicQuote, setDynamicQuote] = useState(null);
  const [status, setStatus] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get('/subscriptions/plans'),
      api.get(`/subscriptions/recommendation/${user.user_id}`),
    ]).then(([planRes, recRes]) => {
      setPlans(planRes.data.plans);
      setRecommendation(recRes.data);
      setDynamicQuote(recRes.data.dynamic_pricing || null);
      if (!isInitialized) {
        setSelectedPlan(recRes.data.recommended_plan);
        setIsInitialized(true);
      }
    });
  }, [user?.user_id]);

  useEffect(() => {
    if (!user || !selectedPlan) return;
    api
      .get(`/subscriptions/pricing-preview/${user.user_id}`, {
        params: { plan_name: selectedPlan },
      })
      .then((res) => setDynamicQuote(res.data.quote))
      .catch(() => setDynamicQuote(null));
  }, [user?.user_id, selectedPlan]);

  const planRows = useMemo(() => Object.entries(plans), [plans]);

  const handlePlanSelect = (planName) => {
    console.log('Selecting plan:', planName);
    setSelectedPlan(planName);
  };

  const activatePlan = async () => {
    if (!user) return;
    setStatus('Processing payment...');
    try {
      const { data } = await api.post('/subscriptions/activate', {
        user_id: user.user_id,
        plan_name: selectedPlan,
        provider: selectedProvider,
      });
      setStatus(`${data.payment_status} via ${data.provider} (${data.payment_reference}) • ${data.dynamic_pricing.inputs.source}`);
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (err) {
      setStatus(err.response?.data?.detail || 'Activation failed');
    }
  };

  return (
    <Layout title="Weekly Protection Plans" subtitle="Choose your plan, activate weekly coverage, and stay protected from disruptions.">
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
          <p className="font-heading text-xl font-bold text-brand-900">AI Recommendation</p>
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
          return (
            <button
              key={name}
              type="button"
              className={`w-full rounded-2xl border-2 bg-white p-5 shadow-soft transition hover:-translate-y-1 focus:outline-none ${
                selectedPlan === name
                  ? 'border-brand-500 ring-2 ring-brand-500'
                  : 'border-slate-200 hover:border-brand-300'
              }`}
              onClick={() => handlePlanSelect(name)}
            >
              <p className="font-heading text-lg font-bold text-brand-900">{name} Plan</p>
              <p className="mt-1 text-xs text-slate-500">{details.description}</p>
              <p className="mt-3 text-2xl font-extrabold text-slate-900">
                Rs.{selectedPlan === name && dynamicQuote ? dynamicQuote.adjusted_weekly_price : plan.weekly_price}
                <span className="text-sm font-medium text-slate-500">/week</span>
              </p>
              {selectedPlan === name && dynamicQuote && (
                <p className="mt-1 text-xs font-semibold text-emerald-700">
                  Delta: Rs.{dynamicQuote.price_delta} | Safe zone discount: Rs.{dynamicQuote.safe_zone_discount}
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

      <div className="mt-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <select className="input w-full sm:w-56" value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
          <option value="UPI">UPI Simulator</option>
          <option value="Razorpay">Razorpay Test Mode</option>
          <option value="Stripe">Stripe Sandbox</option>
        </select>
        <button className="btn-primary" onClick={activatePlan}>Activate Weekly Protection</button>
        <span className="text-sm font-medium text-slate-600">{status}</span>
      </div>
    </Layout>
  );
}
