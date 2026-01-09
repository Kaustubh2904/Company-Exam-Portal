export default function Features() {
  const items = [
    {
      icon: '⚡',
      title: 'Create Drives',
      desc: 'Quickly create hiring drives with scoped targets and custom question sets.',
    },
    {
      icon: '✅',
      title: 'Smart Approvals',
      desc: 'Admins review and approve company registrations with intelligent workflows.',
    },
    {
      icon: '📊',
      title: 'Analytics',
      desc: 'Track participation, scores and get actionable insights in real-time.',
    },
    {
      icon: '🔐',
      title: 'Security',
      desc: 'Bank-level encryption and token-based authentication for all users.',
    },
    {
      icon: '🎓',
      title: 'College Network',
      desc: 'Connect with hundreds of colleges and manage student groups easily.',
    },
    {
      icon: '⏱️',
      title: '24/7 Support',
      desc: 'Round-the-clock support team ready to help with any questions.',
    },
  ];

  return (
    <section className="relative py-20 sm:py-28">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-extrabold mb-4">
            Powerful Features
          </h2>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Everything you need to run examination drives end-to-end with ease
            and confidence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative overflow-hidden rounded-2xl bg-linear-to-br from-slate-800 via-slate-800 to-slate-900 p-8 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/10"
            >
              <div className="absolute inset-0 bg-linear-to-br from-blue-500/0 via-transparent to-purple-500/0 group-hover:from-blue-500/10 group-hover:to-purple-500/10 transition-all duration-300"></div>

              <div className="relative z-10">
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                  {it.icon}
                </div>
                <h3 className="text-xl text-white font-bold mb-3">
                  {it.title}
                </h3>
                <p className="text-slate-400 leading-relaxed">{it.desc}</p>
              </div>

              <div className="absolute top-0 right-0 w-32 h-32 bg-linear-to-br from-blue-500 to-purple-500 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-300 -mr-16 -mt-16"></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
