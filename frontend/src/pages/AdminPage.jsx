import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { clearUser } from '../lib/session';

export default function AdminPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [claimReviews, setClaimReviews] = useState([]);
  const [claimProvider, setClaimProvider] = useState({});
  const [activeSection, setActiveSection] = useState('overview');
  const [oneTimeSimulationAvailable, setOneTimeSimulationAvailable] = useState(
    () => window.localStorage.getItem('admin_one_time_simulation_used') !== '1'
  );
  const [simulationCity, setSimulationCity] = useState('mumbai');
  const [simulationResult, setSimulationResult] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  const loadAll = async () => {
    const [overviewRes, claimsRes] = await Promise.all([
      api.get('/admin/overview'),
      api.get('/admin/claim-reviews'),
    ]);
    setData(overviewRes.data);
    setClaimReviews(claimsRes.data.claims || []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (!data) return <Layout title="Insurer Admin Dashboard" subtitle="Loading analytics..." />;

  const zoneData = Object.entries(data.risk_zone_classification).map(([zone, count]) => ({ zone, count }));
  const weeklyPredictions = data.weekly_claim_predictions || [];

  const reviewClaim = async (claimId, action) => {
    const provider = claimProvider[claimId] || 'UPI';
    try {
      const { data: response } = await api.post(`/admin/claim-reviews/${claimId}/decision`, {
        action,
        provider,
      });

      if (response.payout) {
        setActionMessage(
          `Claim #${claimId} approved. Payout via ${response.payout.provider} (${response.payout.reference}).`
        );
      } else {
        setActionMessage(`Claim #${claimId} rejected.`);
      }
      await loadAll();
    } catch (err) {
      setActionMessage(err.response?.data?.detail || 'Failed to process claim review action.');
    }
  };

  const runSimulation = async () => {
    try {
      const useForcedSimulation = oneTimeSimulationAvailable;
      const endpoint = useForcedSimulation
        ? `/triggers/monitor/auto/${simulationCity}?force=true`
        : `/triggers/monitor/auto/${simulationCity}`;
      const { data: result } = await api.post(endpoint);
      setSimulationResult(result);
      if (useForcedSimulation) {
        window.localStorage.setItem('admin_one_time_simulation_used', '1');
        setOneTimeSimulationAvailable(false);
      }

      if (result.triggered) {
        setActionMessage(
          useForcedSimulation
            ? `One-time simulated disruption completed: ${result.reason}. Next checks will use real-time APIs.`
            : `Real-time check completed: ${result.reason}. ${result.affected_workers} workers affected.`
        );
      } else {
        setActionMessage(
          useForcedSimulation
            ? `One-time simulation completed with no disruption for ${simulationCity}. Next checks will use real-time APIs.`
            : `Real-time check completed: No disruption detected for ${simulationCity}.`
        );
      }
      await loadAll();
    } catch (err) {
      setActionMessage(err.response?.data?.detail || 'Failed to run disruption simulation.');
    }
  };

  return (
    <Layout
      title="Insurer Control Tower"
      subtitle="Monitor platform risk, fraud signals, payouts, and AI-driven pricing optimization."
      maxWidthClass="max-w-[1500px]"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Total Users" value={data.metrics.total_users} />
        <Metric label="Active Subscriptions" value={data.metrics.active_subscriptions} />
        <Metric label="Total Payouts" value={`Rs.${data.metrics.total_payouts}`} />
        <Metric label="Loss Ratio" value={data.metrics.loss_ratio} />
        <Metric label="Pending Claim Reviews" value={data.metrics.pending_claim_reviews} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={activeSection === 'overview' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveSection('overview')}
        >
          Overview
        </button>
        <button
          className={activeSection === 'simulation' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveSection('simulation')}
        >
          Simulation Lab
        </button>
      </div>

      {activeSection === 'overview' ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">Risk Zone Classification</p>
              <div className="mt-3 h-56">
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

            <button
              className="btn-secondary w-full"
              onClick={() => {
                clearUser();
                navigate('/');
              }}
            >
              Logout
            </button>
          </aside>

          <main className="space-y-6">
            <Card>
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

            <Card>
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

            <Card>
        <p className="font-heading text-lg font-bold text-brand-900">Manual Claim Review Queue</p>
        <p className="mt-1 text-xs text-slate-500">Fraud-risk image claims are queued here for insurer approval or rejection.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Claim</th>
                <th className="py-2">Worker</th>
                <th className="py-2">Loss</th>
                <th className="py-2">Fraud Score</th>
                <th className="py-2">Proof</th>
                <th className="py-2">Gateway</th>
                <th className="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {claimReviews.length ? claimReviews.map((row) => (
                <tr key={row.claim_id} className="border-t border-slate-100">
                  <td className="py-2">#{row.claim_id} ({row.status})</td>
                  <td className="py-2">{row.worker_name} ({row.worker_platform})</td>
                  <td className="py-2">Rs.{row.estimated_income_loss}</td>
                  <td className="py-2">{Number(row.fraud_score).toFixed(2)}</td>
                  <td className="py-2">
                    {row.proof_url ? (
                      <a className="text-brand-700 underline" href={`http://127.0.0.1:8000/${row.proof_url}`} target="_blank" rel="noreferrer">
                        View proof
                      </a>
                    ) : 'No file'}
                  </td>
                  <td className="py-2">
                    <select
                      className="input w-40"
                      value={claimProvider[row.claim_id] || 'UPI'}
                      onChange={(e) => setClaimProvider((prev) => ({ ...prev, [row.claim_id]: e.target.value }))}
                    >
                      <option value="UPI">UPI Simulator</option>
                      <option value="Razorpay">Razorpay Test Mode</option>
                      <option value="Stripe">Stripe Sandbox</option>
                    </select>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-2">
                      <button className="btn-primary" onClick={() => reviewClaim(row.claim_id, 'approve')}>Approve</button>
                      <button className="btn-secondary" onClick={() => reviewClaim(row.claim_id, 'reject')}>Reject</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>No claims pending insurer review.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
            </Card>

            {actionMessage && <p className="text-sm font-semibold text-brand-700">{actionMessage}</p>}
          </main>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">Simulation Control</p>
              <p className="mt-1 text-xs text-slate-500">
                Mode: {oneTimeSimulationAvailable ? 'One-time simulation (next run)' : 'Real-time APIs'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select className="input w-full" value={simulationCity} onChange={(e) => setSimulationCity(e.target.value)}>
                  <option value="mumbai">Mumbai</option>
                  <option value="chennai">Chennai</option>
                  <option value="kolkata">Kolkata</option>
                  <option value="delhi">Delhi</option>
                  <option value="bengaluru">Bengaluru</option>
                </select>
                <button className="btn-primary w-full" onClick={runSimulation}>
                  {oneTimeSimulationAvailable ? 'Trigger Fake Rainstorm (One-Time)' : 'Run Real-Time Trigger Check'}
                </button>
              </div>
            </Card>

            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">What This Does</p>
              <p className="mt-2 text-sm text-slate-600">
                Simulates an external city disruption, evaluates trigger signals, and auto-generates eligible worker claims with payout simulation.
              </p>
            </Card>

            <button
              className="btn-secondary w-full"
              onClick={() => {
                clearUser();
                navigate('/');
              }}
            >
              Logout
            </button>
          </aside>

          <main className="space-y-6">
            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">External Disruption Simulation Output</p>
              {simulationResult ? (
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><strong>Triggered:</strong> {String(simulationResult.triggered)}</p>
                  <p><strong>Reason:</strong> {simulationResult.reason}</p>
                  <p><strong>Data Source:</strong> {simulationResult.source}</p>
                  <p><strong>Affected Workers:</strong> {simulationResult.affected_workers}</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-slate-500">
                          <th className="py-2">Claim ID</th>
                          <th className="py-2">Worker ID</th>
                          <th className="py-2">Status</th>
                          <th className="py-2">Loss</th>
                          <th className="py-2">Payout</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(simulationResult.claims || []).map((item) => (
                          <tr key={item.claim_id} className="border-t border-slate-100">
                            <td className="py-2">#{item.claim_id}</td>
                            <td className="py-2">{item.worker_id}</td>
                            <td className="py-2">{item.status}</td>
                            <td className="py-2">Rs.{item.estimated_loss}</td>
                            <td className="py-2">{item.payout ? `${item.payout.provider} (${item.payout.reference})` : 'Not paid (flagged)'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">Run a fake rainstorm to show auto AI claims and payouts.</p>
              )}
            </Card>

            {actionMessage && <p className="text-sm font-semibold text-brand-700">{actionMessage}</p>}
          </main>
        </div>
      )}
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
