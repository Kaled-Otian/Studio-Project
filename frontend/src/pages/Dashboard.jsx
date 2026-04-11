import { useState, useEffect, useCallback } from 'react';
import { useAuth, api } from '../context/AuthContext';
import { Link } from 'react-router-dom';
import { Camera, CheckSquare, Clock, ClipboardList, ArrowRight, AlertCircle, TrendingUp } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import toast from 'react-hot-toast';

const ROLES = { SUPER_ADMIN: 3, ADMIN: 2, USER: 1 };
const hasRole = (user, minRole) => (ROLES[user?.role] || 0) >= ROLES[minRole];

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const fetchAll = useCallback(async () => {
    try {
      const promises = [
        api.get('/shoots'),
        api.get('/tasks')
      ];
      if (hasRole(user, 'ADMIN')) promises.push(api.get('/analytics'));

      const results = await Promise.all(promises);
      const all = results[0].data;
      const allTasks = results[1].data;
      const analyticsData = hasRole(user, 'ADMIN') ? results[2].data : null;

      // Filter tasks based on role
      const myPendingTasks = hasRole(user, 'ADMIN')
        ? allTasks.filter(t => t.status !== 'done')
        : allTasks.filter(t => t.status !== 'done' && parseInt(t.assigned_to) === parseInt(user.id));

      setStats({
        active: all.filter(s => s.status === 'Shooting' || s.status === 'Editing').length,
        pending: all.filter(s => s.status === 'Scheduled').length,
        completed: all.filter(s => s.status === 'Completed').length,
        total: all.length,
        tasksPending: myPendingTasks.filter(t => t.status === 'pending').length,
        tasksInProgress: myPendingTasks.filter(t => t.status === 'in_progress').length,
        adminData: analyticsData // from analytics endpoint
      });

      setTasks(myPendingTasks.slice(0, 8));
    } catch (err) {
      toast.error('Failed to load dashboard stats. Retrying or incomplete data.');
      if(!stats) {
        setStats({ active: 0, pending: 0, completed: 0, total: 0, tasksPending: 0, tasksInProgress: 0, adminData: null });
        setTasks([]);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!socket) return;
    socket.on('shoot_created', fetchAll);
    socket.on('shoot_updated', fetchAll);
    socket.on('shoot_deleted', fetchAll);
    socket.on('task_created', fetchAll);
    socket.on('task_updated', fetchAll);
    socket.on('task_deleted', fetchAll);

    return () => {
      socket.off('shoot_created', fetchAll);
      socket.off('shoot_updated', fetchAll);
      socket.off('shoot_deleted', fetchAll);
      socket.off('task_created', fetchAll);
      socket.off('task_updated', fetchAll);
      socket.off('task_deleted', fetchAll);
    };
  }, [socket, fetchAll]);

  if (loading) return <div className="loading-spinner"></div>;
  if (!stats) return null;

  const statCards = [
    { label: 'Active Shoots', value: stats.active, icon: <Camera size={22}/>, color: 'var(--accent-base)', bg: 'var(--accent-glow)', link: '/shoots?status=Shooting' },
    { label: 'Scheduled', value: stats.pending, icon: <Clock size={22}/>, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', link: '/shoots?status=Scheduled' },
    { label: 'Completed', value: stats.completed, icon: <CheckSquare size={22}/>, color: '#10b981', bg: 'rgba(16,185,129,0.12)', link: '/shoots?status=Completed' },
    { label: 'Pending Tasks', value: stats.tasksPending, icon: <AlertCircle size={22}/>, color: '#ef4444', bg: 'rgba(239,68,68,0.12)', link: '/tasks' },
  ];

  const taskStatusColor = { pending: '#f59e0b', in_progress: 'var(--accent-base)', done: '#10b981' };

  const handleQuickStatusChange = async (taskId, newStatus, completedCount) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus, completed_count: completedCount });
      fetchAll();
    } catch { toast.error('Failed to update task'); }
  };

  return (
    <div>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ marginBottom: '4px' }}>Dashboard</h1>
        <p>Welcome back, <strong style={{ color: 'var(--text-primary)' }}>{user.name}</strong>. Here's your studio overview.</p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
        {statCards.map(card => (
          <Link
            key={card.label}
            to={card.link}
            style={{ textDecoration: 'none' }}
          >
            <div className="glass glass-card" style={{ cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', height: '100%' }}>
                <div style={{ padding: '14px', background: card.bg, borderRadius: '12px', color: card.color, flexShrink: 0, boxShadow: `0 0 10px ${card.bg}` }}>
                  {card.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2px', fontWeight: 500 }}>{card.label}</p>
                  <h2 style={{ margin: 0, fontSize: '2rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{card.value}</h2>
                </div>
                <ArrowRight size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Admin Analytics Block */}
      {hasRole(user, 'ADMIN') && stats.adminData && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={18} color="var(--accent-base)" /> System Analytics & Audit
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div className="glass glass-card" style={{ padding: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Users</p>
              <h2 style={{ margin: '4px 0 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>{stats.adminData.totalUsers} <span style={{fontSize: '0.9rem', color: 'var(--text-muted)'}}>({stats.adminData.activeUsers} Active)</span></h2>
            </div>
            <div className="glass glass-card" style={{ padding: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Global Tasks Completed</p>
              <h2 style={{ margin: '4px 0 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>{stats.adminData.tasksCompleted}</h2>
            </div>
            <div className="glass glass-card" style={{ padding: '16px' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active Shoots Context</p>
              <h2 style={{ margin: '4px 0 0', fontSize: '1.5rem', color: 'var(--text-primary)' }}>{stats.adminData.shootsInProgress}</h2>
            </div>
          </div>
          
          <div className="glass glass-card" style={{ padding: '16px' }}>
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Recent Activity Logs</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stats.adminData.recentLogs.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No logs yet.</p>
              ) : (
                stats.adminData.recentLogs.map((log, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '0.85rem' }}><strong style={{ color: 'var(--accent-base)' }}>{log.user_name || 'System'}</strong>: {log.action}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tasks Panel */}
      <div className="glass glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ClipboardList size={18} color="var(--accent-base)" /> {hasRole(user, 'ADMIN') ? 'Pending Tasks' : 'My Tasks'}
          </h3>
          <Link to="/tasks" style={{ color: 'var(--accent-base)', fontSize: '0.85rem', fontWeight: 500 }}>View All →</Link>
        </div>

        {tasks.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <CheckSquare size={36} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
            <p style={{ margin: 0 }}>No pending tasks — you're all caught up!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tasks.map(task => {
              const isMyTask = parseInt(task.assigned_to) === parseInt(user.id);
              return (
                <div key={task.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 16px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                  borderLeft: `3px solid ${taskStatusColor[task.status] || 'var(--surface-border)'}`,
                  gap: '12px'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        {task.title}
                      </p>
                      {task.target_count > 0 && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '1px 8px', borderRadius: '99px' }}>
                          {task.completed_count || 0}/{task.target_count}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.shoot_title ? `📽 ${task.shoot_title} · ` : ''}{hasRole(user, 'ADMIN') ? `Assigned to: ${task.assigned_to_name}` : `From: ${task.assigned_by_name}`}
                    </p>
                    {task.target_count > 0 && (
                      <div style={{ marginTop: '6px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: task.status === 'done' ? '#10b981' : 'var(--accent-base)', width: `${Math.min(100, ((task.completed_count || 0) / task.target_count) * 100)}%`, transition: 'width 0.3s' }}></div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
                    {/* Quick +/- for count-based tasks */}
                    {task.target_count > 0 && isMyTask && task.status !== 'done' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button className="btn" style={{ padding: '3px 8px', fontSize: '0.85rem', lineHeight: 1 }} onClick={() => handleQuickStatusChange(task.id, 'in_progress', Math.max(0, (task.completed_count || 0) - 1))}>−</button>
                        <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '0.85rem', lineHeight: 1 }} onClick={() => {
                          const next = Math.min(task.target_count, (task.completed_count || 0) + 1);
                          handleQuickStatusChange(task.id, next >= task.target_count ? 'done' : 'in_progress', next);
                        }}>+</button>
                      </div>
                    )}
                    {/* Quick status toggle for non-count tasks */}
                    {task.target_count === 0 && isMyTask && task.status !== 'done' && (
                      <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => handleQuickStatusChange(task.id, task.status === 'pending' ? 'in_progress' : 'done')}>
                        {task.status === 'pending' ? 'Start' : 'Done'}
                      </button>
                    )}
                    <span style={{
                      padding: '3px 10px', borderRadius: '99px', fontSize: '0.72rem', fontWeight: 600,
                      background: `${taskStatusColor[task.status]}15`, color: taskStatusColor[task.status],
                      textTransform: 'capitalize', whiteSpace: 'nowrap'
                    }}>
                      {task.status?.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
