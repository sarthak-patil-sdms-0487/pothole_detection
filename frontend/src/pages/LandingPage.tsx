import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, Clock, CheckCircle, MapPin, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import Dashboard from './Dashboard';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config';

const LandingPage = () => {
  const { role } = useAuthStore();
  const [stats, setStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // If the user is viewing as an engineer, show the dashboard instead of the citizen landing page
  if (role === 'ENGINEER') {
    return <Dashboard />;
  }

  // Fetch live stats from DB (Component E)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/stats/dashboard`);
        if (resp.ok) {
          const data = await resp.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  const displayStats = [
    { name: 'Total Reports', value: stats?.total_reports ?? '—', icon: AlertTriangle, color: 'text-status-warning' },
    { name: 'Defects Resolved', value: stats?.closed_defects ?? '—', icon: CheckCircle, color: 'text-status-success' },
    { name: 'Open Reports', value: stats?.open_count ?? '—', icon: Clock, color: 'text-govBlue' },
    { name: 'Active Segments', value: stats?.active_segments ?? '—', icon: MapPin, color: 'text-accent-orange' },
  ];

  return (
    <div className="flex flex-col min-h-full">
      {/* Hero Section */}
      <div className="relative isolate overflow-hidden bg-govBlue dark:bg-gray-900 rounded-2xl sm:rounded-3xl mb-8 sm:mb-12">
        <div className="px-4 py-16 sm:px-12 sm:py-32 lg:px-16">
          <div className="mx-auto max-w-2xl text-center">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl sm:text-4xl lg:text-6xl font-bold tracking-tight text-white"
            >
              SIDC Road Defect Intelligence
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-4 sm:mt-6 text-base sm:text-lg leading-7 sm:leading-8 text-gray-300"
            >
              AI-powered road defect detection and compliance tracking for SIDC managed infrastructure.
            </motion.p>
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-x-6"
            >
              <Link
                to="/report"
                className="w-full sm:w-auto rounded-md bg-accent-orange px-6 py-3 text-base sm:text-lg font-semibold text-white shadow-sm hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-orange transition-colors text-center"
              >
                Report a Pothole
              </Link>
              <Link to="/reports" className="w-full sm:w-auto text-base sm:text-lg font-semibold leading-6 text-white flex items-center justify-center gap-2 hover:text-gray-300 transition-colors py-2">
                View My Reports <ArrowRight className="w-5 h-5" />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Stats Section - Live from DB (Component E) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8 sm:mb-16">
        {displayStats.map((stat, idx) => (
          <motion.div 
            key={stat.name}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + (idx * 0.1) }}
            className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl sm:rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 text-center sm:text-left"
          >
            <div className={`p-3 sm:p-4 bg-gray-50 dark:bg-gray-700 rounded-xl ${stat.color} shrink-0`}>
              <stat.icon className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-500 dark:text-gray-400">{stat.name}</p>
              {loadingStats ? (
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin mt-1" />
              ) : (
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white mt-1 sm:mt-0">{stat.value}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {/* How it Works */}
      <div className="mb-8 sm:mb-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 dark:text-white mb-8 sm:mb-12">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
          {[
            { step: '1', title: 'Snap a Photo', desc: 'Take a picture of the pothole. Our app automatically captures the GPS location.' },
            { step: '2', title: 'AI Analysis', desc: 'YOLO or Gemini AI instantly estimates the severity, size, and generates a work order.' },
            { step: '3', title: 'Track Progress', desc: 'Follow the repair process in real-time until the issue is completely resolved.' }
          ].map((item, idx) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + (idx * 0.1) }}
              className="text-center bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 md:bg-transparent md:p-0 md:shadow-none md:border-none"
            >
              <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-govBlue text-white rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mb-3 sm:mb-4 shadow-lg">
                {item.step}
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-2 text-gray-900 dark:text-white">{item.title}</h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LandingPage;