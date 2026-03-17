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
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      api.get('/subscriptions/plans'),
      api.get(`/subscriptions/recommendation/${user.user_id}`),
    ]).then(([planRes, recRes]) => {
      setPlans(planRes.data.plans);
      setRecommendation(recRes.data);
      setSelectedPlan(recRes.data.recommended_plan);
    });
  }, [user]);

  const planRows = useMemo(() => Object.entries(plans), [plans]);

  const activatePlan = async () => {
    if (!user) return;
    setStatus('Processing payment...');
    try {
      const { data } = await api.post('/subscriptions/activate', {
        user_id: user.user_id,
        plan_name: selectedPlan,
        provider: 'Razorpay',
      });
      setStatus(`${data.payment_status} (${data.payment_reference})`);
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (err) {
      setStatus(err.response?.data?.detail || 'Activation failed');
    }
  };

  return (
    <Layout title="Weekly Protection Plans" subtitle="Choose your plan, activate weekly coverage, and stay protected from disruptions.">
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
          <p className="mt-2 text-sm text-slate-700">City: {user?.name ? user.name : 'Worker'} - {user?.risk_tier} Risk Zone</p>
          <p className="mt-1 text-sm text-slate-700">Weekly disruptions are monitored for rainfall, AQI, temperature, and curfew alerts.</p>
          <p className="mt-4 text-sm font-semibold text-accent-700">Click Activate Weekly Protection to start.</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {planRows.map(([name, plan]) => (
          <Card
            key={name}
            className={`cursor-pointer transition hover:-translate-y-1 ${selectedPlan === name ? 'ring-2 ring-brand-500' : ''}`}
            onClick={() => setSelectedPlan(name)}
          >
            <p className="font-heading text-lg font-bold text-brand-900">{name} Plan</p>
            <p className="mt-2 text-2xl font-extrabold text-slate-900">Rs.{plan.weekly_price}<span className="text-sm font-medium text-slate-500">/week</span></p>
            <p className="mt-2 text-sm text-slate-700">Coverage up to Rs.{plan.weekly_coverage}</p>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <button className="btn-primary" onClick={activatePlan}>Activate Weekly Protection</button>
        <span className="text-sm font-medium text-slate-600">{status}</span>
      </div>
    </Layout>
  );
}
