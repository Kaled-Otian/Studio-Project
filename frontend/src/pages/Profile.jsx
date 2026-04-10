import { useState, useEffect } from 'react';
import { useAuth, api } from '../context/AuthContext';
import { User, Briefcase, Hash, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: '', job_title: '', abbreviation: '' });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || '',
        job_title: user.job_title || '',
        abbreviation: user.abbreviation || '',
      });
    }
  }, [user]);

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await api.patch(`/users/${user.id}`, form);
      // Sync immediately to sidebar and context
      updateUser({ name: res.data.name, job_title: res.data.job_title, abbreviation: res.data.abbreviation });
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const roleBadge = {
    SUPER_ADMIN: { label: 'Super Admin', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    ADMIN: { label: 'Admin', color: 'var(--accent-base)', bg: 'var(--accent-glow)' },
    USER: { label: 'User', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  }[user?.role] || { label: user?.role, color: 'var(--text-secondary)', bg: 'transparent' };

  return (
    <div>
      <h1 style={{ marginBottom: '8px' }}>My Profile</h1>
      <p style={{ marginBottom: '32px' }}>Manage your display information and preferences.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
        {/* Avatar Card */}
        <div className="glass glass-card" style={{ textAlign: 'center' }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%',
            background: 'var(--accent-base)', color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.5rem', fontWeight: 700, margin: '0 auto 20px'
          }}>
            {form.abbreviation || form.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <h2 style={{ marginBottom: '4px' }}>{form.name || 'Your Name'}</h2>
          <p style={{ marginBottom: '16px', fontSize: '0.9rem' }}>{form.job_title || 'No title set'}</p>
          <span style={{ padding: '5px 14px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600, background: roleBadge.bg, color: roleBadge.color }}>
            {roleBadge.label}
          </span>
          <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <p style={{ margin: 0 }}>📧 {user?.email}</p>
          </div>
        </div>

        {/* Edit Form Card */}
        <div className="glass glass-card">
          <h3 style={{ marginBottom: '24px' }}>Edit Information</h3>
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="form-group">
              <label><User size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Full Name</label>
              <input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Your full name" />
            </div>
            <div className="form-group">
              <label><Briefcase size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Job Title</label>
              <input className="input" value={form.job_title} onChange={e => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. Senior Video Editor" />
            </div>
            <div className="form-group">
              <label><Hash size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Initials / Short Code</label>
              <input className="input" value={form.abbreviation} onChange={e => setForm({ ...form, abbreviation: e.target.value })} placeholder="e.g. JD" maxLength={4} />
              <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Displayed in avatar when no photo is set (max 4 chars)</p>
            </div>
            <button type="submit" className="btn btn-primary" disabled={isSaving}>
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
