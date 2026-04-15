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
  const [manualClaim, setManualClaim] = useState({
    estimated_income_loss: 500,
    proof_file: null,
    worker_lat: '',
    worker_lon: '',
    payout_provider: 'UPI',
  });
  const [message, setMessage] = useState('');
  const [locationStatus, setLocationStatus] = useState('pending');

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
    setMessage(`Checking latest disruption status for ${location}...`);
    const { data } = await api.get(`/triggers/latest/${location}`);
    if (data.triggered) {
      setMessage(`${data.reason} detected. Source: ${data.source}. Event #${data.event_id}.`);
    } else {
      setMessage(`No active disruption found for ${location}. ${data.reason}.`);
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

  const cancelSubscription = async () => {
    if (!window.confirm('Are you sure you want to cancel your active subscription?')) return;

    try {
      const { data } = await api.post('/subscriptions/cancel', { user_id: user.user_id });
      setMessage(`${data.cancelled_plan} subscription cancelled successfully.`);
      await loadData();
    } catch (err) {
      setMessage(err.response?.data?.detail || 'Failed to cancel subscription.');
    }
  };

  const submitManualClaim = async () => {
    if (!manualClaim.proof_file) {
      setMessage('Please upload a proof file (image or video).');
      return;
    }
    
    const formData = new FormData();
    formData.append('user_id', user.user_id);
    formData.append('estimated_income_loss', Number(manualClaim.estimated_income_loss));
    formData.append('proof_file', manualClaim.proof_file);
    formData.append('payout_provider', manualClaim.payout_provider);
    if (manualClaim.worker_lat !== '') formData.append('worker_lat', Number(manualClaim.worker_lat));
    if (manualClaim.worker_lon !== '') formData.append('worker_lon', Number(manualClaim.worker_lon));

    try {
      const { data } = await api.post('/claims/manual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fraudReasonText = (data.fraud_reasons || []).length ? data.fraud_reasons.join(', ') : 'No suspicious signals.';
      const payoutText = data.payout ? `Payout: ${data.payout.gateway} (${data.payout.reference})` : 'No payout due to claim status.';
      setMessage(`Manual claim ${data.claim_status}. ${payoutText} Fraud notes: ${fraudReasonText}`);
      setManualClaim({
        estimated_income_loss: 500,
        proof_file: null,
        worker_lat: '',
        worker_lon: '',
        payout_provider: 'UPI',
      });
      setLocationStatus('pending');
      captureDeviceLocation(false);
      await loadData();
    } catch (err) {
      setMessage(`Error: ${err.response?.data?.detail || 'Claim submission failed'}`);
    }
  };

  const captureDeviceLocation = (showMessage = false) => {
    if (!navigator.geolocation) {
      setLocationStatus('not-supported');
      if (showMessage) setMessage('Geolocation is not supported. We will use image metadata or city profile.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationStatus('captured');
        setManualClaim((prev) => ({
          ...prev,
          worker_lat: String(position.coords.latitude),
          worker_lon: String(position.coords.longitude),
        }));
        if (showMessage) setMessage('Location captured automatically for claim verification.');
      },
      () => {
        setLocationStatus('denied');
        if (showMessage) setMessage('Location permission denied. We will use image metadata or city profile.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    captureDeviceLocation(false);
  }, []);

  const locationBadge = {
    pending: { text: 'Location: Detecting...', className: 'bg-amber-50 text-amber-700' },
    captured: { text: 'Location: Captured', className: 'bg-emerald-50 text-emerald-700' },
    denied: { text: 'Location: Permission denied', className: 'bg-red-50 text-red-700' },
    'not-supported': { text: 'Location: Not supported', className: 'bg-slate-100 text-slate-700' },
  }[locationStatus];

  if (!dashboard) return <Layout title="Worker Dashboard" subtitle="Loading insights..." />;

  return (
    <Layout
      title="Worker Protection Dashboard"
      subtitle="Track protection, disruptions, payouts, and AI suggestions to boost your earnings."
      maxWidthClass="max-w-[1500px]"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title="Active Plan" value={dashboard.active_plan} />
        <Stat title="Coverage Status" value={dashboard.weekly_coverage_status} />
        <Stat title="Earnings Protected" value={`Rs.${dashboard.earnings_protected}`} />
        <Stat title="Total Payouts" value={`Rs.${dashboard.total_payouts_received}`} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-lg font-bold text-brand-900">Plan Controls</p>
                <p className="text-sm text-slate-600">Change your plan or cancel and reactivate anytime.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => navigate('/subscribe')}>Change Plan</button>
                <button className="btn-secondary" onClick={cancelSubscription}>Cancel Subscription</button>
              </div>
            </div>
          </Card>

          <Card>
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
          </Card>
        </aside>

        <section className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <Card>
              <div className="flex items-center justify-between">
                <p className="font-heading text-lg font-bold text-brand-900">Protection Trend</p>
                <button className="btn-secondary" onClick={triggerMockEvent}>Check Latest Disruption</button>
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

          {message && (
            <Card>
              <p className="text-sm font-semibold text-brand-700">{message}</p>
            </Card>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
          <p className="font-heading text-lg font-bold text-brand-900">Manual Claim + AI Image Verification</p>
          <div className="mt-3 grid gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Loss Amount (Rs.)</label>
              <input
                className="input mt-1"
                type="number"
                value={manualClaim.estimated_income_loss}
                onChange={(e) => setManualClaim({ ...manualClaim, estimated_income_loss: e.target.value })}
                placeholder="e.g., 500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-600">Proof (JPG, PNG, or MP4)</label>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${locationBadge.className}`}>{locationBadge.text}</span>
              </div>
              <div className="mt-1 rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center transition hover:border-brand-400">
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.mp4"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setManualClaim({ ...manualClaim, proof_file: e.target.files[0] });
                      captureDeviceLocation();
                    }
                  }}
                  className="hidden"
                  id="proof-upload"
                />
                <label htmlFor="proof-upload" className="cursor-pointer">
                  <p className="text-sm font-semibold text-slate-700">
                    {manualClaim.proof_file ? (
                      <>
                        ✓ {manualClaim.proof_file.name}
                        <br />
                        <span className="text-xs text-slate-500">({(manualClaim.proof_file.size / 1024).toFixed(1)} KB)</span>
                      </>
                    ) : (
                      <>Click to upload</>
                    )}
                  </p>
                  {!manualClaim.proof_file && <p className="mt-1 text-xs text-slate-500">or drag and drop</p>}
                </label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">Auto Latitude</label>
                <p className="input mt-1 flex items-center">{manualClaim.worker_lat || 'Will auto-detect on upload'}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Auto Longitude</label>
                <p className="input mt-1 flex items-center">{manualClaim.worker_lon || 'Will auto-detect on upload'}</p>
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => captureDeviceLocation(true)}>Refresh Location</button>
            <div>
              <label className="text-xs font-semibold text-slate-600">Payout Gateway</label>
              <select
                className="input mt-1"
                value={manualClaim.payout_provider}
                onChange={(e) => setManualClaim({ ...manualClaim, payout_provider: e.target.value })}
              >
                <option value="UPI">UPI Simulator</option>
                <option value="Razorpay">Razorpay Test Mode</option>
                <option value="Stripe">Stripe Sandbox</option>
              </select>
            </div>
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
        </section>
      </div>
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
