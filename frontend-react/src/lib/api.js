import axios from 'axios';

// Base URL for the API - use localhost for consistency
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Create axios instance
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const authData = localStorage.getItem('cxp_auth');
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        if (parsed.token) {
          config.headers.Authorization = `Bearer ${parsed.token}`;
        }
      } catch (e) {
        console.error('Failed to parse auth data:', e);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized errors, but not for login endpoints
    if (error.response?.status === 401) {
      const url = error.config?.url || '';
      // Don't redirect for login endpoints - let the component handle the error
      if (!url.includes('/auth/admin/login') && !url.includes('/auth/company/login')) {
        // Clear token and redirect to login
        localStorage.removeItem('cxp_auth');
        localStorage.removeItem('user');
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
