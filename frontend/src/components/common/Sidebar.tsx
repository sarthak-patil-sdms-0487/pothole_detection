import { Link, useLocation } from 'react-router-dom';
import { 
  Home, 
  AlertCircle, 
  List, 
  LayoutDashboard, 
  Map, 
  BarChart2, 
  Settings, 
  X, 
  FileCheck2, 
  Crosshair 
} from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';

const Sidebar = ({ open, setOpen }: { open: boolean; setOpen: (o: boolean) => void }) => {
  const location = useLocation();
  const { role } = useAuthStore();

  // Define navigation based on role
  const citizenNav = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Drive Mode (Autonomous)', href: '/drive', icon: Crosshair },
    { name: 'Report Pothole', href: '/report', icon: AlertCircle },
    { name: 'My Reports', href: '/reports', icon: List },
    { name: 'Map View', href: '/map', icon: Map },
  ];

  const engineerNav = [
    { name: 'Overview', href: '/', icon: LayoutDashboard },
    { name: 'Drive Mode (Survey)', href: '/drive', icon: Crosshair },
    { name: 'Review Reports', href: '/review', icon: FileCheck2 },
    { name: 'Work Orders', href: '/reports', icon: List },
    { name: 'Map View', href: '/map', icon: Map },
    { name: 'Analytics', href: '/analytics', icon: BarChart2 },
    { name: 'Admin', href: '/admin', icon: Settings },
  ];

  const navigation = role === 'ENGINEER' ? engineerNav : citizenNav;

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-gray-900/80 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar component */}
      <motion.div
        className={clsx(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 flex flex-col",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700 lg:hidden shrink-0">
          <span className="text-xl font-bold text-gray-900 dark:text-white">SIDC Portal</span>
          <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Role Indicator Banner */}
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 shrink-0">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Current Profile</p>
          <div className="flex items-center gap-2">
            <div className={clsx("w-2 h-2 rounded-full", role === 'ENGINEER' ? "bg-accent-orange" : "bg-govBlue")}></div>
            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
              {role === 'ENGINEER' ? 'PWD Engineer' : 'Surveyor / Citizen'}
            </p>
          </div>
        </div>

        <div className="flex flex-col h-full overflow-y-auto py-4">
          <nav className="flex-1 px-3 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    isActive
                      ? 'bg-govBlue text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white',
                    'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors'
                  )}
                >
                  <item.icon
                    className={clsx(
                      isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-400 dark:group-hover:text-gray-300',
                      'mr-3 flex-shrink-0 h-5 w-5'
                    )}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>
      </motion.div>
    </>
  );
};

export default Sidebar;