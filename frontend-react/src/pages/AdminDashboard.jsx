import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import AdminColleges from './AdminColleges';
import { formatDateUTC, formatDateLocal } from '../utils/timezone';

export default function AdminDashboard() {
  const { logout } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState('companies');

  // ============= COMPANIES TAB STATES =============
  const [companiesList, setCompaniesList] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(false);

  // Modals for companies tab
  const [drivesModal, setDrivesModal] = useState({
    open: false,
    companyId: null,
    companyName: '',
  });
  const [studentsModal, setStudentsModal] = useState({
    open: false,
    driveId: null,
    driveTitle: '',
  });
  const [driveStudentsList, setDriveStudentsList] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [drivesList, setDrivesList] = useState([]);

  // ============= DRIVES TAB STATES =============
  const [allDrivesList, setAllDrivesList] = useState([]);
  const [driveStatusFilter, setDriveStatusFilter] = useState('all');
  const [drivesLoading, setDrivesLoading] = useState(false);
  const [driveDetailModal, setDriveDetailModal] = useState({
    open: false,
    data: null,
  });
  const [driveDetailData, setDriveDetailData] = useState(null);
  const [showAllQuestions, setShowAllQuestions] = useState(false);
  const [showAllStudents, setShowAllStudents] = useState(false);
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

  // Modal states for drive actions
  const [approvalModal, setApprovalModal] = useState({
    open: false,
    driveId: null,
    action: null, // 'approve', 'reject', 'suspend'
  });
  const [approvalNotes, setApprovalNotes] = useState('');





  // ============= COMPANIES TAB EFFECTS =============
  useEffect(() => {
    if (activeTab === 'companies') {
      loadCompanies();
    }
  }, [statusFilter, activeTab]);

  // ============= DRIVES TAB EFFECTS =============
  useEffect(() => {
    if (activeTab === 'drives') {
      loadAllDrives();
      loadExamStatuses();
    }
  }, [driveStatusFilter, activeTab]);

  // Polling for active drives in drives tab
  useEffect(() => {
    if (activeTab !== 'drives') {
      return; // Only poll when on drives tab
    }

    // Check if there are any active drives before setting up polling
    const hasActiveDrives = allDrivesList.some(d =>
      ['live', 'ongoing', 'upcoming', 'approved', 'submitted'].includes(d.status)
    );

    if (!hasActiveDrives) {
      return; // Don't set up polling if no active drives
    }

    // Refresh exam statuses every 30 seconds for active drives
    const interval = setInterval(() => {
      loadExamStatuses();
    }, 30000);

    return () => clearInterval(interval);
  }, [allDrivesList, activeTab]); // Re-evaluate when drives or tab changes





  // ============= COMPANIES TAB FUNCTIONS =============
  const loadCompanies = async () => {
    setIsLoading(true);
    try {
      const res = await api.get(
        `/admin/companies?status_filter=${statusFilter}&limit=500`
      );
      setCompaniesList(res.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load companies');
    } finally {
      setIsLoading(false);
    }
  };

  const approveCompany = async (id) => {
    if (!window.confirm('Approve this company?')) return;
    try {
      await api.put(`/admin/companies/${id}/approve`, {
        is_approved: true,
        notes: 'Approved by admin',
      });
      toast.success('Company approved successfully');
      await loadCompanies();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve company');
    }
  };

  const rejectCompany = async (id) => {
    const reason = window.prompt('Reason for rejection (optional):');
    if (reason === null) return;
    try {
      await api.put(`/admin/companies/${id}/reject`, {
        reason: reason || 'Rejected by admin',
      });
      toast.success('Company rejected successfully');
      await loadCompanies();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject company');
    }
  };

  const suspendCompany = async (id) => {
    const reason = window.prompt('Reason for suspension (optional):');
    if (reason === null) return;
    try {
      await api.put(`/admin/companies/${id}/approve`, {
        is_approved: false,
        notes: reason || 'Suspended by admin',
      });
      toast.success('Company suspended');
      await loadCompanies();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to suspend company');
    }
  };

  const viewCompanyDrives = async (companyId, companyName) => {
    try {
      const res = await api.get('/company/drives', {
        headers: { 'X-Company-ID': companyId },
      });
      setDrivesList(res.data || []);
      setDrivesModal({ open: true, companyId, companyName });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load drives');
    }
  };

  const viewDriveStudents = async (companyId, driveId, driveTitle) => {
    try {
      const res = await api.get(`/company/drives/${driveId}/students`, {
        headers: { 'X-Company-ID': companyId },
      });
      setDriveStudentsList(res.data || []);
      setStudentsModal({ open: true, driveId, driveTitle });
      setStudentSearch('');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load students');
    }
  };

  // ============= DRIVES TAB FUNCTIONS =============
  const loadAllDrives = async () => {
    setDrivesLoading(true);
    try {
      const res = await api.get(
        `/admin/drives?status_filter=${driveStatusFilter}&limit=500`
      );
      setAllDrivesList(res.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load drives');
    } finally {
      setDrivesLoading(false);
    }
  };

  const loadExamStatuses = async () => {
    try {
      const res = await api.get(
        `/admin/drives?status_filter=${driveStatusFilter}&limit=500`
      );
      const drivesData = res.data || [];

      // Only load exam status for approved drives (including completed ones)
      const activeDrives = drivesData.filter(d =>
        d.is_approved && !['rejected', 'suspended'].includes(d.status)
      );

      if (activeDrives.length === 0) {
        return; // Skip if no active drives
      }

      const statusPromises = activeDrives.map(async (drive) => {
        try {
          const statusRes = await api.get(`/admin/drives/${drive.id}/exam-status`);
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

  const approveDrive = async (id, notes = '') => {
    try {
      await api.put(`/admin/drives/${id}/approve`, {
        is_approved: true,
        admin_notes: notes || 'Approved by admin',
      });
      toast.success('Drive approved successfully');
      await loadAllDrives();
      setDriveDetailModal({ ...driveDetailModal, open: false });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve drive');
    }
  };

  const rejectDrive = async (id, reason = '') => {
    try {
      await api.put(`/admin/drives/${id}/approve`, {
        is_approved: false,
        admin_notes: reason || 'Rejected by admin',
      });
      toast.success('Drive rejected successfully');
      await loadAllDrives();
      setDriveDetailModal({ ...driveDetailModal, open: false });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reject drive');
    }
  };

  const suspendDrive = async (id, reason = '') => {
    try {
      await api.put(`/admin/drives/${id}/suspend`, {
        reason: reason || 'Suspended by admin',
      });
      toast.success('Drive suspended');
      await loadAllDrives();
      setDriveDetailModal({ ...driveDetailModal, open: false });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to suspend drive');
    }
  };

  const reactivateDrive = async (id) => {
    try {
      await api.put(`/admin/drives/${id}/approve`, {
        is_approved: true,
      });
      toast.success('Drive reactivated');
      await loadAllDrives();
      setDriveDetailModal({ ...driveDetailModal, open: false });
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to reactivate drive');
    }
  };

  const viewDriveDetail = async (driveId) => {
    try {
      const res = await api.get(`/admin/drives/${driveId}/detail`);
      // Backend returns nested structure: {drive, questions, students, stats}
      const detail = res.data;
      const flatData = {
        ...detail.drive,
        questions: detail.questions || [],
        students: detail.students || [],
        targets: detail.drive.targets || [],
        total_points: detail.stats?.total_points || 0,
      };
      setDriveDetailData(flatData);
      setDriveDetailModal({ open: true, data: flatData });
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || 'Failed to load drive details'
      );
    }
  };



  // ============= HELPER FUNCTIONS =============
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return formatDateLocal(dateString);
  };



  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Navigation */}
      <nav className="bg-white dark:bg-slate-800 shadow sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold science-gothic-fontstyle bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Admin Dashboard
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => logout()}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-linear-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105 cursor-pointer"
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
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 8h11m0 0-4-4m4 4-4 4m-5 3H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h3"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-0">
            <button
              onClick={() => setActiveTab('companies')}
              className={`px-6 py-4 font-semibold border-b-2 cursor-pointer transition ${
                activeTab === 'companies'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Companies
            </button>
            <button
              onClick={() => setActiveTab('drives')}
              className={`px-6 py-4 font-semibold border-b-2 cursor-pointer transition ${
                activeTab === 'drives'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Drives
            </button>

            <button
              onClick={() => setActiveTab('colleges')}
              className={`px-6 py-4 font-semibold border-b-2 cursor-pointer transition ${
                activeTab === 'colleges'
                  ? 'border-red-600 text-red-600 dark:text-red-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Colleges
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ============= COMPANIES TAB ============= */}
        {activeTab === 'companies' && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white science-gothic-fontstyle">
                Company Management
              </h2>
              <div className="flex gap-4">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                  <option value="all">All</option>
                </select>
                <button
                  onClick={loadCompanies}
                  disabled={isLoading}
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-semibold transition cursor-pointer"
                >
                  {isLoading ? 'Loading...' : ' Refresh'}
                </button>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full"></div>
              </div>
            ) : companiesList.length === 0 ? (
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-6 text-center">
                <p className="text-blue-800 dark:text-blue-300 text-lg">
                  No companies found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                <table className="w-full">
                  <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Company Name
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Username
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Email
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Registered
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {companiesList.map((company) => (
                      <tr
                        key={company.id}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                      >
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {company.company_name}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {company.username}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {company.email}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(company.status || 'pending')}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300 text-sm">
                          {formatDate(company.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() =>
                                viewCompanyDrives(
                                  company.id,
                                  company.company_name
                                )
                              }
                              className="px-3 py-1 bg-blue-500/50 hover:bg-blue-600 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                            >
                              View Drives
                            </button>
                            {company.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => approveCompany(company.id)}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => rejectCompany(company.id)}
                                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {company.status === 'approved' && (
                              <button
                                onClick={() => suspendCompany(company.id)}
                                className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                              >
                                Suspend
                              </button>
                            )}
                            {company.status === 'suspended' && (
                              <button
                                onClick={() => approveCompany(company.id)}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                              >
                                Activate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ============= DRIVES TAB ============= */}
        {activeTab === 'drives' && (
          <div>
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-bold science-gothic-fontstyle text-gray-900 dark:text-white">
                Drive Management
              </h2>
              <div className="flex gap-4">
                <select
                  value={driveStatusFilter}
                  onChange={(e) => setDriveStatusFilter(e.target.value)}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  <option value="pending">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="suspended">Suspended</option>
                  <option value="all">All</option>
                </select>
                <button
                  onClick={loadAllDrives}
                  disabled={drivesLoading}
                  className="px-6 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-semibold transition cursor-pointer"
                >
                  {drivesLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {drivesLoading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full"></div>
              </div>
            ) : allDrivesList.length === 0 ? (
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-6 text-center">
                <p className="text-blue-800 dark:text-blue-300 text-lg">
                  No drives found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                <table className="w-full">
                  <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Title
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Company
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Type
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Duration
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Exam Status
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Created
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {allDrivesList.map((drive) => (
                      <tr
                        key={drive.id}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                      >
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {drive.title}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {drive.company_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {drive.category}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {drive.exam_duration_minutes} min
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(drive.status)}
                        </td>
                        <td className="px-6 py-4">
                          {drive.is_approved && examStatuses[drive.id] ? (
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                              examStatuses[drive.id].exam_state === 'not_started'
                                ? 'bg-gray-100 text-gray-800'
                                : examStatuses[drive.id].exam_state === 'ongoing'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}>
                              {examStatuses[drive.id].exam_state === 'not_started' && '⏱️ Not Started'}
                              {examStatuses[drive.id].exam_state === 'ongoing' && (
                                <>
                                  🟢 Live
                                  {clientTimeRemaining[drive.id] > 0 && (
                                    <span className="ml-1 font-bold">
                                      ({Math.floor(clientTimeRemaining[drive.id] / 60)}m {Math.floor(clientTimeRemaining[drive.id] % 60)}s)
                                    </span>
                                  )}
                                </>
                              )}
                              {(examStatuses[drive.id].exam_state === 'completed' || examStatuses[drive.id].exam_state === 'ended') && '✅ Ended'}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300 text-sm">
                          {formatDate(drive.created_at)}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => viewDriveDetail(drive.id)}
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold transition"
                            >
                              View
                            </button>
                            {drive.status === 'submitted' && (
                              <>
                                <button
                                  onClick={() => approveDrive(drive.id)}
                                  className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold transition"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => rejectDrive(drive.id)}
                                  className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg font-semibold transition"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {drive.is_approved && drive.status !== 'suspended' && (
                              <button
                                onClick={() => suspendDrive(drive.id)}
                                className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-sm rounded-lg font-semibold transition"
                              >
                                Suspend
                              </button>
                            )}
                            {drive.status === 'suspended' && (
                              <button
                                onClick={() => reactivateDrive(drive.id)}
                                className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold transition"
                              >
                                Reactivate
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}



        {/* ============= COLLEGES TAB ============= */}
        {activeTab === 'colleges' && <AdminColleges />}
      </main>

      {/* ============= MODALS ============= */}

      {/* Drives Modal (Companies Tab) */}
      {drivesModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-100 dark:bg-slate-700 px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-slate-600">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {drivesModal.companyName} - Drives
              </h3>
              <button
                onClick={() => setDrivesModal({ ...drivesModal, open: false })}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              {drivesList.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">
                  No drives found for this company
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Title
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Type
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Duration
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Questions
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Students
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Created
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                      {drivesList.map((drive) => (
                        <tr
                          key={drive.id}
                          className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {drive.title}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {drive.category}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {drive.exam_duration_minutes} min
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(drive.status)}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {drive.question_count || 0}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                            {drive.student_count || 0}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300 text-sm">
                            {formatDate(drive.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() =>
                                viewDriveStudents(
                                  drivesModal.companyId,
                                  drive.id,
                                  drive.title
                                )
                              }
                              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                            >
                              View Students
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Students Modal */}
      {studentsModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-100 dark:bg-slate-700 px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-slate-600">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {studentsModal.driveTitle} - Students
              </h3>
              <button
                onClick={() =>
                  setStudentsModal({ ...studentsModal, open: false })
                }
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              {driveStudentsList.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">
                  No students found for this drive
                </p>
              ) : (
                <>
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-red-50 dark:bg-slate-700 p-4 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Total Students
                      </h4>
                      <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                        {driveStudentsList.length}
                      </p>
                    </div>
                    <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                        Unique Emails
                      </h4>
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {new Set(driveStudentsList.map((s) => s.email)).size}
                      </p>
                    </div>
                  </div>

                  {/* Search */}
                  <input
                    type="text"
                    placeholder="Search by name, email, or roll number..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full px-4 py-2 mb-4 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />

                  {/* Students Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Roll Number
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Name
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Email
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            College
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Group
                          </th>
                          <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                            Batch Year
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                        {driveStudentsList.filter(student =>
                          student.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                          student.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
                          student.roll_number.toLowerCase().includes(studentSearch.toLowerCase())
                        ).map((student, idx) => (
                          <tr
                            key={idx}
                            className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                          >
                            <td className="px-4 py-3 text-gray-900 dark:text-white">
                              {student.roll_number}
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                              {student.name}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {student.email}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {student.college_name || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {student.student_group_name || 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                              {student.batch_year || 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {driveStudentsList.filter(student =>
                    student.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                    student.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
                    student.roll_number.toLowerCase().includes(studentSearch.toLowerCase())
                  ).length === 0 && studentSearch.trim() !== '' && (
                    <p className="text-center text-gray-600 dark:text-gray-400 mt-4">
                      No students match your search
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Drive Detail Modal */}
      {driveDetailModal.open && driveDetailData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-100 dark:bg-slate-700 px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-slate-600">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Drive Details
              </h3>
              <button
                onClick={() => {
                  setDriveDetailModal({ ...driveDetailModal, open: false });
                  setShowAllQuestions(false);
                  setShowAllStudents(false);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="mb-6">
                <h4 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                  {driveDetailData.title}
                </h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Company
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {driveDetailData.company_name || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Description
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {driveDetailData.description || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Exam Duration
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {driveDetailData.exam_duration_minutes || driveDetailData.duration_minutes} minutes
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Status
                    </p>
                    <p>{getStatusBadge(driveDetailData.status)}</p>
                  </div>
                </div>

                {/* Window and Actual Times */}
                <div className="grid grid-cols-2 gap-4 mt-4 p-4 bg-blue-50 dark:bg-slate-700 rounded-lg border-2 border-blue-300">
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-300">
                      📅 Scheduled Window <span className="text-xs font-normal text-blue-600">(UTC)</span>
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 font-medium">
                      Start: {driveDetailData.window_start ? formatDateUTC(driveDetailData.window_start) : 'Not set'}
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                      End: {driveDetailData.window_end ? formatDateUTC(driveDetailData.window_end) : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-900 dark:text-green-300">
                      ✅ Actual Window <span className="text-xs font-normal text-green-600">(Live - UTC)</span>
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 font-medium">
                      Start: {driveDetailData.actual_window_start ? formatDateUTC(driveDetailData.actual_window_start) : '⏳ Not started'}
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">
                      End: {driveDetailData.actual_window_end ? formatDateUTC(driveDetailData.actual_window_end) : '⏳ Not ended'}
                    </p>
                    {driveDetailData.actual_window_start && driveDetailData.actual_window_end && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-2 italic">
                        Duration: {(() => {
                          const start = new Date(driveDetailData.actual_window_start);
                          const end = new Date(driveDetailData.actual_window_end);
                          const diffMs = end - start;
                          const diffHours = Math.floor(diffMs / 3600000);
                          const diffMins = Math.floor((diffMs % 3600000) / 60000);
                          return `${diffHours}h ${diffMins}m`;
                        })()}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Statistics */}
              <div className="mb-6">
                <h5 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                  Statistics
                </h5>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Questions
                    </p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {driveDetailData.questions?.length || 0}
                    </p>
                  </div>
                  <div className="bg-green-50 dark:bg-slate-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Students
                    </p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {driveDetailData.students?.length || 0}
                    </p>
                  </div>
                  <div className="bg-purple-50 dark:bg-slate-700 p-4 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Total Points
                    </p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {driveDetailData.total_points || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Targets Section */}
              {driveDetailData.targets &&
                driveDetailData.targets.length > 0 && (
                  <div className="mb-6">
                    <h5 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                      Target Groups
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {driveDetailData.targets.map((target, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium"
                        >
                          {target.college_name} - {target.student_group_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

              {/* Questions Section */}
              {driveDetailData.questions &&
                driveDetailData.questions.length > 0 && (
                  <div className="mb-6">
                    <h5 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                      Questions ({driveDetailData.questions.length})
                    </h5>
                    <div className="max-h-64 overflow-y-auto bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                      {driveDetailData.questions
                        .slice(0, showAllQuestions ? undefined : 10)
                        .map((q, idx) => (
                          <div
                            key={idx}
                            className="mb-3 pb-3 border-b border-gray-200 dark:border-slate-600 last:border-b-0"
                          >
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {idx + 1}. {q.question_text}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              Points: {q.points}
                            </p>
                          </div>
                        ))}
                    </div>
                    {driveDetailData.questions.length > 10 && (
                      <button
                        onClick={() => setShowAllQuestions(!showAllQuestions)}
                        className="mt-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg font-semibold transition"
                      >
                        {showAllQuestions
                          ? 'Show Less'
                          : `Show ${
                              driveDetailData.questions.length - 10
                            } More Questions`}
                      </button>
                    )}
                  </div>
                )}

              {/* Students Section */}
              {driveDetailData.students &&
                driveDetailData.students.length > 0 && (
                  <div className="mb-6">
                    <h5 className="text-lg font-bold text-gray-900 dark:text-white mb-3">
                      Students ({driveDetailData.students.length})
                    </h5>
                    <div className="max-h-64 overflow-y-auto bg-gray-50 dark:bg-slate-700 rounded-lg p-4">
                      {driveDetailData.students
                        .slice(0, showAllStudents ? undefined : 20)
                        .map((s, idx) => (
                          <div
                            key={idx}
                            className="mb-2 pb-2 border-b border-gray-200 dark:border-slate-600 last:border-b-0 text-sm"
                          >
                            <p className="font-semibold text-gray-900 dark:text-white">
                              {s.name} ({s.roll_number})
                            </p>
                            <p className="text-gray-600 dark:text-gray-400">
                              {s.email}
                            </p>
                          </div>
                        ))}
                    </div>
                    {driveDetailData.students.length > 20 && (
                      <button
                        onClick={() => setShowAllStudents(!showAllStudents)}
                        className="mt-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm rounded-lg font-semibold transition"
                      >
                        {showAllStudents
                          ? 'Show Less'
                          : `Show ${
                              driveDetailData.students.length - 20
                            } More Students`}
                      </button>
                    )}
                  </div>
                )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 pt-6 border-t border-gray-200 dark:border-slate-700">
                {driveDetailData.status === 'submitted' && (
                  <>
                    <button
                      onClick={() =>
                        setApprovalModal({
                          open: true,
                          driveId: driveDetailData.id,
                          action: 'approve',
                        })
                      }
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() =>
                        setApprovalModal({
                          open: true,
                          driveId: driveDetailData.id,
                          action: 'reject',
                        })
                      }
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition"
                    >
                      Reject
                    </button>
                  </>
                )}
                {driveDetailData.status === 'approved' && (
                  <button
                    onClick={() =>
                      setApprovalModal({
                        open: true,
                        driveId: driveDetailData.id,
                        action: 'suspend',
                      })
                    }
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-semibold transition"
                  >
                    Suspend
                  </button>
                )}
                {driveDetailData.status === 'suspended' && (
                  <button
                    onClick={() => reactivateDrive(driveDetailData.id)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                  >
                    Reactivate
                  </button>
                )}
                <button
                  onClick={() => {
                    setDriveDetailModal({ ...driveDetailModal, open: false });
                    setShowAllQuestions(false);
                    setShowAllStudents(false);
                  }}
                  className="px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg font-semibold transition ml-auto"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {approvalModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg max-w-md w-full">
            <div className="bg-gray-100 dark:bg-slate-700 px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-slate-600">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {approvalModal.action === 'approve' && 'Approve Drive'}
                {approvalModal.action === 'reject' && 'Reject Drive'}
                {approvalModal.action === 'suspend' && 'Suspend Drive'}
              </h3>
              <button
                onClick={() => {
                  setApprovalModal({ ...approvalModal, open: false });
                  setApprovalNotes('');
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <label className="block mb-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {approvalModal.action === 'approve' &&
                    'Approval notes (optional):'}
                  {approvalModal.action === 'reject' &&
                    'Reason for rejection (required):'}
                  {approvalModal.action === 'suspend' &&
                    'Reason for suspension (optional):'}
                </p>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Enter your message..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="4"
                />
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (
                      approvalModal.action === 'reject' &&
                      !approvalNotes.trim()
                    ) {
                      toast.error('Rejection reason is required');
                      return;
                    }
                    if (approvalModal.action === 'approve') {
                      approveDrive(approvalModal.driveId, approvalNotes);
                    } else if (approvalModal.action === 'reject') {
                      rejectDrive(approvalModal.driveId, approvalNotes);
                    } else if (approvalModal.action === 'suspend') {
                      suspendDrive(approvalModal.driveId, approvalNotes);
                    }
                    setApprovalModal({ ...approvalModal, open: false });
                    setApprovalNotes('');
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setApprovalModal({ ...approvalModal, open: false });
                    setApprovalNotes('');
                  }}
                  className="flex-1 px-4 py-2 bg-gray-400 hover:bg-gray-500 text-white rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
