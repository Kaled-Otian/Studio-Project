import { useState, useEffect } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { Camera, Calendar, Plus, Search, Filter, Edit2, Trash2 } from 'lucide-react';
import Modal from '../components/Modal';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';

export default function Shoots() {
  const [shoots, setShoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { socket } = useSocket();
  const location = useLocation();

  const [showCreate, setShowCreate] = useState(false);
  const [newShoot, setNewShoot] = useState({
    title: '', person_filmed: '', start_datetime: '', end_datetime: '',
    duration_hours: 1, output_duration: '', details: ''
  });

  const [editingShoot, setEditingShoot] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  // Pre-apply status filter from URL query param (e.g. /shoots?status=Scheduled)
  const [statusFilter, setStatusFilter] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('status') || 'All';
  });

  const fetchShoots = async () => {
    try {
      setLoading(true);
      const res = await api.get('/shoots');
      setShoots(res.data);
    } catch (err) {
      toast.error('Failed to load shoots');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch every time this route is visited (location.key changes per navigation)
  useEffect(() => {
    fetchShoots();
    // Also sync status filter from URL on navigation
    const params = new URLSearchParams(location.search);
    const s = params.get('status');
    if (s) setStatusFilter(s);
  }, [location.key]);

  useEffect(() => {
    if (!socket) return;
    const update = () => fetchShoots();
    socket.on('shoot_created', update);
    socket.on('shoot_updated', update);
    socket.on('shoot_deleted', update);
    return () => {
      socket.off('shoot_created', update);
      socket.off('shoot_updated', update);
      socket.off('shoot_deleted', update);
    };
  }, [socket]);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      if (!newShoot.start_datetime) return toast.error('Start Date/Time is required');
      await api.post('/shoots', newShoot);
      toast.success('Shoot created!');
      setShowCreate(false);
      setNewShoot({ title: '', person_filmed: '', start_datetime: '', end_datetime: '', duration_hours: 1, output_duration: '', details: '' });
      fetchShoots();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create shoot');
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/shoots/${editingShoot.id}`, editingShoot);
      toast.success('Shoot updated');
      setEditingShoot(null);
      fetchShoots();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const handleDelete = async (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to permanently delete this shoot and all tasks?')) return;
    try {
      await api.delete(`/shoots/${id}`);
      toast.success('Shoot deleted');
      fetchShoots();
    } catch (err) {
      toast.error('Failed to delete shoot');
    }
  };

  const filteredShoots = shoots.filter(s => {
    const matchSearch = s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        s.person_filmed?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = statusFilter === 'All' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Completed': return 'badge badge-success';
      case 'Shooting': case 'Editing': return 'badge badge-info';
      case 'Scheduled': return 'badge badge-warning';
      default: return 'badge badge-neutral';
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Shoots</h1>
          <p>Manage and track all production sessions.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={18} /> New Shoot
          </button>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Schedule New Shoot">
        <form onSubmit={handleCreate} style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Title</label>
            <input required className="input" value={newShoot.title} onChange={e => setNewShoot({ ...newShoot, title: e.target.value })} placeholder="e.g. Corporate Promo 2025" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Subject / Client</label>
            <input required className="input" value={newShoot.person_filmed} onChange={e => setNewShoot({ ...newShoot, person_filmed: e.target.value })} placeholder="e.g. ACME Corp" />
          </div>
          <div className="form-group">
            <label>Start Date & Time</label>
            <input type="datetime-local" required className="input" value={newShoot.start_datetime} onChange={e => setNewShoot({ ...newShoot, start_datetime: e.target.value })} />
          </div>
          <div className="form-group">
            <label>End Date & Time</label>
            <input type="datetime-local" className="input" value={newShoot.end_datetime} onChange={e => setNewShoot({ ...newShoot, end_datetime: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Duration (hrs)</label>
            <input type="number" step="0.5" min="0.5" required className="input" value={newShoot.duration_hours} onChange={e => setNewShoot({ ...newShoot, duration_hours: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Output Target</label>
            <input className="input" value={newShoot.output_duration} onChange={e => setNewShoot({ ...newShoot, output_duration: e.target.value })} placeholder="e.g. 3x 1min Reels" />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Details / Notes</label>
            <input className="input" value={newShoot.details} onChange={e => setNewShoot({ ...newShoot, details: e.target.value })} placeholder="Location, gear needed, special instructions..." />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Shoot</button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editingShoot} onClose={() => setEditingShoot(null)} title="Quick Edit Shoot">
        {editingShoot && (
          <form onSubmit={handleEditSubmit} style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Title</label>
              <input required className="input" value={editingShoot.title} onChange={e => setEditingShoot({ ...editingShoot, title: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Subject / Client</label>
              <input required className="input" value={editingShoot.person_filmed} onChange={e => setEditingShoot({ ...editingShoot, person_filmed: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Start Date & Time</label>
              <input type="datetime-local" className="input" value={editingShoot.start_datetime || ''} onChange={e => setEditingShoot({ ...editingShoot, start_datetime: e.target.value })} />
            </div>
            <div className="form-group">
              <label>End Date & Time</label>
              <input type="datetime-local" className="input" value={editingShoot.end_datetime || ''} onChange={e => setEditingShoot({ ...editingShoot, end_datetime: e.target.value })} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--surface-border)', paddingTop: '16px' }}>
              <label>Task Progress (%)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <input type="range" min="0" max="100" style={{ flex: 1, accentColor: 'var(--accent-base)' }} value={editingShoot.progress || 0} onChange={e => {
                  const val = parseInt(e.target.value);
                  setEditingShoot({ ...editingShoot, progress: val, task_status: val === 100 ? 'completed' : val === 0 ? 'pending' : 'in_progress' });
                }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{editingShoot.progress || 0}%</span>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '16px' }}>
              <button type="button" className="btn" onClick={() => setEditingShoot(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Changes</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            className="input"
            style={{ paddingLeft: '38px' }}
            placeholder="Search title or subject..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <Filter size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <select
            className="input"
            style={{ paddingLeft: '38px', cursor: 'pointer' }}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Shooting">Shooting</option>
            <option value="Editing">Editing</option>
            <option value="Reviewing">Reviewing</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="loading-spinner"></div>
      ) : (
        <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {filteredShoots.map(shoot => (
            <Link key={shoot.id} to={`/shoots/${shoot.id}`} className="glass glass-card" style={{ display: 'block', textDecoration: 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div style={{ padding: '8px', background: 'var(--accent-glow)', borderRadius: '8px', flexShrink: 0 }}>
                    <Camera size={18} color="var(--accent-base)" />
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shoot.title}</h3>
                </div>
                <span className={getStatusBadge(shoot.status)} style={{ marginLeft: '8px', flexShrink: 0 }}>{shoot.status}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} /> {shoot.start_datetime ? new Date(shoot.start_datetime).toLocaleString() : shoot.shoot_date || '—'}
                </div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Subject: </strong>{shoot.person_filmed || '—'}</div>
                {/* Progress Bar natively rendering */}
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '4px', color: 'var(--text-primary)' }}>
                    <span>{shoot.task_status === 'completed' ? 'Done' : shoot.task_status === 'in_progress' ? 'In Progress' : 'Pending'}</span>
                    <span>{shoot.progress || 0}%</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--surface-border)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${shoot.progress || 0}%`, background: shoot.progress === 100 ? '#10b981' : 'var(--accent-base)' }} />
                  </div>
                </div>
              </div>

              {/* Edit / Delete overlay for ADMIN */}
              {isAdmin && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }} onClick={e => e.preventDefault()}>
                  <button className="btn" style={{ flex: 1, padding: '6px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)' }} onClick={(e) => { e.preventDefault(); setEditingShoot(shoot); }}>
                    <Edit2 size={14} /> Quick Edit
                  </button>
                  <button className="btn" style={{ padding: '6px', color: 'var(--danger-color)', background: 'transparent', border: '1px solid rgba(239,68,68,0.2)' }} onClick={(e) => handleDelete(e, shoot.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </Link>
          ))}
          {filteredShoots.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed var(--surface-border)' }}>
              <Camera size={40} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
              <h3>No shoots found</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Adjust your search or filters, or create a new shoot.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
