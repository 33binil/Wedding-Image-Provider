import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, HardDrive, LogOut, HeartHandshake, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { success } = useToast();

  const handleLogout = async () => {
    try {
      await logout();
      success('Logged Out', 'You have been safely signed out.');
      navigate('/login');
    } catch {
      navigate('/login');
    }
  };

  const navItems = [
    {
      label: 'Weddings Overview',
      path: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Create Wedding',
      path: '/events/new',
      icon: PlusCircle,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#FAF8F5] border-r border-[#ECE5D8] p-5 justify-between select-none">
      <div>
        {/* Logo & Brand */}
        <div className="flex items-center justify-between pb-6 border-b border-[#EAE3D4]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1C1917] flex items-center justify-center text-[#E5D7C0] shadow">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif font-bold text-stone-900 tracking-tight text-base leading-tight">
                Penta Prizm
              </h1>
              <p className="text-[11px] text-[#8C6D40] font-medium tracking-wide">Wedding AI Photo Finder</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation links */}
        <nav className="mt-6 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-[#1C1917] text-[#FAF8F5] shadow-sm'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-[#F0EBE1]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Integration Status Mini Card */}
        <div className="mt-8 p-3.5 bg-white border border-[#E8DEC9] rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-stone-800">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-stone-500" /> Google Drive
            </span>
            <span
              className={`w-2 h-2 rounded-full ${
                user?.googleDrive?.connected ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
          </div>
          <p className="text-[11px] text-stone-500 mt-1.5 leading-relaxed">
            {user?.googleDrive?.connected
              ? `Connected: ${user.googleDrive.googleEmail || 'Linked'}`
              : 'Drive connection pending for photo sync'}
          </p>
        </div>
      </div>

      {/* User info & Sign out */}
      <div className="pt-4 border-t border-[#EAE3D4] space-y-3">
        {user && (
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-full bg-stone-900 text-stone-100 flex items-center justify-center font-medium text-xs border border-stone-700 shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-stone-900 truncate">{user.name}</p>
              <p className="text-[11px] text-stone-500 truncate">{user.email}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-stone-600 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4 text-stone-400 group-hover:text-rose-600" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block w-64 h-screen sticky top-0 shrink-0 z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
            onClick={onClose}
          />
          <div className="relative w-72 max-w-[80vw] h-full shadow-2xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
