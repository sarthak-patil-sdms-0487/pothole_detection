import React, { useState, useEffect } from 'react';
import { Menu, User, Sun, Moon, ArrowRightLeft, ShieldCheck, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const Navbar = ({ toggleSidebar }: { toggleSidebar: () => void }) => {
  const [darkMode, setDarkMode] = useState(false);
  const { role, toggleRole } = useAuthStore();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-14 sm:h-16 flex items-center justify-between px-3 sm:px-6 lg:px-8 shrink-0 shadow-sm z-30">
      <div className="flex items-center min-w-0">
        <button
          onClick={toggleSidebar}
          className="p-1.5 mr-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 lg:hidden focus:outline-none shrink-0"
        >
          <Menu className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
        <Link to="/" className="flex items-center space-x-2 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-govBlue rounded-xl flex items-center justify-center shadow-md shrink-0">
            <span className="text-white font-black text-sm sm:text-lg">S</span>
          </div>
          <div className="flex flex-col truncate">
            <span className="text-xs sm:text-base font-black text-gray-900 dark:text-white leading-tight tracking-tight truncate">SIDC Road</span>
            <span className="text-[9px] sm:text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest hidden sm:block">48h Compliance</span>
          </div>
        </Link>
      </div>

      <div className="flex items-center space-x-1 sm:space-x-3 shrink-0">
        
        {/* Global Role Switcher */}
        <button
          onClick={toggleRole}
          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] sm:text-sm font-bold rounded-full border transition-all shadow-sm ${
            role === 'ENGINEER'
              ? 'bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800'
              : 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
          }`}
          title="Click to toggle between Surveyor and Engineer roles"
        >
          {role === 'ENGINEER' ? <ShieldCheck className="w-4 h-4 text-purple-600" /> : <UserCheck className="w-4 h-4 text-blue-600" />}
          <span className="hidden md:inline font-normal text-gray-500 dark:text-gray-400">Role:</span>
          <span>{role}</span>
          <ArrowRightLeft className="w-3 h-3 ml-0.5 text-gray-400" />
        </button>

        <button 
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          {darkMode ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
        </button>
        
        <div className="flex items-center space-x-2 p-1 rounded-full">
          <div className="h-8 w-8 rounded-full bg-govBlue flex items-center justify-center text-white font-bold text-xs shadow-inner">
            {role === 'ENGINEER' ? 'EE' : 'SR'}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
