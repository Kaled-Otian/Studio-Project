import { useState, useEffect, useMemo } from 'react';
import { api, useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { Shield, Edit2, Key, UserCheck, Plus, Search, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import { isAdmin as checkIsAdmin, isSuperAdmin as checkIsSuperAdmin, canManageUser, ROLE_COLORS, ROLE_LABELS } from '../lib/roles';

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'USER', job_title: '', abbreviation: '' });
  const [resetPasswordId, setResetPasswordId] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const isSuperAdminUser = checkIsSuperAdmin(user);
  const isAdminUser = checkIsAdmin(user);

  if (!isAdminUser) return <Navigate to="/" />;

  const [requests, setRequests] = useState([]);

  const fetchUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const fetchRequests = async () => {
    if (!isSuperAdminUser) return;
    try {
      const res = await api.get('/users/password-requests');
      setRequests(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { 
    fetchUsers(); 
    fetchRequests();
  }, [isSuperAdminUser]);

  const handleEdit = (u) => {
    setEditingUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      job_title: u.job_title || '',
      abbreviation: u.abbreviation || '',
      role: u.role,
      is_active: u.is_active === 1 || u.is_active === true
    });
    setResetPasswordId(null);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/users/${editingUser.id}`, { ...editForm, is_active: editForm.is_active ? 1 : 0 });
      toast.success('User updated');
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user');
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/users/${resetPasswordId}/password`, { new_password: newPassword });
      toast.success('Password reset successfully');
      setResetPasswordId(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/users', newUser);
      toast.success('User created');
      setShowCreate(false);
      setNewUser({ name: '', email: '', password: '', role: 'USER', job_title: '', abbreviation: '' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [users, search, roleFilter]);

  if (loading) return <div className="loading-spinner"></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ marginBottom: '4px' }}>User Management</h1>
          <p>Manage studio accounts and permissions.</p>
        </div>
        {isSuperAdminUser && (
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Create User
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '250px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
          <input className="input" placeholder="Search users by name or email..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px', width: '100%' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
          <Filter size={16} color="var(--text-secondary)" style={{ marginLeft: '8px' }} />
          <select className="input" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ border: 'none', background: 'transparent', width: 'auto' }}>
            <option value="ALL">All Roles</option>
            <option value="SUPER_ADMIN">Super Admins</option>
            <option value="ADMIN">Admins</option>
            <option value="USER">Users</option>
          </select>
        </div>
      </div>

      {isSuperAdminUser && requests.length > 0 && (
        <div className="glass glass-card" style={{ marginBottom: '24px', border: '1px solid var(--accent-base)' }}>
          <h3 style={{ marginTop: 0, color: 'var(--accent-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Key size={18} /> Pending Password Reset Requests
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {requests.map(req => (
              <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{req.name}</p>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{req.email}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Requested: {new Date(req.created_at).toLocaleString()}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '0.85rem' }} onClick={() => {
                    const pwd = window.prompt(`Enter NEW password for ${req.name}:`);
                    if (!pwd) return;
                    api.post(`/users/password-requests/${req.id}/resolve`, { action: 'approve', new_password: pwd })
                      .then(() => { toast.success('Approved and password set'); fetchRequests(); })
                      .catch(e => toast.error(e.response?.data?.error || 'Failed to approve'));
                  }}>Approve & Set Password</button>
                  <button className="btn" style={{ padding: '6px 16px', fontSize: '0.85rem', color: 'var(--danger-color)' }} onClick={() => {
                    if (!window.confirm(`Reject password reset for ${req.name}?`)) return;
                    api.post(`/users/password-requests/${req.id}/resolve`, { action: 'reject' })
                      .then(() => { toast.success('Request rejected'); fetchRequests(); })
                      .catch(e => toast.error('Failed to reject'));
                  }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create New User" maxWidth="500px">
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}><label>Full Name</label><input required className="input" value={newUser.name} onChange={e => setNewUser({ ...newUser, name: e.target.value })} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Email</label><input required type="email" className="input" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} /></div>
          <div className="form-group" style={{ margin: 0 }}><label>Password</label><input required type="password" className="input" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}><label>Role</label>
              <select className="input" value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })}>
                <option value="USER">User</option>
                <option value="ADMIN">Admin</option>
                <option value="SUPER_ADMIN">Super Admin</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}><label>Initials</label><input className="input" maxLength={4} value={newUser.abbreviation} onChange={e => setNewUser({ ...newUser, abbreviation: e.target.value })} placeholder="e.g. JD" /></div>
          </div>
          <div className="form-group" style={{ margin: 0 }}><label>Job Title</label><input className="input" value={newUser.job_title} onChange={e => setNewUser({ ...newUser, job_title: e.target.value })} placeholder="Optional" /></div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Create User</button>
            <button type="button" className="btn" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal open={!!editingUser} onClose={() => setEditingUser(null)} title={`Edit ${editingUser?.name}`} maxWidth="500px">
        {editingUser && (
          <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}><label>Name</label><input className="input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Email</label><input type="email" className="input" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}><label>Job Title</label><input className="input" value={editForm.job_title} onChange={e => setEditForm({ ...editForm, job_title: e.target.value })} placeholder="Optional" /></div>
              <div className="form-group" style={{ margin: 0 }}><label>Initials</label><input className="input" value={editForm.abbreviation} onChange={e => setEditForm({ ...editForm, abbreviation: e.target.value })} maxLength={4} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group" style={{ margin: 0 }}><label>Role</label>
                <select className="input" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })} disabled={!isSuperAdminUser && !(isAdminUser && editingUser.role === 'USER')}>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                  {isSuperAdminUser && <option value="SUPER_ADMIN">Super Admin</option>}
                </select>
              </div>
              {isSuperAdminUser && (
                <div className="form-group" style={{ margin: 0 }}><label>Status</label>
                  <div style={{ display: 'flex', alignItems: 'center', height: '100%', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                      {editForm.is_active ? <span style={{ color: '#10b981', fontWeight: 600 }}>Active</span> : <span style={{ color: 'var(--text-muted)' }}>Inactive</span>}
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}><UserCheck size={16} /> Save Changes</button>
              <button type="button" className="btn" onClick={() => setEditingUser(null)}>Cancel</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Password Reset Modal */}
      <Modal open={!!resetPasswordId} onClose={() => { setResetPasswordId(null); setNewPassword(''); }} title="Reset Password" maxWidth="400px">
        <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>New Password</label>
            <input required type="password" className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min. 6 characters" minLength={6} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Reset Password</button>
            <button type="button" className="btn" onClick={() => { setResetPasswordId(null); setNewPassword(''); }}>Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Users Table */}
      <div className="glass glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--surface-border)' }}>
                <th style={{ padding: '14px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>User</th>
                <th style={{ padding: '14px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Role</th>
                <th style={{ padding: '14px 16px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
                <th style={{ padding: '14px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontWeight: 500 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                    No users found matching your search or filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => {
                  const canManage = canManageUser(user, u);

                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--surface-border)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)', flexShrink: 0 }}>
                            {u.abbreviation || u.name?.charAt(0)}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>{u.name}</p>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{u.email} {u.job_title ? `· ${u.job_title}` : ''}</p>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: '99px', fontSize: '0.75rem', fontWeight: 600, background: ROLE_COLORS[u.role]?.bg, color: ROLE_COLORS[u.role]?.color }}>
                          {u.role === 'SUPER_ADMIN' && <Shield size={11} style={{ verticalAlign: 'middle', marginRight: '4px' }} />}
                          {ROLE_LABELS[u.role] || u.role}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{ fontSize: '0.8rem', color: u.is_active ? '#10b981' : 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: u.is_active ? '#10b981' : 'var(--danger-color)' }}></span>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {canManage && (
                              <button className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem', border: '1px solid var(--surface-border)' }} onClick={() => handleEdit(u)}>
                                <Edit2 size={13} /> Edit
                              </button>
                            )}
                            {isSuperAdminUser && (
                              <button className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.08)', color: 'var(--danger-color)', border: '1px solid rgba(239,68,68,0.2)' }} onClick={() => { setResetPasswordId(u.id); setEditingUser(null); }}>
                                <Key size={13} /> Password
                              </button>
                            )}
                            {isSuperAdminUser && parseInt(u.id) !== parseInt(user.id) && (
                              <button className="btn" style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger-color)', border: '1px solid var(--danger-color)' }} onClick={async () => {
                                if (!window.confirm(`Are you sure you want to PERMANENTLY delete ${u.name}? This cannot be undone and will fail if they have linked records. Consider deactivating instead.`)) return;
                                try {
                                  await api.delete(`/users/${u.id}`);
                                  toast.success('User permanently deleted');
                                  fetchUsers();
                                } catch (err) {
                                  toast.error(err.response?.data?.error || 'Failed to delete user');
                                }
                              }}>
                                Delete
                              </button>
                            )}
                          </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
