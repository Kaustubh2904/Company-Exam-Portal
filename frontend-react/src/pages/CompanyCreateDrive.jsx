import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { convertInputToUTC, convertUTCToInput, getUTCHelperText } from '../utils/timezone';

export default function CompanyCreateDrive() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { companyId } = useAuth();

  const isEditMode = !!searchParams.get('id');
  const driveId = searchParams.get('id');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    exam_duration_minutes: '',
    window_start: '',
    window_end: '',
  });

  const [targets, setTargets] = useState([
    {
      college_id: '',
      custom_college_name: '',
      student_group_id: '',
      custom_student_group_name: '',
      batch_year: '',
    },
  ]);

  const [colleges, setColleges] = useState([]);
  const [studentGroups, setStudentGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadReferenceData();
    if (isEditMode && driveId) {
      loadDriveData();
    }
  }, []);

  const loadReferenceData = async () => {
    try {
      const [collegesRes, groupsRes] = await Promise.all([
        api.get('/company/colleges'),
        api.get('/company/student-groups'),
      ]);
      setColleges(collegesRes.data || []);
      setStudentGroups(groupsRes.data || []);
    } catch (err) {
      toast.error('Failed to load reference data');
    }
  };

  const loadDriveData = async () => {
    setIsLoading(true);
    try {
      const res = await api.get(`/company/drives/${driveId}`);
      const drive = res.data;

      setFormData({
        title: drive.title || '',
        description: drive.description || '',
        category: drive.category || '',
        exam_duration_minutes: drive.exam_duration_minutes || '',
        window_start: convertUTCToInput(drive.window_start),
        window_end: convertUTCToInput(drive.window_end),
      });

      if (drive.targets && drive.targets.length > 0) {
        setTargets(
          drive.targets.map((t) => ({
            college_id: t.college_id || '',
            custom_college_name: t.custom_college_name || '',
            student_group_id: t.student_group_id || '',
            custom_student_group_name: t.custom_student_group_name || '',
            batch_year: t.batch_year || '',
          }))
        );
      }
    } catch (err) {
      toast.error('Failed to load drive data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTargetChange = (index, field, value) => {
    const newTargets = [...targets];
    newTargets[index][field] = value;
    setTargets(newTargets);
  };

  const addTarget = () => {
    setTargets([
      ...targets,
      {
        college_id: '',
        custom_college_name: '',
        student_group_id: '',
        custom_student_group_name: '',
        batch_year: '',
      },
    ]);
  };

  const removeTarget = (index) => {
    setTargets(targets.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const payload = {
        ...formData,
        exam_duration_minutes: parseInt(formData.exam_duration_minutes) || 0,
        window_start: convertInputToUTC(formData.window_start),
        window_end: convertInputToUTC(formData.window_end),
        targets: targets.map((t) => ({
          college_id: t.college_id ? parseInt(t.college_id) : null,
          custom_college_name: t.custom_college_name || null,
          student_group_id: t.student_group_id
            ? parseInt(t.student_group_id)
            : null,
          custom_student_group_name: t.custom_student_group_name || null,
          batch_year: t.batch_year || null,
        })),
      };

      let responseId;
      if (isEditMode) {
        await api.put(`/company/drives/${driveId}`, payload);
        toast.success('Drive updated successfully!');
        responseId = driveId;
      } else {
        const res = await api.post('/company/drives', payload);
        toast.success('Drive created successfully!');
        responseId = res.data.id;
      }

      setTimeout(() => {
        navigate(`/company-drive-detail?id=${responseId}`);
      }, 1000);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to save drive');
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50   flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
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
                  {isEditMode ? 'Edit Drive' : 'Create New Drive'}
                </h1>
                <p className="text-sm text-gray-600">
                  Configure your recruitment drive details
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
        <div className="flex-1 overflow-auto rounded-2xl">
          <main className="py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              {/* Drive Configuration */}
              <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                <div className="bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 px-8 py-6 rounded-t-2xl">
                  <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    {isEditMode ? 'Edit Drive' : 'Create New Drive'}
                  </h2>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-8">
                  {/* Basic Info */}
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      <span>📝</span> Basic Information
                    </h3>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Drive Title *
                        </label>
                        <input
                          type="text"
                          name="title"
                          value={formData.title}
                          onChange={handleFormChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          Description
                        </label>
                        <textarea
                          name="description"
                          value={formData.description}
                          onChange={handleFormChange}
                          rows="4"
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Category *
                          </label>
                          <select
                            name="category"
                            value={formData.category}
                            onChange={handleFormChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            required
                          >
                            <option value="">Select category...</option>
                            <option value="Technical MCQ">
                              Technical MCQ
                            </option>
                            <option value="Aptitude MCQ">Aptitude MCQ</option>
                            <option value="Data Science MCQ">Data Science MCQ</option>
                            <option value="Coding">Coding</option>
                            <option value="HR Round">HR Round</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Exam Duration (minutes per student) *
                          </label>
                          <input
                            type="number"
                            name="exam_duration_minutes"
                            value={formData.exam_duration_minutes}
                            onChange={handleFormChange}
                            min="1"
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            required
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Window Start * <span className="text-xs font-normal text-blue-600">(Enter time in UTC)</span>
                          </label>
                          <input
                            type="datetime-local"
                            name="window_start"
                            value={formData.window_start}
                            onChange={handleFormChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">{getUTCHelperText()}</p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Window End * <span className="text-xs font-normal text-blue-600">(Enter time in UTC)</span>
                          </label>
                          <input
                            type="datetime-local"
                            name="window_end"
                            value={formData.window_end}
                            onChange={handleFormChange}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">{getUTCHelperText()}</p>
                        </div>
                      </div>

                      {/* Window Duration Info */}
                      {formData.window_start && formData.window_end && (
                        <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
                          <div className="flex items-start">
                            <div className="shrink-0">
                              <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <p className="text-sm text-blue-700">
                                <strong>Window Duration:</strong> {(() => {
                                  const start = new Date(formData.window_start);
                                  const end = new Date(formData.window_end);
                                  const diffMs = end - start;
                                  const diffMins = Math.floor(diffMs / 60000);
                                  const diffHours = Math.floor(diffMins / 60);
                                  const remainMins = diffMins % 60;

                                  if (diffMs <= 0) {
                                    return 'Invalid (end must be after start)';
                                  }

                                  return `${diffHours}h ${remainMins}m (${diffMins} minutes total)`;
                                })()}
                              </p>
                              <p className="text-xs text-blue-600 mt-1">
                                Students can login anytime within this window and get their full {formData.exam_duration_minutes || 0} minutes exam duration.
                              </p>
                              {/* Validation warning */}
                              {(() => {
                                const start = new Date(formData.window_start);
                                const end = new Date(formData.window_end);
                                const windowMins = Math.floor((end - start) / 60000);
                                const examMins = parseInt(formData.exam_duration_minutes) || 0;

                                if (examMins >= windowMins) {
                                  return (
                                    <p className="text-xs text-red-600 font-semibold mt-2">
                                      ⚠️ Warning: Exam duration must be less than window duration!
                                    </p>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Target Students */}
                  <div className="bg-white rounded-2xl shadow-lg border border-gray-200/50 p-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                      Target Students
                    </h3>

                    <div className="space-y-6">
                      {targets.map((target, index) => (
                        <div
                          key={index}
                          className="border-2 border-gray-200 rounded-2xl p-6 space-y-6 bg-gray-50/50"
                        >
                          <div className="flex justify-between items-center">
                            <h4 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                              <span>👥</span> Target Group {index + 1}
                            </h4>
                            {targets.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTarget(index)}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-xl font-semibold transition shadow-lg"
                              >
                                🗑️ Remove
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">
                                College
                              </label>
                              <select
                                value={target.college_id}
                                onChange={(e) =>
                                  handleTargetChange(
                                    index,
                                    'college_id',
                                    e.target.value
                                  )
                                }
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                              >
                                <option value="">
                                  Select or enter custom...
                                </option>
                                {colleges.map((college) => (
                                  <option key={college.id} value={college.id}>
                                    {college.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Or Enter Custom College
                              </label>
                              <input
                                type="text"
                                value={target.custom_college_name}
                                onChange={(e) =>
                                  handleTargetChange(
                                    index,
                                    'custom_college_name',
                                    e.target.value
                                  )
                                }
                                placeholder="Custom college name"
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Student Group
                              </label>
                              <select
                                value={target.student_group_id}
                                onChange={(e) =>
                                  handleTargetChange(
                                    index,
                                    'student_group_id',
                                    e.target.value
                                  )
                                }
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                              >
                                <option value="">
                                  Select or enter custom...
                                </option>
                                {studentGroups.map((group) => (
                                  <option key={group.id} value={group.id}>
                                    {group.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Or Enter Custom Group
                              </label>
                              <input
                                type="text"
                                value={target.custom_student_group_name}
                                onChange={(e) =>
                                  handleTargetChange(
                                    index,
                                    'custom_student_group_name',
                                    e.target.value
                                  )
                                }
                                placeholder="Custom group name"
                                className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                              Batch Year (Optional)
                            </label>
                            <input
                              type="text"
                              value={target.batch_year}
                              onChange={(e) =>
                                handleTargetChange(
                                  index,
                                  'batch_year',
                                  e.target.value
                                )
                              }
                              placeholder="e.g., 2025"
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={addTarget}
                        className="w-full px-6 py-4 border-2 border-dashed border-blue-300 rounded-2xl text-blue-600 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50 font-semibold transition flex items-center justify-center gap-2"
                      >
                        <span>➕</span> Add Another Target Group
                      </button>
                    </div>
                  </div>

                  {/* Submit Buttons */}
                  <div className="flex flex-col sm:flex-row gap-4 justify-end">
                    <button
                      type="button"
                      onClick={() => navigate('/company-dashboard')}
                      className="px-8 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-semibold transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-8 py-3 bg-linear-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition shadow-lg"
                    >
                      {isSubmitting
                        ? '💾 Saving...'
                        : isEditMode
                        ? 'Update Drive'
                        : 'Create Drive'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
