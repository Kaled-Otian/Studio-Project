import { Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth, api } from '../context/AuthContext';
import { LogOut, LayoutDashboard, Camera, Users as UsersIcon, Menu, X, User, ClipboardList, CalendarDays, Megaphone, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';
import { hasRole, ROLE_LABELS } from '../lib/roles';
import logo from '../assets/mulhim Final2.png';

export function ProtectedRoute() {
  const { user, loading, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await api.get('/announcements/unread-count');
        setUnreadCount(res.data.count);
      } catch (err) {}
    };
    fetchUnread();
    const poll = setInterval(fetchUnread, 30000);
    return () => clearInterval(poll);
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobileScreen(mobile);
      if (!mobile && !sidebarOpen) {
        // Option: Auto open on desktop? Let's leave user preference.
      } else if (mobile && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sidebarOpen]);

  if (loading) return <div className="loading-spinner"></div>;
  if (!user) return <Navigate to="/login" />;

  const navLinkStyle = ({ isActive }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    borderRadius: 'var(--radius-sm)',
    background: isActive ? 'var(--surface-border-strong)' : 'transparent',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    transition: 'all var(--duration-fast) var(--ease-smooth)',
    fontWeight: isActive ? 500 : 400,
    cursor: 'pointer',
    textDecoration: 'none',
    fontSize: 'var(--font-sm)',
  });

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebarOnMobile = () => {
    if (isMobileScreen) setSidebarOpen(false);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: 'var(--bg-primary)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && isMobileScreen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Desktop wrapper block to push content softly */}
      {!isMobileScreen && (
        <div style={{
          width: sidebarOpen ? 'var(--sidebar-width)' : '0px',
          transition: 'width var(--duration-normal) var(--ease-spring)',
          flexShrink: 0
        }} />
      )}

      {/* Sidebar fixed container */}
      <aside style={{
        width: 'var(--sidebar-width)',
        position: 'fixed',
        top: 0, bottom: 0, left: 0,
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform var(--duration-normal) var(--ease-spring)',
        zIndex: 50,
        background: 'var(--surface-primary)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--surface-border)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo Section */}
        <div style={{ 
          height: 'var(--header-height)', 
          padding: '0 20px', 
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
          borderBottom: '1px solid var(--surface-border)',
          flexShrink: 0
        }}>
          <img
            src={logo}
            alt="Studio Logo"
            style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          {isMobileScreen && (
            <button onClick={() => setSidebarOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
          <NavLink to="/" end style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <LayoutDashboard size={18} /> Dashboard
          </NavLink>
          <NavLink to="/shoots" style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <Camera size={18} /> Shoots
          </NavLink>
          <NavLink to="/profile" style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <User size={18} /> My Profile
          </NavLink>
          <NavLink to="/schedule" style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <CalendarDays size={18} /> Schedule
          </NavLink>
          <NavLink to="/announcements" style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <Megaphone size={18} /> Announcements
            {unreadCount > 0 && (
              <span style={{ marginLeft: 'auto', background: 'var(--accent-base)', color: 'white', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontWeight: 600 }}>{unreadCount}</span>
            )}
          </NavLink>
          <NavLink to="/chat" style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <MessageSquare size={18} /> Chat
          </NavLink>
          <NavLink to="/tasks" style={navLinkStyle} onClick={closeSidebarOnMobile}>
            <ClipboardList size={18} /> Tasks
          </NavLink>
          {hasRole(user, 'ADMIN') && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--surface-border)' }}>
              <NavLink to="/users" style={navLinkStyle} onClick={closeSidebarOnMobile}>
                <UsersIcon size={18} /> User Management
              </NavLink>
            </div>
          )}
        </nav>

        {/* User Footer */}
        <div style={{ padding: '16px', borderTop: '1px solid var(--surface-border)', background: 'rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)',
              background: 'var(--surface-border-strong)', color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: '0.9rem', flexShrink: 0
            }}>
              {user.abbreviation || user.name?.charAt(0)?.toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name}
              </p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.job_title || user.role}
              </p>
            </div>
          </div>
          <button
            className="btn"
            style={{ width: '100%', border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-color)' }}
            onClick={handleLogout}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100dvh', overflow: 'hidden' }}>
        {/* Header */}
        <header style={{
          height: 'var(--header-height)',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--surface-border)',
          background: 'rgba(10, 15, 26, 0.8)',
          backdropFilter: 'blur(12px)',
          flexShrink: 0,
          zIndex: 30
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: 'transparent', border: '1px solid var(--surface-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text-primary)', padding: '6px', display: 'flex', alignItems: 'center', transition: 'all var(--duration-fast)', backgroundColor: 'rgba(255,255,255,0.03)' }}
            >
              <Menu size={18} />
            </button>
            {!sidebarOpen && !isMobileScreen && (
              <img src={logo} alt="Studio Logo" style={{ height: '22px', objectFit: 'contain', opacity: 0.8 }} />
            )}
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span className="badge badge-neutral" style={{ padding: '4px 10px' }}>{ROLE_LABELS[user.role] || user.role}</span>
          </div>
        </header>

        {/* Page Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobileScreen ? '20px 16px' : '32px 40px', scrollBehavior: 'smooth' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', width: '100%', animation: 'fadeInUp 0.3s var(--ease-smooth)' }}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
