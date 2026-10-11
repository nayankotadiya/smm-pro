import { NavLink, useLocation } from 'react-router-dom';
import { Home, CheckSquare, Calendar, FolderArchive, PlusCircle, MessageSquare } from 'lucide-react';
import { useNotifications } from '@/store/notifications';
import clsx from 'clsx';

export function BottomNav() {
  const location = useLocation();
  const { pendingApprovals, unreadChat } = useNotifications();

  // On approval detail view, hide bottom nav to make room for sticky decision action bar
  if (location.pathname.startsWith('/approvals/') && location.pathname !== '/approvals') {
    return null;
  }

  const items = [
    { label: 'Home', to: '/', icon: Home, end: true },
    { label: 'Reviews', to: '/approvals', icon: CheckSquare, badge: pendingApprovals > 0 ? pendingApprovals : null, badgeVariant: 'amber' },
    { label: 'Chat', to: '/chat', icon: MessageSquare, badge: unreadChat > 0 ? unreadChat : null, badgeVariant: 'blue' },
    { label: 'Calendar', to: '/calendar', icon: Calendar },
    { label: 'Assets', to: '/assets', icon: FolderArchive },
    { label: 'New Brief', to: '/briefs', icon: PlusCircle },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-surface/95 backdrop-blur-lg safe-b">
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
                  'flex flex-col items-center justify-center gap-1 py-1 px-2.5 rounded-xl transition-all select-none relative',
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
                      'flex items-center justify-center p-1 rounded-lg transition-transform relative',
                      isActive ? 'scale-110 bg-primary-soft' : ''
                    )}
                  >
                    <Icon size={19} className={isActive ? 'text-primary' : 'text-current'} />
                    {item.badge != null && (
                      <span
                        className={clsx(
                          'absolute -top-1 -right-1.5 min-w-4 h-4 px-1 flex items-center justify-center text-[9px] font-black rounded-full text-white shadow-xs',
                          item.badgeVariant === 'amber' ? 'bg-amber-500 animate-pulse' : 'bg-primary'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
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
