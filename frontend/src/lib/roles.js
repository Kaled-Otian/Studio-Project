// Centralized role helper — use across all frontend components
// Eliminates duplicated inline role checks

export const ROLES = { USER: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export const hasRole = (user, minRole) =>
  (ROLES[user?.role] || 0) >= (ROLES[minRole] || 0);

export const isAdmin = (user) => hasRole(user, 'ADMIN');
export const isSuperAdmin = (user) => user?.role === 'SUPER_ADMIN';

export const canManageUser = (actor, target) => {
  if (isSuperAdmin(actor)) return true;
  if (isAdmin(actor) && target?.role === 'USER') return true;
  return false;
};

export const canCreateAnnouncement = (user) => isAdmin(user);
export const canManageSchedule = (user, schedule) => {
  if (isAdmin(user)) return true;
  return parseInt(schedule?.created_by) === parseInt(user?.id);
};

export const ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  USER: 'User',
};

export const ROLE_COLORS = {
  SUPER_ADMIN: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  ADMIN: { color: '#c87212', bg: 'rgba(200,114,18,0.12)' },
  USER: { color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

export const STATUS_BADGE = {
  Scheduled: { cls: 'badge badge-warning', color: '#f59e0b' },
  Shooting: { cls: 'badge badge-info', color: '#60a5fa' },
  Editing: { cls: 'badge badge-info', color: '#8b5cf6' },
  Reviewing: { cls: 'badge badge-neutral', color: '#06b6d4' },
  Completed: { cls: 'badge badge-success', color: '#10b981' },
};

export const PRIORITY_CONFIG = {
  urgent: { label: 'Urgent', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  high: { label: 'High', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  normal: { label: 'Normal', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  low: { label: 'Low', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
};

export const SCHEDULE_TYPES = ['meeting', 'shoot', 'deadline', 'review', 'other'];
export const SCHEDULE_TYPE_COLORS = {
  meeting: '#c87212',
  shoot: '#8b5cf6',
  deadline: '#ef4444',
  review: '#06b6d4',
  other: '#94a3b8',
};

export function formatDate(isoStr, opts = {}) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', ...opts
    });
  } catch {
    return isoStr;
  }
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return isoStr;
  }
}

export function timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
