import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if student is logged in
    const storedToken = localStorage.getItem('student_access_token');
    const storedStudent = localStorage.getItem('student_data');

    if (storedToken && storedStudent) {
      setStudent(JSON.parse(storedStudent));
      setIsAuthenticated(true);
    }
    setLoading(false);
  }, []);

  const login = async (email, access_token) => {
    try {
      const response = await axios.post(API_ENDPOINTS.login, {
        email,
        access_token
      });

      const studentData = response.data;

      // Clear any previous exam data before storing new student data
      localStorage.removeItem('exam_answers');

      // Store in localStorage
      localStorage.setItem('student_access_token', studentData.access_token);
      localStorage.setItem('student_data', JSON.stringify(studentData));

      setStudent(studentData);
      setIsAuthenticated(true);

      return { success: true, data: studentData };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.detail || 'Invalid email or access token'
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('student_access_token');
    localStorage.removeItem('student_data');
    // Clear all exam-related data
    localStorage.removeItem('exam_answers');
    setStudent(null);
    setIsAuthenticated(false);
  };

  const validateToken = async () => {
    try {
      const token = localStorage.getItem('student_access_token');
      if (!token) return { valid: false };

      const response = await axios.get(API_ENDPOINTS.validate, {
        params: { token },
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.is_disqualified) {
        return { valid: false, disqualified: true, reason: response.data.disqualification_reason };
      }

      return { valid: true };
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false };
    }
  };

  const refreshStudentData = async () => {
    try {
      const token = localStorage.getItem('student_access_token');
      const storedStudent = localStorage.getItem('student_data');

      if (!token || !storedStudent) return false;

      const studentData = JSON.parse(storedStudent);

      // Re-login to get fresh data (token remains the same)
      const response = await axios.post(API_ENDPOINTS.login, {
        email: studentData.email,
        access_token: token
      });

      const freshData = response.data;

      // Update localStorage and state
      localStorage.setItem('student_data', JSON.stringify(freshData));
      setStudent(freshData);

      return true;
    } catch (error) {
      console.error('Error refreshing student data:', error);
      return false;
    }
  };

  const value = {
    student,
    loading,
    isAuthenticated,
    login,
    logout,
    validateToken,
    refreshStudentData
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
