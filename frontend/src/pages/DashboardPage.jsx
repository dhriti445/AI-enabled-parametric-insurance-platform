import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { clearUser, getUser } from '../lib/session';

export default function DashboardPage() {
  const user = getUser();
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [claims, setClaims] = useState([]);
  const [goalInput, setGoalInput] = useState('25000');
  const [manualClaim, setManualClaim] = useState({ estimated_income_loss: 500, image_filename: 'flood-proof.jpg' });
  const [message, setMessage] = useState('');

  const loadData = async () => {
    if (!user) return;
    const [dashRes, claimRes] = await Promise.all([
      api.get(`/subscriptions/dashboard/${user.user_id}`),
      api.get(`/claims/user/${user.user_id}`),
    ]);
    setDashboard(dashRes.data);
    setClaims(claimRes.data.claims || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const chartData = useMemo(() => {
    const base = [
      { name: 'Mon', value: 220 },
      { name: 'Tue', value: 310 },
      { name: 'Wed', value: 280 },
      { name: 'Thu', value: 390 },
      { name: 'Fri', value: 460 },
      { name: 'Sat', value: 440 },
      { name: 'Sun', value: 510 },
    ];
    return base;
  }, []);

  const triggerMockEvent = async () => {
    const location = (dashboard?.user?.location || 'mumbai').toLowerCase();
    setMessage(`Checking automated disruption signals for ${location}...`);
    const { data } = await api.post(`/triggers/monitor/auto/${location}`);
    if (data.triggered) {
      setMessage(`${data.reason} detected via ${data.source}. Auto-claims created for eligible workers.`);
    } else {
      setMessage(`No severe disruption detected for ${location}. Source: ${data.source}.`);
    }
    await loadData();
  };

  const submitGoal = async () => {
    await api.post('/subscriptions/goals', {
      user_id: user.user_id,
      monthly_target: Number(goalInput),
    });
    setMessage('Monthly goal updated.');
    await loadData();
  };

  const submitManualClaim = async () => {
    const { data } = await api.post('/claims/manual', {
      user_id: user.user_id,
      estimated_income_loss: Number(manualClaim.estimated_income_loss),
      image_filename: manualClaim.image_filename,
    });
    setMessage(`Manual claim ${data.claim_status}.`);
    await loadData();
  };

  if (!dashboard) return <Layout title="Worker Dashboard" subtitle="Loading insights..." />;

  return (
    <Layout title="Worker Protection Dashboard" subtitle="Track protection, disruptions, payouts, and AI suggestions to boost your earnings.">
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Active Plan" value={dashboard.active_plan} />
        <Stat title="Coverage Status" value={dashboard.weekly_coverage_status} />
        <Stat title="Earnings Protected" value={`Rs.${dashboard.earnings_protected}`} />
        <Stat title="Total Payouts" value={`Rs.${dashboard.total_payouts_received}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <div className="flex items-center justify-between">
            <p className="font-heading text-lg font-bold text-brand-900">Protection Trend</p>
            <button className="btn-secondary" onClick={triggerMockEvent}>Run Auto Trigger Check</button>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1f8f86" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#1f8f86" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#d7e5e3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#11635d" fill="url(#grad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <p className="font-heading text-lg font-bold text-brand-900">Goal Tracker</p>
          <p className="mt-2 text-sm text-slate-700">Target: Rs.{dashboard.goal.monthly_target}</p>
          <p className="text-sm text-slate-700">Progress: Rs.{dashboard.goal.current_progress}</p>
          <p className="text-sm text-slate-700">Remaining: Rs.{dashboard.goal.remaining}</p>
          <input className="input mt-3" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="Set monthly goal" />
          <button className="btn-primary mt-3" onClick={submitGoal}>Update Goal</button>
          <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-900">{dashboard.work_suggestion}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="font-heading text-lg font-bold text-brand-900">Manual Claim + AI Image Verification</p>
          <div className="mt-3 grid gap-3">
            <input
              className="input"
              type="number"
              value={manualClaim.estimated_income_loss}
              onChange={(e) => setManualClaim({ ...manualClaim, estimated_income_loss: e.target.value })}
            />
            <input
              className="input"
              value={manualClaim.image_filename}
              onChange={(e) => setManualClaim({ ...manualClaim, image_filename: e.target.value })}
              placeholder="proof image filename"
            />
            <button className="btn-primary" onClick={submitManualClaim}>Submit Manual Claim</button>
          </div>
        </Card>

        <Card>
          <p className="font-heading text-lg font-bold text-brand-900">Recent Notifications</p>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {dashboard.latest_notifications.length ? dashboard.latest_notifications.map((note) => (
              <li key={note} className="rounded-lg bg-slate-100 p-2">{note}</li>
            )) : <li className="rounded-lg bg-slate-100 p-2">No notifications yet.</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-heading text-lg font-bold text-brand-900">Claims History</p>
          <button
            className="btn-secondary"
            onClick={() => {
              clearUser();
              navigate('/');
            }}
          >
            Logout
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-2">Claim ID</th>
                <th className="py-2">Loss</th>
                <th className="py-2">Status</th>
                <th className="py-2">Fraud Score</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="py-2">#{c.id}</td>
                  <td className="py-2">Rs.{c.estimated_income_loss}</td>
                  <td className="py-2">{c.status}</td>
                  <td className="py-2">{Number(c.fraud_score).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {message && <p className="mt-3 text-sm font-semibold text-brand-700">{message}</p>}
      </Card>
    </Layout>
  );
}

function Stat({ title, value }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 font-heading text-xl font-bold text-brand-900">{value}</p>
    </Card>
  );
}
