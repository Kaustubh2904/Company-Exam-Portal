import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const DisqualifiedPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { reason } = location.state || {};

  if (!reason) {
    navigate('/login');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-red-600 mb-2">
            Disqualified
          </h1>
          <p className="text-gray-600">
            You have been disqualified from this exam
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Reason for Disqualification:</h2>
          <p className="text-gray-800 text-lg">
            {reason}
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">What happened?</h2>
          <p className="text-gray-700 mb-3">
            You exceeded the allowed number of violations during the exam. The exam portal has strict
            anti-cheating measures to ensure fair assessment for all candidates.
          </p>
          <p className="text-gray-700">
            Common reasons for disqualification include:
          </p>
          <ul className="list-disc list-inside text-gray-700 mt-2 space-y-1">
            <li>Switching tabs or applications (more than 1 time)</li>
            <li>Exiting fullscreen mode (more than 1 time)</li>
            <li>Right-clicking excessively (more than 3 times)</li>
            <li>Attempting to take screenshots (more than 1 time)</li>
          </ul>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <p className="text-gray-700 text-center">
            <strong>Note:</strong> If you believe this was a mistake, please contact the company's
            recruitment team. Your case will be reviewed.
          </p>
        </div>

        <div className="text-center">
          <button
            onClick={handleLogout}
            className="bg-gray-600 text-white py-3 px-8 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DisqualifiedPage;
