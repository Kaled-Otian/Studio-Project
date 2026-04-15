import { useState } from 'react';
import { useAuth, api } from '../context/AuthContext';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // If already authenticated, redirect immediately
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Logged in successfully!');
      navigate('/', { replace: true });
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      toast.success(res.data?.message || 'If the email exists, a request has been submitted to Admins.');
      setShowForgot(false);
      setForgotEmail('');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error submitting request');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <Toaster />
      <div className="glass glass-card" style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src="/logo.png" alt="Studio Logo" style={{ height: '300px', objectFit: 'contain', marginBottom: '16px' }} onError={(e) => e.target.style.display = 'none'} />
          <h1>Welcome Back</h1>
          <p>Login to your Studio Mulhim account</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email Address</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@studio.com"
              required 
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required 
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '16px' }} disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
          
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.9rem' }}>
            <button type="button" onClick={() => setShowForgot(true)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textDecoration: 'underline' }}>Forgot your password?</button>
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '0.9rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Don't have an account? <Link to="/register" style={{ color: 'var(--accent-base)', fontWeight: 500 }}>Create an account</Link></p>
          </div>
        </form>
      </div>

      {showForgot && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass glass-card" style={{ width: '90%', maxWidth: '400px', position: 'relative' }}>
            <h3 style={{ marginTop: 0 }}>Reset Password</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Enter your email. If an account exists, a reset request will be sent to the studio admins.</p>
            <form onSubmit={handleForgotPassword}>
              <div className="form-group">
                <input type="email" placeholder="you@studio.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required className="input" />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={forgotLoading}>
                  {forgotLoading ? 'Submitting...' : 'Request Reset'}
                </button>
                <button type="button" className="btn" onClick={() => setShowForgot(false)} disabled={forgotLoading}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
