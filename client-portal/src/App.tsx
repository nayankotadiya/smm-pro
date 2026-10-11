import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { ToastsContainer } from '@/components/Toasts';
import { Spinner } from '@/components/Ui';
import { useNotifications } from '@/store/notifications';
import { api } from '@/lib/api';

const AuthPage = lazy(() => import('@/pages/Auth').then((m) => ({ default: m.AuthPage })));
const DashboardPage = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const ApprovalsPage = lazy(() => import('@/pages/Approvals').then((m) => ({ default: m.ApprovalsPage })));
const ContentCalendarPage = lazy(() => import('@/pages/ContentCalendar').then((m) => ({ default: m.ContentCalendarPage })));
const BrandAssetsPage = lazy(() => import('@/pages/BrandAssets').then((m) => ({ default: m.BrandAssetsPage })));
const BriefsPage = lazy(() => import('@/pages/Briefs').then((m) => ({ default: m.BriefsPage })));
const ChatPage = lazy(() => import('@/pages/Chat').then((m) => ({ default: m.ChatPage })));

function MagicVerify() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    api.get(`/auth/magic/verify/${token}`)
      .then((res) => {
        login(res.data.token, res.data.user);
        navigate('/');
      })
      .catch(() => navigate('/login'));
  }, [token, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size={32} />
    </div>
  );
}

function ProtectedLayout() {
  const { user, ready } = useAuth();
  const location = useLocation();
  const { initRealtime, clearUnreadChat } = useNotifications();

  useEffect(() => {
    if (user) {
      initRealtime();
    }
  }, [user, initRealtime]);

  useEffect(() => {
    if (location.pathname.startsWith('/chat')) {
      clearUnreadChat();
    }
  }, [location.pathname, clearUnreadChat]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <Spinner size={32} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <ToastsContainer />
      <Navbar />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-12">
        <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
          <Routes>
            <Route index element={<DashboardPage />} />
            <Route path="approvals" element={<ApprovalsPage />} />
            <Route path="approvals/:id" element={<ApprovalsPage />} />
            <Route path="calendar" element={<ContentCalendarPage />} />
            <Route path="assets" element={<BrandAssetsPage />} />
            <Route path="briefs" element={<BriefsPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const { fetchProfile } = useAuth();

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-canvas"><Spinner size={32} /></div>}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/auth/magic" element={<MagicVerify />} />
        <Route path="/*" element={<ProtectedLayout />} />
      </Routes>
    </Suspense>
  );
}
