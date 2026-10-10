/**
 * A.E.G.I.S 4.0 — Main Application Component
 * WP-4.1.4 | Protected Routing & Authorization Foundation
 *
 * Configures React Router, AuthProvider, public layout, protected portal routes,
 * role-specific route guards, legacy hash redirection, and alias matrices.
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { LocaleProvider } from '@/context/LocaleContext';
import {
  StudentRoute,
  AuthorityRoute,
  AdminRoute,
  GuestRoute,
} from '@/routes/ProtectedRoutes';
import { AccessDeniedScreen } from '@/components/auth/AuthScreens';

// Layouts
import PublicLayout from '@/layouts/PublicLayout';
import StudentLayout from '@/layouts/StudentLayout';
import AuthorityLayout from '@/layouts/AuthorityLayout';
import OwnerLayout from '@/layouts/OwnerLayout';

// Public Pages
import LandingPage from '@/pages/LandingPage';
import AboutPage from '@/pages/AboutPage';
import SafetyPage from '@/pages/SafetyPage';
import RegisterPage from '@/pages/RegisterPage';
import LoginPage from '@/pages/LoginPage';
import SuspendedPage from '@/pages/SuspendedPage';
import NotFoundPage from '@/pages/NotFoundPage';

// Student Portal Pages
import StudentDashboardPage from '@/pages/student/StudentDashboardPage';
import StudentReportPage from '@/pages/student/StudentReportPage';
import StudentTrackPage from '@/pages/student/StudentTrackPage';

// Authority Portal Pages
import AuthorityDashboardPage from '@/pages/authority/AuthorityDashboardPage';
import AuthorityCasesPage from '@/pages/authority/AuthorityCasesPage';
import AuthorityReviewPage from '@/pages/authority/AuthorityReviewPage';

// Admin Portal Pages
import AdminOverviewPage from '@/pages/admin/AdminOverviewPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import AdminCasesPage from '@/pages/admin/AdminCasesPage';
import AdminAuditPage from '@/pages/admin/AdminAuditPage';

// Development-Only Showcase (Isolated from production)
import DesignSystemShowcasePage from '@/pages/design-system/DesignSystemShowcasePage';

/**
 * LegacyHashRedirect
 * Intercepts legacy prototype hash routes (#report, #track, #dashboard)
 * and safely forwards them to modern React paths without exposing data.
 * Cleans the hash fragment to prevent state pollution.
 */
function LegacyHashRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#report' || hash === '#/report') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      navigate('/student/report', { replace: true });
    } else if (hash === '#track' || hash === '#/track') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      navigate('/student/track', { replace: true });
    } else if (hash === '#dashboard' || hash === '#/dashboard') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      navigate('/student', { replace: true });
    }
  }, [location, navigate]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
          <LegacyHashRedirect />
          <Routes>
            {/* Public Website Routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/safety" element={<SafetyPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Account Status & Authorization Notices */}
            <Route path="/suspended" element={<SuspendedPage />} />
            <Route path="/unauthorized" element={<AccessDeniedScreen />} />

            {/* Guest Only Routes (redirects authenticated users to their portal) */}
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Protected Student Portal */}
            <Route element={<StudentRoute />}>
              <Route path="/student" element={<StudentLayout />}>
                <Route index element={<StudentDashboardPage />} />
                <Route path="dashboard" element={<Navigate to="/student" replace />} />
                <Route path="report" element={<StudentReportPage />} />
                <Route path="track" element={<StudentTrackPage />} />
                <Route path="cases" element={<Navigate to="/student/track" replace />} />
                <Route path="profile" element={<Navigate to="/student" replace />} />
              </Route>
            </Route>

            {/* Protected Authority Portal */}
            <Route element={<AuthorityRoute />}>
              <Route path="/authority" element={<AuthorityLayout />}>
                <Route index element={<AuthorityDashboardPage />} />
                <Route path="dashboard" element={<Navigate to="/authority" replace />} />
                <Route path="cases" element={<AuthorityCasesPage />} />
                <Route path="review" element={<AuthorityReviewPage />} />
                <Route path="reviews" element={<Navigate to="/authority/review" replace />} />
              </Route>
            </Route>

            {/* Protected Owner / Admin Portal */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<OwnerLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="cases" element={<AdminCasesPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
              </Route>
              {/* Protected /owner aliases — identical security boundary */}
              <Route path="/owner" element={<OwnerLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="dashboard" element={<Navigate to="/owner" replace />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="roles" element={<Navigate to="/owner/users" replace />} />
                <Route path="cases" element={<AdminCasesPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
                <Route path="settings" element={<Navigate to="/owner" replace />} />
              </Route>
            </Route>

            {/* Development-Only Design System Showcase (Isolated from Production) */}
            {import.meta.env.DEV && (
              <Route path="/design-system" element={<DesignSystemShowcasePage />} />
            )}

            {/* 404 Catch-All */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
