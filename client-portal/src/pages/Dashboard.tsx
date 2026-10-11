import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Calendar, Sparkles, User, Video, FileText, ChevronRight, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { PendingApproval, DashboardStats, UpcomingPost } from '@/lib/types';
import { Card, Button, Badge, Spinner } from '@/components/Ui';

export function DashboardPage() {
  const { user, brand } = useAuth();
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingPost[]>([]);
  const [accountManager, setAccountManager] = useState<{ name: string; title: string } | null>(null);

  useEffect(() => {
    api.get('/dashboard')
      .then((res) => {
        setApprovals(res.data.pendingApprovals || []);
        setStats(res.data.stats || null);
        setUpcoming(res.data.upcomingPosts || []);
        setAccountManager(res.data.accountManager || null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Spinner size={32} />
      </div>
    );
  }

  const progressPct = stats && stats.totalThisMonth > 0
    ? Math.round((stats.publishedCount / stats.totalThisMonth) * 100)
    : 0;

  return (
    <div className="space-y-6 pb-20">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Welcome back, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-ink-2 mt-0.5">
            Here is what’s happening with <b>{brand?.businessName || brand?.name}</b>’s content today.
          </p>
        </div>

        <Link to="/briefs">
          <Button variant="primary" size="md" icon={<Send size={15} />}>
            Request Content
          </Button>
        </Link>
      </div>

      {/* Action Needed Card (Highest Priority) */}
      {approvals.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertCircle size={15} /> Needs Your Sign-off ({approvals.length})
            </h2>
            <Link to="/approvals" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
              View all <ChevronRight size={13} />
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {approvals.map((item) => (
              <Card
                key={item._id}
                className="border-amber-300/60 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/20 p-4 hover:shadow-lift transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      {item.type === 'CLIENT_SCRIPT' ? <FileText size={16} /> : <Video size={16} />}
                    </span>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        {item.type === 'CLIENT_SCRIPT' ? 'Script Review' : 'Final Video Cut'} • {item.version}
                      </span>
                      <h3 className="text-sm font-bold text-ink line-clamp-1">{item.title}</h3>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-amber-200/50 dark:border-amber-900/50">
                  <span className="text-[11px] text-ink-3 flex items-center gap-1">
                    <Clock size={12} /> Pending your review
                  </span>
                  <Link to={`/approvals/${item._id}`}>
                    <Button variant="primary" size="sm" icon={<ArrowRight size={13} />}>
                      Review Now
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Deliverable Pace Progress */}
      {stats && (
        <Card className="p-5 sm:p-6 bg-gradient-to-br from-surface to-surface-2 border-line">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Monthly Content Pace
              </h2>
              <p className="text-xs text-ink-3">Deliverables tracking for this cycle</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-extrabold text-ink">{stats.publishedCount}</span>
              <span className="text-xs text-ink-3 font-medium"> / {stats.totalThisMonth} Delivered</span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 w-full rounded-full bg-line overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-700"
              style={{ width: `${Math.max(5, progressPct)}%` }}
            />
          </div>

          {/* Metrics Pill Grid */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center pt-4 border-t border-line/60">
            <div className="p-2 rounded-xl bg-surface border border-line/50">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Published</div>
              <div className="text-lg font-bold text-ink mt-0.5">{stats.publishedCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-line/50">
              <div className="text-xs font-semibold text-primary">In Pipeline</div>
              <div className="text-lg font-bold text-ink mt-0.5">{stats.inProductionCount}</div>
            </div>
            <div className="p-2 rounded-xl bg-surface border border-line/50">
              <div className="text-xs font-semibold text-amber-600 dark:text-amber-400">Scheduled</div>
              <div className="text-lg font-bold text-ink mt-0.5">{stats.scheduledCount}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Upcoming Posts Schedule */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
            <Calendar size={15} /> Upcoming Posts
          </h2>
          <Link to="/calendar" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            Open Calendar <ChevronRight size={13} />
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <Card className="p-6 text-center text-ink-3 text-xs">
            No scheduled posts queued right now. New content will appear here once approved.
          </Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map((post) => (
              <Card key={post._id} className="p-3.5 flex items-center justify-between gap-3 hover:border-line-strong transition-all">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary">
                    <Video size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink line-clamp-1">{post.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-ink-3">
                      <span className="font-medium text-ink-2 uppercase text-[10px] bg-surface-2 px-1.5 py-0.5 rounded">
                        {post.platform || 'INSTAGRAM'}
                      </span>
                      {post.scheduledAt && (
                        <span>Scheduled: {new Date(post.scheduledAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                <Badge variant={post.publishedAt ? 'success' : 'primary'}>
                  {post.publishedAt ? 'Live' : 'Ready'}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Dedicated Account Manager */}
      {accountManager && (
        <Card className="p-4 flex items-center justify-between gap-4 border-line">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink font-bold">
              <User size={20} />
            </div>
            <div>
              <div className="text-xs font-medium text-ink-3">Your Dedicated Account Lead</div>
              <div className="text-sm font-bold text-ink">{accountManager.name}</div>
              <div className="text-[11px] text-ink-2">{accountManager.title}</div>
            </div>
          </div>
          <Link to="/briefs">
            <Button variant="secondary" size="sm">
              Contact Agency
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
