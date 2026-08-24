import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function GuestRoute() {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return status === 'authenticated' ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
