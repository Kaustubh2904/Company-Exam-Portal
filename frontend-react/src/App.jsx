import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Navbar from './components/Navbar';
import AdminLogin from './pages/AdminLogin';
import CompanyLogin from './pages/CompanyLogin';
import CompanyRegister from './pages/CompanyRegister';
import AdminDashboard from './pages/AdminDashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import CompanyCreateDrive from './pages/CompanyCreateDrive';
import CompanyDriveDetail from './pages/CompanyDriveDetail';
import CompanySendEmails from './pages/CompanySendEmails';
import Hero from './components/Hero';
import Landing from './components/Landing';
import Footer from './components/Footer';
import { AuthProvider } from './contexts/AuthContext';
import RequireAuth from './components/RequireAuth';
import ErrorBoundary from './components/ErrorBoundary';

const Home = () => (
  <main className="max-w-4xl mx-auto p-6">
    <h1 className="text-3xl font-bold">Welcome to Company Exam Portal</h1>
    <p className="mt-4 text-muted-foreground">
      Use the navigation to login or register as a company or admin.
    </p>
  </main>
);

const App = () => {
  function RouteBasedHeader() {
    const location = useLocation();
    const noHeaderPaths = [
      '/admin',
      '/company',
      '/admin/login',
      '/company/login',
      '/company/register',
    ];
    if (noHeaderPaths.some((path) => location.pathname.startsWith(path))) {
      return null;
    }
    return (
      <div className="bg-hero-pattern bg-cover bg-no-repeat bg-center">
        <Navbar />
      </div>
    );
  }

  function RouteBasedFooter() {
    const location = useLocation();
    const noFooterPaths = [
      '/admin',
      '/company',
      '/admin/login',
      '/company/login',
      '/company/register',
    ];
    if (noFooterPaths.some((path) => location.pathname.startsWith(path))) {
      return null;
    }
    return <Footer />;
  }

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <div className="relative z-0 bg-primary min-h-screen flex flex-col">
            <RouteBasedHeader />

            <main className="grow">
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/company/login" element={<CompanyLogin />} />
                <Route path="/company/register" element={<CompanyRegister />} />

              <Route
                path="/admin"
                element={
                  <RequireAuth allowedTypes={['admin']}>
                    <AdminDashboard />
                  </RequireAuth>
                }
              />

              <Route
                path="/admin-dashboard"
                element={
                  <RequireAuth allowedTypes={['admin']}>
                    <AdminDashboard />
                  </RequireAuth>
                }
              />

              {/* Company Dashboard */}
              <Route
                path="/company"
                element={
                  <RequireAuth allowedTypes={['company']}>
                    <CompanyDashboard />
                  </RequireAuth>
                }
              />

              <Route
                path="/company-dashboard"
                element={
                  <RequireAuth allowedTypes={['company']}>
                    <CompanyDashboard />
                  </RequireAuth>
                }
              />

              <Route
                path="/company-create-drive"
                element={
                  <RequireAuth allowedTypes={['company']}>
                    <CompanyCreateDrive />
                  </RequireAuth>
                }
              />

              <Route
                path="/company-drive-detail"
                element={
                  <RequireAuth allowedTypes={['company']}>
                    <CompanyDriveDetail />
                  </RequireAuth>
                }
              />

              <Route
                path="/company-send-emails"
                element={
                  <RequireAuth allowedTypes={['company']}>
                    <CompanySendEmails />
                  </RequireAuth>
                }
              />
            </Routes>
          </main>

          <RouteBasedFooter />
        </div>
        <ToastContainer
          position="top-right"
          autoClose={3000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
          theme="colored"
          style={{ zIndex: 9999 }}
        />
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
  );
};

export default App;
