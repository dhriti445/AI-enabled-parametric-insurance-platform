import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { saveUser } from '../lib/session';

const initialRegister = {
  name: '',
  email: '',
  phone: '',
  platform: 'Swiggy',
  location: 'Mumbai',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const [registerData, setRegisterData] = useState(initialRegister);
  const [loginInput, setLoginInput] = useState('');
  const [mode, setMode] = useState('register');
  const [error, setError] = useState('');

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/register', registerData);
      saveUser(data);
      navigate(data.role === 'admin' ? '/admin' : '/subscribe');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email_or_phone: loginInput });
      saveUser(data);
      navigate(data.role === 'admin' ? '/admin' : '/subscribe');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed');
    }
  };

  return (
    <Layout
      title="AI Parametric Insurance for Gig Workers"
      subtitle="Protect weekly earnings against rain, pollution, heat spikes, and curfews with AI-powered automatic payouts."
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="animate-rise">
          <p className="font-heading text-lg font-semibold text-brand-900">Income Shield Highlights</p>
          <ul className="mt-4 grid gap-3 font-body text-sm text-slate-700">
            <li className="rounded-xl bg-brand-50 p-3">Weekly plan activation with instant payment confirmation</li>
            <li className="rounded-xl bg-brand-50 p-3">AI risk profiling with personalized premium suggestion</li>
            <li className="rounded-xl bg-brand-50 p-3">Auto-claims on live disruption triggers + fraud checks</li>
            <li className="rounded-xl bg-brand-50 p-3">Smart work suggestions and monthly goal tracking</li>
          </ul>
        </Card>

        <Card className="animate-rise [animation-delay:120ms]">
          <div className="mb-4 flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
            <button
              type="button"
              className={`w-1/2 rounded-lg px-3 py-2 ${mode === 'register' ? 'bg-white text-brand-900' : 'text-slate-600'}`}
              onClick={() => setMode('register')}
            >
              Register
            </button>
            <button
              type="button"
              className={`w-1/2 rounded-lg px-3 py-2 ${mode === 'login' ? 'bg-white text-brand-900' : 'text-slate-600'}`}
              onClick={() => setMode('login')}
            >
              Login
            </button>
          </div>

          {mode === 'register' ? (
            <form onSubmit={handleRegister} className="grid gap-3">
              <input className="input" placeholder="Name" value={registerData.name} onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })} required />
              <input className="input" placeholder="Email" type="email" value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} required />
              <input className="input" placeholder="Phone" value={registerData.phone} onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })} required />
              <select className="input" value={registerData.platform} onChange={(e) => setRegisterData({ ...registerData, platform: e.target.value })}>
                <option>Swiggy</option>
                <option>Zomato</option>
                <option>Amazon</option>
                <option>Flipkart</option>
              </select>
              <input className="input" placeholder="City / Work Zone" value={registerData.location} onChange={(e) => setRegisterData({ ...registerData, location: e.target.value })} required />
              <button className="btn-primary" type="submit">Create Account</button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="grid gap-3">
              <input className="input" placeholder="Email or Phone" value={loginInput} onChange={(e) => setLoginInput(e.target.value)} required />
              <button className="btn-primary" type="submit">Login</button>
            </form>
          )}

          {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
        </Card>
      </div>
    </Layout>
  );
}
