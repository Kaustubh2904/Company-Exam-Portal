const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const API_ENDPOINTS = {
  // Auth endpoints
  login: `${API_BASE_URL}/api/student/auth/login`,
  validate: `${API_BASE_URL}/api/student/auth/validate`,

  // Exam endpoints
  startExam: `${API_BASE_URL}/api/student/exam/start`,
  getQuestions: `${API_BASE_URL}/api/student/exam/questions`,
  recordViolation: `${API_BASE_URL}/api/student/exam/violation`,
  disqualifyStudent: `${API_BASE_URL}/api/student/exam/disqualify`,
  submitExam: `${API_BASE_URL}/api/student/exam/submit`,
  getResult: `${API_BASE_URL}/api/student/exam/result`,
  driveInfo: `${API_BASE_URL}/api/student/drive-info`,
};

export default API_BASE_URL;
