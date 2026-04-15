import { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext();

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
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

  // Bootstrap auth state from localStorage on mount
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (storedUser && token) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
      // Refresh from DB in background — non-blocking
      api.get('/auth/me').then(res => {
        const fresh = res.data;
        localStorage.setItem('user', JSON.stringify(fresh));
        setUser(fresh);
      }).catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      });
    }
    setLoading(false);
  }, []);

  // Auto-logout on 401 (expired token) and global error object normalization
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (res) => res,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }
        
        // Normalize error message to prevent React Error #31 (Rendering objects)
        let errMsg = 'An unexpected error occurred';
        if (error.response?.data) {
          if (typeof error.response.data.error === 'string') {
            errMsg = error.response.data.error;
          } else if (typeof error.response.data.message === 'string') {
            errMsg = error.response.data.message;
          } else if (typeof error.response.data === 'string') {
            errMsg = error.response.data;
          } else {
            errMsg = JSON.stringify(error.response.data);
          }
        } else if (error.message) {
          errMsg = error.message;
        } else if (typeof error === 'string') {
          errMsg = error;
        }
        
        // Safely mutate error.response so UI always gets a string
        if (error.response) {
          if (!error.response.data) error.response.data = {};
          error.response.data.error = errMsg;
        } else {
          error.message = errMsg;
        }

        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token, user: userData } = res.data;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  // Sync profile updates immediately to context + localStorage
  const updateUser = useCallback((data) => {
    setUser(prev => {
      const updated = { ...prev, ...data };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
