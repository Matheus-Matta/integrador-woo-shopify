'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
  HiChartPie, 
  HiUsers, 
  HiShoppingBag, 
  HiExclamationCircle, 
  HiChip, 
  HiLink 
} from 'react-icons/hi';
import { twMerge } from 'tailwind-merge';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const MENU_ITEMS = [
  { href: '/dashboard', icon: HiChartPie, label: 'Pedidos' },
  { href: '/dashboard/customers', icon: HiUsers, label: 'Clientes' },
  { href: '/dashboard/products', icon: HiShoppingBag, label: 'Produtos' },
  { href: '/dashboard/errors', icon: HiExclamationCircle, label: 'Erros' },
  { href: '/dashboard/queues', icon: HiChip, label: 'Filas' },
  { href: '/dashboard/webhooks', icon: HiLink, label: 'Webhooks' },
];

export function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Overlay para mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="top-bar-sidebar"
        className={twMerge(
          "fixed top-0 left-0 z-40 w-64 h-full pt-16 transition-transform border-e border-gray-800 bg-[#161b27] sm:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Sidebar"
      >
        <div className="h-full px-3 py-4 overflow-y-auto scrollbar-none">
          <ul className="space-y-2 font-medium">
            {MENU_ITEMS.map((item) => {
              const isActive = item.href === '/dashboard' 
                ? pathname === '/dashboard' 
                : pathname?.startsWith(item.href);

              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className={twMerge(
                      "flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group border border-transparent",
                      isActive 
                        ? "bg-indigo-600/10 text-indigo-400 font-semibold border-indigo-500/20 shadow-lg shadow-indigo-500/5" 
                        : "text-gray-400 hover:bg-[#1e2535] hover:text-white"
                    )}
                  >
                    <Icon className={twMerge(
                      "w-5 h-5 transition duration-75",
                      isActive ? "text-indigo-400" : "text-gray-500 group-hover:text-gray-300"
                    )} />
                    <span className="ms-3">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Footer Sidebar (Opcional) */}
          <div className="absolute bottom-0 left-0 w-full p-4 border-t border-gray-800 bg-[#161b27]">
             <div className="flex items-center gap-3 px-2">
                <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                  M
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">Admin</p>
                  <p className="text-xs text-gray-500 truncate">integrador@dash.com</p>
                </div>
             </div>
          </div>
        </div>
      </aside>
    </>
  );
}
