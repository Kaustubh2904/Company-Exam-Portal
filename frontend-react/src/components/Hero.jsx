import { NavLink } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="relative pt-20 pb-32 lg:pt-32 lg:pb-40 overflow-hidden" style={{ background: 'linear-gradient(to bottom, var(--bg-primary), var(--bg-secondary))' }}>
      {/* Decorative blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        <div className="absolute top-40 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-block mb-6 px-4 py-2 bg-blue-500/20 border border-blue-400/40 rounded-full">
              <span className="text-sm font-semibold text-blue-700">
                🚀 Smart Recruitment Platform
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 leading-tight" style={{ color: 'var(--text-primary)' }}>
              Streamline Your{' '}
              <span className="bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Hiring Process
              </span>
            </h1>

            <p className="text-lg sm:text-xl mb-8 leading-relaxed max-w-xl" style={{ color: 'var(--text-secondary)' }}>
              Create, manage and run hiring drives - connect with top colleges
              and students seamlessly. Built for companies and admins to
              coordinate exams, approvals and reports with ease.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <NavLink
                to="/company/register"
                className="inline-flex items-center justify-center px-8 py-4 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 transition-all duration-300 transform hover:scale-105"
              >
                <span className="flex items-center gap-2">
                  Get Started Free
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </span>
              </NavLink>
              <NavLink
                to="/company/login"
                className="inline-flex items-center justify-center px-8 py-4 border-2 border-slate-400 hover:border-blue-400 hover:text-white font-bold rounded-xl hover:bg-slate-800 transition-all duration-300"
              >
                Company Login
              </NavLink>
            </div>

            <div className="flex flex-wrap gap-6 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center bg-green-500/20 border border-green-500/40 rounded-full text-green-400 text-xs">
                  ✓
                </span>
                Trusted by 500+ companies
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center bg-green-500/20 border border-green-500/40 rounded-full text-green-400 text-xs">
                  ✓
                </span>
                Bank-level security
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center bg-green-500/20 border border-green-500/40 rounded-full text-green-400 text-xs">
                  ✓
                </span>
                24/7 Support
              </div>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="absolute inset-0 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur-2xl opacity-20"></div>
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-xl p-2">
              <div className="rounded-2xl overflow-hidden bg-linear-to-br from-slate-800 to-slate-900 p-8 flex items-center justify-center min-h-96">
                <div className="text-center">
                  <img src="dashboard.png" alt="" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
