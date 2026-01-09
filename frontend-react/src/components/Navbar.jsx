import { useState, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const NAV_ITEMS = [{ to: '/', label: 'Home', variant: 'link' }];

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const [toast, setToast] = useState(null);

  const toggleMobile = useCallback(() => setMobileMenuOpen((v) => !v), []);
  const closeMobile = useCallback(() => setMobileMenuOpen(false), []);

  const renderItem = (item, idx, isMobile = false) => {
    const base = isMobile
      ? 'block px-3 py-2 rounded-md text-base font-medium'
      : 'text-sm font-medium px-3 py-2 rounded-md';

    const extra =
      'text-sm text-slate-600 dark:hover:text-black font-bold font-serif px-3 py-2 rounded-md transition-colors';

    return (
      <NavLink
        key={idx}
        to={item.to}
        onClick={closeMobile}
        className={({ isActive }) =>
          `${base} ${extra} ${isActive ? 'text-blue-600 font-semibold' : ''}`
        }
        data-testid={
          isMobile
            ? `link-${item.label.toLowerCase().replace(/\s+/g, '-')}-mobile`
            : `link-${item.label.toLowerCase().replace(/\s+/g, '-')}`
        }
      >
        {item.label}
      </NavLink>
    );
  };

  return (
    <header
      className="sticky top-0 z-50 w-full backdrop-blur-lg border-b"
      style={{
        backgroundColor: 'var(--navbar-bg)',
        borderColor: 'var(--navbar-border)',
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center gap-3">
            <NavLink
              to="/"
              onClick={closeMobile}
              className="flex items-center gap-2 text-3xl font-bold science-gothic-fontstyle bg-linear-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent"
              data-testid="link-home"
            >
              Company Exam Portal
            </NavLink>

            {user && (
              <div
                className="text-xs px-2.5 py-1.5 bg-blue-500/20 rounded-full font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {user.userType?.toUpperCase()}
              </div>
            )}
          </div>

          <nav className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item, idx) => renderItem(item, idx, false))}

            {!user && (
              <>
                <NavLink
                  to="/admin/login"
                  className="text-sm text-slate-600 dark:hover:text-black font-bold font-serif px-3 py-2 rounded-md transition-colors"
                >
                  Admin Login
                </NavLink>
                <NavLink
                  to="/company/login"
                  className="text-sm text-slate-600 dark:hover:text-black font-bold font-serif px-3 py-2 rounded-md transition-colors"
                >
                  Company Login
                </NavLink>
                <NavLink
                  to="/company/register"
                  className="inline-flex items-center justify-center px-5 py-2.5 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/50 transition-all duration-300 transform hover:scale-105"
                >
                  Register
                </NavLink>
              </>
            )}

            {user && (
              <>
                <NavLink
                  to={user.userType === 'admin' ? '/admin' : '/company'}
                  className="text-sm text-slate-600 dark:hover:text-black font-bold font-serif px-3 py-2 rounded-md transition-colors"
                >
                  Dashboard
                </NavLink>
                <button
                  onClick={() => {
                    logout();
                    closeMobile();
                    setToast('Logged out');
                    setTimeout(() => setToast(null), 2000);
                  }}
                  className="inline-flex items-center justify-center px-5 py-2.5 bg-linear-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold rounded-lg shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-red-500/50 transition-all duration-300 transform hover:scale-105"
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
              </>
            )}
          </nav>

          <button
            type="button"
            className="md:hidden p-2 text-slate-600 dark:text-slate-300"
            onClick={toggleMobile}
            data-testid="button-mobile-menu"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
          >
            <div className="w-6 h-5 flex flex-col justify-between">
              <span
                className={`block w-full h-0.5 bg-current transform transition-transform ${
                  mobileMenuOpen ? 'rotate-45 translate-y-2' : ''
                }`}
              ></span>
              <span
                className={`block w-full h-0.5 bg-current ${
                  mobileMenuOpen ? 'opacity-0' : ''
                }`}
              ></span>
              <span
                className={`block w-full h-0.5 bg-current transform transition-transform ${
                  mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''
                }`}
              ></span>
            </div>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-2" data-testid="menu-mobile">
            {NAV_ITEMS.map((item, idx) => renderItem(item, idx, true))}

            {!user && (
              <>
                <NavLink
                  to="/admin/login"
                  onClick={closeMobile}
                  className="block px-3 py-2 text-base font-medium font-serif text-slate-700 hover:text-black"
                >
                  Admin Login
                </NavLink>
                <NavLink
                  to="/company/login"
                  onClick={closeMobile}
                  className="block px-3 py-2 text-base font-medium font-serif text-slate-700 hover:text-black"
                >
                  Company Login
                </NavLink>
                <NavLink
                  to="/company/register"
                  onClick={closeMobile}
                  className="block w-full mt-2 px-4 py-3 text-center bg-linear-to-r from-blue-600 to-blue-700 text-white font-bold rounded-lg"
                >
                  Register
                </NavLink>
              </>
            )}

            {user && (
              <>
                <NavLink
                  to={user.userType === 'admin' ? '/admin' : '/company'}
                  onClick={closeMobile}
                  className="block px-3 py-2 text-base font-semibold font-serif text-slate-600 hover:text-black"
                >
                  Dashboard
                </NavLink>
                <button
                  onClick={() => {
                    logout();
                    closeMobile();
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
              </>
            )}
          </div>
        )}
        {toast && (
          <div className="fixed right-4 top-24 bg-slate-800 border border-slate-700 text-white px-4 py-3 rounded-lg shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </header>
  );
}
