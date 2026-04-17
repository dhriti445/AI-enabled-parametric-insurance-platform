import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { useTranslation } from '../lib/useTranslation';

export default function AdminPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [claimReviews, setClaimReviews] = useState([]);
  const [claimProvider, setClaimProvider] = useState({});
  const [allNotifications, setAllNotifications] = useState([]);
  const [activeSection, setActiveSection] = useState('overview');
  const [simulationCity, setSimulationCity] = useState('mumbai');
  const [simulationResult, setSimulationResult] = useState(null);
  const [actionMessage, setActionMessage] = useState('');

  const loadAll = async () => {
    const [overviewRes, claimsRes, notifsRes] = await Promise.all([
      api.get('/admin/overview'),
      api.get('/admin/claim-reviews'),
      api.get('/admin/notifications'),
    ]);
    setData(overviewRes.data);
    setClaimReviews(claimsRes.data.claims || []);
    setAllNotifications(notifsRes.data.notifications || []);
  };

  useEffect(() => {
    loadAll();
  }, []);

  if (!data) return <Layout title={t('adminTitle')} subtitle={t('adminSubtitle')} />;

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
      const { data: result } = await api.post(`/triggers/monitor/auto/${simulationCity}?force=true`);
      setSimulationResult(result);
      if (result.triggered) {
        setActionMessage(`Simulated disruption triggered: ${result.reason}. ${result.affected_workers} workers auto-processed.`);
      } else {
        setActionMessage(`Simulation ran for ${simulationCity} — no workers with active subscriptions found.`);
      }
      await loadAll();
    } catch (err) {
      setActionMessage(err.response?.data?.detail || 'Failed to run disruption simulation.');
    }
  };

  return (
    <Layout
      title={t('adminTitle')}
      subtitle={t('adminSubtitle')}
      maxWidthClass="max-w-[1500px]"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label={t('totalUsers')} value={data.metrics.total_users} />
        <Metric label={t('activeSubscriptions')} value={data.metrics.active_subscriptions} />
        <Metric label={t('totalPayouts')} value={`Rs.${Number(data.metrics.total_payouts).toFixed(2)}`} />
        <Metric label={t('lossRatio')} value={data.metrics.loss_ratio} />
        <Metric label={t('pendingReviews')} value={data.metrics.pending_claim_reviews} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={activeSection === 'overview' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveSection('overview')}
        >
          {t('overview')}
        </button>
        <button
          className={activeSection === 'simulation' ? 'btn-primary' : 'btn-secondary'}
          onClick={() => setActiveSection('simulation')}
        >
          {t('simulationLab')}
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
              <p className="font-heading text-lg font-bold text-brand-900">{t('fraudAnalytics')}</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                {data.fraud_analytics.length ? data.fraud_analytics.map((item, idx) => (
                  <li key={idx} className="rounded-lg bg-red-50 p-3">
                    {item.name} - Suspicion Score: {Number(item.fraud_score).toFixed(2)}
                  </li>
                )) : <li className="rounded-lg bg-slate-100 p-3">No suspicious claims currently flagged.</li>}
              </ul>
            </Card>

            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">All Platform Notifications</p>
              <p className="mt-1 text-xs text-slate-500">Activity across all workers — newest first.</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-700 max-h-72 overflow-y-auto pr-1">
                {allNotifications.length ? allNotifications.map((n) => {
                  const msg = n.message.toLowerCase();
                  const icon = msg.includes('approved') ? '✅' : msg.includes('rejected') ? '❌' : msg.includes('payout') || msg.includes('activated') ? '💰' : msg.includes('flagged') || msg.includes('pending') ? '🕐' : 'ℹ️';
                  return (
                    <li key={n.id} className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <span className="mr-1">{icon}</span>
                      <span className="font-semibold text-brand-800">{n.user_name}:</span>{' '}
                      <span>{n.message}</span>
                      <p className="mt-0.5 text-[10px] text-slate-400">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</p>
                    </li>
                  );
                }) : <li className="rounded-lg bg-slate-100 p-2">No notifications yet.</li>}
              </ul>
            </Card>

          </aside>

          <main className="space-y-6">
            <Card>
        <p className="font-heading text-lg font-bold text-brand-900">{t('aiOptimization')}</p>
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
        <p className="font-heading text-lg font-bold text-brand-900">{t('forecastTitle')}</p>
        <p className="mt-1 text-xs text-slate-500">{t('forecastDesc')}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Region</th>
                <th className="py-2">Workers</th>
                <th className="py-2">Total Claims</th>
                <th className="py-2">Predicted Next Week</th>
                <th className="py-2">Forecasted Disruptions</th>
                <th className="py-2">Recent Triggered</th>
                <th className="py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPredictions.length ? weeklyPredictions.map((row) => (
                <tr key={row.region} className="border-t border-slate-100">
                  <td className="py-2">{row.region}</td>
                  <td className="py-2">{row.workers}</td>
                  <td className="py-2 font-semibold text-slate-700">{row.total_claims ?? 0}</td>
                  <td className="py-2 font-semibold text-brand-900">{row.predicted_claims_next_week}</td>
                  <td className="py-2">{row.forecast_disruptions_next_week}</td>
                  <td className="py-2">{row.recent_triggered_events}</td>
                  <td className="py-2">{row.confidence}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={7}>No event history available yet for prediction.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
            </Card>

            <Card>
        <p className="font-heading text-lg font-bold text-brand-900">{t('claimReviewQueue')}</p>
        <p className="mt-1 text-xs text-slate-500">{t('claimReviewDesc')}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Claim</th>
                <th className="py-2">Worker</th>
                <th className="py-2">Loss</th>
                <th className="py-2">Condition Score</th>
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
                      <button className="btn-primary" onClick={() => reviewClaim(row.claim_id, 'approve')}>{t('approve')}</button>
                      <button className="btn-secondary" onClick={() => reviewClaim(row.claim_id, 'reject')}>{t('reject')}</button>
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
              <p className="text-xs uppercase tracking-wide text-slate-500">{t('simulationControl')}</p>
              <p className="mt-1 text-xs text-slate-500">{t('simulationMode')}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select className="input w-full" value={simulationCity} onChange={(e) => setSimulationCity(e.target.value)}>
                  <option value="mumbai">Mumbai</option>
                  <option value="chennai">Chennai</option>
                  <option value="kolkata">Kolkata</option>
                  <option value="delhi">Delhi</option>
                  <option value="bengaluru">Bengaluru</option>
                </select>
                <button className="btn-primary w-full" onClick={runSimulation}>
                  {t('triggerSimulation')}
                </button>
              </div>
            </Card>

            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">{t('whatThisDoes')}</p>
              <p className="mt-2 text-sm text-slate-600">{t('whatThisDoesDesc')}</p>
            </Card>

          </aside>

          <main className="space-y-6">
            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">{t('simulationOutput')}</p>
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
