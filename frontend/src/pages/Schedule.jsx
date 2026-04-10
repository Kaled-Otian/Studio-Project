import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Calendar as CalendarIcon, List, Plus, MapPin, Clock, Trash2, Edit2, Users, Link2, LayoutGrid, ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { useSocket } from '../context/SocketContext';
import { isAdmin, formatDateTime, SCHEDULE_TYPE_COLORS } from '../lib/roles';

const TYPE_ICON = { meeting: '🤝', shoot: '🎬', deadline: '🔴', review: '🔍', other: '📌', task: '📋' };

const BLANK_FORM = {
  title: '', description: '', type: 'meeting',
  start_datetime: '', end_datetime: '', all_day: false,
  location: '', color: '#c87212', shoot_id: '', attendee_ids: []
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// ── Helper: pad number ──────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0');

// ── Helper: format date to YYYY-MM-DD ───────────────────────────────────────
const toKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── Helper: same day check ──────────────────────────────────────────────────
const isSameDay = (a, b) => a && b && toKey(a) === toKey(b);

// ── Helper: generate calendar days for a month ──────────────────────────────
function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  // Padding from previous month
  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(year, month, -first.getDay() + i + 1);
    days.push({ date: d, isCurrentMonth: false });
  }
  // Current month
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  // Padding to fill 6 rows
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - last.getDate() - first.getDay() + 1);
    days.push({ date: d, isCurrentMonth: false });
  }
  return days;
}

// ── Helper: get week days ───────────────────────────────────────────────────
function getWeekDays(date) {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// ── Helper: safe date parse ─────────────────────────────────────────────────
function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export default function Schedule() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [schedules, setSchedules] = useState([]);
  const [shoots, setShoots] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('month'); // 'list' | 'month' | 'week' | 'day' | 'year'
  const [modal, setModal] = useState(null);
  const [createMode, setCreateMode] = useState('event');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [calDate, setCalDate] = useState(new Date());
  const fetchRef = useRef(false);

  const admin = isAdmin(user);

  // ── Data Fetching (debounce-protected) ──────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (fetchRef.current) return;
    fetchRef.current = true;
    try {
      const [schRes, shRes, taskRes] = await Promise.all([
        api.get('/schedules'),
        api.get('/shoots'),
        api.get('/tasks')
      ]);
      setSchedules(Array.isArray(schRes.data) ? schRes.data : []);
      setShoots(Array.isArray(shRes.data) ? shRes.data : []);
      setTasks(Array.isArray(taskRes.data) ? taskRes.data : []);
      if (admin) {
        try {
          const usersRes = await api.get('/users/basic');
          setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);
        } catch (_) { }
      }
      setError(null);
    } catch (err) {
      console.error('Schedule fetch error:', err);
      setError('Failed to load schedule data');
    } finally {
      setLoading(false);
      setTimeout(() => { fetchRef.current = false; }, 500);
    }
  }, [admin]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Socket (with cleanup) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const update = () => fetchAll();
    const events = ['shoot_created', 'shoot_updated', 'shoot_deleted', 'schedule_updated', 'task_created', 'task_updated'];
    events.forEach(ev => socket.on(ev, update));
    return () => events.forEach(ev => socket.off(ev, update));
  }, [socket, fetchAll]);

  // ── Merge all data into unified events ────────────────────────────────────
  const allEvents = useMemo(() => {
    const result = [];

    // Schedule events
    schedules.forEach(s => {
      const start = safeDate(s.start_datetime);
      if (!start) return; // Skip invalid
      result.push({
        ...s,
        _key: `sch-${s.id}`,
        start,
        end: safeDate(s.end_datetime) || start,
        color: s.color || SCHEDULE_TYPE_COLORS[s.type] || '#c87212'
      });
    });

    // Shoots as events
    shoots.forEach(s => {
      const start = safeDate(s.start_datetime) || safeDate(s.shoot_date);
      if (!start) return;
      result.push({
        ...s,
        _key: `shoot-${s.id}`,
        isShoot: true,
        type: 'shoot',
        start,
        end: safeDate(s.end_datetime) || new Date(start.getTime() + 3600000),
        color: s.status === 'Completed' ? '#10b981' : s.status === 'Scheduled' ? '#f59e0b' : '#3b82f6'
      });
    });

    // Tasks as events
    tasks.forEach(t => {
      const start = safeDate(t.created_at);
      if (!start) return;
      result.push({
        ...t,
        _key: `task-${t.id}`,
        isTask: true,
        type: 'task',
        title: t.title || 'Untitled Task',
        start,
        end: start,
        color: t.status === 'done' ? '#10b981' : t.status === 'in_progress' ? '#3b82f6' : '#f59e0b',
        location: t.assigned_to_name ? `Assigned to: ${t.assigned_to_name}` : ''
      });
    });

    return result.sort((a, b) => a.start - b.start);
  }, [schedules, shoots, tasks]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let r = filterType === 'all' ? allEvents : allEvents.filter(s => s.type === filterType);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      r = r.filter(s =>
        s.title?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q) ||
        s.location?.toLowerCase().includes(q)
      );
    }
    return r;
  }, [allEvents, filterType, searchQuery]);

  // ── Events grouped by day key ─────────────────────────────────────────────
  const eventsByDay = useMemo(() => {
    const map = {};
    filtered.forEach(ev => {
      const key = toKey(ev.start);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [filtered]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navPrev = () => {
    const d = new Date(calDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else if (view === 'day') d.setDate(d.getDate() - 1);
    else if (view === 'year') d.setFullYear(d.getFullYear() - 1);
    setCalDate(d);
  };
  const navNext = () => {
    const d = new Date(calDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else if (view === 'day') d.setDate(d.getDate() + 1);
    else if (view === 'year') d.setFullYear(d.getFullYear() + 1);
    setCalDate(d);
  };
  const goToday = () => setCalDate(new Date());

  // ── Modal helpers ─────────────────────────────────────────────────────────
  const openCreate = (date = null) => {
    const now = date ? new Date(date) : new Date();
    if (isNaN(now.getTime())) return;
    const localISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
    setForm({ ...BLANK_FORM, start_datetime: localISO, attendee_ids: [user.id] });
    setCreateMode('event');
    setModal('create');
  };

  const openEdit = (s) => {
    setForm({
      title: s.title, description: s.description || '',
      type: s.type || 'meeting', start_datetime: s.start_datetime?.slice?.(0, 16) || '',
      end_datetime: s.end_datetime?.slice?.(0, 16) || '', all_day: !!s.all_day,
      location: s.location || '', color: s.color || '#c87212',
      shoot_id: s.shoot_id || '', attendee_ids: s.attendees?.map(a => a.user_id) || []
    });
    setSelected(s);
    setModal('edit');
  };

  const openDetail = (s) => { setSelected(s); setModal('detail'); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (modal === 'create' && createMode === 'shoot') {
        await api.post('/shoots', {
          title: form.title, details: form.description,
          start_datetime: form.start_datetime, end_datetime: form.end_datetime,
          person_filmed: form.location
        });
        toast.success('Shoot created!');
      } else {
        const payload = { ...form, attendee_ids: form.attendee_ids.map(Number) };
        if (modal === 'create') {
          await api.post('/schedules', payload);
          toast.success('Event created!');
        } else {
          await api.patch(`/schedules/${selected.id}`, payload);
          toast.success('Event updated!');
        }
      }
      setModal(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
  };

  const handleDelete = async (id, isShoot) => {
    if (!window.confirm(`Delete this ${isShoot ? 'shoot' : 'event'}?`)) return;
    try {
      if (isShoot) await api.delete(`/shoots/${id}`);
      else await api.delete(`/schedules/${id}`);
      toast.success('Deleted');
      setModal(null);
      fetchAll();
    } catch { toast.error('Failed to delete'); }
  };

  // ── Navigation label ──────────────────────────────────────────────────────
  const navLabel = useMemo(() => {
    if (view === 'month') return `${MONTHS[calDate.getMonth()]} ${calDate.getFullYear()}`;
    if (view === 'year') return `${calDate.getFullYear()}`;
    if (view === 'day') return `${DAYS_SHORT[calDate.getDay()]}, ${calDate.getDate()} ${MONTHS[calDate.getMonth()]} ${calDate.getFullYear()}`;
    if (view === 'week') {
      const wk = getWeekDays(calDate);
      return `${wk[0].getDate()} ${MONTHS[wk[0].getMonth()].slice(0, 3)} – ${wk[6].getDate()} ${MONTHS[wk[6].getMonth()].slice(0, 3)} ${wk[6].getFullYear()}`;
    }
    return '';
  }, [view, calDate]);

  // ── Loading / Error states ────────────────────────────────────────────────
  if (loading) return <div className="loading-spinner"></div>;
  if (error) return (
    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
      <p style={{ color: 'var(--danger-color)', marginBottom: '16px' }}>{error}</p>
      <button className="btn btn-primary" onClick={() => { setError(null); setLoading(true); fetchAll(); }}>Retry</button>
    </div>
  );

  const today = new Date();

  // ── Event chip component ──────────────────────────────────────────────────
  const EventChip = ({ ev, compact = false }) => (
    <div
      onClick={e => { e.stopPropagation(); openDetail(ev); }}
      title={ev.title}
      style={{
        fontSize: compact ? '0.7rem' : '0.78rem',
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: '4px',
        background: `${ev.color}18`,
        borderLeft: `3px solid ${ev.color}`,
        color: 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        cursor: 'pointer', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: '4px',
        transition: 'background 0.15s',
        marginBottom: '2px'
      }}
      onMouseEnter={e => e.currentTarget.style.background = `${ev.color}30`}
      onMouseLeave={e => e.currentTarget.style.background = `${ev.color}18`}
    >
      <span style={{ fontSize: compact ? '9px' : '11px', flexShrink: 0 }}>{TYPE_ICON[ev.type] || '📌'}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.title}</span>
    </div>
  );

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>Schedule</h1>
          <p>Events, meetings, deadlines and shoot sessions.</p>
        </div>
        <button className="btn btn-primary" onClick={() => openCreate()}>
          <Plus size={16} /> New Event
        </button>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* View switcher */}
        <div style={{ display: 'flex', gap: '3px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '3px' }}>
          {[['list', List, 'List'], ['day', Eye, 'Day'], ['week', LayoutGrid, 'Week'], ['month', CalendarIcon, 'Month'], ['year', CalendarIcon, 'Year']].map(([v, Icon, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 12px',
              borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 500,
              background: view === v ? 'var(--accent-base)' : 'transparent',
              color: view === v ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.15s'
            }}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Nav controls (not for list) */}
        {view !== 'list' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={navPrev} className="btn" style={{ padding: '6px 10px' }}><ChevronLeft size={16} /></button>
            <button onClick={goToday} className="btn" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Today</button>
            <button onClick={navNext} className="btn" style={{ padding: '6px 10px' }}><ChevronRight size={16} /></button>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginLeft: '8px', whiteSpace: 'nowrap' }}>{navLabel}</span>
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Search..."
            style={{ width: '180px', padding: '6px 12px', fontSize: '0.85rem' }}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <select className="input" style={{ width: 'auto', padding: '6px 10px', fontSize: '0.85rem' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            {['meeting', 'shoot', 'task', 'deadline', 'review', 'other'].map(t => (
              <option key={t} value={t}>{TYPE_ICON[t] || '📋'} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ══════════════════════ LIST VIEW ══════════════════════ */}
      {view === 'list' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.length === 0 && <EmptyState icon={CalendarIcon} title="No events scheduled" description="Create your first event to get started." action={<button className="btn btn-primary" onClick={() => openCreate()}><Plus size={14} /> New Event</button>} />}
          {filtered.map(s => {
            const typeColor = s.color || SCHEDULE_TYPE_COLORS[s.type] || '#c87212';
            const isPast = s.start < today;
            return (
              <div key={s._key} onClick={() => openDetail(s)} style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px',
                background: 'rgba(255,255,255,0.04)', borderRadius: '10px', cursor: 'pointer',
                border: '1px solid var(--surface-border)', borderLeft: `3px solid ${typeColor}`,
                opacity: isPast ? 0.6 : 1, transition: 'background 0.15s'
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              >
                <div style={{ fontSize: '1.3rem', flexShrink: 0 }}>{TYPE_ICON[s.type] || '📌'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{s.title}</strong>
                    <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '99px', background: `${typeColor}20`, color: typeColor, fontWeight: 600 }}>
                      {s.isTask ? 'Task' : s.isShoot ? s.status : s.type}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={11} /> {formatDateTime(s.start_datetime || s.start?.toISOString())}
                    </span>
                    {s.location && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} /> {s.location}</span>}
                  </div>
                </div>
                {(admin || parseInt(s.created_by) === parseInt(user.id)) && !s.isShoot && !s.isTask && (
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(s)} style={{ background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={13} /></button>
                    <button onClick={() => handleDelete(s.id, false)} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: 'var(--danger-color)' }}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══════════════════════ MONTH VIEW ══════════════════════ */}
      {view === 'month' && (() => {
        const days = getMonthDays(calDate.getFullYear(), calDate.getMonth());
        return (
          <div className="glass glass-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '12px' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.12)' }}>
              {DAYS_SHORT.map(d => (
                <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
              ))}
            </div>
            {/* Days grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
              {days.map(({ date, isCurrentMonth }, i) => {
                const key = toKey(date);
                const dayEvs = eventsByDay[key] || [];
                const isToday = isSameDay(date, today);
                return (
                  <div key={i} onClick={() => openCreate(date)} style={{
                    minHeight: '110px', padding: '6px', borderRight: '1px solid var(--surface-border)',
                    borderBottom: '1px solid var(--surface-border)', cursor: 'pointer',
                    background: isToday ? 'rgba(200,114,18,0.07)' : (!isCurrentMonth ? 'rgba(0,0,0,0.15)' : 'transparent'),
                    transition: 'background 0.15s', position: 'relative'
                  }}
                    onMouseEnter={e => { if (isCurrentMonth) e.currentTarget.style.background = isToday ? 'rgba(200,114,18,0.12)' : 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = isToday ? 'rgba(200,114,18,0.07)' : (!isCurrentMonth ? 'rgba(0,0,0,0.15)' : 'transparent')}
                  >
                    <div style={{
                      textAlign: 'right', fontSize: '0.82rem', fontWeight: isToday ? 700 : 400,
                      color: !isCurrentMonth ? 'var(--text-muted)' : (isToday ? 'var(--accent-base)' : 'var(--text-primary)'),
                      marginBottom: '4px'
                    }}>
                      {isToday ? (
                        <span style={{ background: 'var(--accent-base)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem' }}>{date.getDate()}</span>
                      ) : date.getDate()}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      {dayEvs.slice(0, 3).map(ev => <EventChip key={ev._key} ev={ev} compact />)}
                      {dayEvs.length > 3 && <div style={{ fontSize: '0.68rem', color: 'var(--accent-base)', fontWeight: 600, textAlign: 'center', cursor: 'pointer', padding: '2px' }} onClick={e => { e.stopPropagation(); setCalDate(date); setView('day'); }}>+{dayEvs.length - 3} more</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════ WEEK VIEW ══════════════════════ */}
      {view === 'week' && (() => {
        const weekDays = getWeekDays(calDate);
        return (
          <div className="glass glass-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '12px' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', borderBottom: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.12)' }}>
              <div style={{ padding: '10px 4px', textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-muted)' }}></div>
              {weekDays.map((d, i) => {
                const isToday = isSameDay(d, today);
                return (
                  <div key={i} style={{ padding: '8px 4px', textAlign: 'center', borderLeft: '1px solid var(--surface-border)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>{DAYS_SHORT[d.getDay()]}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'white' : 'var(--text-primary)', background: isToday ? 'var(--accent-base)' : 'transparent', borderRadius: '50%', width: '30px', height: '30px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto' }}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
            {/* Time grid */}
            <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {HOURS.map(h => (
                <div key={h} style={{ display: 'grid', gridTemplateColumns: '60px repeat(7,1fr)', minHeight: '52px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ padding: '4px 8px', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right', borderRight: '1px solid var(--surface-border)' }}>
                    {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                  </div>
                  {weekDays.map((d, di) => {
                    const key = toKey(d);
                    const hourEvs = (eventsByDay[key] || []).filter(ev => ev.start.getHours() === h);
                    return (
                      <div key={di} onClick={() => { const nd = new Date(d); nd.setHours(h); openCreate(nd); }} style={{
                        borderLeft: '1px solid var(--surface-border)', padding: '2px 3px', cursor: 'pointer',
                        background: isSameDay(d, today) ? 'rgba(200,114,18,0.04)' : 'transparent',
                        transition: 'background 0.1s'
                      }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                        onMouseLeave={e => e.currentTarget.style.background = isSameDay(d, today) ? 'rgba(200,114,18,0.04)' : 'transparent'}
                      >
                        {hourEvs.map(ev => <EventChip key={ev._key} ev={ev} compact />)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════ DAY VIEW ══════════════════════ */}
      {view === 'day' && (() => {
        const key = toKey(calDate);
        const dayEvs = eventsByDay[key] || [];
        return (
          <div className="glass glass-card" style={{ padding: 0, overflow: 'hidden', borderRadius: '12px' }}>
            {/* All-day / summary bar */}
            {dayEvs.length > 0 && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.08)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{dayEvs.length} event{dayEvs.length !== 1 ? 's' : ''} today</span>
              </div>
            )}
            {/* Hour rows */}
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {HOURS.map(h => {
                const hourEvs = dayEvs.filter(ev => ev.start.getHours() === h);
                return (
                  <div key={h} onClick={() => { const nd = new Date(calDate); nd.setHours(h); openCreate(nd); }} style={{
                    display: 'grid', gridTemplateColumns: '70px 1fr', minHeight: '56px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer',
                    transition: 'background 0.1s'
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right', borderRight: '1px solid var(--surface-border)', fontWeight: 500 }}>
                      {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                    </div>
                    <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {hourEvs.map(ev => <EventChip key={ev._key} ev={ev} />)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ══════════════════════ YEAR VIEW ══════════════════════ */}
      {view === 'year' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {Array.from({ length: 12 }, (_, m) => {
            const monthDays = getMonthDays(calDate.getFullYear(), m);
            const monthEventCount = monthDays.reduce((sum, { date }) => sum + (eventsByDay[toKey(date)]?.length || 0), 0);
            return (
              <div key={m} className="glass glass-card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => { setCalDate(new Date(calDate.getFullYear(), m, 1)); setView('month'); }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.08)' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{MONTHS[m]}</span>
                  {monthEventCount > 0 && <span style={{ fontSize: '0.72rem', background: 'var(--accent-glow)', color: 'var(--accent-base)', padding: '2px 8px', borderRadius: '99px', fontWeight: 600 }}>{monthEventCount}</span>}
                </div>
                <div style={{ padding: '6px' }}>
                  {/* Mini day headers */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '2px' }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ fontSize: '0.62rem', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>{d}</div>)}
                  </div>
                  {/* Mini day grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px' }}>
                    {monthDays.slice(0, 42).map(({ date, isCurrentMonth }, i) => {
                      const hasEvents = (eventsByDay[toKey(date)]?.length || 0) > 0;
                      const isToday = isSameDay(date, today);
                      return (
                        <div key={i} style={{
                          fontSize: '0.65rem', textAlign: 'center', padding: '3px 0',
                          color: !isCurrentMonth ? 'var(--text-muted)' : (isToday ? 'white' : 'var(--text-primary)'),
                          background: isToday ? 'var(--accent-base)' : 'transparent',
                          borderRadius: '50%', fontWeight: isToday ? 700 : 400,
                          position: 'relative'
                        }}>
                          {isCurrentMonth ? date.getDate() : ''}
                          {hasEvents && isCurrentMonth && <div style={{ position: 'absolute', bottom: '-1px', left: '50%', transform: 'translateX(-50%)', width: '4px', height: '4px', borderRadius: '50%', background: isToday ? 'white' : 'var(--accent-base)' }}></div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DETAIL MODAL ──────────────────────────────────────────────── */}
      <Modal open={modal === 'detail'} onClose={() => setModal(null)} title={selected?.title || ''} maxWidth="500px">
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 600, background: `${(selected.color || SCHEDULE_TYPE_COLORS[selected.type] || '#c87212')}20`, color: selected.color || SCHEDULE_TYPE_COLORS[selected.type] || '#c87212' }}>{TYPE_ICON[selected.type]} {selected.type}</span>
              {selected.isShoot && <span style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(139,92,246,0.12)', color: '#8b5cf6' }}>Shoot: {selected.status}</span>}
              {selected.isTask && <span style={{ padding: '4px 12px', borderRadius: '99px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(59,130,246,0.12)', color: '#3b82f6' }}>Task: {selected.status}</span>}
            </div>
            {selected.description && <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6 }}>{selected.description}</p>}
            <div style={{ display: 'grid', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Clock size={14} color="var(--accent-base)" /><span>{formatDateTime(selected.start_datetime || selected.start?.toISOString())}{selected.end_datetime ? ` → ${formatDateTime(selected.end_datetime)}` : ''}</span></div>
              {selected.location && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><MapPin size={14} color="var(--accent-base)" /><span>{selected.location}</span></div>}
              {selected.shoot_title && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}><Link2 size={14} color="var(--accent-base)" /><span>Linked: {selected.shoot_title}</span></div>}
              {selected.attendees?.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Users size={14} color="var(--accent-base)" style={{ marginTop: '2px' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {selected.attendees.map(a => (
                      <span key={a.user_id} style={{ padding: '2px 10px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', fontSize: '0.78rem' }}>{a.user_name}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {/* Actions */}
            {!selected.isShoot && !selected.isTask && (admin || parseInt(selected.created_by) === parseInt(user.id)) && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button className="btn btn-primary" onClick={() => { setModal(null); setTimeout(() => openEdit(selected), 50); }}><Edit2 size={14} /> Edit</button>
                <button className="btn" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => handleDelete(selected.id, false)}><Trash2 size={14} /> Delete</button>
              </div>
            )}
            {selected.isShoot && (
              <div style={{ padding: '10px', background: 'rgba(139,92,246,0.08)', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.2)' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>🎬 This is a Shoot event. Go to Shoots to manage it.</p>
              </div>
            )}
            {selected.isTask && (
              <div style={{ padding: '10px', background: 'rgba(59,130,246,0.08)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>📋 This is a Task. Go to Tasks to manage progress.</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── CREATE / EDIT MODAL ────────────────────────────────────── */}
      <Modal open={modal === 'create' || modal === 'edit'} onClose={() => setModal(null)} title={modal === 'create' ? 'New Entry' : 'Edit Event'} maxWidth="600px">
        {modal === 'create' && admin && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', background: 'rgba(0,0,0,0.1)', padding: '5px', borderRadius: '10px' }}>
            <button type="button" onClick={() => setCreateMode('event')} style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: createMode === 'event' ? 'var(--surface-color)' : 'transparent',
              color: createMode === 'event' ? 'var(--text-primary)' : 'var(--text-secondary)',
              boxShadow: createMode === 'event' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.2s'
            }}>Schedule Event</button>
            <button type="button" onClick={() => setCreateMode('shoot')} style={{
              flex: 1, padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: createMode === 'shoot' ? 'var(--accent-base)' : 'transparent',
              color: createMode === 'shoot' ? 'white' : 'var(--text-secondary)',
              boxShadow: createMode === 'shoot' ? '0 2px 4px rgba(0,0,0,0.2)' : 'none', transition: 'all 0.2s'
            }}>Production Shoot</button>
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>{createMode === 'shoot' ? 'Shoot Title *' : 'Event Title *'}</label>
            <input required className="input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={createMode === 'shoot' ? 'e.g. Masterclass Ep 1' : 'Event title'} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {createMode === 'event' ? (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Type</label>
                <select className="input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {['meeting', 'shoot', 'deadline', 'review', 'other'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Person Filmed</label>
                <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Who is being recorded?" />
              </div>
            )}
            {createMode === 'event' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Location</label>
                <input className="input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Optional" />
              </div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Start *</label>
              <input required type="datetime-local" className="input" value={form.start_datetime} onChange={e => setForm(f => ({ ...f, start_datetime: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>End</label>
              <input type="datetime-local" className="input" value={form.end_datetime} onChange={e => setForm(f => ({ ...f, end_datetime: e.target.value }))} />
            </div>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Description</label>
            <textarea className="input" style={{ minHeight: '64px', fontFamily: 'inherit', resize: 'vertical' }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional details..." />
          </div>
          {createMode === 'event' && shoots.length > 0 && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Link to Shoot (optional)</label>
              <select className="input" value={form.shoot_id} onChange={e => setForm(f => ({ ...f, shoot_id: e.target.value }))}>
                <option value="">— None —</option>
                {shoots.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
          )}
          {createMode === 'event' && users.length > 0 && (
            <div className="form-group" style={{ margin: 0 }}>
              <label>Attendees</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {users.map(u => {
                  const checked = form.attendee_ids.includes(u.id) || form.attendee_ids.includes(String(u.id));
                  return (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '99px', border: `1px solid ${checked ? 'var(--accent-base)' : 'var(--surface-border)'}`, background: checked ? 'var(--accent-glow)' : 'transparent', cursor: 'pointer', fontSize: '0.78rem', color: checked ? 'var(--accent-base)' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                      <input type="checkbox" style={{ display: 'none' }} checked={checked} onChange={() => {
                        setForm(f => ({
                          ...f,
                          attendee_ids: checked
                            ? f.attendee_ids.filter(id => String(id) !== String(u.id))
                            : [...f.attendee_ids, u.id]
                        }));
                      }} />
                      {u.abbreviation || u.name?.charAt(0)} {u.name}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          {createMode === 'shoot' && (
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>You can assign editors after creating the shoot.</p>
          )}
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{modal === 'create' ? (createMode === 'shoot' ? 'Create Shoot' : 'Create Event') : 'Save Changes'}</button>
            <button type="button" className="btn" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
