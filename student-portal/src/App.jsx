import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import WaitingRoom from './pages/WaitingRoom';
import ExamPage from './pages/ExamPage';
import ResultPage from './pages/ResultPage';
import DisqualifiedPage from './pages/DisqualifiedPage';
import ErrorBoundary from './components/ErrorBoundary';
import './App.css'

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/waiting-room" element={<WaitingRoom />} />
            <Route path="/exam" element={<ExamPage />} />
            <Route path="/result" element={<ResultPage />} />
            <Route path="/disqualified" element={<DisqualifiedPage />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
          </Routes>
          <ToastContainer
            position="top-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App
