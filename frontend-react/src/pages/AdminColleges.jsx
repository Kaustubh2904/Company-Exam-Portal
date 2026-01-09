import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import api from '../lib/api';

export default function AdminColleges() {
  const [pendingColleges, setPendingColleges] = useState([]);
  const [approvedColleges, setApprovedColleges] = useState([]);
  const [pendingGroups, setPendingGroups] = useState([]);
  const [approvedGroups, setApprovedGroups] = useState([]);
  const [collegesLoading, setCollegesLoading] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    setCollegesLoading(true);
    try {
      await Promise.all([
        loadPendingColleges(),
        loadColleges(),
        loadPendingGroups(),
        loadStudentGroups()
      ]);
    } catch (err) {
      toast.error('Failed to load colleges data');
    } finally {
      setCollegesLoading(false);
    }
  };

  const loadPendingColleges = async () => {
    try {
      console.log('Loading pending colleges...');
      const res = await api.get('/admin/colleges/pending');
      console.log('Pending colleges response:', res.data);
      setPendingColleges(res.data || []);
    } catch (err) {
      console.error('Failed to load pending colleges:', err);
      toast.error('Failed to load pending colleges');
    }
  };

  const loadColleges = async () => {
    try {
      const res = await api.get('/admin/colleges');
      setApprovedColleges(res.data || []);
    } catch (err) {
      console.error('Failed to load colleges:', err);
      toast.error('Failed to load colleges');
    }
  };

  const loadPendingGroups = async () => {
    try {
      const res = await api.get('/admin/student-groups/pending');
      setPendingGroups(res.data || []);
    } catch (err) {
      console.error('Failed to load pending groups:', err);
      toast.error('Failed to load pending groups');
    }
  };

  const loadStudentGroups = async () => {
    try {
      const res = await api.get('/admin/student-groups');
      setApprovedGroups(res.data || []);
    } catch (err) {
      console.error('Failed to load student groups:', err);
      toast.error('Failed to load student groups');
    }
  };

  const approveCustomCollege = async (collegeName) => {
    if (!window.confirm(`Approve "${collegeName}" and add it to the system?`)) return;

    try {
      const res = await api.put('/admin/colleges/approve-custom', {
        name: collegeName,
      });
      toast.success(`College approved! Updated ${res.data?.updated_targets || 0} drive(s)`);
      await Promise.all([loadPendingColleges(), loadColleges()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve college');
    }
  };

  const approveCustomGroup = async (groupName) => {
    if (!window.confirm(`Approve "${groupName}" and add it to the system?`)) return;

    try {
      const res = await api.put('/admin/student-groups/approve-custom', {
        name: groupName,
      });
      toast.success(`Group approved! Updated ${res.data?.updated_targets || 0} drive(s)`);
      await Promise.all([loadPendingGroups(), loadStudentGroups()]);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to approve group');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (isApproved) => {
    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-semibold ${
          isApproved
            ? 'bg-green-100 text-green-800 border border-green-300'
            : 'bg-yellow-100 text-yellow-800 border border-yellow-300'
        }`}
      >
        {isApproved ? 'Approved' : 'Pending'}
      </span>
    );
  };

  return (
    <div>
      <h2 className="text-3xl font-bold science-gothic-fontstyle text-gray-900 dark:text-white mb-8">
        Reference Data Management
      </h2>

      {collegesLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Colleges */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Pending Custom Colleges (Need Approval)
              </h3>
              <button
                onClick={loadPendingColleges}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-semibold transition cursor-pointer"
              >
                Refresh
              </button>
            </div>
            {pendingColleges.length === 0 ? (
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-6 text-center">
                <p className="text-blue-800 dark:text-blue-300">
                  No pending custom colleges
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                <table className="w-full">
                  <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        College Name
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Usage Count
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        First Used
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {pendingColleges.map((college, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                      >
                        <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                          {college.name}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {college.usage_count} drive(s)
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {formatDate(college.first_used)}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => approveCustomCollege(college.name)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                          >
                            Approve & Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Approved Colleges */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Approved Colleges
              </h3>
              <button
                onClick={loadColleges}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-semibold transition cursor-pointer"
              >
                Refresh
              </button>
            </div>
            {approvedColleges.length === 0 ? (
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-6 text-center">
                <p className="text-blue-800 dark:text-blue-300">
                  No colleges found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                <table className="w-full">
                  <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        College Name
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {approvedColleges.map((college, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                      >
                        <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                          {college.name}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(college.is_approved)}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {formatDate(college.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pending Student Groups */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Pending Custom Student Groups (Need Approval)
              </h3>
              <button
                onClick={loadPendingGroups}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-semibold transition cursor-pointer"
              >
                Refresh
              </button>
            </div>
            {pendingGroups.length === 0 ? (
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-6 text-center">
                <p className="text-blue-800 dark:text-blue-300">
                  No pending custom student groups
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                <table className="w-full">
                  <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Group Name
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Usage Count
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        First Used
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {pendingGroups.map((group, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                      >
                        <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                          {group.name}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {group.usage_count} drive(s)
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {formatDate(group.first_used)}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => approveCustomGroup(group.name)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold transition cursor-pointer"
                          >
                            Approve & Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Approved Student Groups */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                Approved Student Groups
              </h3>
              <button
                onClick={loadStudentGroups}
                className="px-6 py-2 bg-blue-500 hover:bg-blue-700 text-white rounded-lg font-semibold transition cursor-pointer"
              >
                Refresh
              </button>
            </div>
            {approvedGroups.length === 0 ? (
              <div className="bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 rounded-lg p-6 text-center">
                <p className="text-blue-800 dark:text-blue-300">
                  No student groups found
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white dark:bg-slate-800 rounded-lg shadow">
                <table className="w-full">
                  <thead className="bg-gray-100 dark:bg-slate-700 border-b border-gray-200 dark:border-slate-600">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Group Name
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Status
                      </th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900 dark:text-white">
                        Created
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                    {approvedGroups.map((group, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-gray-50 dark:hover:bg-slate-700 transition"
                      >
                        <td className="px-6 py-4 font-semibold text-gray-900 dark:text-white">
                          {group.name}
                        </td>
                        <td className="px-6 py-4">
                          {getStatusBadge(group.is_approved)}
                        </td>
                        <td className="px-6 py-4 text-gray-700 dark:text-gray-300">
                          {formatDate(group.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
