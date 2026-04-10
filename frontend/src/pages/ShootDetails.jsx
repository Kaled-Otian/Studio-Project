import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, useAuth } from '../context/AuthContext';
import { UserPlus, CheckSquare, MessageSquare, Edit2, X, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

const ROLES = { SUPER_ADMIN: 3, ADMIN: 2, USER: 1 };
const hasRole = (user, minRole) => (ROLES[user?.role] || 0) >= ROLES[minRole];

export default function ShootDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [shoot, setShoot] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [assignment, setAssignment] = useState({ user_id: '', task_description: '', is_main_editor: false, target_count: 0 });
  const [noteContent, setNoteContent] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [assignSearch, setAssignSearch] = useState('');

  const isAdmin = hasRole(user, 'ADMIN');

  const fetchData = async () => {
    setError(null);
    try {
      const [shootRes, usersRes] = await Promise.all([
        api.get(`/shoots/${id}`),
        isAdmin ? api.get('/users/basic') : Promise.resolve({ data: [] })
      ]);
      setShoot(shootRes.data);
      setEditForm(shootRes.data);
      if (isAdmin) setUsers(usersRes.data);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to load shoot details';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  // Fix: coerce both sides to int for reliable comparison
  const hasEditAccess = isAdmin || (shoot?.assignments?.some(a => parseInt(a.user_id) === parseInt(user.id)));

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/shoots/${id}`, editForm);
      toast.success('Shoot updated');
      setShoot({ ...shoot, ...editForm });
      setIsEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/shoots/${id}/assignments`, assignment);
      toast.success('Editor assigned!');
      setAssignment({ user_id: '', task_description: '', is_main_editor: false, target_count: 0 });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Assignment failed');
    }
  };

  const handleRemoveAssignment = async (assignmentId) => {
    try {
      await api.delete(`/shoots/${id}/assignments/${assignmentId}`);
      toast.success('Assignment removed');
      fetchData();
    } catch (err) {
      toast.error('Failed to remove assignment');
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    try {
      await api.post(`/shoots/${id}/notes`, { content: noteContent });
      toast.success('Note added');
      setNoteContent('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add note');
    }
  };

  const handleStatusChange = async (newStatus) => {
    setIsUpdatingStatus(true);
    try {
      await api.patch(`/shoots/${id}/status`, { status: newStatus });
      toast.success('Status updated');
      setShoot(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const statusColors = {
    Scheduled: '#f59e0b', Shooting: 'var(--accent-base)',
    Editing: '#8b5cf6', Reviewing: '#06b6d4', Completed: '#10b981'
  };

  if (loading) return (
    <div>
      <div className="skeleton" style={{ height: '140px', marginBottom: '24px', borderRadius: '12px' }}></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
        <div className="skeleton" style={{ height: '280px', borderRadius: '12px' }}></div>
        <div className="skeleton" style={{ height: '280px', borderRadius: '12px' }}></div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h3 style={{ color: 'var(--danger-color)', marginBottom: '8px' }}>Failed to load shoot</h3>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>{error}</p>
      <button className="btn btn-primary" onClick={fetchData}>Retry</button>
    </div>
  );

  if (!shoot) return <div style={{ textAlign: 'center', padding: '60px' }}>Shoot not found</div>;

  return (
    <div>
      {/* Header Card */}
      <div className="glass glass-card" style={{ marginBottom: '24px' }}>
        {!isEditing ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="Go Back">
                <ArrowLeft size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <h1 style={{ margin: 0 }}>{shoot.title}</h1>
                  <span style={{
                    padding: '4px 12px', borderRadius: '99px', fontSize: '0.8rem', fontWeight: 600,
                    background: `${statusColors[shoot.status]}20`, color: statusColors[shoot.status]
                  }}>{shoot.status}</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  <span><strong style={{ color: 'var(--text-primary)' }}>Subject:</strong> {shoot.person_filmed || '—'}</span>
                  <span><strong style={{ color: 'var(--text-primary)' }}>Date:</strong> {shoot.shoot_date || '—'}</span>
                  <span><strong style={{ color: 'var(--text-primary)' }}>Duration:</strong> {shoot.duration_hours}hrs</span>
                  {shoot.output_duration && <span><strong style={{ color: 'var(--text-primary)' }}>Output:</strong> {shoot.output_duration}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                {hasEditAccess && (
                  <button className="btn" style={{ border: '1px solid var(--surface-border)', fontSize: '0.85rem', padding: '8px 14px' }} onClick={() => setIsEditing(true)}>
                    <Edit2 size={14} /> Edit
                  </button>
                )}
                {isAdmin && (
                  <select
                    value={shoot.status}
                    onChange={e => handleStatusChange(e.target.value)}
                    disabled={isUpdatingStatus}
                    className="input"
                    style={{ padding: '8px 12px', cursor: 'pointer', maxWidth: '160px' }}
                  >
                    {['Scheduled','Shooting','Editing','Reviewing','Completed'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {shoot.details && (
              <div style={{ padding: '14px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginTop: '12px' }}>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>{shoot.details}</p>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleEditSubmit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0 }}>Edit Shoot Details</h3>
              <button type="button" onClick={() => { setIsEditing(false); setEditForm(shoot); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Title</label>
                <input required className="input" value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Subject / Client</label>
                <input className="input" value={editForm.person_filmed || ''} onChange={e => setEditForm({ ...editForm, person_filmed: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Shoot Date</label>
                <input type="date" className="input" value={editForm.shoot_date || ''} onChange={e => setEditForm({ ...editForm, shoot_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Duration (hrs)</label>
                <input type="number" step="0.5" className="input" value={editForm.duration_hours || ''} onChange={e => setEditForm({ ...editForm, duration_hours: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Output Target</label>
                <input className="input" value={editForm.output_duration || ''} onChange={e => setEditForm({ ...editForm, output_duration: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label>Details</label>
                <textarea className="input" style={{ minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' }} value={editForm.details || ''} onChange={e => setEditForm({ ...editForm, details: e.target.value })} />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--surface-border)', paddingTop: '16px' }}>
                <label>Task Progress (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <input type="range" min="0" max="100" style={{ flex: 1, accentColor: 'var(--accent-base)' }} value={editForm.progress || 0} onChange={e => {
                    const val = parseInt(e.target.value);
                    setEditForm({ ...editForm, progress: val, task_status: val === 100 ? 'completed' : val === 0 ? 'pending' : 'in_progress' });
                  }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{editForm.progress || 0}%</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary">Save Changes</button>
              <button type="button" className="btn" onClick={() => { setIsEditing(false); setEditForm(shoot); }}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {/* Bottom Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        {/* Left: Assignments + Notes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Assignments */}
          <div className="glass glass-card">
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckSquare size={18} color="var(--accent-base)" /> Team Assignments
            </h3>
            {(shoot.assignments?.length === 0 || !shoot.assignments) ? (
              <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--surface-border)', borderRadius: '8px' }}>
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>No team assigned yet.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {shoot.assignments.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                    borderLeft: a.is_main_editor ? '3px solid var(--accent-base)' : '3px solid transparent'
                  }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>
                        {a.user_name}
                        {a.is_main_editor ? <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: 'var(--accent-base)', fontWeight: 400 }}>Main Editor</span> : null}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{a.task_description}</p>
                      {a.target_count > 0 && (
                        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', fontWeight: 500, color: a.status === 'done' ? '#10b981' : 'var(--accent-base)' }}>
                          Status: {a.completed_count || 0}/{a.target_count} ({a.incomplete_count || 0} inc., {Math.max(0, a.target_count - (a.completed_count || 0) - (a.incomplete_count || 0))} rem)
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <button onClick={() => handleRemoveAssignment(a.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="glass glass-card">
            <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} color="var(--accent-base)" /> Notes & Feedback
            </h3>
            <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Add a comment or update..."
                required
              />
              <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>Post</button>
            </form>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(shoot.notes?.length === 0 || !shoot.notes) ? (
                <div style={{ padding: '20px', textAlign: 'center', border: '1px dashed var(--surface-border)', borderRadius: '8px' }}>
                  <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>No notes yet.</p>
                </div>
              ) : (
                shoot.notes.map(n => (
                  <div key={n.id} style={{ padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <strong style={{ fontSize: '0.875rem' }}>{n.user_name}</strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{n.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right: Assign Team (ADMIN only) */}
        {isAdmin && (
          <div className="glass glass-card">
            <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={18} color="var(--accent-base)" /> Assign Team Member
            </h3>
            <form onSubmit={handleAssign} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label>Team Member</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    placeholder="Search by name, initials, or email..."
                    value={assignment.user_id ? (users.find(u => String(u.id) === String(assignment.user_id))?.name || '') : assignSearch}
                    onChange={e => { setAssignSearch(e.target.value); setAssignment({ ...assignment, user_id: '' }); }}
                    onFocus={() => { if (assignment.user_id) { setAssignSearch(''); setAssignment({ ...assignment, user_id: '' }); } }}
                    autoComplete="off"
                  />
                  {assignSearch && !assignment.user_id && (() => {
                    const filtered = users.filter(u =>
                      u.name?.toLowerCase().includes(assignSearch.toLowerCase()) ||
                      u.abbreviation?.toLowerCase().includes(assignSearch.toLowerCase()) ||
                      u.email?.toLowerCase().includes(assignSearch.toLowerCase())
                    );
                    return (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface-color)', border: '1px solid var(--surface-border)', borderRadius: '0 0 8px 8px', maxHeight: '220px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                        {filtered.length === 0 ? (
                          <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No users found</div>
                        ) : (
                          filtered.map(u => (
                            <div key={u.id} onClick={() => { setAssignment({ ...assignment, user_id: u.id }); setAssignSearch(''); }} style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>{u.abbreviation || u.name?.charAt(0)}</div>
                              <div>
                                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>{u.name}</p>
                                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.role}{u.job_title ? ` · ${u.job_title}` : ''}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div className="form-group">
                <label>Task Description</label>
                <input required className="input" value={assignment.task_description} onChange={e => setAssignment({ ...assignment, task_description: e.target.value })} placeholder="e.g. Cut and color-grade the highlights" />
              </div>
              <div className="form-group">
                <label>Target Count / Number of Items (optional)</label>
                <input type="number" min="0" className="input" value={assignment.target_count || ''} onChange={e => setAssignment({ ...assignment, target_count: parseInt(e.target.value) || 0 })} placeholder="e.g. 5 videos" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" id="mainEditor" checked={assignment.is_main_editor} onChange={e => setAssignment({ ...assignment, is_main_editor: e.target.checked })} style={{ width: 'auto', accentColor: 'var(--accent-base)' }} />
                <label htmlFor="mainEditor" style={{ margin: 0, cursor: 'pointer', fontSize: '0.9rem' }}>Mark as Main Editor</label>
              </div>
              <button type="submit" className="btn btn-primary" disabled={!assignment.user_id}>Assign</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
