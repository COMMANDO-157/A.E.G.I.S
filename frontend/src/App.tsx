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
  HodRoute,
  DeanRoute,
  HigherAuthorityRoute,
  AdminRoute,
  OwnerRoute,
  GuestRoute,
} from '@/routes/ProtectedRoutes';
import { AccessDeniedScreen } from '@/components/auth/AuthScreens';

// Layouts
import PublicLayout from '@/layouts/PublicLayout';
import StudentLayout from '@/layouts/StudentLayout';
import HodLayout from '@/layouts/HodLayout';
import DeanLayout from '@/layouts/DeanLayout';
import AuthorityLayout from '@/layouts/AuthorityLayout';
import OwnerLayout from '@/layouts/OwnerLayout';
import PrimaryOwnerLayout from '@/layouts/PrimaryOwnerLayout';

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
import AuthorityStudentsPage from '@/pages/authority/AuthorityStudentsPage';

// Admin Portal Pages
import AdminOverviewPage from '@/pages/admin/AdminOverviewPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';
import AdminCasesPage from '@/pages/admin/AdminCasesPage';
import AdminAuditPage from '@/pages/admin/AdminAuditPage';
import AdminRosterConflictsPage from '@/pages/admin/AdminRosterConflictsPage';

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

            {/* 2. Protected Head of Department Portal (/hod) */}
            <Route element={<HodRoute />}>
              <Route path="/hod" element={<HodLayout />}>
                <Route index element={<AuthorityDashboardPage />} />
                <Route path="dashboard" element={<Navigate to="/hod" replace />} />
                <Route path="cases" element={<AuthorityCasesPage />} />
                <Route path="students" element={<AuthorityStudentsPage />} />
                <Route path="review" element={<AuthorityReviewPage />} />
              </Route>
            </Route>

            {/* 3. Protected Dean Portal (/dean) */}
            <Route element={<DeanRoute />}>
              <Route path="/dean" element={<DeanLayout />}>
                <Route index element={<AuthorityDashboardPage />} />
                <Route path="dashboard" element={<Navigate to="/dean" replace />} />
                <Route path="cases" element={<AuthorityCasesPage />} />
                <Route path="students" element={<AuthorityStudentsPage />} />
                <Route path="review" element={<AuthorityReviewPage />} />
              </Route>
            </Route>

            {/* 4. Protected Higher Authority Portal (/authority) */}
            <Route element={<HigherAuthorityRoute />}>
              <Route path="/authority" element={<AuthorityLayout />}>
                <Route index element={<AuthorityDashboardPage />} />
                <Route path="dashboard" element={<Navigate to="/authority" replace />} />
                <Route path="cases" element={<AuthorityCasesPage />} />
                <Route path="students" element={<AuthorityStudentsPage />} />
                <Route path="review" element={<AuthorityReviewPage />} />
                <Route path="reviews" element={<Navigate to="/authority/review" replace />} />
              </Route>
            </Route>

            {/* 5. Protected Delegated Administrator Portal (/admin) */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<OwnerLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="dashboard" element={<Navigate to="/admin" replace />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="roster-conflicts" element={<AdminRosterConflictsPage />} />
                <Route path="cases" element={<AdminCasesPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
              </Route>
            </Route>

            {/* 6. Protected Primary Owner Portal (/owner) */}
            <Route element={<OwnerRoute />}>
              <Route path="/owner" element={<PrimaryOwnerLayout />}>
                <Route index element={<AdminOverviewPage />} />
                <Route path="dashboard" element={<Navigate to="/owner" replace />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="roster-conflicts" element={<AdminRosterConflictsPage />} />
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
