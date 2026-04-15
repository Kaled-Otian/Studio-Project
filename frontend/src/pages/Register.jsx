import { useState } from 'react';
import { useAuth, api } from '../context/AuthContext';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

export default function Register() {
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const { user, login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.post('/auth/register', formData);
      toast.success('Account created! Logging in...');
      await login(formData.email, formData.password);
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '20px' }}>
      <Toaster />
      <div className="glass glass-card" style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img src="/logo.png" alt="Studio Logo" style={{ height: '300px', objectFit: 'contain', marginBottom: '16px' }} onError={e => e.target.style.display = 'none'} />
          <h1 style={{ marginBottom: '6px' }}>Create Account</h1>
          <p>You will be registered as a <strong style={{ color: 'var(--text-primary)' }}>User</strong>. Contact a Super Admin to promote your role.</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label>Full Name</label>
            <input type="text" className="input" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Your full name" />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" className="input" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} placeholder="you@studio.com" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" className="input" required value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} placeholder="Min. 6 characters" minLength={6} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '4px' }} disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Register'}
          </button>
          <div style={{ textAlign: 'center', fontSize: '0.875rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Already have an account? <Link to="/login" style={{ color: 'var(--accent-base)', fontWeight: 500 }}>Sign in</Link></p>
          </div>
        </form>
      </div>
    </div>
  );
}
