import { useNavigate } from "react-router-dom";

const ResultPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center animate-fadeIn">
        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full bg-linear-to-r from-green-500 to-emerald-600 flex items-center justify-center shadow-md">
            <svg
              className="h-10 w-10 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">
          Exam Submitted Successfully
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-8">
          Your responses have been securely recorded. You can safely exit now
          and wait for further communication.
        </p>

        {/* Info Section */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-left text-sm text-slate-700 mb-8">
          <h3 className="font-medium text-slate-800 mb-3">
            What happens next?
          </h3>

          <ul className="space-y-2">
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">•</span>
              Please avoid refreshing or logging in again.
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">•</span>
              Results will be shared directly by the company.
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">•</span>
              Further instructions will be sent via email.
            </li>
          </ul>
        </div>

        {/* Action Button */}
        <button
          onClick={() => navigate("/login")}
          className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 transition-colors text-white font-medium py-3 shadow-md"
        >
          Exit Exam
        </button>
      </div>
    </div>
  );
};

export default ResultPage;
