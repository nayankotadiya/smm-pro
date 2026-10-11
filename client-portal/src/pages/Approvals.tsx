import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Check, RotateCcw, Play, Clock, ArrowLeft, MessageSquare, Video, FileText, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { ApprovalDetail } from '@/lib/types';
import { Card, Button, Badge, Spinner, Textarea } from '@/components/Ui';

export function ApprovalsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // List state
  const [list, setList] = useState<any[]>([]);
  const [listLoading, setListLoading] = useState(true);

  // Detail state
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Video and Comments
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [useTimestamp, setUseTimestamp] = useState(true);
  const [comments, setComments] = useState<Array<{ comment: string; timestampSec?: number }>>([]);
  const [mode, setMode] = useState<'view' | 'changes' | 'confirm'>('view');
  const [submitting, setSubmitting] = useState(false);
  const [actionDone, setActionDone] = useState<'APPROVED' | 'CHANGES_REQUESTED' | null>(null);

  // Load List
  useEffect(() => {
    if (!id) {
      setListLoading(true);
      api.get('/approvals')
        .then((res) => setList(res.data))
        .finally(() => setListLoading(false));
    }
  }, [id]);

  // Load Detail
  useEffect(() => {
    if (id) {
      setDetailLoading(true);
      setError(null);
      setMode('view');
      setComments([]);
      setCommentText('');
      setActionDone(null);

      api.get(`/approvals/${id}`)
        .then((res) => {
          setDetail(res.data);
          if (res.data.decided) {
            setActionDone(res.data.status);
          }
        })
        .catch((err) => {
          setError(err.response?.data?.error?.message || 'Failed to load review item.');
        })
        .finally(() => setDetailLoading(false));
    }
  }, [id]);

  const addComment = () => {
    if (!commentText.trim()) return;
    const time = detail?.hasVideo && useTimestamp ? Math.floor(currentTime) : undefined;
    setComments((prev) => [...prev, { comment: commentText.trim(), timestampSec: time }]);
    setCommentText('');
  };

  const removeComment = (idx: number) => {
    setComments((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitDecision = async (decision: 'APPROVE' | 'CHANGES') => {
    if (!detail) return;
    const finalComments = decision === 'CHANGES' && commentText.trim()
      ? [...comments, { comment: commentText.trim(), timestampSec: detail.hasVideo && useTimestamp ? Math.floor(currentTime) : undefined }]
      : comments;

    if (decision === 'CHANGES' && !finalComments.length) {
      setError('Please add at least one change request note.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post(`/approvals/${detail._id}/decision`, {
        decision,
        comments: decision === 'CHANGES' ? finalComments : undefined,
      });
      setActionDone(res.data.status);
      setMode('view');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to record decision.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // ----------------------------------------------------
  // LIST VIEW
  // ----------------------------------------------------
  if (!id) {
    return (
      <div className="space-y-6 pb-20">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Reviews & Sign-offs</h1>
          <p className="text-sm text-ink-2 mt-0.5">Approve scripts and videos ready for your brand</p>
        </div>

        {listLoading ? (
          <div className="flex justify-center py-20"><Spinner size={32} /></div>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center text-ink-3">
            <CheckCircle2 size={36} className="mx-auto text-success mb-2" />
            <h3 className="text-base font-bold text-ink">All caught up!</h3>
            <p className="text-xs text-ink-3 mt-1">No items currently waiting for your review.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {list.map((item) => (
              <Link key={item._id} to={`/approvals/${item._id}`}>
                <Card className="p-4 hover:shadow-lift hover:border-line-strong transition-all flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-primary">
                      {item.type === 'CLIENT_SCRIPT' ? <FileText size={20} /> : <Video size={20} />}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary uppercase">
                          {item.type === 'CLIENT_SCRIPT' ? 'Script' : 'Video Cut'} • {item.version}
                        </span>
                        {item.status === 'APPROVED' && <Badge variant="success">Approved</Badge>}
                        {item.status === 'CHANGES_REQUESTED' && <Badge variant="warning">Changes Sent</Badge>}
                        {['SENT', 'DELIVERED', 'OPENED', 'WAITING_FOR_CLIENT', 'PENDING'].includes(item.status) && (
                          <Badge variant="primary">Needs Action</Badge>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-ink mt-0.5">{item.title}</h3>
                    </div>
                  </div>

                  <Button variant="secondary" size="sm">
                    Open
                  </Button>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ----------------------------------------------------
  // DETAIL REVIEW ROOM VIEW
  // ----------------------------------------------------
  if (detailLoading) {
    return <div className="flex justify-center py-24"><Spinner size={36} /></div>;
  }

  if (error && !detail) {
    return (
      <Card className="p-8 text-center max-w-lg mx-auto mt-10">
        <h2 className="text-lg font-bold text-danger">Review Unavailable</h2>
        <p className="text-xs text-ink-3 mt-1">{error}</p>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => navigate('/approvals')}>
          Back to Reviews
        </Button>
      </Card>
    );
  }

  if (!detail) return null;

  return (
    <div className="space-y-6 pb-36">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => navigate('/approvals')}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink transition-colors"
        >
          <ArrowLeft size={16} /> All Reviews
        </button>

        <Badge variant={actionDone === 'APPROVED' ? 'success' : actionDone === 'CHANGES_REQUESTED' ? 'warning' : 'primary'}>
          {actionDone === 'APPROVED' ? 'Signed Off' : actionDone === 'CHANGES_REQUESTED' ? 'Revision Requested' : 'Awaiting Your Review'}
        </Badge>
      </div>

      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-primary">
          {detail.type === 'CLIENT_SCRIPT' ? 'Script for Review' : 'Video Cut for Sign-off'} • {detail.version}
        </div>
        <h1 className="text-2xl font-extrabold text-ink mt-1 tracking-tight">{detail.title}</h1>
      </div>

      {/* Celebratory Approved Banner */}
      {actionDone === 'APPROVED' && (
        <Card className="p-6 bg-success-soft border-success/30 text-center animate-fade-in">
          <CheckCircle2 size={40} className="mx-auto text-success mb-2" />
          <h2 className="text-lg font-bold text-success-ink">Approved & Signed Off!</h2>
          <p className="text-xs text-success-ink mt-1">
            Thank you! Your approval of <b>{detail.version}</b> has been recorded. Our agency team has been notified to schedule this content.
          </p>
        </Card>
      )}

      {/* Revision Sent Banner */}
      {actionDone === 'CHANGES_REQUESTED' && (
        <Card className="p-6 bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800 text-center animate-fade-in">
          <RotateCcw size={40} className="mx-auto text-amber-600 mb-2" />
          <h2 className="text-lg font-bold text-amber-800 dark:text-amber-300">Changes Sent to Agency</h2>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Your feedback and timestamp notes on <b>{detail.version}</b> were received. Our creative team will update the content and share a revised version.
          </p>
        </Card>
      )}

      {/* VIDEO PLAYER (If Video) */}
      {detail.hasVideo && (
        <section className="space-y-2">
          <div className="relative rounded-2xl overflow-hidden bg-black shadow-lift aspect-video flex items-center justify-center">
            <video
              ref={videoRef}
              controls
              playsInline
              preload="metadata"
              src={detail.videoUrl}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              className="w-full h-full object-contain"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-ink-3 px-1">
            <span className="font-mono font-medium">Time: {fmtTime(currentTime)}</span>
            <span>HD Direct Stream</span>
          </div>
        </section>
      )}

      {/* SCRIPT VIEWER (If Script) */}
      {detail.script && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={16} className="text-primary" /> Full Script Breakdown
            </h2>
            {detail.script.duration && <span className="text-xs text-ink-3 font-medium">Target Duration: {detail.script.duration}</span>}
          </div>

          {/* Hook */}
          {detail.script.hook && (
            <div className="p-3.5 rounded-xl bg-primary-soft/60 border border-primary/20">
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary">Hook (First 3 Seconds)</div>
              <p className="text-sm font-semibold text-ink mt-1">{detail.script.hook}</p>
            </div>
          )}

          {/* Scenes */}
          {detail.script.scenes && detail.script.scenes.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-ink-2">Scene by Scene</div>
              {detail.script.scenes.map((scene, i) => (
                <div key={i} className="p-3.5 rounded-xl bg-surface-2 border border-line space-y-1.5">
                  <div className="text-[11px] font-bold text-ink-3 uppercase">{scene.title || `Scene ${i + 1}`}</div>
                  {scene.dialogue && <p className="text-sm text-ink font-medium leading-relaxed">{scene.dialogue}</p>}
                  {scene.visual && (
                    <p className="text-xs text-primary font-medium italic">[Visual Direction: {scene.visual}]</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Full body fallback */}
          {!detail.script.scenes?.length && detail.script.body && (
            <div className="p-4 rounded-xl bg-surface-2 text-sm leading-relaxed whitespace-pre-wrap text-ink">
              {detail.script.body}
            </div>
          )}

          {/* CTA */}
          {detail.script.cta && (
            <div className="p-3.5 rounded-xl bg-surface-2 border border-line">
              <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">Call to Action (CTA)</div>
              <p className="text-sm font-semibold text-ink mt-0.5">{detail.script.cta}</p>
            </div>
          )}
        </Card>
      )}

      {/* Caption & Hashtags preview */}
      {(detail.caption || detail.hashtags) && (
        <Card className="p-5 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-ink-3">Social Copy & Hashtags</div>
          {detail.caption && (
            <p className="text-sm text-ink whitespace-pre-wrap font-medium">{detail.caption}</p>
          )}
          {detail.hashtags && (
            <p className="text-xs font-semibold text-primary">{detail.hashtags}</p>
          )}
        </Card>
      )}

      {/* Previous / Existing Feedback notes */}
      {detail.feedback && detail.feedback.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">Feedback Notes History</h3>
          <div className="space-y-2">
            {detail.feedback.map((fb, idx) => (
              <Card key={idx} className="p-3 text-xs flex items-start gap-3 bg-surface-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-surface text-ink-2 shrink-0 font-mono text-[10px]">
                  {fb.timestampSec != null ? fmtTime(fb.timestampSec) : 'Note'}
                </span>
                <div>
                  <span className="font-semibold text-ink">{fb.authorName}:</span> {fb.comment}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Interactive Change Request Composer (when mode === 'changes') */}
      {mode === 'changes' && !actionDone && (
        <Card className="p-5 border-amber-300 dark:border-amber-800 space-y-4 animate-fade-in shadow-lift">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <MessageSquare size={16} className="text-amber-500" /> What changes are needed?
            </h3>
            {detail.hasVideo && (
              <span className="text-xs font-mono font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded-lg">
                Current Time: {fmtTime(currentTime)}
              </span>
            )}
          </div>

          <Textarea
            placeholder={detail.hasVideo ? 'E.g., At 0:14 change the headline text color to gold, and remove background music volume.' : 'Describe the edits or changes you would like our team to make...'}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
          />

          <div className="flex items-center justify-between gap-2">
            {detail.hasVideo && (
              <label className="flex items-center gap-2 text-xs font-medium text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useTimestamp}
                  onChange={(e) => setUseTimestamp(e.target.checked)}
                  className="rounded border-line text-primary focus:ring-primary"
                />
                Attach video timestamp ({fmtTime(currentTime)})
              </label>
            )}

            <Button variant="secondary" size="sm" onClick={addComment} disabled={!commentText.trim()}>
              Add Note
            </Button>
          </div>

          {/* Pending notes list */}
          {comments.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-line">
              <div className="text-[11px] font-bold text-ink-3 uppercase">Queued Notes ({comments.length})</div>
              {comments.map((c, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-xl bg-surface-2 text-xs">
                  <span>
                    {c.timestampSec != null && <b className="font-mono text-primary mr-1.5">[{fmtTime(c.timestampSec)}]</b>}
                    {c.comment}
                  </span>
                  <button onClick={() => removeComment(i)} className="text-danger hover:underline text-[11px] font-bold">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* STICKY BOTTOM ACTION BAR */}
      {!actionDone && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 backdrop-blur-lg p-3 safe-b shadow-pop">
          <div className="max-w-xl mx-auto flex items-center gap-3">
            {mode === 'view' && (
              <>
                <Button
                  variant="success"
                  size="lg"
                  className="flex-1 font-bold shadow-md"
                  icon={<Check size={18} />}
                  onClick={() => setMode('confirm')}
                >
                  Approve & Sign Off
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  className="flex-1 font-bold"
                  icon={<RotateCcw size={16} />}
                  onClick={() => setMode('changes')}
                >
                  Request Changes
                </Button>
              </>
            )}

            {mode === 'confirm' && (
              <div className="w-full flex items-center gap-2">
                <Button
                  variant="success"
                  size="lg"
                  className="flex-1 font-bold"
                  loading={submitting}
                  onClick={() => submitDecision('APPROVE')}
                >
                  Confirm Sign-off
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => setMode('view')}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            )}

            {mode === 'changes' && (
              <div className="w-full flex items-center gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1 font-bold"
                  loading={submitting}
                  onClick={() => submitDecision('CHANGES')}
                >
                  Send Changes ({comments.length + (commentText.trim() ? 1 : 0)})
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => setMode('view')}
                  disabled={submitting}
                >
                  Back
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
