import { Outlet } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import BottomNav from '../components/common/BottomNav';
import { PWAPrompt } from '../components/common/PWAPrompt';
import { useState } from 'react';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      
      <div className="flex-1 flex flex-col h-full relative">
        <Navbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
        
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8 h-full pb-24 md:pb-8">
            <Outlet />
          </div>
        </main>
        
        <BottomNav />
        <PWAPrompt />
      </div>
    </div>
  );
};

export default MainLayout;