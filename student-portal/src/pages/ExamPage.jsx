import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useAntiCheat } from '../hooks/useAntiCheat';
import { API_ENDPOINTS } from '../utils/api';
import SafeStorage from '../utils/safeStorage';

const ExamPage = () => {
  const { student, logout } = useAuth();
  const navigate = useNavigate();

  const [examData, setExamData] = useState(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [markedForReview, setMarkedForReview] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [examStarted, setExamStarted] = useState(false);
  const [examSubmitted, setExamSubmitted] = useState(false);

  const handleDisqualified = useCallback(
    (reason) => {
      navigate('/disqualified', { state: { reason } });
    },
    [navigate]
  );

  const { requestFullscreen } = useAntiCheat(handleDisqualified, examStarted);

  // Define submit handlers before they're used in effects
  const handleSubmit = useCallback(
    async (isAuto = false) => {
      console.log('handleSubmit called, isAuto:', isAuto);
      console.log('Current answers:', answers);
      console.log('examData:', examData);

      // Check if examData is loaded
      if (!examData || !examData.questions) {
        console.error('Cannot submit: examData not loaded');
        alert('Exam data not loaded. Please refresh and try again.');
        return;
      }

      // Prevent double submission
      if (submitting || examSubmitted) {
        console.log('Exam already being submitted or has been submitted');
        return;
      }

      setExamSubmitted(true);
      setSubmitting(true);

      try {
        const token = localStorage.getItem('student_access_token');

        // Prepare answers in the required format
        const answersList = examData.questions.map((q) => ({
          question_id: q.id,
          selected_option: answers[q.id] || null,
          marked_for_review: markedForReview[q.id] || false,
        }));

        console.log('Submitting answers:', answersList);

        const response = await axios.post(
          API_ENDPOINTS.submitExam,
          { answers: answersList },
          { params: { token } }
        );

        console.log('Submit response:', response.data);

        // Clear SafeStorage
        SafeStorage.removeItem('exam_answers');

        // Navigate to results
        navigate('/result', {
          state: {
            score: response.data.score,
            total_marks: response.data.total_marks,
            percentage: response.data.percentage,
            submitted_at: response.data.submitted_at,
          },
        });
      } catch (error) {
        console.error('Error submitting exam:', error);
        console.error('Error details:', error.response?.data);

        // If exam already submitted, just navigate to result
        if (
          error.response?.status === 400 &&
          error.response?.data?.detail?.includes('already submitted')
        ) {
          console.log('Exam was already submitted, navigating to result page');
          navigate('/result');
          return;
        }

        alert('Error submitting exam. Please try again.');
        setSubmitting(false);
        setExamSubmitted(false); // Reset on error
      }
    },
    [examData, answers, markedForReview, navigate, submitting, examSubmitted]
  );

  const handleAutoSubmit = useCallback(() => {
    handleSubmit(true);
  }, [handleSubmit]);

  // Load exam data
  useEffect(() => {
    const loadExam = async () => {
      // Check if exam has already been submitted
      if (student?.exam_submitted_at) {
        console.log('Exam already submitted, redirecting to results');
        navigate('/result');
        return;
      }

      let examAlreadyStarted = false;

      try {
        const token = localStorage.getItem('student_access_token');

        // Try to start the exam (will fail if already started, which is fine)
        try {
          await axios.post(API_ENDPOINTS.startExam, {}, { params: { token } });
          console.log('Exam started successfully');
        } catch (startError) {
          // If exam already started, that's okay - we'll just get the questions
          if (
            startError.response?.status === 400 &&
            startError.response?.data?.detail?.includes('already started')
          ) {
            console.log('Exam already started, continuing...');
            examAlreadyStarted = true;
          } else if (
            startError.response?.status === 400 &&
            startError.response?.data?.detail?.includes('already submitted')
          ) {
            // Exam already submitted, redirect to results
            console.log('Exam already submitted, redirecting to results');
            navigate('/result');
            return;
          } else {
            console.error('Unexpected error starting exam:', startError);
            throw startError;
          }
        }

        // Try to get questions - if exam already submitted, redirect to result
        let response;
        try {
          response = await axios.get(API_ENDPOINTS.getQuestions, {
            params: { token },
          });
        } catch (getQuestionsError) {
          if (
            getQuestionsError.response?.status === 400 &&
            getQuestionsError.response?.data?.detail?.includes(
              'already submitted'
            )
          ) {
            console.log(
              'Exam already submitted (detected during get questions), redirecting to results'
            );
            navigate('/result');
            return;
          } else {
            throw getQuestionsError;
          }
        }

        setExamData(response.data);

        // Calculate time remaining - ALWAYS calculate from exam_started_at + duration_minutes
        // Backend sends UTC datetime strings (already in UTC, DO NOT convert again)
        let remaining;

        if (response.data.exam_started_at && response.data.duration_minutes) {
          // Backend sends ISO datetime string in UTC format
          // Just parse it directly - JavaScript Date handles ISO strings correctly
          const startTime = new Date(response.data.exam_started_at);
          const durationMs = response.data.duration_minutes * 60 * 1000;
          const endTime = new Date(startTime.getTime() + durationMs);
          const now = new Date();
          remaining = Math.floor((endTime - now) / 1000);

          console.log('Exam Timer Calculation:', {
            exam_started_at: response.data.exam_started_at,
            startTime: startTime.toISOString(),
            duration_minutes: response.data.duration_minutes,
            endTime: endTime.toISOString(),
            now: now.toISOString(),
            remaining_seconds: remaining
          });

          // Safety check: if time is negative, exam time has expired
          if (remaining < 0) {
            remaining = 0;
          }
        } else {
          // Critical error: cannot calculate time properly
          console.error('Missing exam_started_at or duration_minutes');
          remaining = 0;
        }

        setTimeRemaining(remaining > 0 ? remaining : 0);

        // Only load saved answers if exam was already started (continuing existing exam)
        // For fresh exam starts, don't load previous answers
        const savedAnswers = SafeStorage.getItem('exam_answers');
        if (savedAnswers && examAlreadyStarted) {
          // Only load saved answers if we got "already started" error (continuing existing exam)
          setAnswers(savedAnswers);
        } else {
          // Clear any previous answers for fresh exam start
          SafeStorage.removeItem('exam_answers');
          setAnswers({});
        }

        setExamStarted(true);
        setLoading(false);

        // Enter fullscreen
        requestFullscreen();
      } catch (error) {
        console.error('Error loading exam:', error);
        console.error('Error details:', error.response?.data);
        const errorMessage =
          error.response?.data?.detail || error.message || 'Unknown error';
        alert(`Error loading exam: ${errorMessage}\n\nPlease try again.`);
        navigate('/waiting-room');
      }
    };

    loadExam();
  }, [navigate, requestFullscreen]);

  // Timer countdown
  useEffect(() => {
    if (
      !examStarted ||
      timeRemaining === null ||
      timeRemaining <= 0 ||
      examSubmitted
    )
      return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Clear the interval immediately before auto-submit
          clearInterval(interval);
          handleAutoSubmit();
          return 0;
        }

        // Show warning at 5 minutes remaining (only once)
        if (prev === 300) {
          alert('⚠️ Warning: Only 5 minutes remaining!');
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [examStarted, timeRemaining, handleAutoSubmit, examSubmitted]);

  // Auto-save answers using SafeStorage
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      SafeStorage.setItem('exam_answers', answers);
    }
  }, [answers]);

  const handleAnswerSelect = (questionId, option) => {
    console.log('Answer selected - Question:', questionId, 'Option:', option);
    setAnswers((prev) => {
      const updated = {
        ...prev,
        [questionId]: option,
      };
      console.log('Updated answers:', updated);
      return updated;
    });
  };

  const handleMarkForReview = (questionId) => {
    setMarkedForReview((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const formatTime = (seconds) => {
    if (seconds === null || seconds === undefined || isNaN(seconds)) {
      return '00:00:00';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getQuestionStatus = (questionId) => {
    if (markedForReview[questionId]) return 'review';
    if (answers[questionId]) return 'answered';
    return 'not-answered';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-700">Loading exam...</p>
        </div>
      </div>
    );
  }

  const currentQuestion = examData?.questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar - Question Navigator */}
      <div className="w-80 bg-white shadow-xl border-r border-gray-200 overflow-y-auto">
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-600 to-purple-600 text-white p-6">
          <h2 className="text-xl font-bold mb-2 flex items-center">
            <svg
              className="w-6 h-6 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Question Navigator
          </h2>
          <p className="text-indigo-100 text-sm">Track your progress</p>
        </div>

        {/* Progress Stats */}
        <div className="p-6 border-b border-gray-100">
          <div className="grid grid-cols-1 gap-4">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-green-800">Answered</p>
                  <p className="text-lg font-bold text-green-600">
                    {Object.keys(answers).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-yellow-800">
                    Marked for Review
                  </p>
                  <p className="text-lg font-bold text-yellow-600">
                    {
                      Object.keys(markedForReview).filter(
                        (k) => markedForReview[k]
                      ).length
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-400 rounded-full flex items-center justify-center mr-3">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Not Answered
                  </p>
                  <p className="text-lg font-bold text-gray-600">
                    {examData?.question_count - Object.keys(answers).length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Progress</span>
              <span>
                {Math.round(
                  (Object.keys(answers).length / examData?.question_count) * 100
                )}
                %
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{
                  width: `${
                    (Object.keys(answers).length / examData?.question_count) *
                    100
                  }%`,
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Question Grid */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <svg
              className="w-5 h-5 mr-2 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 10h16M4 14h16M4 18h16"
              />
            </svg>
            All Questions
          </h3>

          <div className="grid grid-cols-5 gap-3 mb-6">
            {examData?.questions.map((q, idx) => {
              const status = getQuestionStatus(q.id);
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestionIndex(idx)}
                  className={`
                    w-12 h-12 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105
                    ${
                      currentQuestionIndex === idx
                        ? 'ring-2 ring-indigo-500 ring-offset-2 shadow-lg'
                        : 'hover:shadow-md'
                    }
                    ${
                      status === 'answered'
                        ? 'bg-linear-to-br from-green-500 to-green-600 text-white shadow-md'
                        : status === 'review'
                        ? 'bg-linear-to-br from-yellow-500 to-yellow-600 text-white shadow-md'
                        : 'bg-linear-to-br from-gray-200 to-gray-300 text-gray-700 hover:from-gray-300 hover:to-gray-400'
                    }
                  `}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Legend</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-linear-to-br from-green-500 to-green-600 rounded mr-2"></div>
                <span className="text-gray-700">Answered</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-linear-to-br from-yellow-500 to-yellow-600 rounded mr-2"></div>
                <span className="text-gray-700">Marked for Review</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-linear-to-br from-gray-200 to-gray-300 rounded mr-2"></div>
                <span className="text-gray-700">Not Answered</span>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-linear-to-r from-red-500 to-red-600 text-white py-4 px-6 rounded-lg font-semibold hover:from-red-600 hover:to-red-700 transition-all duration-200 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            {submitting ? (
              <div className="flex items-center justify-center">
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Submitting...
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
                Submit Exam
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Main Content - Question Display */}
      <div className="flex-1 p-6">
        {/* Header with Timer */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {examData?.drive_title}
            </h1>
          </div>
          <div className="text-right">
            <div
              className={`text-3xl font-bold ${
                timeRemaining < 300 ? 'text-red-600' : 'text-gray-900'
              }`}
            >
              {formatTime(timeRemaining)}
            </div>
            <p className="text-sm text-gray-600">Time Remaining</p>
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="mb-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Question {currentQuestionIndex + 1}
              </h2>
            </div>
            <p className="text-lg text-gray-800 whitespace-pre-wrap">
              {currentQuestion?.question_text}
            </p>
          </div>

          {/* Options */}
          <div className="space-y-4">
            {['a', 'b', 'c', 'd'].map((option) => (
              <button
                key={option}
                onClick={() => handleAnswerSelect(currentQuestion.id, option)}
                className={`
                  w-full text-left p-4 rounded-lg border-2 transition-all
                  ${
                    answers[currentQuestion.id] === option
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 bg-white'
                  }
                `}
              >
                <div className="flex items-start">
                  <span className="font-bold text-indigo-600 mr-3">
                    {option.toUpperCase()}.
                  </span>
                  <span className="text-gray-800">
                    {currentQuestion[`option_${option}`]}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between items-center mt-8">
            <button
              onClick={() =>
                setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))
              }
              disabled={currentQuestionIndex === 0}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>

            <button
              onClick={() => handleMarkForReview(currentQuestion.id)}
              className={`
                px-6 py-2 rounded-lg font-semibold transition-all
                ${
                  markedForReview[currentQuestion.id]
                    ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                    : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                }
              `}
            >
              {markedForReview[currentQuestion.id]
                ? 'Unmark Review'
                : 'Mark for Review'}
            </button>

            <button
              onClick={() =>
                setCurrentQuestionIndex((prev) =>
                  Math.min(examData.question_count - 1, prev + 1)
                )
              }
              disabled={currentQuestionIndex === examData.question_count - 1}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamPage;
