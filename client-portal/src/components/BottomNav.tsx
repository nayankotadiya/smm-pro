import { NavLink } from 'react-router-dom';
import { Home, CheckSquare, Calendar, FolderArchive, PlusCircle } from 'lucide-react';
import clsx from 'clsx';

export function BottomNav() {
  const items = [
    { label: 'Home', to: '/', icon: Home, end: true },
    { label: 'Reviews', to: '/approvals', icon: CheckSquare },
    { label: 'Calendar', to: '/calendar', icon: Calendar },
    { label: 'Assets', to: '/assets', icon: FolderArchive },
    { label: 'New Brief', to: '/briefs', icon: PlusCircle },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur-lg safe-b">
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center justify-center gap-1 py-1 px-3 rounded-xl transition-all select-none',
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-ink-3 hover:text-ink font-medium'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={clsx(
                      'flex items-center justify-center p-1 rounded-lg transition-transform',
                      isActive ? 'scale-110 bg-primary-soft' : ''
                    )}
                  >
                    <Icon size={20} className={isActive ? 'text-primary' : 'text-current'} />
                  </div>
                  <span className="text-[11px] tracking-tight">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
