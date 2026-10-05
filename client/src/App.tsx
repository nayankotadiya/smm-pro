import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, useCan } from '@/store/auth';
import { refreshSession } from '@/lib/api';
import AppLayout from '@/layouts/AppLayout';
import { Login, ForgotPassword, ResetPassword } from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import { Empty, Spinner } from '@/components/ui';

const PublicApproval = lazy(() => import('@/pages/PublicApproval'));
const ContentDetail = lazy(() => import('@/pages/ContentDetail'));
const Chat = lazy(() => import('@/pages/Chat'));
const Calendar = lazy(() => import('@/pages/Calendar'));
const Approvals = lazy(() => import('@/pages/Approvals'));
const MediaLibrary = lazy(() => import('@/pages/Media'));
const Settings = lazy(() => import('@/pages/Settings'));
const L = <T extends Record<string, any>>(load: () => Promise<T>, name: keyof T) => lazy(() => load().then((m) => ({ default: m[name] })));
const work = () => import('@/pages/Work'); const list = () => import('@/pages/ContentList'); const clients = () => import('@/pages/Clients'); const misc = () => import('@/pages/Misc');
const MyWork = L(work, 'MyWork'), Tasks = L(work, 'Tasks'), TaskDetail = L(work, 'TaskDetail'), Blocked = L(work, 'Blocked'), ChangesRequested = L(work, 'ChangesRequested');
const ContentList = L(list, 'ContentList'), Scripts = L(list, 'Scripts'), Shooting = L(list, 'Shooting'), Editing = L(list, 'Editing');
const Clients = L(clients, 'Clients'), ClientDetail = L(clients, 'ClientDetail');
const Reminders = L(misc, 'Reminders'), Automation = L(misc, 'Automation'), Team = L(misc, 'Team'), TeamMember = L(misc, 'TeamMember'), Reports = L(misc, 'Reports'), Notifications = L(misc, 'Notifications'), Activity = L(misc, 'Activity');

const Fallback = () => <div className="flex justify-center py-16"><Spinner /></div>;
function Protected() {
  const { user, ready } = useAuth(); const loc = useLocation();
  if (!ready) return <div className="flex h-app items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <AppLayout />;
}
function Need({ perm, children }: { perm: string; children: JSX.Element }) { const can = useCan(); return can(perm) ? children : <Empty title="You do not have access to this page" hint="Ask an admin if you need it." />; }

export default function App() {
  const setReady = useAuth((s) => s.setReady); const loc = useLocation();
  const isPublic = loc.pathname.startsWith('/approval/');
  // restore the session from the httpOnly refresh cookie; never attempted on the client approval page
  useEffect(() => { if (isPublic) { setReady(); return; } refreshSession().finally(setReady); }, []); // eslint-disable-line
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/approval/:token" element={<PublicApproval />} />
        <Route path="/login" element={<Login />} /><Route path="/forgot-password" element={<ForgotPassword />} /><Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<Protected />}>
          <Route element={<Suspense fallback={<Fallback />}><Outlet /></Suspense>}>
            <Route index element={<Dashboard />} />
            <Route path="my-work" element={<MyWork />} />
            <Route path="clients" element={<Need perm="clients.read"><Clients /></Need>} /><Route path="clients/:id" element={<Need perm="clients.read"><ClientDetail /></Need>} />
            <Route path="content" element={<ContentList />} /><Route path="content/:id" element={<ContentDetail />} />
            <Route path="scripts" element={<Scripts />} /><Route path="shooting" element={<Shooting />} /><Route path="editing" element={<Editing />} />
            <Route path="approvals" element={<Approvals />} />
            <Route path="tasks" element={<Tasks />} /><Route path="tasks/:id" element={<TaskDetail />} />
            <Route path="blocked" element={<Blocked />} /><Route path="changes-requested" element={<ChangesRequested />} />
            <Route path="calendar" element={<Calendar />} /><Route path="media" element={<MediaLibrary />} />
            <Route path="chat" element={<Chat />} /><Route path="chat/:roomId" element={<Chat />} />
            <Route path="automation" element={<Need perm="dashboard.org"><Automation /></Need>} />
            <Route path="reminders" element={<Reminders />} />
            <Route path="team" element={<Team />} /><Route path="team/:id" element={<TeamMember />} />
            <Route path="reports" element={<Need perm="reports.view"><Reports /></Need>} />
            <Route path="notifications" element={<Notifications />} /><Route path="activity" element={<Activity />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Empty title="Page not found" />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
