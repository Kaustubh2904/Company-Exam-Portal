export default function HowItWorks() {
  const steps = [
    {
      title: 'Register Company',
      desc: 'Sign up your company and provide necessary details. Our team will verify and approve your registration quickly.',
      icon: '📝',
    },
    {
      title: 'Create Hiring Drive',
      desc: 'Set up your first hiring drive with custom questions, target colleges, and exam specifications.',
      icon: '🎯',
    },
    {
      title: 'Invite Students',
      desc: 'Send invitations to students from partner colleges. They register and participate in your exam.',
      icon: '📧',
    },
    {
      title: 'Review Results',
      desc: 'Access detailed analytics, results, and insights to make informed hiring decisions.',
      icon: '📈',
    },
  ];

  return (
    <section className="relative py-20 sm:py-28 ">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
        <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-extrabold mb-4">
            Simple & Easy
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Get your hiring drive up and running in just a few simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((s, i) => (
            <div key={s.title} className="relative group">
              {/* Connection line */}
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-20 -right-4 w-8 h-1 bg-linear-to-r from-blue-500 to-transparent"></div>
              )}

              <div className="relative z-10 h-full rounded-2xl bg-linear-to-br from-slate-800 to-slate-900 p-8 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/10">
                <div className="flex items-center justify-between mb-6">
                  <div className="text-5xl">{s.icon}</div>
                  <div className="w-10 h-10 rounded-full bg-linear-to-br from-blue-600 to-blue-700 flex items-center justify-center text-white font-bold text-lg">
                    {i + 1}
                  </div>
                </div>

                <h3 className="text-xl font-bold text-white mb-3">{s.title}</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  {s.desc}
                </p>

                {/* Hover effect */}
                <div className="absolute inset-0 rounded-2xl bg-linear-to-br from-blue-500/0 to-purple-500/0 group-hover:from-blue-500/10 group-hover:to-purple-500/10 transition-all duration-300 pointer-events-none"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
