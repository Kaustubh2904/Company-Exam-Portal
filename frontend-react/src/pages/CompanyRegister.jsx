import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';

export default function CompanyRegister() {
  const [formData, setFormData] = useState({
    company_name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    logo_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      toast.error('Passwords do not match');
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await api.post('/auth/company/register', {
        company_name: formData.company_name,
        username: formData.username,
        email: formData.email,
        password: formData.password,
        logo_url: formData.logo_url || undefined,
      });
      const data = res.data;
      toast.success(
        data.message || 'Registered successfully. Waiting for admin approval.'
      );
      setTimeout(() => navigate('/company/login'), 1200);
    } catch (err) {
      console.error('Register error', err?.response || err);
      const message =
        err?.response?.data?.detail || err?.message || 'Registration error';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-serif font-bold mb-2">
            Create Company Account
          </h1>
          <p className="font-serif text-gray-800">
            Register to start managing your hiring drives
          </p>
        </div>

        <div className="bg-gray-100 rounded-xl shadow-lg border border-gray-200 p-8 hover:shadow-2xl transition-shadow duration-300">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="Acme Corp"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Username *
              </label>
              <input
                name="username"
                value={formData.username}
                onChange={handleChange}
                type="text"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="acme_corp"
                required
              />
              <small className="text-gray-500 text-xs mt-1 block">
                Used for login
              </small>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email *
              </label>
              <input
                name="email"
                value={formData.email}
                onChange={handleChange}
                type="email"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="admin@acme.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password *
              </label>
              <input
                name="password"
                value={formData.password}
                onChange={handleChange}
                type="password"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="Min. 6 characters"
                minLength="6"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm Password *
              </label>
              <input
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                type="password"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="Confirm your password"
                minLength="6"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Logo URL (Optional)
              </label>
              <input
                name="logo_url"
                value={formData.logo_url}
                onChange={handleChange}
                type="url"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="https://example.com/logo.png"
              />
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition duration-300"
            >
              {loading ? '⏳ Registering...' : 'Register'}
            </button>
          </form>

          <div className="mt-6 flex items-center justify-between">
            <Link
              to="/"
              className="text-gray-600 hover:text-blue-600 text-sm transition"
            >
              ← Back to home
            </Link>
            <span className="text-gray-300">•</span>
            <Link
              to="/company/login"
              className="text-blue-600 hover:text-blue-700 text-sm transition"
            >
              Already have an account?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
