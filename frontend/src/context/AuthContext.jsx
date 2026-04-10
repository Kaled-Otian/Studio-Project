import { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

export const api = axios.create({
  baseURL: import.meta.env.DEV ? 'http://localhost:5000/api' : '/api',
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      // Set immediately from cache so UI renders fast
      setUser(JSON.parse(storedUser));
      // Then refresh from DB to catch any profile/role changes
      api.get('/auth/me').then(res => {
        const fresh = res.data;
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      }).catch(() => {
        // Token expired or user deleted — auto-logout
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      });
    }
    setLoading(false);
  }, []);

  // Auto-logout on 401 (expired token)
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (res) => res,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  // Sync profile updates immediately to context + localStorage
  const updateUser = (data) => {
    const updated = { ...user, ...data };
    localStorage.setItem('user', JSON.stringify(updated));
    setUser(updated);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
