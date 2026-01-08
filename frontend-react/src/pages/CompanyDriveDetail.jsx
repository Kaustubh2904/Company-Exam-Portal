import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { formatDateUTC } from '../utils/timezone';

export default function CompanyDriveDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout } = useAuth();

  const driveId = searchParams.get('id');

  const [drive, setDrive] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [students, setStudents] = useState([]);
  const [examStatus, setExamStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isEndingExam, setIsEndingExam] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('overview');

  // Results state
  const [results, setResults] = useState([]);
  const [minPercentage, setMinPercentage] = useState(0);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  useEffect(() => {
    if (!driveId) {
      navigate('/company-dashboard');
      return;
    }
    loadDriveData();

    // Poll exam status every 30 seconds to check for auto-end
    const intervalId = setInterval(() => {
      loadExamStatus();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [driveId]);

  // Auto-refresh results when on Results tab and exam is ongoing
  useEffect(() => {
    if (activeTab === 'results' && examStatus?.exam_state === 'ongoing' && results.length > 0) {
      const resultsIntervalId = setInterval(() => {
        console.log('Auto-refreshing results...');
        loadResults();
      }, 15000); // Refresh every 15 seconds

      return () => clearInterval(resultsIntervalId);
    }
  }, [activeTab, examStatus?.exam_state, results.length]);

  const loadDriveData = async () => {
    setIsLoading(true);
    try {
      const [driveRes, questionsRes, studentsRes, examStatusRes] =
        await Promise.all([
          api.get(`/company/drives/${driveId}`),
          api.get(`/company/drives/${driveId}/questions`).catch((err) => {
            console.error('Failed to load questions:', err);
            return { data: [] };
          }),
          api.get(`/company/drives/${driveId}/students`).catch((err) => {
            console.error('Failed to load students:', err);
            return { data: [] };
          }),
          api.get(`/company/drives/${driveId}/exam-status`).catch((err) => {
            console.error('Failed to load exam status:', err);
            return { data: null };
          }),
        ]);

      setDrive(driveRes.data);
      setQuestions(questionsRes.data || []);
      setStudents(studentsRes.data || []);
      setExamStatus(examStatusRes.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load drive data');
    } finally {
      setIsLoading(false);
    }
  };

  const loadExamStatus = async () => {
    try {
      const res = await api.get(`/company/drives/${driveId}/exam-status`);
      setExamStatus(res.data);

      // If exam auto-ended, reload drive data to update status
      if (res.data.should_auto_end) {
        toast.info('Exam has automatically ended after duration elapsed');
        loadDriveData();
      }
    } catch (err) {
      console.error('Failed to load exam status:', err);
    }
  };

  const handleEndExam = async () => {
    if (
      !window.confirm(
        'Are you sure you want to end the exam? This will prevent students from continuing the test.'
      )
    ) {
      return;
    }

    setIsEndingExam(true);
    try {
      await api.post(`/company/drives/${driveId}/end`);
      toast.success('Exam ended successfully!');
      await loadDriveData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to end exam');
    } finally {
      setIsEndingExam(false);
    }
  };

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      if (type === 'questions') {
        await api.post(
          `/company/drives/${driveId}/questions/csv-upload`,
          formData,
          {
            headers: { 'Content-Type': undefined },
          }
        );
        toast.success('Questions uploaded successfully!');
      } else if (type === 'students') {
        await api.post(
          `/company/drives/${driveId}/students/csv-upload`,
          formData,
          {
            headers: { 'Content-Type': undefined },
          }
        );
        toast.success('Students uploaded successfully!');
      }

      // Wait a moment for backend to process, then reload data
      setTimeout(() => {
        loadDriveData();
        event.target.value = '';
        setIsUploading(false);
      }, 500);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to upload file');
      setIsUploading(false);
    }
  };

  const loadResults = async () => {
    setIsLoadingResults(true);
    try {
      const res = await api.get(`/company/drives/${driveId}/results`, {
        params: minPercentage > 0 ? { min_percentage: minPercentage } : {},
      });
      setResults(res.data.results || []);
      toast.success(
        `Loaded ${res.data.filtered_students} of ${res.data.total_students} students`
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load results');
      console.error('Failed to load results:', err);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const exportResults = async (format) => {
    try {
      const response = await api.get(
        `/company/drives/${driveId}/results/export`,
        {
          params: { format },
          responseType: 'blob',
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `drive_${driveId}_results_${format}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success(
        `${
          format.charAt(0).toUpperCase() + format.slice(1)
        } results exported successfully`
      );
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to export results');
      console.error('Failed to export results:', err);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
      approved: 'bg-green-100 text-green-800 border border-green-300',
      rejected: 'bg-red-100 text-red-800 border border-red-300',
      suspended: 'bg-orange-100 text-orange-800 border border-orange-300',
      submitted: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    };
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${
          styles[status] || styles.pending
        }`}
      >
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!drive) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Drive not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-linear-to-br from-slate-50 via-gray-50 to-zinc-50">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex md:w-72 md:bg-linear-to-b md:from-slate-900 md:via-slate-800 md:to-slate-900 md:text-white md:flex-col md:sticky md:top-0 md:h-screen md:shadow-2xl">
        <div className="p-8 border-b border-slate-700/50">
          <h2 className="text-2xl font-bold science-gothic-fontstyle bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Company Exam Portal
          </h2>
          <p className="text-sm text-slate-300 mt-2">Recruitment Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => navigate('/company-dashboard')}
            className="w-full text-left px-4 py-3 rounded-xl bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-lg font-medium flex items-center gap-3"
          >
            <span>📊</span> Dashboard
          </button>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => {
              logout();
              navigate('/company/login');
            }}
            className="w-full inline-flex items-center justify-center px-5 py-2.5 bg-linear-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105"
          >
            Logout
            <svg
              className="w-4 h-4 text-gray-800 dark:text-white ml-2"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 8h11m0 0-4-4m4 4-4 4m-5 3H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h3"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-0 left-0 right-0 bg-slate-800 text-white p-4 flex justify-between items-center z-40">
        <h2 className="text-lg font-bold science-gothic-fontstyle">
          Company Exam Portal
        </h2>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-2xl"
        >
          ☰
        </button>
      </div>

      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-slate-800 text-white z-30 pt-16 md:hidden">
          <div className="p-4 border-t border-slate-700">
            <button
              onClick={() => {
                logout();
                navigate('/company/login');
              }}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-linear-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105"
            >
              Logout
              <svg
                className="w-4 h-4 text-gray-800 dark:text-white ml-2"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 16 16"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 8h11m0 0-4-4m4 4-4 4m-5 3H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h3"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden md:mt-0 mt-16">
        {/* Header */}
        <header className="bg-linear-to-r from-white via-blue-50 to-indigo-50 shadow-lg border-b border-gray-200/50 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4">
              <div className="hidden sm:block">
                <h1 className="text-3xl font-bold science-gothic-fontstyle bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Drive Details
                </h1>
                <p className="text-sm text-gray-600">
                  Manage questions, students, and send emails
                </p>
              </div>

              <nav className="flex items-center space-x-2 sm:space-x-3">
                <button
                  onClick={() => navigate('/company-dashboard')}
                  className="text-white bg-linear-to-br from-purple-600 to-blue-500 hover:bg-linear-to-bl focus:ring-4 focus:outline-none focus:ring-blue-300 dark:focus:ring-blue-800 font-medium rounded-xl text-sm px-4 py-2.5 text-center leading-5"
                >
                  ← Back to Dashboard
                </button>
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <main className="py-8">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              {/* Tab Navigation */}
              <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 overflow-hidden">
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`flex-1 px-6 py-4 font-semibold transition-all ${
                      activeTab === 'overview'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    📋 Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('questions')}
                    className={`flex-1 px-6 py-4 font-semibold transition-all ${
                      activeTab === 'questions'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    ❓ Questions ({questions.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('students')}
                    className={`flex-1 px-6 py-4 font-semibold transition-all ${
                      activeTab === 'students'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    👥 Students ({students.length})
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('results');
                      if (results.length === 0) loadResults();
                    }}
                    className={`flex-1 px-6 py-4 font-semibold transition-all ${
                      activeTab === 'results'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    📊 Results
                  </button>
                </div>
              </div>

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <>
                  {/* Drive Overview */}
                  <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                    <div className="bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 px-8 py-6 rounded-t-2xl">
                      <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                        <span>📋</span> {drive.title}
                      </h2>
                    </div>

                    <div className="p-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                          <p className="text-sm font-semibold text-gray-600 mb-2">
                            Description
                          </p>
                          <p className="text-gray-900 font-medium">
                            {drive.description || 'N/A'}
                          </p>
                        </div>
                        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                          <p className="text-sm font-semibold text-gray-600 mb-2">
                            Type
                          </p>
                          <p className="text-gray-900 font-medium">
                            {drive.category}
                          </p>
                        </div>
                        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                          <p className="text-sm font-semibold text-gray-600 mb-2">
                            Duration
                          </p>
                          <p className="text-gray-900 font-medium">
                            {drive.exam_duration_minutes} minutes
                          </p>
                        </div>
                        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                          <p className="text-sm font-semibold text-gray-600 mb-2">
                            Status
                          </p>
                          <div>{getStatusBadge(drive.status)}</div>
                        </div>
                      </div>

                      {/* Scheduled Start Time */}
                      {drive.window_start && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
                          <p className="text-sm font-semibold text-blue-900 mb-2">
                            📅 Scheduled Window Start
                          </p>
                          <p className="text-blue-800 font-medium">
                            {formatDateUTC(drive.window_start)}
                          </p>
                          {examStatus &&
                            !examStatus.scheduled_has_passed &&
                            !drive.actual_window_start && (
                              <p className="text-blue-700 text-sm mt-2">
                                ⏰ Exam window will open at this time, or you
                                can start it manually.
                              </p>
                            )}
                        </div>
                      )}

                      {/* Exam Status Display */}
                      {examStatus && (
                        <div className="mb-6">
                          {examStatus.exam_state === 'not_started' && (
                            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                              <p className="text-blue-800 font-bold flex items-center gap-2 mb-2">
                                <span>ℹ️</span>
                                <span>Exam has not started yet</span>
                              </p>
                              {examStatus.is_scheduled &&
                              !examStatus.scheduled_has_passed ? (
                                <p className="text-blue-700 text-sm">
                                  Will start automatically at scheduled time, or
                                  start manually from the Send Emails page.
                                </p>
                              ) : (
                                <p className="text-blue-700 text-sm">
                                  Navigate to Send Emails page to start the
                                  exam.
                                </p>
                              )}
                            </div>
                          )}

                          {examStatus.exam_state === 'ongoing' && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                              <p className="text-green-800 font-bold flex items-center gap-2 mb-3">
                                <span>🟢</span>
                                <span>Exam is Currently Ongoing</span>
                              </p>
                              <div className="space-y-2 text-sm text-green-700 mb-4">
                                {drive.actual_window_start && (
                                  <p>
                                    <strong>Window Started at:</strong>{' '}
                                    {formatDateUTC(drive.actual_window_start)}
                                  </p>
                                )}
                                <p>
                                  <strong>Duration:</strong>{' '}
                                  {drive.exam_duration_minutes} minutes
                                </p>
                                {examStatus.time_remaining_minutes !== null && (
                                  <p className="text-lg font-bold text-green-900">
                                    ⏱️ Time Remaining:{' '}
                                    {Math.round(
                                      examStatus.time_remaining_minutes
                                    )}{' '}
                                    minutes
                                  </p>
                                )}
                              </div>
                              <p className="text-green-700 text-xs mb-4">
                                Note: Exam will automatically end when duration
                                expires.
                              </p>
                              {examStatus.can_end && (
                                <button
                                  onClick={handleEndExam}
                                  disabled={isEndingExam}
                                  className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-bold transition shadow-lg flex items-center justify-center gap-2"
                                >
                                  <span>{isEndingExam ? '⏳' : '🛑'}</span>
                                  {isEndingExam
                                    ? 'Ending Exam...'
                                    : 'End Exam Manually'}
                                </button>
                              )}
                            </div>
                          )}

                          {examStatus.exam_state === 'ended' && (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                              <p className="text-gray-800 font-bold flex items-center gap-2 mb-3">
                                <span>🏁</span>
                                <span>Exam Has Ended</span>
                              </p>
                              <div className="space-y-2 text-sm text-gray-700">
                                {drive.actual_window_start && (
                                  <p>
                                    <strong>Started at:</strong>{' '}
                                    {formatDateUTC(drive.actual_window_start)}
                                  </p>
                                )}
                                {drive.actual_window_end && (
                                  <p>
                                    <strong>Ended at:</strong>{' '}
                                    {formatDateUTC(drive.actual_window_end)}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {drive.is_approved ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                          <p className="text-green-800 flex items-center gap-2">
                            <span>✅</span> Drive is approved by admin
                          </p>
                        </div>
                      ) : (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                          <p className="text-yellow-800 flex items-center gap-2">
                            <span>⚠️</span> Drive is not yet approved. Approval
                            status: {drive.status}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Questions Tab */}
              {activeTab === 'questions' && (
                <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                  <div className="bg-linear-to-r from-green-600 via-emerald-600 to-teal-600 px-8 py-6 rounded-t-2xl">
                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                      <span>❓</span> Questions Management
                    </h3>
                  </div>

                  <div className="p-8">
                    <div className="flex flex-wrap gap-4 mb-6">
                      <div>
                        <input
                          type="file"
                          id="questionsFile"
                          accept=".csv"
                          onChange={(e) => handleFileUpload(e, 'questions')}
                          className="hidden"
                          disabled={isUploading}
                        />
                        <button
                          onClick={() =>
                            document.getElementById('questionsFile').click()
                          }
                          disabled={isUploading}
                          className="px-6 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition shadow-lg"
                        >
                          {isUploading
                            ? '📤 Uploading...'
                            : '📤 Upload Questions (CSV)'}
                        </button>
                      </div>
                      <a
                        href="/sample_questions.csv"
                        download
                        className="px-6 py-3 bg-linear-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-semibold transition shadow-lg inline-flex items-center gap-2"
                      >
                        <span>📥</span> Download Sample CSV
                      </a>
                    </div>

                    {questions.length === 0 ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <span className="text-3xl">❓</span>
                        </div>
                        <h4 className="text-xl font-bold text-blue-900 mb-2">
                          No questions yet
                        </h4>
                        <p className="text-blue-700">
                          Upload a CSV file to add questions to this drive.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">
                                  #
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">
                                  Question
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">
                                  Points
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {questions.map((q, idx) => (
                                <tr
                                  key={idx}
                                  className="hover:bg-gray-50 transition"
                                >
                                  <td className="px-6 py-4 text-gray-900 font-medium">
                                    {idx + 1}
                                  </td>
                                  <td className="px-6 py-4 text-gray-900">
                                    {q.question_text}
                                  </td>
                                  <td className="px-6 py-4 text-gray-900 font-semibold">
                                    {q.points}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                          <p className="text-sm text-gray-600 font-semibold">
                            <span className="text-blue-600">📊</span> Total
                            Questions: {questions.length}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Students Tab */}
              {activeTab === 'students' && (
                <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                  <div className="bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-8 py-6">
                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                      <span>👥</span> Students Management
                    </h3>
                  </div>

                  <div className="p-8">
                    <div className="flex flex-wrap gap-4 mb-6">
                      <div>
                        <input
                          type="file"
                          id="studentsFile"
                          accept=".csv"
                          onChange={(e) => handleFileUpload(e, 'students')}
                          className="hidden"
                          disabled={isUploading}
                        />
                        <button
                          onClick={() =>
                            document.getElementById('studentsFile').click()
                          }
                          disabled={isUploading}
                          className="px-6 py-3 bg-linear-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition shadow-lg"
                        >
                          {isUploading
                            ? '📤 Uploading...'
                            : '📤 Upload Students (CSV)'}
                        </button>
                      </div>
                      <a
                        href="/sample_students.csv"
                        download
                        className="px-6 py-3 bg-linear-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-semibold transition shadow-lg inline-flex items-center gap-2"
                      >
                        <span>📥</span> Download Sample CSV
                      </a>
                    </div>

                    {students.length === 0 ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-8 text-center">
                        <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <span className="text-3xl">👥</span>
                        </div>
                        <h4 className="text-xl font-bold text-purple-900 mb-2">
                          No students yet
                        </h4>
                        <p className="text-purple-700">
                          Upload a CSV file to add students to this drive.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                              <tr>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">
                                  Roll Number
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">
                                  Name
                                </th>
                                <th className="px-6 py-4 text-left text-sm font-bold text-gray-900">
                                  Email
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {students.map((s, idx) => (
                                <tr
                                  key={idx}
                                  className="hover:bg-gray-50 transition"
                                >
                                  <td className="px-6 py-4 text-gray-900 font-medium">
                                    {s.roll_number}
                                  </td>
                                  <td className="px-6 py-4 text-gray-900">
                                    {s.name || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 text-gray-900">
                                    {s.email}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                          <p className="text-sm text-gray-600 font-semibold">
                            <span className="text-purple-600">📊</span> Total
                            Students: {students.length}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Results Tab */}
              {activeTab === 'results' && (
                <div className="space-y-6">
                  {/* Filter and Export Section */}
                  <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">
                      📊 Exam Results
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                      {/* Filter Section */}
                      <div className="bg-linear-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          🔍 Filter Results
                        </h3>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-3">
                            Minimum Percentage:{' '}
                            <span className="text-indigo-600 text-xl font-bold">
                              {minPercentage}%
                            </span>
                          </label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={minPercentage}
                            onChange={(e) =>
                              setMinPercentage(Number(e.target.value))
                            }
                            className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                          <div className="flex justify-between text-xs text-gray-600 mt-2">
                            <span>0%</span>
                            <span>50%</span>
                            <span>100%</span>
                          </div>
                        </div>
                        <button
                          onClick={loadResults}
                          disabled={isLoadingResults}
                          className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-semibold transition shadow-lg"
                        >
                          {isLoadingResults
                            ? '⏳ Loading...'
                            : '🔍 Apply Filter & Load Results'}
                        </button>
                      </div>

                      {/* Export Section */}
                      <div className="bg-linear-to-br from-green-50 to-emerald-50 rounded-lg p-6 border border-green-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">
                          📥 Export Results
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Download results in CSV format for further analysis.
                        </p>
                        <div className="space-y-3">
                          <button
                            onClick={() => exportResults('summary')}
                            className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-lg flex items-center justify-center gap-2"
                          >
                            <span>📄</span> Export Summary CSV
                          </button>
                          <button
                            onClick={() => exportResults('detailed')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition shadow-lg flex items-center justify-center gap-2"
                          >
                            <span>📊</span> Export Detailed CSV (with Q1-Q50)
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                          <strong>Summary:</strong> Name, Email, Roll Number,
                          College, Score, Percentage, Status
                          <br />
                          <strong>Detailed:</strong> All summary columns +
                          individual question responses
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Results Table */}
                  {isLoadingResults ? (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 p-12 text-center">
                      <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto mb-4"></div>
                      <p className="text-gray-600 font-semibold">
                        Loading results...
                      </p>
                    </div>
                  ) : results.length === 0 ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-8 text-center">
                      <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-3xl">📊</span>
                      </div>
                      <h4 className="text-xl font-bold text-yellow-900 mb-2">
                        No results to display
                      </h4>
                      <p className="text-yellow-700">
                        Click "Apply Filter & Load Results" to view student
                        results, or adjust the percentage filter.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl shadow-lg border border-gray-200/50 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-linear-to-r from-indigo-600 to-purple-600 text-white">
                            <tr>
                              <th className="px-6 py-4 text-left font-semibold">
                                Name
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                Email
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                Roll Number
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                College
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                Group
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                Score
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                Percentage
                              </th>
                              <th className="px-8 py-4 text-left font-semibold">
                                Status
                              </th>
                              <th className="px-6 py-4 text-left font-semibold">
                                Violations
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {results.map((result, index) => {
                              const violationCount = result.violation_details
                                ? Object.values(
                                    result.violation_details
                                  ).reduce((a, b) => a + b, 0)
                                : 0;

                              return (
                                <tr
                                  key={result.id}
                                  className={`hover:bg-gray-50 transition ${
                                    index % 2 === 0
                                      ? 'bg-white'
                                      : 'bg-gray-50/50'
                                  }`}
                                >
                                  <td className="px-6 py-4 font-medium text-gray-900">
                                    {result.name}
                                  </td>
                                  <td className="px-6 py-4 text-gray-700">
                                    {result.email}
                                  </td>
                                  <td className="px-6 py-4 text-gray-700">
                                    {result.roll_number || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 text-gray-700">
                                    {result.college_name || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 text-gray-700">
                                    {result.student_group_name || 'N/A'}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="font-semibold text-indigo-600">
                                      {result.score !== null
                                        ? result.score
                                        : '-'}
                                      /
                                      {result.total_marks !== null
                                        ? result.total_marks
                                        : '-'}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    {result.percentage !== null ? (
                                      <span
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                                          result.percentage >= 80
                                            ? 'bg-green-100 text-green-800'
                                            : result.percentage >= 60
                                            ? 'bg-blue-100 text-blue-800'
                                            : result.percentage >= 40
                                            ? 'bg-yellow-100 text-yellow-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}
                                      >
                                        {result.percentage.toFixed(2)}%
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">-</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    {result.is_disqualified ? (
                                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-red-100 text-red-800">
                                        ❌ Disqualified
                                      </span>
                                    ) : result.exam_submitted_at ? (
                                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-800">
                                        ✅ Submitted
                                      </span>
                                    ) : result.exam_started_at ? (
                                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-yellow-100 text-yellow-800">
                                        ⏳ In Progress
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-gray-100 text-gray-800">
                                        ⚪ Not Started
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    {violationCount > 0 ? (
                                      <button
                                        onClick={() => {
                                          alert(
                                            `Violation Details:\n\n${JSON.stringify(
                                              result.violation_details,
                                              null,
                                              2
                                            )}\n\nDisqualification Reason: ${
                                              result.disqualification_reason ||
                                              'N/A'
                                            }`
                                          );
                                        }}
                                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-orange-100 text-orange-800 hover:bg-orange-200 transition cursor-pointer"
                                      >
                                        ⚠️ {violationCount} violations
                                      </button>
                                    ) : (
                                      <span className="text-gray-400 text-sm">
                                        None
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
                        <p className="text-sm text-gray-600 font-semibold">
                          <span className="text-indigo-600">📊</span> Showing{' '}
                          {results.length} student(s)
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Legend */}
                  {results.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">
                        📖 Legend
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-semibold text-gray-700 mb-2">
                            Status Colors:
                          </p>
                          <ul className="space-y-1 text-gray-600">
                            <li>
                              ✅ <strong>Submitted:</strong> Exam completed
                              successfully
                            </li>
                            <li>
                              ⏳ <strong>In Progress:</strong> Currently taking
                              the exam
                            </li>
                            <li>
                              ⚪ <strong>Not Started:</strong> Haven't begun the
                              exam
                            </li>
                            <li>
                              ❌ <strong>Disqualified:</strong> Exceeded
                              violation limits
                            </li>
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-700 mb-2">
                            Percentage Colors:
                          </p>
                          <ul className="space-y-1 text-gray-600">
                            <li>
                              <span className="inline-block w-4 h-4 bg-green-500 rounded mr-2"></span>
                              80%+ : Excellent
                            </li>
                            <li>
                              <span className="inline-block w-4 h-4 bg-blue-500 rounded mr-2"></span>
                              60-79% : Good
                            </li>
                            <li>
                              <span className="inline-block w-4 h-4 bg-yellow-500 rounded mr-2"></span>
                              40-59% : Average
                            </li>
                            <li>
                              <span className="inline-block w-4 h-4 bg-red-500 rounded mr-2"></span>
                              &lt;40% : Below Average
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
