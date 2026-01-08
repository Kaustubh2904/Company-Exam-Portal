import Hero from './Hero';
import Features from './Features';
import HowItWorks from './HowItWorks';

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Background decorative blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 dark:bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        <div className="absolute top-40 -left-40 w-80 h-80 bg-purple-500 dark:bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-pink-500 dark:bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      </div>

      <div className="relative z-10">
        <Hero />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Features />
          <HowItWorks />
        </div>

        {/* Premium CTA Section */}
        <section className="py-16 sm:py-24 px-4">
          <div className="max-w-4xl mx-auto">
            {/* Glowing border effect */}
            <div className="relative group">
              <div className="absolute inset-0 bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 rounded-3xl blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-500"></div>

              {/* Main card */}
              <div className="relative rounded-3xl overflow-hidden shadow-xl" style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderWidth: '1px', borderStyle: 'solid' }}>
                {/* Inner gradient accent */}
                <div className="absolute inset-0 bg-linear-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none"></div>

                <div className="relative px-6 py-16 sm:px-12 sm:py-20 text-center">
                  {/* Badge */}
                  <div className="inline-block mb-6 px-4 py-2 bg-blue-500/20 border border-blue-400/40 rounded-full">
                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-700">
                      ✨ Limited Time Offer
                    </span>
                  </div>

                  {/* Heading */}
                  <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-4 leading-tight" style={{ color: 'var(--text-primary)' }}>
                    Transform Your{' '}
                    <span className="bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                      Recruitment
                    </span>{' '}
                    Process
                  </h2>

                  {/* Description */}
                  <p className="text-base sm:text-lg max-w-2xl mx-auto mb-10" style={{ color: 'var(--text-secondary)' }}>
                    Join hundreds of companies streamlining their hiring with
                    our intelligent exam portal. Set up drives, manage
                    candidates, and make data-driven decisions in minutes.
                  </p>

                  {/* Trust indicators */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10" style={{ color: 'var(--text-secondary)' }}>
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-green-500/20 border border-green-500/40 rounded-full text-green-600 dark:text-green-400 text-sm">
                        ✓
                      </span>
                      <span className="text-sm">No credit card</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-green-500/20 border border-green-500/40 rounded-full text-green-600 dark:text-green-400 text-sm">
                        ✓
                      </span>
                      <span className="text-sm">Setup in minutes</span>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-green-500/20 border border-green-500/40 rounded-full text-green-600 dark:text-green-400 text-sm">
                        ✓
                      </span>
                      <span className="text-sm">24/7 Support</span>
                    </div>
                  </div>

                  {/* CTA Buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
                    <a
                      href="/company/register"
                      className="w-full sm:w-auto px-8 py-4 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/70 transition-all duration-300 transform hover:scale-105 active:scale-95"
                    >
                      <span className="flex items-center justify-center gap-2">
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
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
