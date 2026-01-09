import axios from 'axios';

// Base URL for the API - use localhost for consistency
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Create axios instance for company-specific API calls
const companyApi = axios.create({
  baseURL: `${API_BASE_URL}/api/company`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
companyApi.interceptors.request.use(
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
companyApi.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized errors
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('cxp_auth');
      localStorage.removeItem('user');
      window.location.href = '/company/login';
    }
    return Promise.reject(error);
  }
);

export default companyApi;
