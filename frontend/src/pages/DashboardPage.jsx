import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { useTranslation } from '../lib/useTranslation';
import { clearUser, getUser } from '../lib/session';

export default function DashboardPage() {
  const user = getUser();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [dashboard, setDashboard] = useState(null);
  const [claims, setClaims] = useState([]);
  const [goalInput, setGoalInput] = useState('25000');
  const [manualClaim, setManualClaim] = useState({
    estimated_income_loss: 500,
    condition: 'unknown',
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
    formData.append('condition', manualClaim.condition);
    formData.append('proof_file', manualClaim.proof_file);
    formData.append('payout_provider', manualClaim.payout_provider);
    if (manualClaim.worker_lat !== '') formData.append('worker_lat', Number(manualClaim.worker_lat));
    if (manualClaim.worker_lon !== '') formData.append('worker_lon', Number(manualClaim.worker_lon));

    try {
      const { data } = await api.post('/claims/manual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const fraudReasonText = (data.fraud_reasons || []).length ? data.fraud_reasons.join(', ') : 'No suspicious signals.';
      const imgVerif = data.image_verification;
      const imgText = imgVerif ? `${imgVerif.disaster_type.toUpperCase()} detected (${(imgVerif.confidence * 100).toFixed(0)}% confidence)` : '';
      const score = data.condition_verification_score ?? data.fraud_score ?? 0;

      let resultMsg = '';
      if (data.claim_status === 'Approved' && data.payout) {
        resultMsg = `✅ Auto-approved! ${imgText}. Payout Rs.${data.payout.amount} via ${data.payout.provider} (${data.payout.reference}).`;
      } else if (data.claim_status === 'Rejected') {
        resultMsg = `❌ Rejected — ${imgText || 'image did not show a valid disruption'}.`;
      } else {
        const payoutText = data.payout ? `Payout: ${data.payout.provider} (${data.payout.reference})` : 'Sent for insurer review.';
        resultMsg = `🕐 ${data.claim_status}. ${imgText}. Condition score: ${(score * 100).toFixed(0)}%. ${payoutText}${fraudReasonText !== 'No suspicious signals.' ? ` Flags: ${fraudReasonText}` : ''}`;
      }
      setMessage(resultMsg);
      setManualClaim({
        estimated_income_loss: 500,
        condition: 'unknown',
        proof_file: null,
        worker_lat: '',
        worker_lon: '',
        payout_provider: 'UPI',
      });
      setLocationStatus('pending');
      captureDeviceLocation(false);
      await loadData();
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Claim submission failed';
      setMessage(`ERROR:${errMsg}`);
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
    pending: { text: t('locationDetecting'), className: 'bg-amber-50 text-amber-700' },
    captured: { text: t('locationCaptured'), className: 'bg-emerald-50 text-emerald-700' },
    denied: { text: t('locationDenied'), className: 'bg-red-50 text-red-700' },
    'not-supported': { text: t('locationNotSupported'), className: 'bg-slate-100 text-slate-700' },
  }[locationStatus];

  if (!dashboard) return <Layout title={t('dashboardTitle')} subtitle={t('dashboardSubtitle')} />;

  const activePlanName = dashboard.active_plan;
  const hasActivePlan = activePlanName && activePlanName !== 'No active plan';
  const planFeatures = {
    Basic:    { badge: '🌱 Basic',    monitors: ['Rainfall'], autoClaims: false, priorityPayout: false, curfew: false, claimLimit: 400,  allowedConditions: ['storm','rain','flood','other','unknown'] },
    Standard: { badge: '⭐ Standard', monitors: ['Rainfall','AQI','Temperature'], autoClaims: true,  priorityPayout: false, curfew: false, claimLimit: 700,  allowedConditions: ['storm','rain','flood','smoke','drought','heatwave','other','unknown'] },
    Premium:  { badge: '🏆 Premium',  monitors: ['Rainfall','AQI','Temperature','Curfew','Wind'], autoClaims: true,  priorityPayout: true,  curfew: true,  claimLimit: 1000, allowedConditions: ['storm','rain','flood','fire','smoke','drought','heatwave','curfew','other','unknown'] },
  };
  const pf = planFeatures[activePlanName] || null;
  const claimLimit = pf?.claimLimit || 400;
  const allowedConditions = pf?.allowedConditions || ['storm','rain','flood','other','unknown'];

  return (
    <Layout
      title={t('dashboardTitle')}
      subtitle={t('dashboardSubtitle')}
      maxWidthClass="max-w-[1500px]"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <Stat title={t('activePlan')} value={pf ? pf.badge : dashboard.active_plan} />
        <Stat title={t('coverageStatus')} value={dashboard.weekly_coverage_status} />
        <Stat title={t('earningsProtected')} value={`Rs.${dashboard.earnings_protected}`} />
        <Stat title={t('totalPayouts')} value={`Rs.${dashboard.total_payouts_received}`} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading text-lg font-bold text-brand-900">
                  {pf ? pf.badge : t('noPlan')}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {pf ? `Coverage: Rs.${claimLimit}/week` : t('subscribeTip')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-secondary" onClick={() => navigate('/subscribe')}>{t('changePlan')}</button>
                {hasActivePlan && (
                  <button className="btn-secondary" onClick={cancelSubscription}>{t('cancelSubscription')}</button>
                )}
              </div>
            </div>
            {!hasActivePlan && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-700">⚠️ No active subscription</p>
                <p className="mt-0.5 text-xs text-red-600">You cannot submit claims without an active plan. Subscribe to get protected.</p>
                <button className="mt-2 rounded-lg bg-red-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-700 transition" onClick={() => navigate('/subscribe')}>
                  Subscribe Now →
                </button>
              </div>
            )}
            {pf && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {[
                  ['🌧️ Rainfall monitoring', true],
                  ['💨 AQI monitoring', pf.monitors.includes('AQI')],
                  ['🌡️ Temperature alerts', pf.monitors.includes('Temperature')],
                  ['🚫 Curfew coverage', pf.curfew],
                  ['⚡ Auto-claims on trigger', pf.autoClaims],
                  ['🏆 Priority payout', pf.priorityPayout],
                ].map(([label, enabled]) => (
                  <div key={label} className={`flex items-center gap-1 rounded-lg px-2 py-1 ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    <span>{enabled ? '✓' : '✗'}</span>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-heading text-lg font-bold text-brand-900">Claims History</p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2">Claim ID</th>
                    <th className="py-2">Loss</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Condition Score</th>
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
                <button className="btn-secondary" onClick={triggerMockEvent}>{t('checkDisruption')}</button>
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
              <p className="font-heading text-lg font-bold text-brand-900">{t('goalTracker')}</p>
              <p className="mt-2 text-sm text-slate-700">Target: Rs.{dashboard.goal.monthly_target}</p>
              <p className="text-sm text-slate-700">Progress: Rs.{dashboard.goal.current_progress}</p>
              <p className="text-sm text-slate-700">Remaining: Rs.{dashboard.goal.remaining}</p>
              <input className="input mt-3" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="Set monthly goal" />
              <button className="btn-primary mt-3" onClick={submitGoal}>{t('updateGoal')}</button>
              <p className="mt-4 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-900">{dashboard.work_suggestion}</p>
            </Card>
          </div>

          {message && (
            <Card>
              <p className={`text-sm font-semibold ${
                message.startsWith('ERROR:') || message.startsWith('❌') ? 'text-red-600' :
                message.startsWith('✅') ? 'text-emerald-700' :
                'text-brand-700'
              }`}>
                {message.startsWith('ERROR:') ? `⚠️ ${message.slice(6)}` : message}
              </p>
            </Card>
          )}

          {/* Upgrade nudge for Basic plan */}
          {activePlanName === 'Basic' && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-semibold">⬆️ Upgrade to Standard or Premium</p>
              <p className="mt-1 text-xs">Basic plan only covers rainfall. Upgrade to get AQI, temperature, curfew monitoring and <strong>automatic payouts</strong> without filing a claim.</p>
              <button className="btn-primary mt-2 text-xs" onClick={() => navigate('/subscribe')}>View Plans</button>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
          <p className="font-heading text-lg font-bold text-brand-900">{t('manualClaim')}</p>
          <div className="mt-3 grid gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('lossAmount')} <span className="text-slate-400">(max Rs.{claimLimit})</span></label>
              <input
                className="input mt-1"
                type="number"
                min="50"
                max={claimLimit}
                value={manualClaim.estimated_income_loss}
                onChange={(e) => setManualClaim({ ...manualClaim, estimated_income_loss: Math.min(Number(e.target.value), claimLimit) })}
                placeholder={`e.g., 500 (max Rs.${claimLimit})`}
              />
              {Number(manualClaim.estimated_income_loss) >= claimLimit && (
                <p className="mt-1 text-xs text-amber-600">⚠️ Capped at your plan limit of Rs.{claimLimit}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('disruptionCondition')}</label>
              <select
                className="input mt-1"
                value={manualClaim.condition}
                onChange={(e) => setManualClaim({ ...manualClaim, condition: e.target.value })}
              >
                <option value="unknown">{t('selectCondition')}</option>
                {allowedConditions.includes('storm') && <option value="storm">{t('condStorm')}</option>}
                {allowedConditions.includes('flood') && <option value="flood">{t('condFlood')}</option>}
                {allowedConditions.includes('fire') && <option value="fire">{t('condFire')}</option>}
                {allowedConditions.includes('smoke') && <option value="smoke">{t('condSmoke')}</option>}
                {allowedConditions.includes('drought') && <option value="drought">{t('condDrought')}</option>}
                {allowedConditions.includes('heatwave') && <option value="heatwave">{t('condHeatwave')}</option>}
                {allowedConditions.includes('curfew') && <option value="curfew">{t('condCurfew')}</option>}
                <option value="other">{t('condOther')}</option>
              </select>
              {!hasActivePlan && (
                <p className="mt-1 text-xs text-red-500">Subscribe to a plan to submit claims.</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-600">{t('proofUpload')}</label>
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
                      <>{t('clickToUpload')}</>
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
            <button type="button" className="btn-secondary" onClick={() => captureDeviceLocation(true)}>{t('refreshLocation')}</button>
            <div>
              <label className="text-xs font-semibold text-slate-600">{t('payoutGateway')}</label>
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
            <button className="btn-primary" onClick={submitManualClaim} disabled={!hasActivePlan}>
              {hasActivePlan ? t('submitClaim') : 'No Active Plan — Subscribe First'}
            </button>
          </div>
            </Card>

            <Card>
              <p className="font-heading text-lg font-bold text-brand-900">{t('notifications')}</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-700">
                {(dashboard.notifications_structured || []).length
                  ? (dashboard.notifications_structured || []).map((note, i) => {
                      const colorMap = {
                        emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                        red: 'bg-red-50 text-red-800 border-red-200',
                        amber: 'bg-amber-50 text-amber-800 border-amber-200',
                        brand: 'bg-brand-50 text-brand-800 border-brand-200',
                        slate: 'bg-slate-100 text-slate-700 border-slate-200',
                      };
                      const cls = colorMap[note.color] || colorMap.slate;
                      return (
                        <li key={i} className={`rounded-lg border p-2 flex gap-2 items-start ${cls}`}>
                          <span className="text-base leading-tight">{note.icon}</span>
                          <span>{note.message}</span>
                        </li>
                      );
                    })
                  : <li className="rounded-lg bg-slate-100 p-2">{t('noNotifications')}</li>}
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
