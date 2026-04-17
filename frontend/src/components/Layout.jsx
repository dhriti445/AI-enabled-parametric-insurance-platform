import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import LanguageSwitcher from './LanguageSwitcher';
import { getUser, clearUser } from '../lib/session';

function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const links = isAdmin
    ? [{ label: 'Dashboard', path: '/admin' }, { label: 'Profile', path: '/profile' }]
    : [
        { label: 'Dashboard', path: '/dashboard' },
        { label: 'Plans', path: '/subscribe' },
        { label: 'Profile', path: '/profile' },
      ];

  const logout = () => { clearUser(); navigate('/'); };

  return (
    <div className="mb-6 rounded-2xl px-5 py-3 flex items-center justify-between gap-4"
      style={{ background: 'linear-gradient(135deg,#0a3734,#11635d)', border: '1px solid rgba(110,231,183,0.15)', boxShadow: '0 4px 24px rgba(17,99,93,0.3)' }}>
      {/* Logo */}
      <button onClick={() => navigate(isAdmin ? '/admin' : '/dashboard')}
        className="flex items-center gap-2 shrink-0">
        <div className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
        </div>
        <span className="font-heading text-base font-bold text-white tracking-tight">GigShield</span>
      </button>

      {/* Nav links — desktop */}
      <div className="hidden sm:flex items-center gap-1">
        {links.map((l) => (
          <button key={l.path} onClick={() => navigate(l.path)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              location.pathname === l.path
                ? 'bg-white/15 text-white'
                : 'text-emerald-200/70 hover:text-white hover:bg-white/10'
            }`}>
            {l.label}
          </button>
        ))}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher dark />
        <div className="hidden sm:flex items-center gap-2 rounded-xl px-3 py-1.5"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold text-emerald-900"
            style={{ background: 'linear-gradient(135deg,#6ee7b7,#34d399)' }}>
            {user.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <span className="text-xs font-medium text-emerald-100">{user.name}</span>
        </div>
        <button onClick={logout}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-300/70 hover:text-white transition hover:bg-white/10">
          Logout
        </button>
      </div>
    </div>
  );
}

export function Layout({ title, subtitle, children, leftAligned = false, maxWidthClass = 'max-w-6xl' }) {
  const containerAlignment = leftAligned ? '' : 'mx-auto';

  return (
    <div className="min-h-screen text-slate-900" style={{ background: 'var(--surface)' }}>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 left-[-120px] h-72 w-72 rounded-full bg-brand-100 blur-3xl opacity-60" />
        <div className="absolute bottom-0 right-[-120px] h-72 w-72 rounded-full bg-orange-100 blur-3xl opacity-40" />
      </div>
      <div className={`${containerAlignment} ${maxWidthClass} px-4 py-6 sm:px-6 lg:px-8`}>
        <TopNav />
        <header className="mb-6 animate-rise rounded-2xl border border-white/70 bg-white/80 px-6 py-5 shadow-soft backdrop-blur">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-brand-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl font-body text-sm text-slate-500">{subtitle}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function Card({ children, className = '', ...props }) {
  return (
    <section className={`rounded-2xl border border-white/70 bg-white p-5 shadow-soft ${className}`} {...props}>
      {children}
    </section>
  );
}
