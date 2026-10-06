import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { LayoutDashboard, Clapperboard, CheckSquare, MessageSquare, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { useUI } from '@/store/ui';

export function MobileBottomNav() {
  const loc = useLocation();
  const { setSidebar, sidebar } = useUI();
  const unread = useQuery({ queryKey: ['chat-unread'], queryFn: () => get('/chat/unread-count') });
  const appr = useQuery({ queryKey: ['approvals', 'counts'], queryFn: () => get('/approvals/counts') });
  const pendingApprovals = appr.data?.mine || 0;

  // Hide bottom bar when inside a specific chat room or when sidebar is open on mobile
  const isInsideChatRoom = loc.pathname.startsWith('/chat/') && loc.pathname !== '/chat';
  if (isInsideChatRoom || sidebar) return null;

  const items = [
    { to: '/', label: 'Home', icon: LayoutDashboard },
    { to: '/content', label: 'Content', icon: Clapperboard },
    { to: '/tasks', label: 'Tasks', icon: CheckSquare },
    { to: '/chat', label: 'Chat', icon: MessageSquare, badge: unread.data?.count },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-line/70 bg-surface/92 px-2 pt-1.5 pb-[max(0.6rem,calc(env(safe-area-inset-bottom)+0.25rem))] backdrop-blur-2xl backdrop-saturate-150 lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)]"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            clsx(
              'relative flex flex-1 flex-col items-center justify-center py-1 text-center transition-all duration-200 active:scale-95',
              isActive ? 'text-primary font-bold' : 'text-ink-2 hover:text-ink font-medium'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <item.icon
                  size={20}
                  strokeWidth={isActive ? 2.5 : 1.9}
                  className={clsx(
                    'transition-transform duration-200',
                    isActive ? 'scale-110 text-primary drop-shadow-[0_2px_8px_rgba(124,58,237,0.4)]' : ''
                  )}
                />
                {!!item.badge && item.badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-rose-500 px-1 text-[10px] font-bold text-white shadow-xs">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] leading-tight tracking-tight">
                {item.label}
              </span>
              {isActive && (
                <span
                  aria-hidden
                  className="absolute bottom-0 h-0.5 w-6 rounded-full bg-primary shadow-[0_0_8px_rgba(124,58,237,0.8)]"
                />
              )}
            </>
          )}
        </NavLink>
      ))}

      {/* Menu / More button */}
      <button
        type="button"
        onClick={() => setSidebar(true)}
        className="relative flex flex-1 flex-col items-center justify-center py-1 text-center text-ink-2 hover:text-ink font-medium transition-all duration-200 active:scale-95"
      >
        <div className="relative">
          <Menu size={20} strokeWidth={1.9} />
          {pendingApprovals > 0 && (
            <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-surface animate-pulse" />
          )}
        </div>
        <span className="mt-1 text-[11px] leading-tight tracking-tight">More</span>
      </button>
    </nav>
  );
}
