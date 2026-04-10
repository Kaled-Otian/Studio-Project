import { useState, useEffect, useCallback } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Megaphone, Plus, Trash2, Edit2, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { isAdmin, isSuperAdmin, PRIORITY_CONFIG, formatDateTime, timeAgo } from '../lib/roles';

const BLANK = { title: '', body: '', priority: 'normal' };

export default function Announcements() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'create' | 'edit'
  const [form, setForm] = useState(BLANK);
  const [editTarget, setEditTarget] = useState(null);
  const admin = isAdmin(user);
  const superAdmin = isSuperAdmin(user);

  const fetch = useCallback(async () => {
    try {
      const res = await api.get('/announcements');
      setItems(res.data);
    } catch {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const handleRead = async (id) => {
    try {
      await api.post(`/announcements/${id}/read`);
      setItems(prev => prev.map(a => a.id === id ? { ...a, is_read: 1 } : a));
    } catch (_) {}
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modal === 'create') {
        await api.post('/announcements', form);
        toast.success('Announcement posted!');
      } else {
        await api.patch(`/announcements/${editTarget.id}`, form);
        toast.success('Announcement updated');
      }
      setModal(null);
      setForm(BLANK);
      fetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      toast.success('Deleted');
      setItems(prev => prev.filter(a => a.id !== id));
    } catch {
      toast.error('Failed to delete');
    }
  };

  const openEdit = (a) => {
    setForm({ title: a.title, body: a.body, priority: a.priority });
    setEditTarget(a);
    setModal('edit');
  };

  if (loading) return <div className="loading-spinner"></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Announcements</h1>
          <p>Internal notices and studio-wide communications.</p>
        </div>
        {admin && (
          <button className="btn btn-primary" onClick={() => { setForm(BLANK); setModal('create'); }}>
            <Plus size={16} /> New Announcement
          </button>
        )}
      </div>

      {items.length === 0 && (
        <EmptyState icon={Megaphone} title="No announcements yet" description={admin ? 'Post an announcement to notify the team.' : 'Check back later for updates from your admin team.'} action={admin && <button className="btn btn-primary" onClick={() => { setForm(BLANK); setModal('create'); }}><Plus size={14}/> Post Announcement</button>} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {items.map(a => {
          const pc = PRIORITY_CONFIG[a.priority] || PRIORITY_CONFIG.normal;
          const isOwner = parseInt(a.created_by) === parseInt(user.id);
          const canEdit = isOwner || superAdmin;
          const isRead = !!a.is_read;

          return (
            <div key={a.id} className="glass" style={{
              padding: '20px 24px', borderRadius: '12px',
              borderLeft: `4px solid ${pc.color}`,
              background: isRead ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
              opacity: isRead ? 0.8 : 1,
              transition: 'all 0.2s'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700, background: pc.bg, color: pc.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {a.priority}
                  </span>
                  {!isRead && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-base)', display: 'inline-block', flexShrink: 0 }} title="Unread" />}
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{a.title}</h3>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  {!isRead && (
                    <button onClick={() => handleRead(a.id)} title="Mark as read" style={{ background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={13} /> Read
                    </button>
                  )}
                  {canEdit && (
                    <button onClick={() => openEdit(a)} style={{ background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={13}/></button>
                  )}
                  {canEdit && (
                    <button onClick={() => handleDelete(a.id)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--danger-color)' }}><Trash2 size={13}/></button>
                  )}
                </div>
              </div>
              <p style={{ margin: '0 0 12px', color: 'var(--text-primary)', lineHeight: 1.7, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{a.body}</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Posted by <strong style={{ color: 'var(--text-secondary)' }}>{a.creator_name}</strong> · {timeAgo(a.created_at)}
              </p>
            </div>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'create' ? 'New Announcement' : 'Edit Announcement'}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Title *</label>
            <input required className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Priority</label>
            <select className="input" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">🚨 Urgent</option>
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Message *</label>
            <textarea required className="input" style={{ minHeight: '120px', fontFamily: 'inherit', resize: 'vertical' }}
              value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
              placeholder="Write your announcement..." />
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{modal === 'create' ? 'Post' : 'Save'}</button>
            <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
