import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_ENDPOINTS } from '../utils/api';

const ResultPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, student } = useAuth();
  const [resultData, setResultData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check if data was passed via navigation state (from exam submission)
  const stateData = location.state || {};
  const hasStateData = stateData.score !== undefined || stateData.total_marks !== undefined;

  useEffect(() => {
    const fetchResult = async () => {
      // If we have data from navigation state, use it
      if (hasStateData) {
        setResultData(stateData);
        setLoading(false);
        return;
      }

      // Otherwise, fetch from API
      try {
        const token = localStorage.getItem('student_access_token');
        if (!token) {
          navigate('/login');
          return;
        }

        const response = await axios.get(API_ENDPOINTS.getResult, {
          params: { token }
        });

        setResultData(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching exam result:', error);
        if (error.response?.status === 400 && error.response?.data?.detail?.includes('not submitted')) {
          // Exam not submitted yet, redirect to waiting room
          navigate('/waiting-room');
          return;
        }
        setError('Failed to load exam results. Please try again.');
        setLoading(false);
      }
    };

    fetchResult();
  }, [hasStateData, stateData, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Loading your results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8 text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/waiting-room')}
            className="bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!resultData) {
    navigate('/login');
    return null;
  }

  const { score, total_marks, percentage, submitted_at, total_violations, violation_details } = resultData;
  const percentageValue = typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0;
  const violationsCount = total_violations || 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="mb-6">
            {percentageValue >= 40 ? (
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Exam Submitted Successfully!
          </h1>
          <p className="text-gray-600">
            Your exam has been submitted on {new Date(submitted_at).toLocaleString()}
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 mb-6">
          <div className="text-center mb-6">
            <div className="text-6xl font-bold text-indigo-600 mb-2">
              {percentageValue.toFixed(2)}%
            </div>
            <p className="text-gray-600">Your Score</p>
          </div>

          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-3xl font-bold text-gray-900">{score}</p>
              <p className="text-gray-600">Marks Obtained</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{total_marks}</p>
              <p className="text-gray-600">Total Marks</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-gray-900">{violationsCount}</p>
              <p className="text-gray-600">Total Violations</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <p className="text-gray-700 text-center">
            <strong>Note:</strong> Your detailed results will be shared by the company recruiting team.
            Please check your email for further communication.
          </p>
        </div>

        <div className="text-center">
          <button
            onClick={handleLogout}
            className="bg-red-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultPage;
