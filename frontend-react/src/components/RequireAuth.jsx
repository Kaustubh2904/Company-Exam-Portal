import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function RequireAuth({ children, allowedTypes = [] }) {
  const { user } = useAuth();

  if (!user || !user.token) {
    return <Navigate to="/" replace />;
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(user.userType)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
