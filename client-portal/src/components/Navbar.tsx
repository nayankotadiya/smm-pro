import { Link, NavLink } from 'react-router-dom';
import { LogOut, Sparkles, Home, CheckSquare, Calendar, FolderArchive, PlusCircle } from 'lucide-react';
import { useAuth } from '@/store/auth';
import clsx from 'clsx';

export function Navbar() {
  const { user, brand, logout } = useAuth();

  const navLinks = [
    { label: 'Dashboard', to: '/', icon: Home, end: true },
    { label: 'Reviews', to: '/approvals', icon: CheckSquare },
    { label: 'Calendar', to: '/calendar', icon: Calendar },
    { label: 'Assets', to: '/assets', icon: FolderArchive },
    { label: 'New Brief', to: '/briefs', icon: PlusCircle },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 border border-line p-1 shadow-sm">
            <img
              src="/brand/bulletproof-shield.png"
              alt="Bulletproof Brands"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink text-base tracking-tight group-hover:text-primary transition-colors">
                {brand?.businessName || brand?.name || 'Bulletproof Brands'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-ink uppercase tracking-wider">
                <Sparkles size={10} /> Client Portal
              </span>
            </div>
            <p className="text-xs text-ink-3">BULLETPROOF SCRIPT MANAGEMENT SYSTEM</p>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1 bg-surface-2/60 p-1 rounded-xl border border-line">
          {navLinks.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all select-none',
                    isActive
                      ? 'bg-surface text-primary shadow-xs font-bold'
                      : 'text-ink-2 hover:text-ink hover:bg-surface/50'
                  )
                }
              >
                <Icon size={14} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-xs font-semibold text-ink">{user?.name}</span>
            <span className="text-[11px] text-ink-3">{user?.email}</span>
          </div>

          <button
            onClick={logout}
            title="Sign out"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface-2/60 text-ink-2 hover:bg-danger-soft hover:text-danger-ink hover:border-danger/30 transition-all"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
