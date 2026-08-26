import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function GuestRoute() {
  const { status, user } = useAuth();
  if (status === 'loading') return null;
  if (status === 'authenticated') {
    return <Navigate to={user?.role === 'HR' ? (!user.isApproved ? '/pending-approval' : '/dashboard') : '/'} replace />;
  }
  return <Outlet />;
}
