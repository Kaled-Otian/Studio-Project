import { useState, useEffect } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Plus, ClipboardList, CheckCircle, Clock, AlertCircle, Search } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';

export default function Tasks() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [tasks, setTasks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [shoots, setShoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', shoot_id: '', assigned_to: '', target_count: 0 });
  const [userSearch, setUserSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const isAdminUser = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const fetchAll = async () => {
    try {
      const promises = [api.get('/tasks'), api.get('/shoots')];
      // Fetch all active users for assignment autocomplete (admins only create tasks)
      if (isAdminUser) promises.push(api.get('/users/basic'));
      const results = await Promise.all(promises);
      setTasks(results[0].data);
      setShoots(results[1].data);
      if (isAdminUser && results[2]) setAllUsers(results[2].data);
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchAll();
    socket.on('task_created', handleUpdate);
    socket.on('task_updated', handleUpdate);
    socket.on('task_deleted', handleUpdate);
    return () => {
      socket.off('task_created', handleUpdate);
      socket.off('task_updated', handleUpdate);
      socket.off('task_deleted', handleUpdate);
    };
  }, [socket]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/tasks', newTask);
      toast.success('Task assigned!');
      setShowCreate(false);
      setNewTask({ title: '', description: '', shoot_id: '', assigned_to: '', target_count: 0 });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    }
  };

  const handleStatusChange = async (taskId, status, completedCount = undefined, incompleteCount = undefined) => {
    try {
      const payload = { status };
      if (completedCount !== undefined) payload.completed_count = completedCount;
      if (incompleteCount !== undefined) payload.incomplete_count = incompleteCount;

      await api.patch(`/tasks/${taskId}/status`, payload);
      toast.success('Task updated');
      setTasks(tasks.map(t => t.id === taskId ? { 
        ...t, 
        status, 
        completed_count: completedCount !== undefined ? completedCount : t.completed_count,
        incomplete_count: incompleteCount !== undefined ? incompleteCount : t.incomplete_count
      } : t));
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update task');
    }
  };

  const promptIncomplete = (task) => {
    const raw = prompt(`How many items to mark as Not Completed / Abandoned?\n(Current: ${task.incomplete_count || 0})`, task.incomplete_count || 0);
    if (raw === null) return;
    const val = parseInt(raw);
    if (!isNaN(val) && val >= 0) {
      handleStatusChange(task.id, task.status, task.completed_count, val);
    }
  };

  const handleDelete = async (taskId) => {
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success('Task deleted');
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  const statusConfig = {
    pending: { label: 'Pending', icon: <Clock size={14} />, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    in_progress: { label: 'In Progress', icon: <AlertCircle size={14} />, color: 'var(--accent-base)', bg: 'var(--accent-glow)' },
    done: { label: 'Done', icon: <CheckCircle size={14} />, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  };

  const filteredByStatus = (list) => statusFilter === 'all' ? list : list.filter(t => t.status === statusFilter);
  const myTasks = filteredByStatus(tasks.filter(t => parseInt(t.assigned_to) === parseInt(user.id)));
  const delegatedTasks = filteredByStatus(tasks.filter(t => parseInt(t.assigned_by) === parseInt(user.id) && parseInt(t.assigned_to) !== parseInt(user.id)));
  const filteredUsers = allUsers.filter(u => 
    u.name?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.abbreviation?.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  if (loading) return <div className="loading-spinner"></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Tasks</h1>
          <p>{isAdminUser ? 'Manage team task assignments and delegations.' : 'Your assigned tasks.'}</p>
        </div>
        {isAdminUser && (
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
            <Plus size={16} /> Assign Task
          </button>
        )}
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {[['all', 'All'], ['pending', 'Pending'], ['in_progress', 'In Progress'], ['done', 'Done']].map(([val, label]) => (
          <button key={val} className="btn" onClick={() => setStatusFilter(val)} style={{
            padding: '6px 14px', fontSize: '0.82rem', fontWeight: 500,
            background: statusFilter === val ? 'var(--accent-base)' : 'rgba(255,255,255,0.05)',
            color: statusFilter === val ? 'white' : 'var(--text-secondary)',
            border: statusFilter === val ? 'none' : '1px solid var(--surface-border)',
          }}>{label}</button>
        ))}
      </div>

      {/* Create Form */}
      {showCreate && isAdminUser && (
        <div className="glass glass-card" style={{ marginBottom: '28px' }}>
          <h3 style={{ marginBottom: '20px' }}>New Task Assignment</h3>
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Task Title</label>
              <input required className="input" value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })} placeholder="e.g. Review final cut for client" />
            </div>
            <div className="form-group">
              <label>Assign To</label>
              <div style={{ position: 'relative' }}>
                <input className="input" placeholder="Search by name, initials, or email..." value={newTask.assigned_to ? (allUsers.find(u => String(u.id) === String(newTask.assigned_to))?.name || newTask.assigned_to) : userSearch} onChange={e => { setUserSearch(e.target.value); setNewTask({ ...newTask, assigned_to: '' }); }} onFocus={() => setUserSearch('')} autoComplete="off" />
                {userSearch && !newTask.assigned_to && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--surface-color)', border: '1px solid var(--surface-border)', borderRadius: '0 0 8px 8px', maxHeight: '200px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                    {filteredUsers.length === 0 ? (
                      <div style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No users found</div>
                    ) : (
                      filteredUsers.map(u => (
                        <div key={u.id} onClick={() => { setNewTask({ ...newTask, assigned_to: u.id }); setUserSearch(''); }} style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>{u.abbreviation || u.name?.charAt(0)}</div>
                          <div>
                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>{u.name}</p>
                            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.role} {u.job_title ? `· ${u.job_title}` : ''}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="form-group">
              <label>Related Shoot (optional)</label>
              <select className="input" value={newTask.shoot_id} onChange={e => setNewTask({ ...newTask, shoot_id: e.target.value })}>
                <option value="">— None —</option>
                {shoots.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Target Count (optional)</label>
              <input type="number" min="0" className="input" value={newTask.target_count || ''} onChange={e => setNewTask({ ...newTask, target_count: parseInt(e.target.value) || 0 })} placeholder="e.g. 10 videos" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Description (optional)</label>
              <textarea className="input" style={{ minHeight: '80px', fontFamily: 'inherit', resize: 'vertical' }} value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} placeholder="Additional context or instructions..." />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: '12px' }}>
              <button type="submit" className="btn btn-primary" disabled={!newTask.assigned_to}>Assign Task</button>
              <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* My Tasks */}
      <div style={{ marginBottom: '32px' }}>
        <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ClipboardList size={18} color="var(--accent-base)" /> Assigned to Me ({myTasks.length})
        </h3>
        {myTasks.length === 0 ? (
          <div className="glass glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            No tasks assigned to you.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '12px' }}>
            {myTasks.map(task => {
              const sc = statusConfig[task.status] || statusConfig.pending;
              const isAssignedToMe = parseInt(task.assigned_to) === parseInt(user.id);
              return (
                <div key={task.id} className="glass glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{task.title}</h4>
                      <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', background: sc.bg, color: sc.color }}>
                        {sc.icon} {sc.label}
                      </span>
                    </div>
                    {task.description && <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{task.description}</p>}
                    
                    {task.target_count > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px', fontWeight: 500, flexWrap: 'wrap', gap: '8px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Status: 
                            <span style={{ color: 'var(--text-primary)', marginLeft: '4px' }}>
                              {task.completed_count || 0} completed
                              {task.incomplete_count > 0 ? `, ${task.incomplete_count} incomplete` : ''}
                              {` (${Math.max(0, task.target_count - (task.completed_count || 0) - (task.incomplete_count || 0))} remaining)`}
                            </span>
                          </span>
                          <span style={{color: 'var(--text-muted)'}}>Target: {task.target_count}</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ height: '100%', background: task.status === 'done' ? '#10b981' : 'var(--accent-base)', width: `${Math.min(100, ((task.completed_count || 0) / task.target_count) * 100)}%`, transition: 'width 0.3s' }}></div>
                          <div style={{ height: '100%', background: 'var(--danger-color)', width: `${Math.min(100, ((task.incomplete_count || 0) / task.target_count) * 100)}%`, transition: 'width 0.3s', opacity: 0.6 }}></div>
                        </div>
                      </div>
                    )}

                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {task.shoot_title ? `📽 ${task.shoot_title} · ` : ''}From: {task.assigned_by_name}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
                    {task.target_count > 0 && isAssignedToMe && task.status !== 'done' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '8px', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '2px' }}>
                          <button className="btn" style={{ padding: '2px 8px', fontSize: '0.9rem', border: 'none' }} onClick={() => handleStatusChange(task.id, 'in_progress', Math.max(0, (task.completed_count || 0) - 1))}>-</button>
                          <span style={{ fontSize: '0.9rem', fontWeight: 600, minWidth: '16px', textAlign: 'center' }}>{task.completed_count}</span>
                          <button className="btn" style={{ padding: '2px 8px', fontSize: '0.9rem', border: 'none' }} onClick={() => handleStatusChange(task.id, ((task.completed_count || 0) + 1 >= task.target_count) ? 'done' : 'in_progress', Math.min(task.target_count, (task.completed_count || 0) + 1))}>+</button>
                        </div>
                        <button className="btn" style={{ padding: '4px 10px', fontSize: '0.75rem', border: '1px solid var(--surface-border)' }} onClick={() => promptIncomplete(task)} title="Mark items as not completed/abandoned">
                          Set Incomplete...
                        </button>
                      </div>
                    )}
                    
                    {task.status !== 'in_progress' && task.status !== 'done' && isAssignedToMe && task.target_count === 0 && (
                      <button className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem', border: '1px solid var(--surface-border)' }} onClick={() => handleStatusChange(task.id, 'in_progress')}>
                        Start
                      </button>
                    )}
                    {task.status !== 'done' && isAssignedToMe && task.target_count === 0 && (
                      <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleStatusChange(task.id, 'done')}>
                        Mark Done
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tasks I Delegated */}
      {delegatedTasks.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '16px' }}>Delegated by Me ({delegatedTasks.length})</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            {delegatedTasks.map(task => {
              const sc = statusConfig[task.status] || statusConfig.pending;
              return (
                <div key={task.id} className="glass glass-card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{task.title}</h4>
                      <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600, background: sc.bg, color: sc.color }}>
                        {sc.label}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Assigned to: {task.assigned_to_name}
                      {task.shoot_title ? ` · 📽 ${task.shoot_title}` : ''}
                    </p>
                  </div>
                  <button className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.08)', color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => handleDelete(task.id)}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
