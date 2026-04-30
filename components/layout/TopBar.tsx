'use client';

import { useRouter } from 'next/navigation';
import { logout } from '@/services/api';
import { SSEStatus } from './SSEStatus';
import { HiMenuAlt2, HiLogout } from 'react-icons/hi';
import Link from 'next/link';

interface TopBarProps {
  toggleSidebar: () => void;
}

export function TopBar({ toggleSidebar }: TopBarProps) {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/login');
      router.refresh();
    } catch {
      router.push('/login');
    }
  };

  return (
    <nav className="fixed top-0 z-50 w-full bg-[#161b27] border-b border-gray-800">
      <div className="px-3 py-3 lg:px-5 lg:pl-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center justify-start">
            <button
              onClick={toggleSidebar}
              type="button"
              className="inline-flex items-center p-2 text-sm text-gray-400 rounded-lg sm:hidden hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600"
            >
              <span className="sr-only">Abrir sidebar</span>
              <HiMenuAlt2 className="w-6 h-6" />
            </button>
            <Link href="/dashboard" className="flex ms-2 md:me-24 items-center gap-3">
              <div className="w-7 h-7 bg-indigo-600 rounded flex items-center justify-center">
                <span className="material-icons text-white text-xs">sync_alt</span>
              </div>
              <span className="self-center text-xl font-bold sm:text-2xl whitespace-nowrap text-white">
                Integrador
              </span>
            </Link>
          </div>
          
          <div className="flex items-center gap-6">
            <SSEStatus />
            
            <div className="h-6 w-px bg-gray-800 hidden sm:block"></div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors group"
            >
              <div className="p-2 rounded-lg bg-gray-800 group-hover:bg-red-900/20 transition-colors">
                <HiLogout className="w-5 h-5 group-hover:text-red-500" />
              </div>
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
