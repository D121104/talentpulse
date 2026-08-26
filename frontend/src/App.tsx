import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { GuestRoute } from './auth/GuestRoute';
import { ProtectedRoute } from './auth/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import GoogleCallbackPage from './pages/auth/GoogleCallbackPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import VerifyAccountPage from './pages/auth/VerifyAccountPage';
import MyCVPage from './pages/cv/MyCVPage';
import { ProfileViewersPage } from './pages/candidate/ProfileViewersPage';
import CVTemplatePage from './pages/cv/CVTemplatePage';
import CVEditorPage from './pages/cv/CVEditorPage';
import EmployerDashboardPage from './pages/employer/EmployerDashboardPage';
import PremiumPage from './pages/premium/PremiumPage';
import PaymentHistoryPage from './pages/payment/PaymentHistoryPage';
import PaymentVerifyPage from './pages/payment/PaymentVerifyPage';
import { ScrollToTop } from './components/common/ScrollToTop';

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <ScrollToTop />
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/verify-account" element={<VerifyAccountPage />} />
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
            <Route path="/pending-approval" element={<PendingApprovalPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/premium" element={<PremiumPage />} />
              <Route path="/pricing" element={<Navigate to="/premium" replace />} />
              <Route path="/payment-history" element={<PaymentHistoryPage />} />
              <Route path="/payment/history" element={<Navigate to="/payment-history" replace />} />
              <Route path="/payment/verify/:orderCode" element={<PaymentVerifyPage />} />
              <Route path="/payment/verify" element={<PaymentVerifyPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['HR', 'ADMIN']} />}>
              <Route path="/dashboard" element={<EmployerDashboardPage />} />
              <Route path="/hr/dashboard" element={<Navigate to="/dashboard" replace />} />
              <Route path="/hr/jobs/create" element={<EmployerDashboardPage />} />
              <Route path="/hr/jobs/new" element={<Navigate to="/hr/jobs/create" replace />} />
              <Route path="/hr/jobs/edit/:id" element={<EmployerDashboardPage />} />
              <Route path="/employer/jobs/create" element={<Navigate to="/hr/jobs/create" replace />} />
              <Route path="/employer/jobs/edit/:id" element={<EmployerDashboardPage />} />
              <Route path="/hr/premium" element={<EmployerDashboardPage />} />
              <Route path="/employer/premium" element={<EmployerDashboardPage />} />
            </Route>
            <Route element={<ProtectedRoute allowedRoles={['USER', 'ADMIN']} />}>
              <Route path="/my-cv" element={<MyCVPage />} />
              <Route path="/mycv" element={<Navigate to="/my-cv" replace />} />
              <Route path="/profile-viewers" element={<ProfileViewersPage />} />
              <Route path="/profile/cv-views" element={<Navigate to="/profile-viewers" replace />} />
              <Route path="/cv-templates" element={<CVTemplatePage />} />
              <Route path="/cv-editor/:id" element={<CVEditorPage />} />
              <Route path="/cv-editor/new" element={<CVEditorPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />

          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  </ThemeProvider>
  );
}

export default App;
