import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { UserRole } from './types';

export function ProtectedRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { status, user } = useAuth();

  if (status === 'loading') return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'HR' && !user.isApproved) {
    return <Navigate to="/pending-approval" replace />;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
