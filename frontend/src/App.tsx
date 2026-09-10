import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './layouts/MainLayout';
import LandingPage from './pages/LandingPage';
import ReportPothole from './pages/ReportPothole';
import DriveMode from './pages/DriveMode';
import AIAnalysis from './pages/AIAnalysis';
import WorkOrders from './pages/WorkOrders';
import MyReports from './pages/MyReports';
import Dashboard from './pages/Dashboard';
import EngineerReview from './pages/EngineerReview';
import MapPage from './pages/MapPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AdminDashboard from './pages/AdminDashboard';
import PushNotificationPrompt from './components/common/PushNotificationPrompt';
import PWAInstallPrompt from './components/common/PWAInstallPrompt';
import ReportDetailsPage from './pages/ReportDetailsPage';
import LoginPage from './pages/LoginPage';
import { useAuthStore, type Role } from './store/authStore';
import { NotificationProvider } from './components/notifications';
import './components/notifications/Notification.css';

const queryClient = new QueryClient();

/**
 * Gate a route behind authentication. Optionally require a specific role; an
 * authenticated user lacking that role is sent home rather than to login.
 */
function RequireAuth({ children, roles }: { children: JSX.Element; roles?: Role[] }) {
  const { isAuthenticated, role } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationProvider>
        <Router future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}>
          <PushNotificationPrompt />
          <PWAInstallPrompt />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<LandingPage />} />
              <Route path="report" element={<ReportPothole />} />
              <Route path="drive" element={<DriveMode />} />
              <Route path="ai-analysis" element={<AIAnalysis />} />
              <Route path="work-orders" element={<WorkOrders />} />
              <Route path="my-reports" element={<MyReports />} />
              <Route path="reports/:reportId" element={<ReportDetailsPage />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="review" element={<RequireAuth roles={['ENGINEER']}><EngineerReview /></RequireAuth>} />
              <Route path="map" element={<MapPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="admin" element={<RequireAuth roles={['ENGINEER']}><AdminDashboard /></RequireAuth>} />
            </Route>
          </Routes>
        </Router>
      </NotificationProvider>
    </QueryClientProvider>
  );
}

export default App;