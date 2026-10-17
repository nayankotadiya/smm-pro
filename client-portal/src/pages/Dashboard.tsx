import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, Calendar, Sparkles, User, Video, FileText, ChevronRight, Send, MessageSquare, BellRing, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { PendingApproval, DashboardStats, UpcomingPost, ClientBrief } from '@/lib/types';
import { Card, Button, Badge, Spinner } from '@/components/Ui';
import { getClientPushState, enableClientPush } from '@/lib/push';
import { useNotifications } from '@/store/notifications';

function getStageDisplay(stage?: string): { label: string; variant: 'neutral' | 'primary' | 'warning' | 'success' } {
  switch (stage) {
    case 'IDEA':
      return { label: 'Concept & Angle', variant: 'neutral' };
    case 'SCRIPT':
      return { label: 'Script Drafting', variant: 'primary' };
    case 'INTERNAL_REVIEW':
      return { label: 'Internal Polish', variant: 'neutral' };
    case 'CLIENT_REVIEW':
      return { label: 'Sign-off Needed', variant: 'warning' };
    case 'SHOOTING':
      return { label: 'Shoot Production', variant: 'primary' };
    case 'RAW_FOOTAGE':
      return { label: 'Footage Uploaded', variant: 'neutral' };
    case 'GRAPHIC_DESIGN':
      return { label: 'Designing Graphics', variant: 'primary' };
    case 'EDITING':
      return { label: 'Video Editing', variant: 'primary' };
    case 'SMM_REVIEW':
    case 'FINAL_REVIEW':
      return { label: 'Quality Review', variant: 'neutral' };
    case 'CLIENT_FINAL_APPROVAL':
      return { label: 'Final Sign-off', variant: 'warning' };
    case 'SCHEDULE':
      return { label: 'Scheduled', variant: 'primary' };
    case 'PUBLISHED':
      return { label: 'Published Live', variant: 'success' };
    default:
      return { label: 'In Production', variant: 'neutral' };
  }
}

function getStageDetailedName(stage?: string): string {
  switch (stage) {
    case 'IDEA': return 'Concept & Angle';
    case 'SCRIPT': return 'Writing Script';
    case 'INTERNAL_REVIEW': return 'Internal Review';
    case 'CLIENT_REVIEW': return 'Waiting for Your Review';
    case 'SHOOTING': return 'Filming / Shooting';
    case 'RAW_FOOTAGE': return 'Raw Footage Ingest';
    case 'GRAPHIC_DESIGN': return 'Designing Graphics & Layout';
    case 'EDITING': return 'Editing & Color';
    case 'SMM_REVIEW': return 'Social Lead Review';
    case 'FINAL_REVIEW': return 'Agency Final Polish';
    case 'CLIENT_FINAL_APPROVAL': return 'Final Sign-off';
    case 'SCHEDULE': return 'Scheduled to Post';
    case 'PUBLISHED': return 'Published Live';
    default: return 'Production';
  }
}

export function DashboardPage() {
  const { user, brand } = useAuth();
  const { addToast } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingPost[]>([]);
  const [recentBriefs, setRecentBriefs] = useState<ClientBrief[]>([]);
  const [accountManager, setAccountManager] = useState<{ name: string; title: string } | null>(null);

  // Background Push status banner
  const [pushSubscribed, setPushSubscribed] = useState(true);
  const [enablingPush, setEnablingPush] = useState(false);

  useEffect(() => {
    api.get('/dashboard')
      .then((res) => {
        setApprovals(res.data.pendingApprovals || []);
        setStats(res.data.stats || null);
        setUpcoming(res.data.upcomingPosts || []);
        setRecentBriefs(res.data.recentBriefs || []);
        setAccountManager(res.data.accountManager || null);
      })
      .finally(() => setLoading(false));

    getClientPushState().then((s) => {
      setPushSubscribed(s.subscribed);
    });
  }, []);

  const handleEnablePush = async () => {
    setEnablingPush(true);
    try {
      const res = await enableClientPush();
      if (res.ok) {
        setPushSubscribed(true);
        addToast({
          title: 'Background Alerts Enabled',
          message: 'You will receive notifications even when the browser tab is closed.',
          type: 'success',
        });
      } else {
        addToast({
          title: 'Permission Notice',
          message: res.reason || 'Could not enable push.',
          type: 'warning',
        });
      }
    } finally {
      setEnablingPush(false);
    }
  };

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
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
            Welcome back, {user?.name?.split(' ')[0] || 'Client'} 👋
          </h1>
          <p className="text-xs sm:text-sm text-ink-2 mt-0.5 truncate">
            Here is what’s happening with <b>{brand?.businessName || brand?.name || 'your brand'}</b>’s content today.
          </p>
        </div>

        <Link to="/briefs" className="shrink-0">
          <Button variant="primary" size="md" icon={<Send size={15} />}>
            Request Content
          </Button>
        </Link>
      </div>

      {/* Background Push Alerts Promo (If not already enabled) */}
      {!pushSubscribed && (
        <Card className="p-4 sm:p-5 border-primary/30 bg-gradient-to-r from-primary-soft via-surface to-primary-soft/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-xs">
              <BellRing size={20} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-ink">Enable Background Push Alerts</h3>
              <p className="text-xs text-ink-2 mt-0.5">
                Receive instant notifications when new scripts or video cuts arrive for sign-off, even if this browser tab is closed.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleEnablePush}
              disabled={enablingPush}
              className="px-4 py-2 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <BellRing size={14} /> {enablingPush ? 'Enabling...' : 'Enable Alerts'}
            </button>
            <button
              onClick={() => setPushSubscribed(true)}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold text-ink-3 hover:text-ink transition-colors cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </Card>
      )}

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
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                      {item.type === 'CLIENT_SCRIPT' ? <FileText size={16} /> : <Video size={16} />}
                    </span>
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                        {item.type === 'CLIENT_SCRIPT' ? 'Script Review' : 'Final Video Cut'} • {item.version}
                      </span>
                      <h3 className="text-sm font-bold text-ink truncate mt-0.5">{item.title}</h3>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-amber-200/50 dark:border-amber-900/50">
                  <span className="text-[11px] text-ink-3 flex items-center gap-1">
                    <Clock size={12} /> Pending review
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
        <Card className="p-4 sm:p-6 bg-gradient-to-br from-surface to-surface-2 border-line">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Sparkles size={16} className="text-primary" /> Monthly Content Pace
              </h2>
              <p className="text-xs text-ink-3">Deliverables tracking for this cycle</p>
            </div>
            <div className="text-left sm:text-right">
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
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-4 border-t border-line/60">
            <div className="p-2 sm:p-3 rounded-xl bg-surface border border-line/50">
              <div className="text-[11px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400">Published</div>
              <div className="text-base sm:text-lg font-bold text-ink mt-0.5">{stats.publishedCount}</div>
            </div>
            <div className="p-2 sm:p-3 rounded-xl bg-surface border border-line/50">
              <div className="text-[11px] sm:text-xs font-semibold text-primary">In Pipeline</div>
              <div className="text-base sm:text-lg font-bold text-ink mt-0.5">{stats.inProductionCount}</div>
            </div>
            <div className="p-2 sm:p-3 rounded-xl bg-surface border border-line/50">
              <div className="text-[11px] sm:text-xs font-semibold text-purple-600 dark:text-purple-400">Creative Requests</div>
              <div className="text-base sm:text-lg font-bold text-ink mt-0.5">{stats.openRequestsCount ?? recentBriefs.length}</div>
            </div>
            <div className="p-2 sm:p-3 rounded-xl bg-surface border border-line/50">
              <div className="text-[11px] sm:text-xs font-semibold text-amber-600 dark:text-amber-400">Scheduled</div>
              <div className="text-base sm:text-lg font-bold text-ink mt-0.5">{stats.scheduledCount}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Content Requests & Production Pipeline Section */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
              <Sparkles size={15} className="text-primary" /> Creative Requests & Briefs
            </h2>
            {recentBriefs.length > 0 && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary-ink">
                {recentBriefs.length}
              </span>
            )}
          </div>
          <Link to="/briefs" className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
            View all briefs <ChevronRight size={13} />
          </Link>
        </div>

        {recentBriefs.length === 0 ? (
          <Card className="p-6 text-center border-dashed border-line-strong bg-surface-2/30">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink mb-3 shadow-xs">
              <Send size={20} />
            </div>
            <h3 className="text-sm font-bold text-ink">Have a new creative idea or campaign?</h3>
            <p className="text-xs text-ink-3 max-w-md mx-auto mt-1 mb-4">
              Submit a content brief for upcoming promotions, product launches, or event reels. Our agency team picks it up instantly and begins drafting.
            </p>
            <Link to="/briefs">
              <Button variant="primary" size="sm" icon={<Send size={13} />}>
                Request New Content
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recentBriefs.map((brief) => {
              const c = brief.contentId;
              const stageInfo = c ? getStageDisplay(c.stage) : { label: 'In Agency Review', variant: 'warning' as const };
              const progress = c?.progress ?? 8;

              return (
                <Card
                  key={brief._id}
                  className="p-4 hover:border-line-strong transition-all flex flex-col justify-between gap-3 shadow-xs"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-surface-2 text-ink-2">
                          {brief.targetPlatform} • {brief.contentType}
                        </span>
                        {c?.contentId && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary-soft text-primary-ink">
                            {c.contentId}
                          </span>
                        )}
                      </div>
                      <Badge variant={stageInfo.variant}>
                        {stageInfo.label}
                      </Badge>
                    </div>

                    <h3 className="text-sm font-bold text-ink truncate mt-1">
                      {brief.title}
                    </h3>

                    {brief.objective && (
                      <p className="text-xs text-ink-2 line-clamp-2 mt-1">
                        {brief.objective}
                      </p>
                    )}
                  </div>

                  {/* Workflow Pipeline Status Bar */}
                  <div className="pt-2 border-t border-line/60">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="font-semibold text-ink-2 flex items-center gap-1">
                        <Clock size={12} className="text-primary" /> Workflow Stage:
                      </span>
                      <span className="font-bold text-ink">
                        {c ? getStageDetailedName(c.stage) : 'Brief Received'} ({progress}%)
                      </span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.max(6, progress)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-2.5 pt-1 text-[11px] text-ink-3">
                      <span>Requested {new Date(brief.createdAt).toLocaleDateString()}</span>
                      {c?.stage === 'CLIENT_REVIEW' || c?.stage === 'CLIENT_FINAL_APPROVAL' ? (
                        <Link to="/approvals">
                          <span className="font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5">
                            Review Now <ArrowRight size={11} />
                          </span>
                        </Link>
                      ) : (
                        <span className="text-ink-3 font-medium">In Production Pipeline</span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

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
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary">
                    <Video size={18} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink truncate">{post.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-ink-3 flex-wrap">
                      <span className="font-medium text-ink-2 uppercase text-[10px] bg-surface-2 px-1.5 py-0.5 rounded shrink-0">
                        {post.platform || 'INSTAGRAM'}
                      </span>
                      {post.scheduledAt && (
                        <span className="truncate">Scheduled: {new Date(post.scheduledAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>

                <Badge variant={post.publishedAt ? 'success' : 'primary'} className="shrink-0">
                  {post.publishedAt ? 'Live' : 'Ready'}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Dedicated Account Manager */}
      {accountManager && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-line">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary-ink font-bold">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-ink-3">Your Dedicated Account Lead</div>
              <div className="text-sm font-bold text-ink truncate">{accountManager.name}</div>
              <div className="text-[11px] text-ink-2 truncate">{accountManager.title}</div>
            </div>
          </div>
          <Link to="/chat" className="shrink-0">
            <Button variant="primary" size="sm" icon={<MessageSquare size={14} />}>
              Chat with Lead
            </Button>
          </Link>
        </Card>
      )}
    </div>
  );
}
