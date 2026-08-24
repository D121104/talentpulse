import { ThemeProvider } from './context/ThemeContext';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { GuestRoute } from './auth/GuestRoute';
import { ProtectedRoute } from './auth/ProtectedRoute';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import GoogleCallbackPage from './pages/auth/GoogleCallbackPage';
import PendingApprovalPage from './pages/auth/PendingApprovalPage';
import DashboardEntryPage from './pages/dashboard/DashboardEntryPage';
import MyCVPage from './pages/cv/MyCVPage';
import CVTemplatePage from './pages/cv/CVTemplatePage';
import CVEditorPage from './pages/cv/CVEditorPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>
            <Route path="/auth/google/callback" element={<GoogleCallbackPage />} />
            <Route path="/pending-approval" element={<PendingApprovalPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardEntryPage />} />
              <Route path="/my-cv" element={<MyCVPage />} />
              <Route path="/cv-templates" element={<CVTemplatePage />} />
              <Route path="/cv-editor/:id" element={<CVEditorPage />} />
              <Route path="/cv-editor/new" element={<CVEditorPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
