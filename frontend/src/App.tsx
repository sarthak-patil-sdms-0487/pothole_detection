import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './layouts/MainLayout';
import LandingPage from './pages/LandingPage';
import ReportPothole from './pages/ReportPothole';
import DriveMode from './pages/DriveMode';
import AIAnalysis from './pages/AIAnalysis';
import ReportsList from './pages/ReportsList';
import MyReports from './pages/MyReports';
import Dashboard from './pages/Dashboard';
import EngineerReview from './pages/EngineerReview';
import TimelinePage from './pages/TimelinePage';
import MapPage from './pages/MapPage';
import AnalyticsPage from './pages/AnalyticsPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/AdminDashboard';
import AboutPage from './pages/AboutPage';
import PushNotificationPrompt from './components/common/PushNotificationPrompt';
import ShareTargetPage from './pages/ShareTargetPage';
import PWAInstallPrompt from './components/common/PWAInstallPrompt';
import ReportDetailsPage from './pages/ReportDetailsPage';
import { NotificationProvider } from './components/notifications';
import { RoleProvider } from './context/RoleContext';
import './components/notifications/Notification.css';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider>
        <NotificationProvider>
          <Router future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}>
            <PushNotificationPrompt />
            <PWAInstallPrompt />
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<LandingPage />} />
                <Route path="report" element={<ReportPothole />} />
                <Route path="drive" element={<DriveMode />} />
                <Route path="ai-analysis" element={<AIAnalysis />} />
                <Route path="reports" element={<ReportsList />} />
                <Route path="my-reports" element={<MyReports />} />
                <Route path="reports/:reportId" element={<ReportDetailsPage />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="review" element={<EngineerReview />} />
                <Route path="timeline" element={<TimelinePage />} />
                <Route path="map" element={<MapPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="about" element={<AboutPage />} />
                <Route path="share-target" element={<ShareTargetPage />} />
              </Route>
            </Routes>
          </Router>
        </NotificationProvider>
      </RoleProvider>
    </QueryClientProvider>
  );
}

export default App;