import { Menu, Plus, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button.js';
import { useAuth } from '../../hooks/useAuth.js';

interface NavbarProps {
  onToggleSidebar: () => void;
}

export function Navbar({ onToggleSidebar }: NavbarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#FAF8F5]/85 backdrop-blur-md border-b border-[#ECE5D8] px-4 sm:px-6 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="md:hidden p-2 text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
          aria-label="Toggle navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#1C1917] flex items-center justify-center text-[#E5D7C0] shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="font-serif font-semibold tracking-tight text-stone-900 text-sm hidden sm:inline-block">
              Wedding AI Photo Finder
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#9C7D4F] font-semibold block leading-none">
              Penta Prizm · Photographer Suite
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate('/events/new')}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          <span className="hidden sm:inline">Create Wedding</span>
          <span className="sm:hidden">New</span>
        </Button>

        {user && (
          <div className="hidden lg:flex items-center gap-2 pl-3 border-l border-stone-200">
            <div className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center font-semibold text-xs border border-stone-300">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left text-xs">
              <span className="font-medium text-stone-800 block truncate max-w-[120px]">{user.name}</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
