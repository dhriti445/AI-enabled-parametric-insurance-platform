import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { clearUser } from '../lib/session';

export default function AdminPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/admin/overview').then((res) => setData(res.data));
  }, []);

  if (!data) return <Layout title="Insurer Admin Dashboard" subtitle="Loading analytics..." />;

  const zoneData = Object.entries(data.risk_zone_classification).map(([zone, count]) => ({ zone, count }));
  const weeklyPredictions = data.weekly_claim_predictions || [];

  return (
    <Layout title="Insurer Control Tower" subtitle="Monitor platform risk, fraud signals, payouts, and AI-driven pricing optimization.">
      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Total Users" value={data.metrics.total_users} />
        <Metric label="Active Subscriptions" value={data.metrics.active_subscriptions} />
        <Metric label="Total Payouts" value={`Rs.${data.metrics.total_payouts}`} />
        <Metric label="Loss Ratio" value={data.metrics.loss_ratio} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="font-heading text-lg font-bold text-brand-900">Risk Zone Classification</p>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={zoneData}>
                <XAxis dataKey="zone" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1f8f86" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="font-heading text-lg font-bold text-brand-900">Fraud Analytics</p>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {data.fraud_analytics.length ? data.fraud_analytics.map((item, idx) => (
              <li key={idx} className="rounded-lg bg-red-50 p-3">
                {item.name} - Suspicion Score: {Number(item.fraud_score).toFixed(2)}
              </li>
            )) : <li className="rounded-lg bg-slate-100 p-3">No suspicious claims currently flagged.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <p className="font-heading text-lg font-bold text-brand-900">AI Subscription Optimization</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Region</th>
                <th className="py-2">Avg Risk</th>
                <th className="py-2">Workers</th>
                <th className="py-2">Premium Action</th>
              </tr>
            </thead>
            <tbody>
              {data.subscription_optimization.map((row) => (
                <tr key={row.region} className="border-t border-slate-100">
                  <td className="py-2">{row.region}</td>
                  <td className="py-2">{row.avg_risk}</td>
                  <td className="py-2">{row.workers}</td>
                  <td className="py-2">{row.recommended_premium_adjustment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <p className="font-heading text-lg font-bold text-brand-900">Next Week Disruption Claim Forecast</p>
        <p className="mt-1 text-xs text-slate-500">Predictive analytics based on recent triggered events and city-level worker density.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Region</th>
                <th className="py-2">Predicted Claims</th>
                <th className="py-2">Forecasted Disruptions</th>
                <th className="py-2">Recent Triggered Events</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPredictions.length ? weeklyPredictions.map((row) => (
                <tr key={row.region} className="border-t border-slate-100">
                  <td className="py-2">{row.region}</td>
                  <td className="py-2 font-semibold text-brand-900">{row.predicted_claims_next_week}</td>
                  <td className="py-2">{row.forecast_disruptions_next_week}</td>
                  <td className="py-2">{row.recent_triggered_events}</td>
                  <td className="py-2">{row.confidence}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5}>No event history available yet for prediction.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <button
        className="btn-secondary mt-6"
        onClick={() => {
          clearUser();
          navigate('/');
        }}
      >
        Logout
      </button>
    </Layout>
  );
}

function Metric({ label, value }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 font-heading text-2xl font-bold text-brand-900">{value}</p>
    </Card>
  );
}
