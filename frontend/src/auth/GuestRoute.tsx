import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function GuestRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (status !== 'authenticated' || !user) return <Outlet />;
  return <Navigate to={user.role === 'USER' ? '/my-cv' : '/dashboard'} replace />;
}
