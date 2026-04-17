import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useTranslation } from '../lib/useTranslation';
import { saveUser } from '../lib/session';
import LanguageSwitcher from '../components/LanguageSwitcher';

const initialRegister = { name: '', email: '', phone: '', platform: 'Swiggy', location: 'Mumbai' };

/* ── tiny sub-components ── */
function NavBar({ onGetStarted }) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 sm:px-12"
      style={{ background: 'rgba(10,55,52,0.7)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <span className="h-3 w-3 rounded-sm bg-emerald-400" />
          <span className="h-3 w-3 rounded-sm bg-emerald-600" />
        </div>
        <span className="font-heading text-lg font-bold text-white tracking-tight">InSureWell</span>
      </div>
      <div className="hidden sm:flex items-center gap-8 text-sm text-emerald-200/70 font-medium">
        <a href="#features" className="hover:text-white transition">Features</a>
        <a href="#how" className="hover:text-white transition">How it works</a>
        <a href="#plans" className="hover:text-white transition">Plans</a>
      </div>
      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <button onClick={onGetStarted}
          className="rounded-full px-5 py-2 text-sm font-semibold text-white transition"
          style={{ background: 'linear-gradient(135deg,#1f8f86,#11635d)', border: '1px solid rgba(110,231,183,0.3)' }}>
          Get Started →
        </button>
      </div>
    </nav>
  );
}

function GlowOrb({ className, style }) {
  return <div className={`absolute rounded-full pointer-events-none ${className}`} style={style} />;
}

function StatBox({ value, label }) {
  return (
    <div className="stat-box rounded-2xl px-6 py-4 text-center">
      <p className="font-heading text-3xl font-extrabold text-white">{value}</p>
      <p className="mt-1 text-xs text-emerald-300/70 font-medium uppercase tracking-widest">{label}</p>
    </div>
  );
}

function FeaturePill({ icon, title, desc }) {
  return (
    <div className="feature-pill rounded-2xl px-5 py-4 flex items-start gap-4 cursor-default">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ background: 'rgba(110,231,183,0.12)', border: '1px solid rgba(110,231,183,0.2)' }}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs text-emerald-200/60 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function HowStep({ num, title, desc }) {
  return (
    <div className="flex gap-4 items-start opacity-0 animate-fade-in-up" style={{ animationDelay: `${num * 0.15}s`, animationFillMode: 'forwards' }}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-emerald-900"
        style={{ background: 'linear-gradient(135deg,#6ee7b7,#34d399)' }}>
        {num}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs text-emerald-200/60 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── main page ── */
export default function LoginPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authRef = useRef(null);

  const [registerData, setRegisterData] = useState(initialRegister);
  const [loginInput, setLoginInput] = useState('');
  const [mode, setMode] = useState('register');
  const [accountType, setAccountType] = useState('worker');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const scrollToAuth = () => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const handleRegister = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const payload = { ...registerData, role: accountType, platform: accountType === 'insurer' ? 'Insurer Portal' : registerData.platform };
      const { data } = await api.post('/auth/register', payload);
      saveUser(data);
      navigate(data.role === 'admin' ? '/admin' : '/subscribe');
    } catch (err) { setError(err.response?.data?.detail || 'Registration failed'); }
    finally { setLoading(false); }
  };

  const handleLogin = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email_or_phone: loginInput.trim(), expected_role: accountType === 'insurer' ? 'admin' : 'worker' });
      saveUser(data);
      if (data.role === 'admin') { navigate('/admin'); return; }
      try {
        const { data: sub } = await api.get(`/subscriptions/status/${data.user_id}`);
        navigate(sub.has_active_subscription ? '/dashboard' : '/subscribe');
      } catch { navigate('/subscribe'); }
    } catch (err) { setError(err.response?.data?.detail || 'Login failed'); }
    finally { setLoading(false); }
  };

  const bgStyle = {
    background: 'radial-gradient(ellipse 120% 80% at 60% 0%, #1a5c56 0%, #0d4440 30%, #071f1e 70%, #040f0f 100%)',
    minHeight: '100vh',
  };

  return (
    <div style={bgStyle} className="relative overflow-x-hidden">
      {/* grid overlay */}
      <div className="pointer-events-none fixed inset-0 z-0"
        style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize: '64px 64px' }} />

      {/* glow orbs */}
      <GlowOrb className="h-[600px] w-[600px] -top-40 left-1/2 -translate-x-1/2"
        style={{ background: 'radial-gradient(circle,rgba(31,143,134,0.25) 0%,transparent 70%)', filter: 'blur(40px)' }} />
      <GlowOrb className="h-96 w-96 top-1/3 -right-32"
        style={{ background: 'radial-gradient(circle,rgba(52,211,153,0.15) 0%,transparent 70%)', filter: 'blur(60px)' }} />
      <GlowOrb className="h-80 w-80 bottom-1/4 -left-20"
        style={{ background: 'radial-gradient(circle,rgba(17,99,93,0.3) 0%,transparent 70%)', filter: 'blur(50px)' }} />

      <NavBar onGetStarted={scrollToAuth} />

      {/* ── HERO ── */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-16 text-center">
        {/* pill badge */}
        <div className="opacity-0 animate-fade-in-up delay-1" style={{ animationFillMode: 'forwards' }}>
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-300"
            style={{ background: 'rgba(110,231,183,0.1)', border: '1px solid rgba(110,231,183,0.25)' }}>
            <span className="glow-dot" />
            India's First AI Parametric Insurance for Gig Workers
          </span>
        </div>

        {/* headline */}
        <h1 className="mt-6 font-heading font-extrabold leading-tight tracking-tight text-white opacity-0 animate-fade-in-up delay-2"
          style={{ fontSize: 'clamp(2.5rem,7vw,5rem)', animationFillMode: 'forwards' }}>
          Your income,<br />
          <span className="shimmer-text">protected by AI.</span>
        </h1>

        <p className="mt-5 max-w-lg text-base text-emerald-200/70 leading-relaxed opacity-0 animate-fade-in-up delay-3"
          style={{ animationFillMode: 'forwards' }}>
          InSureWell pays you automatically when rain, floods, fire, or curfews stop you from working —
          before you even file a claim.
        </p>

        {/* CTA buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 opacity-0 animate-fade-in-up delay-4"
          style={{ animationFillMode: 'forwards' }}>
          <button onClick={scrollToAuth}
            className="group relative rounded-full px-8 py-3.5 text-sm font-bold text-white transition-all hover:scale-105 hover:shadow-2xl"
            style={{ background: 'linear-gradient(135deg,#34d399,#1f8f86,#11635d)', boxShadow: '0 0 40px rgba(52,211,153,0.35)' }}>
            <span className="relative z-10">Get Protected — Free to Start →</span>
          </button>
          <button onClick={scrollToAuth}
            className="rounded-full px-8 py-3.5 text-sm font-semibold text-emerald-200 transition hover:text-white hover:bg-white/10"
            style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
            Insurer Dashboard
          </button>
        </div>

        {/* floating live cards */}
        <div className="mt-14 w-full max-w-3xl opacity-0 animate-fade-in-up delay-5" style={{ animationFillMode: 'forwards' }}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { city: 'Mumbai', event: '🌧️ Heavy Rain', status: 'Payout sent', color: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.3)' },
              { city: 'Delhi', event: '💨 AQI 310', status: 'Auto-claim filed', color: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.25)' },
              { city: 'Chennai', event: '🌊 Flood alert', status: 'Payout sent', color: 'rgba(52,211,153,0.15)', border: 'rgba(52,211,153,0.3)' },
              { city: 'Bengaluru', event: '🌡️ 44°C Heat', status: 'Monitoring...', color: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
            ].map((c) => (
              <div key={c.city} className="rounded-2xl p-3 text-left animate-float"
                style={{ background: c.color, border: `1px solid ${c.border}`, animationDelay: `${Math.random() * 2}s` }}>
                <p className="text-[10px] font-bold text-emerald-300/70 uppercase tracking-widest">{c.city}</p>
                <p className="mt-1 text-xs font-semibold text-white">{c.event}</p>
                <p className="mt-0.5 text-[10px] text-emerald-300/80">{c.status}</p>
              </div>
            ))}
          </div>
        </div>

        {/* stats row */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 w-full max-w-2xl opacity-0 animate-fade-in-up delay-6"
          style={{ animationFillMode: 'forwards' }}>
          <StatBox value="₹0" label="Claim filing cost" />
          <StatBox value="< 2 min" label="Avg payout time" />
          <StatBox value="5 cities" label="Live monitoring" />
          <StatBox value="₹20/wk" label="Starting from" />
        </div>

        {/* scroll hint */}
        <div className="mt-10 flex flex-col items-center gap-2 opacity-40">
          <p className="text-[10px] text-emerald-300 tracking-widest uppercase">Scroll to explore</p>
          <div className="h-8 w-5 rounded-full flex items-start justify-center pt-1.5"
            style={{ border: '1px solid rgba(110,231,183,0.3)' }}>
            <div className="h-1.5 w-1 rounded-full bg-emerald-400 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── TICKER ── */}
      <div className="relative z-10 overflow-hidden py-3"
        style={{ background: 'rgba(255,255,255,0.04)', borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="animate-ticker flex gap-16 text-xs font-semibold text-emerald-300/60 uppercase tracking-widest">
          {['🌧️ Rainfall Detection', '💨 AQI Monitoring', '🌡️ Heatwave Alerts', '🚫 Curfew Coverage', '🔥 Fire Detection', '🌊 Flood Tracking', '⚡ Instant Payouts', '🛡️ AI Fraud Check', '📍 GPS Verification', '🌧️ Rainfall Detection', '💨 AQI Monitoring', '🌡️ Heatwave Alerts', '🚫 Curfew Coverage', '🔥 Fire Detection', '🌊 Flood Tracking', '⚡ Instant Payouts', '🛡️ AI Fraud Check', '📍 GPS Verification'].map((item, i) => (
            <span key={i} className="shrink-0">{item}</span>
          ))}
        </div>
      </div>

      {/* ── FEATURES ── */}
      <section id="features" className="relative z-10 mx-auto max-w-6xl px-6 py-24">
        <div className="mb-4 text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Platform Features</span>
        </div>
        <h2 className="text-center font-heading text-4xl font-extrabold text-white mb-3">
          Everything a gig worker needs
        </h2>
        <p className="text-center text-sm text-emerald-200/60 mb-12 max-w-lg mx-auto">
          Built for Swiggy, Zomato, Amazon, and Flipkart delivery partners across India's highest-risk cities.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeaturePill icon="🤖" title="AI Risk Profiling" desc="Your risk score is computed from city-level weather history, flood zones, and AQI data the moment you register." />
          <FeaturePill icon="⚡" title="Zero-Touch Auto Claims" desc="When our AI detects a disruption in your city, your claim is created and paid automatically — no forms, no waiting." />
          <FeaturePill icon="🛡️" title="CLIP Image Verification" desc="Upload a photo proof. Our CLIP vision model reads the actual image to detect rain, fire, flood, or smoke." />
          <FeaturePill icon="📍" title="GPS Location Check" desc="Device GPS and image EXIF data are cross-checked against your registered city to prevent location fraud." />
          <FeaturePill icon="💰" title="Dynamic Pricing" desc="Your weekly premium adjusts in real-time based on live weather, AQI, and your personal risk tier." />
          <FeaturePill icon="🌐" title="6 Languages" desc="Full UI in English, Hindi, Tamil, Bengali, Telugu, and Kannada — so every worker feels at home." />
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-2 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">How it works</span>
            <h2 className="mt-3 font-heading text-4xl font-extrabold text-white leading-tight">
              From disruption<br />to payout in minutes.
            </h2>
            <p className="mt-4 text-sm text-emerald-200/60 leading-relaxed max-w-sm">
              No insurance agent. No paperwork. No waiting weeks. Just register, pick a plan, and let the AI do the rest.
            </p>
          </div>
          <div className="space-y-5">
            <HowStep num={1} title="Register with your city & platform" desc="Takes 30 seconds. We compute your risk score instantly from live city data." />
            <HowStep num={2} title="Choose a weekly protection plan" desc="Basic, Standard, or Premium — starting at just ₹20/week. AI recommends the best fit." />
            <HowStep num={3} title="AI monitors your city 24/7" desc="Live weather APIs, AQI feeds, and civic alerts are checked every hour for your location." />
            <HowStep num={4} title="Disruption detected → payout sent" desc="Your claim is auto-created, fraud-checked, and payment is dispatched via UPI or Razorpay." />
            <HowStep num={5} title="You get notified instantly" desc="A notification lands in your dashboard. No action needed from you." />
          </div>
        </div>
      </section>

      {/* ── PLANS PREVIEW ── */}
      <section id="plans" className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-4 text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Protection Plans</span>
        </div>
        <h2 className="text-center font-heading text-4xl font-extrabold text-white mb-12">Simple, honest pricing.</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {[
            { name: 'Basic', price: '₹20', cover: '₹400', badge: '🌱', features: ['Rainfall monitoring', 'Manual claims', 'Standard payout'] },
            { name: 'Standard', price: '₹30', cover: '₹700', badge: '⭐', features: ['Rainfall + AQI + Temp', 'Auto-claims on trigger', 'Fast payout (T+0)'], highlight: true },
            { name: 'Premium', price: '₹40', cover: '₹1000', badge: '🏆', features: ['Full disruption suite', 'Curfew + Wind coverage', 'Priority instant payout'] },
          ].map((plan) => (
            <div key={plan.name}
              className={`rounded-3xl p-6 flex flex-col gap-4 transition hover:-translate-y-1 ${plan.highlight ? '' : 'glass'}`}
              style={plan.highlight ? { background: 'linear-gradient(135deg,rgba(31,143,134,0.4),rgba(17,99,93,0.5))', border: '1px solid rgba(110,231,183,0.3)', boxShadow: '0 0 40px rgba(31,143,134,0.2)' } : {}}>
              <div className="flex items-center justify-between">
                <span className="text-2xl">{plan.badge}</span>
                {plan.highlight && <span className="rounded-full px-3 py-0.5 text-[10px] font-bold text-emerald-900 uppercase tracking-wide" style={{ background: '#6ee7b7' }}>Most Popular</span>}
              </div>
              <div>
                <p className="font-heading text-xl font-bold text-white">{plan.name}</p>
                <p className="text-3xl font-extrabold text-white mt-1">{plan.price}<span className="text-sm font-medium text-emerald-300/70">/week</span></p>
                <p className="text-xs text-emerald-300/60 mt-1">Up to {plan.cover} coverage</p>
              </div>
              <ul className="space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-emerald-200/80">
                    <span className="text-emerald-400">✓</span>{f}
                  </li>
                ))}
              </ul>
              <button onClick={() => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                className="mt-auto rounded-xl py-2.5 text-sm font-semibold transition"
                style={plan.highlight
                  ? { background: 'linear-gradient(135deg,#1f8f86,#11635d)', color: '#fff', border: '1px solid rgba(110,231,183,0.3)' }
                  : { background: 'rgba(255,255,255,0.07)', color: '#a7f3d0', border: '1px solid rgba(255,255,255,0.1)' }}>
                Get Started →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── AUTH FORM ── */}
      <section ref={authRef} className="relative z-10 mx-auto max-w-md px-6 py-20">
        <div className="mb-8 text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">Join Now</span>
          <h2 className="mt-2 font-heading text-3xl font-extrabold text-white">Start your protection today.</h2>
          <p className="mt-2 text-sm text-emerald-200/60">Takes 30 seconds. No credit card required.</p>
        </div>

        <div className="glass-white rounded-3xl p-6 shadow-2xl">
          {/* portal toggle */}
          <div className="mb-4 flex rounded-xl p-1 text-sm font-semibold" style={{ background: '#ecf7f6' }}>
            {['worker', 'insurer'].map((type) => (
              <button key={type} type="button"
                className={`w-1/2 rounded-lg px-3 py-2 transition ${accountType === type ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500'}`}
                onClick={() => setAccountType(type)}>
                {type === 'worker' ? t('workerPortal') : t('insurerPortal')}
              </button>
            ))}
          </div>

          {/* mode toggle */}
          <div className="mb-4 flex rounded-xl p-1 text-sm font-semibold" style={{ background: '#f1f5f9' }}>
            {['register', 'login'].map((m) => (
              <button key={m} type="button"
                className={`w-1/2 rounded-lg px-3 py-2 transition ${mode === m ? 'bg-white text-brand-900 shadow-sm' : 'text-slate-500'}`}
                onClick={() => setMode(m)}>
                {m === 'register' ? t('register') : t('login')}
              </button>
            ))}
          </div>

          {mode === 'register' ? (
            <form onSubmit={handleRegister} className="grid gap-3">
              <input className="input" placeholder={t('name')} value={registerData.name} onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })} required />
              <input className="input" placeholder={t('email')} type="email" value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} required />
              <input className="input" placeholder={t('phone')} value={registerData.phone} onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })} required />
              {accountType === 'worker' ? (
                <>
                  <select className="input" value={registerData.platform} onChange={(e) => setRegisterData({ ...registerData, platform: e.target.value })}>
                    <option>Swiggy</option><option>Zomato</option><option>Amazon</option><option>Flipkart</option>
                  </select>
                  <input className="input" placeholder={t('city')} value={registerData.location} onChange={(e) => setRegisterData({ ...registerData, location: e.target.value })} required />
                </>
              ) : (
                <input className="input" placeholder="Insurer HQ City" value={registerData.location} onChange={(e) => setRegisterData({ ...registerData, location: e.target.value })} required />
              )}
              <button className="btn-primary w-full py-3 rounded-xl text-sm" type="submit" disabled={loading}>
                {loading ? 'Creating account…' : accountType === 'insurer' ? t('createInsurerAccount') : t('createWorkerAccount')}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="grid gap-3">
              <input className="input" placeholder={t('emailOrPhone')} value={loginInput} onChange={(e) => setLoginInput(e.target.value)} required />
              <button className="btn-primary w-full py-3 rounded-xl text-sm" type="submit" disabled={loading}>
                {loading ? 'Logging in…' : accountType === 'insurer' ? t('loginAsInsurer') : t('loginAsWorker')}
              </button>
            </form>
          )}

          {error && <p className="mt-3 text-sm font-medium text-red-500">{error}</p>}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="relative z-10 border-t py-8 text-center text-xs text-emerald-300/40"
        style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <p>© 2026 InSureWell · AI Parametric Insurance Platform · Built for India's gig workforce</p>
      </footer>
    </div>
  );
}
