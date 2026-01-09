import { createContext, useContext, useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem('cxp_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Attempt to decode token to expose claims
        const claims = parsed?.token ? decodeJwt(parsed.token) : null;
        
        // Validate token expiration
        if (claims && claims.exp) {
          const now = Math.floor(Date.now() / 1000);
          if (claims.exp < now) {
            console.log('Token expired, clearing auth');
            localStorage.removeItem('cxp_auth');
            setUser(null);
            setLoading(false);
            return;
          }
        }
        
        setUser({ ...parsed, claims });
      } catch (error) {
        console.error('Error loading auth data:', error);
        localStorage.removeItem('cxp_auth');
        setUser(null);
      }
    }
    setLoading(false);
  }, []);

  const login = (token, userType) => {
    const payload = { token, userType };
    const claims = decodeJwt(token);
    localStorage.setItem('cxp_auth', JSON.stringify(payload));
    setUser({ ...payload, claims });
  };

  const logout = () => {
    localStorage.removeItem('cxp_auth');
    setUser(null);
    toast.info('Logged out');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, api }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
