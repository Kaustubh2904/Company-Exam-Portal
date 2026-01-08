import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { formatDateUTC } from '../utils/timezone';

export default function CompanySendEmails() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout } = useAuth();

  const driveId = searchParams.get('id');

  const [emailStatus, setEmailStatus] = useState(null);
  const [emailConfig, setEmailConfig] = useState({
    subject_template: '',
    body_template: '',
    use_custom_template: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [examStatus, setExamStatus] = useState(null);
  const [previewText, setPreviewText] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const templateVariables = [
    '{{student_name}}',
    '{{roll_number}}',
    '{{drive_title}}',
    '{{company_name}}',
    '{{password}}',
    '{{login_url}}',
    '{{start_time}}',
    '{{duration}}',
  ];

  useEffect(() => {
    if (!driveId) {
      navigate('/company-dashboard');
      return;
    }
    loadData();
  }, [driveId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [statusRes, configRes, examStatusRes] = await Promise.all([
        api.get(`/company/drives/${driveId}/email-status`).catch(() => null),
        api.get(`/company/email-template`).catch(() => ({
          data: {
            subject_template: 'Invitation to {{drive_title}}',
            body_template:
              'Dear {{student_name}}, You are invited to participate in {{drive_title}}. Password: {{password}}',
            use_custom_template: true,
          },
        })),
        api.get(`/company/drives/${driveId}/exam-status`).catch(() => null),
      ]);

      setEmailStatus(statusRes?.data || null);
      setEmailConfig(configRes.data);
      setExamStatus(examStatusRes?.data || null);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfigChange = (field, value) => {
    setEmailConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmitConfig = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await api.put(`/company/email-template`, emailConfig);
      toast.success('Email template updated successfully!');
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to update template');
    } finally {
      setIsSubmitting(false);
    }
  };

  const generatePreview = () => {
    let preview = emailConfig.body_template;
    const sampleData = {
      '{{student_name}}': 'John Doe',
      '{{roll_number}}': '2024001',
      '{{drive_title}}': emailStatus?.drive_title || 'Drive',
      '{{company_name}}': 'Company',
      '{{password}}': 'temp123456',
      '{{login_url}}': 'http://localhost:5173/student-login',
      '{{start_time}}': examStatus?.scheduled_start 
        ? formatDateUTC(examStatus.scheduled_start) 
        : formatDateUTC(new Date().toISOString()),
      '{{duration}}': '60',
    };

    Object.entries(sampleData).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(key, 'g'), value);
    });

    setPreviewText(preview);
  };

  const handleSendEmails = async () => {
    if (
      !window.confirm('Are you sure you want to send emails to all students?')
    ) {
      return;
    }

    setIsSendingEmails(true);
    try {
      const res = await api.post(`/company/drives/${driveId}/email-students`);

      toast.success(
        `Emails sent successfully to ${res.data?.sent_count || 0} students!`
      );
      // Reload data to update exam status
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to send emails');
    } finally {
      setIsSendingEmails(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!emailStatus) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Drive not found</p>
        </div>
      </div>
    );
  }

  const canSendEmails = emailStatus?.can_send_emails || false;

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
                  Send Email Invitations
                </h1>
                <p className="text-sm text-gray-600">
                  Configure and send email invitations to students
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
            <div className="max-w-[832px] mx-auto sm:px-6 lg:px-8 space-y-8 bg-linear-to-r from-blue-600 via-purple-600 to-indigo-600 px-8 py-6 rounded-t-2xl">
              <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                {emailStatus.drive_title}
              </h3>
            </div>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
              {/* Email Status */}
              {emailStatus && (
                <div className="bg-white rounded-b-xl shadow-lg border border-gray-200 p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                      <p className="flex items-center gap-2">
                        <strong>Approval Status:</strong>
                        {emailStatus.is_approved
                          ? ' Approved'
                          : ' Not Approved'}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                      <p className="flex items-center gap-2">
                        <strong>Students:</strong> {emailStatus.student_count}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                      <p className="flex items-center gap-2">
                        <strong>Email Configuration:</strong>
                        {emailStatus.email_configured
                          ? 'Configured'
                          : 'Not Configured'}
                      </p>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200/50">
                      <p className="flex items-center gap-2">
                        <strong>Status:</strong> {emailStatus.status_message}
                      </p>
                    </div>
                  </div>

                  {!emailStatus.can_send_emails && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                      <p className="text-yellow-800">
                        ⚠️ Cannot send emails. Please ensure drive is approved
                        and has students.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Email Template Configuration */}
              <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                <div className="bg-linear-to-r from-green-600 via-emerald-600 to-teal-600 px-8 py-6 rounded-t-2xl">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    Email Template Configuration
                  </h3>
                </div>

                <form onSubmit={handleSubmitConfig} className="p-8 space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <span>🔧</span> Available Variables:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {templateVariables.map((variable) => (
                        <code
                          key={variable}
                          className="px-3 py-1 bg-blue-100 text-blue-900 rounded-lg text-sm font-mono border border-blue-200"
                        >
                          {variable}
                        </code>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Email Subject *
                      </label>
                      <input
                        type="text"
                        value={emailConfig.subject_template}
                        onChange={(e) =>
                          handleConfigChange('subject_template', e.target.value)
                        }
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Email Body *
                      </label>
                      <textarea
                        value={emailConfig.body_template}
                        onChange={(e) =>
                          handleConfigChange('body_template', e.target.value)
                        }
                        rows="12"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                        required
                      />
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <input
                        type="checkbox"
                        id="useCustom"
                        checked={emailConfig.use_custom_template}
                        onChange={(e) =>
                          handleConfigChange(
                            'use_custom_template',
                            e.target.checked
                          )
                        }
                        className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label
                        htmlFor="useCustom"
                        className="text-sm font-semibold text-gray-700"
                      >
                        Use custom template
                      </label>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-4">
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-8 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-semibold transition shadow-lg"
                      >
                        {isSubmitting ? '💾 Updating...' : 'Update Template'}
                      </button>
                      <button
                        type="button"
                        onClick={generatePreview}
                        className="px-8 py-3 bg-linear-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white rounded-xl font-semibold transition shadow-lg"
                      >
                        Generate Preview
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {/* Preview */}
              {previewText && (
                <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                  <div className="bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600 px-8 py-6">
                    <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                      Email Preview
                    </h3>
                  </div>

                  <div className="p-8">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 whitespace-pre-wrap text-gray-900 text-sm leading-relaxed">
                      {previewText}
                    </div>
                  </div>
                </div>
              )}

              {/* Send Emails Action */}
              <div className="bg-linear-to-br from-white via-blue-50/30 to-indigo-50/30 rounded-2xl shadow-xl border border-gray-200/50">
                <div className="bg-linear-to-r from-red-600 via-pink-600 to-rose-600 px-8 py-6 rounded-t-2xl">
                  <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                    Send Email Invitations
                  </h3>
                </div>

                <div className="p-8 space-y-4">
                  <button
                    onClick={handleSendEmails}
                    disabled={isSendingEmails || !canSendEmails}
                    className="w-full px-8 py-4 bg-linear-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-bold text-lg transition shadow-lg flex items-center justify-center gap-3"
                  >
                    <span className="text-2xl">
                      {isSendingEmails ? '⏳' : '📧'}
                    </span>
                    {isSendingEmails
                      ? 'Sending Emails...'
                      : 'Send Emails to All Students'}
                  </button>

                  {!canSendEmails && (
                    <div className="mt-6 text-center text-gray-600 text-sm bg-gray-50 rounded-xl p-4 border border-gray-200">
                      <span className="font-semibold">Note:</span> Send emails
                      button is disabled. Please ensure drive is approved and
                      has students.
                    </div>
                  )}

                  {/* Exam Status Info - Just informational */}
                  {examStatus && (
                    <div className="pt-6 border-t border-gray-200">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                        <p className="text-blue-800 font-semibold mb-2">
                          � Exam Status
                        </p>
                        {examStatus.scheduled_start && (
                          <p className="text-blue-700 text-sm mb-2">
                            📅 Scheduled Start:{' '}
                            <strong>
                              {formatDateUTC(examStatus.scheduled_start)}
                            </strong>
                          </p>
                        )}
                        {examStatus.exam_state === 'not_started' && (
                          <p className="text-blue-700 text-sm">
                            ⏱️ Status: <strong>Not Started</strong>
                          </p>
                        )}
                        {examStatus.exam_state === 'ongoing' && (
                          <p className="text-green-700 text-sm">
                            🟢 Status: <strong>Ongoing</strong> - Time remaining:{' '}
                            {Math.round(examStatus.time_remaining_minutes || 0)} minutes
                          </p>
                        )}
                        {(examStatus.exam_state === 'completed' ||
                          examStatus.exam_state === 'ended') && (
                          <p className="text-gray-700 text-sm">
                            🏁 Status: <strong>Completed</strong>
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => navigate(`/company-dashboard`)}
                        className="w-full px-6 py-3 bg-linear-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl font-semibold transition shadow-lg"
                      >
                        Go to Dashboard to Control Exam
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
