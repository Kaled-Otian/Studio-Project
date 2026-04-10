import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import logo from '../assets/mulhim Final2.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  if (user) return <Navigate to="/" />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Logged in successfully!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to login');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
      <Toaster />
      <div className="glass glass-card" style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <img src={logo} alt="Studio Logo" style={{ height: '300px', objectFit: 'contain', marginBottom: '16px' }} onError={(e) => e.target.style.display = 'none'} />
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
          
          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.9rem' }}>
            <p style={{ color: 'var(--text-secondary)' }}>Don't have an account? <Link to="/register" style={{ color: 'var(--accent-base)', fontWeight: 500 }}>Create an account</Link></p>
          </div>
        </form>
      </div>
    </div>
  );
}
