import { Outlet } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Sidebar from '../components/common/Sidebar';
import BottomNav from '../components/common/BottomNav';
import { useState } from 'react';

const MainLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] bg-gray-50 dark:bg-gray-900 overflow-hidden">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />

      {/*
        min-w-0 is load-bearing. A flex item defaults to min-width:auto, so without
        it this column refuses to shrink below the min-content width of whatever page
        is rendered — a wide table or a 4-up KPI row then squeezes the sidebar instead
        of scrolling itself. overflow-x-hidden keeps any remaining overflow inside the
        page area rather than pushing the whole shell sideways.
      */}
      <div className="flex-1 min-w-0 flex flex-col h-full relative">
        <Navbar toggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-4 sm:py-8 min-h-full pb-24 md:pb-8">
            <Outlet />
          </div>
        </main>

        <BottomNav />
      </div>
    </div>
  );
};

export default MainLayout;
