import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatDateUTC } from '../utils/timezone';

// Main component for the Company Dashboard
const CompanyDashboard = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [drives, setDrives] = useState([]);
  const [dashboardStats, setDashboardStats] = useState({
    total: 0,
    active: 0,
    completed: 0,
  });
  const [loading, setLoading] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [examStatuses, setExamStatuses] = useState({}); // Track exam status for each drive
  const [clientTimeRemaining, setClientTimeRemaining] = useState({}); // Client-side countdown

  // Real-time countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setClientTimeRemaining(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(driveId => {
          if (updated[driveId] > 0) {
            updated[driveId] = updated[driveId] - 1;
          }
        });
        return updated;
      });
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, []);

  // Load initial data
  useEffect(() => {
    loadDashboardData();
    loadDrives();
    loadExamStatuses();
  }, []); // Only run on mount

  // Polling for active drives
  useEffect(() => {
    // Only poll if there are any active drives
    const hasActiveDrives = drives.some(d =>
      ['live', 'ongoing', 'upcoming', 'approved'].includes(d.status)
    );

    if (!hasActiveDrives) {
      return; // Don't set up polling if no active drives
    }

    // Refresh exam statuses every 30 seconds for active drives
    const interval = setInterval(() => {
      loadExamStatuses();
    }, 30000);

    return () => clearInterval(interval);
  }, [drives]); // Re-evaluate when drives change

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/company/drives');
      const drivesData = response.data;
      setDashboardStats({
        total: drivesData.length,
        active: drivesData.filter((d) =>
          ['live', 'ongoing', 'upcoming'].includes(d.status)
        ).length,
        completed: drivesData.filter((d) => d.status === 'completed').length,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      if (error?.response?.status === 401) {
        toast.error('Unauthorized - please login again');
        logout();
        navigate('/company/login');
      } else {
        toast.error('Error loading dashboard data');
      }
    }
  };

  const loadDrives = async () => {
    setLoading(true);
    try {
      const response = await api.get('/company/drives');
      setDrives(response.data);
    } catch (error) {
      console.error('Error loading drives:', error);
      if (error?.response?.status === 401) {
        logout();
        navigate('/company/login');
      } else {
        toast.error('Error loading drives');
      }
    } finally {
      setLoading(false);
    }
  };

  const submitForApproval = async (driveId) => {
    if (
      !confirm('Are you sure you want to submit this drive for admin approval?')
    )
      return;

    try {
      await api.put(`/company/drives/${driveId}/submit`);
      toast.success('Drive submitted for approval');
      loadDrives();
      loadDashboardData();
    } catch (error) {
      toast.error(
        'Error submitting drive: ' +
          (error.response?.data?.detail || error.message)
      );
    }
  };

  const duplicateDrive = async (driveId) => {
    if (!confirm('Duplicate this drive?')) return;

    try {
      await api.post(`/company/drives/${driveId}/duplicate`);
      toast.success('Drive duplicated');
      loadDrives();
      loadDashboardData();
    } catch (error) {
      toast.error(
        'Error duplicating drive: ' +
          (error.response?.data?.detail || error.message)
      );
    }
  };

  const deleteDrive = async (driveId) => {
    if (!confirm('Delete this drive?')) return;

    try {
      await api.delete(`/company/drives/${driveId}`);
      toast.success('Drive deleted');
      loadDrives();
      loadDashboardData();
    } catch (error) {
      toast.error(
        'Error deleting drive: ' +
          (error.response?.data?.detail || error.message)
      );
    }
  };

  const loadExamStatuses = async () => {
    try {
      const response = await api.get('/company/drives');
      const drivesData = response.data;

      // Load exam status for all approved drives (including completed to show final state)
      const activeDrives = drivesData.filter(d =>
        d.is_approved && !['rejected', 'suspended'].includes(d.status)
      );

      if (activeDrives.length === 0) {
        return; // Skip if no active drives
      }

      const statusPromises = activeDrives.map(async (drive) => {
        try {
          const statusRes = await api.get(`/company/drives/${drive.id}/exam-status`);
          return { driveId: drive.id, status: statusRes.data };
        } catch (error) {
          return { driveId: drive.id, status: null };
        }
      });

      const statuses = await Promise.all(statusPromises);
      const statusMap = {};
      const timeMap = {};

      statuses.forEach(({ driveId, status }) => {
        statusMap[driveId] = status;
        // Initialize client-side countdown with server time
        if (status && status.time_remaining) {
          timeMap[driveId] = status.time_remaining;
        }
      });

      setExamStatuses(statusMap);
      setClientTimeRemaining(timeMap);
    } catch (error) {
      console.error('Error loading exam statuses:', error);
    }
  };

  const startExam = async (driveId) => {
    if (!confirm('Are you sure you want to start the exam now?')) return;

    try {
      await api.post(`/company/drives/${driveId}/start`);
      toast.success('Exam started successfully!');
      loadExamStatuses();
      loadDrives();
    } catch (error) {
      toast.error(
        'Error starting exam: ' +
          (error.response?.data?.detail || error.message)
      );
    }
  };

  const endExam = async (driveId) => {
    if (!confirm('Are you sure you want to end the exam now?')) return;

    try {
      await api.post(`/company/drives/${driveId}/end`);
      toast.success('Exam ended successfully!');
      loadExamStatuses();
      loadDrives();
    } catch (error) {
      toast.error(
        'Error ending exam: ' +
          (error.response?.data?.detail || error.message)
      );
    }
  };

  const formatTargetsDisplay = (targets) => {
    if (!targets || targets.length === 0) return 'No targets';
    if (targets.length === 1) {
      const target = targets[0];
      return `${target.college_name} - ${target.student_group_name}${
        target.batch_year ? ` - ${target.batch_year}` : ''
      }`;
    }
    return `${targets.length} targets`;
  };

  const getStatusBadge = (status) => {
    const classes = {
      draft: 'bg-gray-500',
      submitted: 'bg-blue-500',
      approved: 'bg-green-500',
      live: 'bg-blue-500',
      ongoing: 'bg-blue-500',
      upcoming: 'bg-purple-500',
      completed: 'bg-green-600',
      rejected: 'bg-red-500',
    };
    return `inline-block px-2 py-1 text-xs font-semibold rounded-full text-white ${
      classes[status] || 'bg-gray-500'
    }`;
  };

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
            onClick={() => {}}
            className="w-full text-left px-4 py-3 rounded-xl bg-linear-to-r from-blue-500 to-purple-600 text-white shadow-lg font-medium flex items-center gap-3"
          >
            <span>📊</span> Dashboard
          </button>
        </nav>

        <div className="p-4 border-t border-slate-700">
          <button
            onClick={() => {
              logout();
              navigate('/');
            }}
            className=" w-full inline-flex items-center justify-center px-5 py-2.5 bg-linear-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105"
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
                navigate('/');
              }}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold"
            >
              Logout
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
                  Company Dashboard
                </h1>
                <p className="text-sm text-gray-600">
                  Manage your recruitment drives
                </p>
              </div>

              <nav className="flex items-center space-x-2 sm:space-x-3">
                <button
                  onClick={() => navigate('/company-create-drive')}
                  className="px-6 py-2.5 rounded-xl font-semibold bg-linear-to-r from-green-500 to-green-600 text-white shadow-lg hover:from-green-600 hover:to-green-700 transition"
                >
                  ➕ Create Drive
                </button>
                <button
                  onClick={() => logout()}
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
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="flex-1 overflow-auto">
          <main className="py-8">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              {/* Dashboard Overview */}
              <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                <div className="bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 px-8 py-6">
                  <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    <span>📊</span> Dashboard Overview
                  </h2>
                </div>
                <div className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="bg-linear-to-br from-blue-50 to-blue-100 p-8 rounded-2xl border border-blue-200/50 hover:shadow-2xl transition group">
                      <p className="text-sm font-semibold text-blue-700 mb-2 uppercase">
                        Total Drives
                      </p>
                      <p className="text-5xl font-bold text-blue-900">
                        {dashboardStats.total}
                      </p>
                      <div className="text-6xl text-right group-hover:animate-bounce">
                        📋
                      </div>
                    </div>
                    <div className="bg-linear-to-br from-green-50 to-emerald-100 p-8 rounded-2xl border border-green-200/50 hover:shadow-2xl transition group">
                      <p className="text-sm font-semibold text-green-700 mb-2 uppercase">
                        Active Drives
                      </p>
                      <p className="text-5xl font-bold text-green-900">
                        {dashboardStats.active}
                      </p>
                      <div className="text-6xl text-right group-hover:animate-bounce">
                        🚀
                      </div>
                    </div>
                    <div className="bg-linear-to-br from-purple-50 to-violet-100 p-8 rounded-2xl border border-purple-200/50 hover:shadow-2xl transition group">
                      <p className="text-sm font-semibold text-purple-700 mb-2 uppercase">
                        Completed
                      </p>
                      <p className="text-5xl font-bold text-purple-900">
                        {dashboardStats.completed}
                      </p>
                      <div className="text-6xl text-right group-hover:animate-bounce">
                        ✅
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* My Drives */}
              <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                <div className="bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 px-8 py-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-3xl font-bold text-white flex items-center gap-3">
                      <span>📋</span> My Drives
                    </h3>
                    <div className="flex gap-3">
                      <button
                        onClick={loadDrives}
                        disabled={loading}
                        className="px-6 py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl font-semibold transition border border-white/30"
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => navigate('/company-create-drive')}
                        className="px-6 py-2.5 bg-linear-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white rounded-xl font-semibold shadow-lg"
                      >
                        ➕ New Drive
                      </button>
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center items-center py-16">
                    <div className="animate-spin h-16 w-16 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                  </div>
                ) : drives.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-24 h-24 bg-linear-to-br from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                      <span className="text-5xl">📭</span>
                    </div>
                    <h4 className="text-2xl font-bold text-gray-800 mb-3">
                      No drives yet
                    </h4>
                    <p className="text-gray-600 text-lg mb-8">
                      Start your recruitment journey by creating your first
                      drive
                    </p>
                    <button
                      onClick={() => navigate('/company-create-drive')}
                      className="inline-flex items-center px-8 py-4 bg-linear-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl font-semibold shadow-lg"
                    >
                      <span className="text-xl mr-2">🚀</span> Create Your First
                      Drive
                    </button>
                  </div>
                ) : (
                  <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {drives.map((drive) => (
                        <div
                          key={drive.id}
                          className="bg-white rounded-2xl shadow-lg border border-gray-200/50 hover:shadow-2xl transition transform hover:scale-105 overflow-hidden group"
                        >
                          <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <h4 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-900">
                                  {drive.title}
                                </h4>
                                <p className="text-sm text-gray-600 mb-3">
                                  {formatTargetsDisplay(drive.targets)}
                                </p>
                              </div>

                              <div className="flex flex-col items-end space-y-2">
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getStatusBadge(drive.status)}`}>
                                  {drive.status.toUpperCase()}
                                </span>


                                {drive.is_approved ? (
                                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                                    ✅ Approved
                                  </span>
                                ) : drive.status === 'submitted' ? (
                                  <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                                    ⏳ Pending
                                  </span>
                                ) : (
                                  <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                                    📝 Draft
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-between mb-4">
                              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                                {drive.category.toUpperCase()}
                              </span>
                              <span className="text-sm text-gray-600 font-medium">
                                {drive.exam_duration_minutes} min per student
                              </span>
                            </div>

                            {/* Window Time Display */}
                            {drive.is_approved && (
                              <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200">
                                <p className="text-xs font-semibold text-gray-700 mb-1">
                                  {drive.actual_window_start ? '🟢 Active Window' : '📅 Scheduled Window'}
                                </p>
                                {drive.actual_window_start ? (
                                  // Show ACTUAL times when exam has started
                                  <div className="flex flex-col text-xs space-y-1">
                                    <div className="text-green-700 font-semibold">
                                      Started: {formatDateUTC(drive.actual_window_start)}
                                    </div>
                                    <div className="text-green-700 font-semibold">
                                      Closes: {formatDateUTC(drive.actual_window_end)}
                                    </div>
                                    {/* Calculate remaining time */}
                                    {(() => {
                                      const now = new Date();
                                      const windowEnd = new Date(drive.actual_window_end);
                                      if (windowEnd > now) {
                                        const diffMs = windowEnd - now;
                                        const diffHours = Math.floor(diffMs / 3600000);
                                        const diffMins = Math.floor((diffMs % 3600000) / 60000);
                                        return (
                                          <div className="text-indigo-700 font-semibold mt-1">
                                            ⏳ Closes in: {diffHours}h {diffMins}m
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : (
                                  // Show scheduled times before exam starts
                                  <div className="flex flex-col text-xs text-gray-600 space-y-1">
                                    <div>
                                      <span className="font-semibold">Start:</span> {formatDateUTC(drive.window_start)}
                                    </div>
                                    <div>
                                      <span className="font-semibold">End:</span> {formatDateUTC(drive.window_end)}
                                    </div>
                                    <p className="text-gray-500 mt-2">
                                      ℹ️ Click "Start Exam" to activate this window
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Exam Status Display */}
                            {drive.is_approved && examStatuses[drive.id] && (
                              <>
                                <div className={`mb-4 p-3 rounded-lg border ${
                                  examStatuses[drive.id].exam_state === 'not_started'
                                    ? 'bg-linear-to-r from-gray-50 to-slate-50 border-gray-300'
                                    : examStatuses[drive.id].exam_state === 'ongoing'
                                    ? 'bg-linear-to-r from-green-50 to-emerald-50 border-green-300'
                                    : 'bg-linear-to-r from-blue-50 to-indigo-50 border-blue-300'
                                }`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                      <p className="text-xs font-semibold text-gray-700 mb-1">
                                        Exam Status
                                      </p>
                                      <p className={`text-sm font-bold ${
                                        examStatuses[drive.id].exam_state === 'not_started'
                                          ? 'text-gray-900'
                                          : examStatuses[drive.id].exam_state === 'ongoing'
                                          ? 'text-green-900'
                                          : 'text-blue-900'
                                      }`}>
                                        {examStatuses[drive.id].exam_state === 'not_started' && '⏱️ Not Started'}
                                        {examStatuses[drive.id].exam_state === 'ongoing' && '🟢 Live - Ongoing'}
                                        {(examStatuses[drive.id].exam_state === 'completed' || examStatuses[drive.id].exam_state === 'ended') && '✅ Ended'}
                                      </p>
                                      {examStatuses[drive.id].scheduled_start && 
                                       examStatuses[drive.id].exam_state === 'not_started' && (
                                        <p className="text-xs text-gray-600 mt-1">
                                          📅 {formatDateUTC(examStatuses[drive.id].scheduled_start)}
                                        </p>
                                    )}
                                  </div>
                                  {examStatuses[drive.id].exam_state === 'ongoing' && clientTimeRemaining[drive.id] > 0 && (
                                    <div className="text-right">
                                      <p className="text-xs text-green-700 font-medium">Time Left</p>
                                      <p className="text-lg font-bold text-green-900">
                                        {Math.floor(clientTimeRemaining[drive.id] / 60)}m {Math.floor(clientTimeRemaining[drive.id] % 60)}s
                                      </p>
                                    </div>
                                  )}
                                </div>
                                </div>

                                {/* Warning if no students added yet */}
                                {!examStatuses[drive.id].has_students &&
                                 examStatuses[drive.id].exam_state === 'not_started' && (
                                  <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                    <p className="text-xs text-yellow-800">
                                      ⚠️ Add students and send emails before starting the exam
                                    </p>
                                  </div>
                                )}
                              </>
                            )}

                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() =>
                                  navigate(
                                    `/company-drive-detail?id=${drive.id}`
                                  )
                                }
                                className="flex-1 px-4 py-2 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm rounded-lg font-semibold transition"
                              >
                                View
                              </button>

                              {/* Start Exam Button - Only show if approved and not started */}
                              {drive.is_approved &&
                               examStatuses[drive.id]?.exam_state === 'not_started' &&
                               examStatuses[drive.id]?.can_start && (
                                <button
                                  onClick={() => startExam(drive.id)}
                                  className="flex-1 px-4 py-2 bg-linear-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-sm rounded-lg font-semibold transition"
                                >
                                  Start Exam
                                </button>
                              )}

                              {/* End Exam Button - Only show if ongoing */}
                              {drive.is_approved &&
                               examStatuses[drive.id]?.exam_state === 'ongoing' && (
                                <button
                                  onClick={() => endExam(drive.id)}
                                  className="flex-1 px-4 py-2 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm rounded-lg font-semibold transition"
                                >
                                  End Exam
                                </button>
                              )}

                              {drive.is_approved && (
                                <button
                                  onClick={() =>
                                    navigate(
                                      `/company-send-emails?id=${drive.id}`
                                    )
                                  }
                                  className="flex-1 px-4 py-2 bg-linear-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-sm rounded-lg font-semibold transition"
                                >
                                  Emails
                                </button>
                              )}
                              <button
                                onClick={() => duplicateDrive(drive.id)}
                                className="px-4 py-2 bg-linear-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white text-sm rounded-lg font-semibold transition"
                              >
                                Duplicate
                              </button>
                              {drive.status === 'draft' && (
                                <>
                                  <button
                                    onClick={() => navigate(`/company-create-drive?id=${drive.id}`)}
                                    className="px-4 py-2 bg-linear-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-sm rounded-lg font-semibold transition"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => submitForApproval(drive.id)}
                                    className="px-4 py-2 bg-linear-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white text-sm rounded-lg font-semibold transition"
                                  >
                                    Submit
                                  </button>
                                  <button
                                    onClick={() => deleteDrive(drive.id)}
                                    className="px-4 py-2 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-sm rounded-lg font-semibold transition"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default CompanyDashboard;
