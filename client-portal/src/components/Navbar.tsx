import { Link } from 'react-router-dom';
import { LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '@/store/auth';

export function Navbar() {
  const { user, brand, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-line bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-white shadow-sm font-bold text-lg tracking-wider">
            {brand?.name ? brand.name.slice(0, 2).toUpperCase() : 'SP'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-ink text-base tracking-tight group-hover:text-primary transition-colors">
                {brand?.businessName || brand?.name || 'Client Portal'}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-primary-soft px-2 py-0.5 text-[10px] font-bold text-primary-ink uppercase tracking-wider">
                <Sparkles size={10} /> Brand Portal
              </span>
            </div>
            <p className="text-xs text-ink-3">Managed by SMM PRO</p>
          </div>
        </Link>

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
