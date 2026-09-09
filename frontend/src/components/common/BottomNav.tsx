import { Home, AlertCircle, Video, FileText, BarChart3 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const navItems = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Drive AI', href: '/drive', icon: Video },
  { name: 'Report', href: '/report', icon: AlertCircle },
  { name: 'My Reports', href: '/my-reports', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

const BottomNav = () => {
  const location = useLocation();

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-30 pb-safe">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={clsx(
                "flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors",
                isActive ? "text-govBlue dark:text-govBlue-light" : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              )}
            >
              <item.icon className={clsx("h-6 w-6", isActive && "fill-current opacity-20")} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNav;
