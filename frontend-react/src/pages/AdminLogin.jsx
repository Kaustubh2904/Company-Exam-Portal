import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/auth/admin/login', { username, password });
      const data = res.data;
      if (data.access_token) {
        login(data.access_token, 'admin');
        toast.success('Login successful');
        navigate('/admin');
      } else {
        throw new Error('No access token returned');
      }
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message || 'Login error';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-12 relative overflow-hidden transition-colors duration-300">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold mb-2">Admin Login</h1>
          <p className="font-serif text-gray-800">Manage and approve drives securely</p>
        </div>

        <div className="relative group mb-8 hover:shadow-2xl transition-shadow duration-300">
          <div className="bg-gray-100 rounded-xl shadow-lg border border-gray-200 p-8">
            <form onSubmit={submit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Username
                </label>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                  placeholder="Enter your password"
                  required
                />
              </div>

              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
                </div>
              )}

              <button
                disabled={loading}
                className="w-full px-4 py-3 bg-linear-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:from-slate-500 dark:disabled:from-slate-600 disabled:to-slate-600 dark:disabled:to-slate-700 text-white font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            <div className="mt-6 flex items-center gap-3 justify-between">
              <Link
                to="/"
                className="text-gray-600 dark:text-slate-400 hover:text-red-500 dark:hover:text-red-400 text-sm transition"
              >
                ← Back to home
              </Link>
              <span className="text-gray-400 dark:text-slate-600">•</span>
              <Link
                to="/company/login"
                className="text-red-600 hover:text-red-700 text-sm transition"
              >
                Company login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
