import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Layout } from '../components/Layout';
import api from '../lib/api';
import { clearUser, getUser, saveUser } from '../lib/session';

export default function ProfilePage() {
  const user = getUser();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError(''); setStatus('');
    try {
      const { data } = await api.patch(`/auth/profile/${user.user_id}`, { name: name.trim() });
      saveUser({ ...user, name: data.name });
      setStatus('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.detail || 'Update failed.');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      await api.delete(`/auth/profile/${user.user_id}`);
      clearUser();
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Delete failed.');
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const planBadge = { Basic: '🌱', Standard: '⭐', Premium: '🏆' };

  return (
    <Layout title="My Profile" subtitle="Manage your account details.">
      <div className="max-w-md space-y-4">
        <Card>
          {/* Avatar + identity */}
          <div className="flex items-center gap-4 mb-6">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-emerald-900 shrink-0"
              style={{ background: 'linear-gradient(135deg,#6ee7b7,#34d399)' }}>
              {name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div>
              <p className="font-heading text-lg font-bold text-brand-900">{user?.name}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role} · {user?.location}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                  style={{ background: 'rgba(31,143,134,0.1)', color: '#11635d' }}>
                  {user?.risk_tier} Risk
                </span>
                <span className="text-[10px] text-slate-400">Score: {user?.risk_score}</span>
              </div>
            </div>
          </div>

          {/* Editable: name only */}
          <form onSubmit={handleSave} className="grid gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-600">Display Name</label>
              <input className="input mt-1" value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name" required />
            </div>

            {/* Read-only fields */}
            {[
              { label: 'Email', value: user?.email },
              { label: 'Phone', value: user?.phone },
              { label: 'Platform', value: user?.platform },
              { label: 'City / Work Zone', value: user?.location },
            ].map(({ label, value }) => (
              <div key={label}>
                <label className="text-xs font-semibold text-slate-600">{label}</label>
                <div className="input mt-1 flex items-center bg-slate-50 text-slate-500 select-all cursor-default">
                  {value || '—'}
                </div>
              </div>
            ))}

            {error && <p className="text-sm font-medium text-red-600">⚠️ {error}</p>}
            {status && <p className="text-sm font-medium text-emerald-700">✓ {status}</p>}

            <button className="btn-primary py-3 rounded-xl" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save Name'}
            </button>
          </form>
        </Card>

        {/* Delete account */}
        <Card>
          <p className="font-heading text-base font-bold text-red-700">Danger Zone</p>
          <p className="mt-1 text-xs text-slate-500">
            Permanently delete your account, all subscriptions, claims, and data. This cannot be undone.
          </p>

          {!confirmDelete ? (
            <button
              className="mt-4 w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
              onClick={() => setConfirmDelete(true)}>
              Delete My Account
            </button>
          ) : (
            <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-red-800">Are you absolutely sure?</p>
              <p className="text-xs text-red-600">All your data will be permanently erased.</p>
              <div className="flex gap-3">
                <button
                  className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-700 transition"
                  onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button
                  className="flex-1 rounded-xl border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                  onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
