import { Navigate } from 'react-router-dom';

/**
 * AdminDashboardPage is now deprecated.
 * The Admin section uses AdminLayout with discrete nested routes:
 * - /admin/dashboard
 * - /admin/packages
 * - /admin/subscriptions
 * - /admin/payments
 * - /admin/users
 * - /admin/companies
 * - /admin/jobs
 * - /admin/skills
 */
export default function AdminDashboardPage() {
  return <Navigate to="/admin/dashboard" replace />;
}
