import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, CheckCircle2, Clock, Sparkles, Plus, AlertCircle, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientBrief } from '@/lib/types';
import { Card, Button, Input, Textarea, Badge, Spinner } from '@/components/Ui';

function getStageDisplay(stage?: string): { label: string; variant: 'neutral' | 'primary' | 'warning' | 'success' } {
  switch (stage) {
    case 'IDEA': return { label: 'Concept & Angle', variant: 'neutral' };
    case 'SCRIPT': return { label: 'Script Drafting', variant: 'primary' };
    case 'INTERNAL_REVIEW': return { label: 'Internal Polish', variant: 'neutral' };
    case 'CLIENT_REVIEW': return { label: 'Sign-off Needed', variant: 'warning' };
    case 'SHOOTING': return { label: 'Shoot Production', variant: 'primary' };
    case 'RAW_FOOTAGE': return { label: 'Footage Uploaded', variant: 'neutral' };
    case 'EDITING': return { label: 'Video Editing', variant: 'primary' };
    case 'SMM_REVIEW':
    case 'FINAL_REVIEW': return { label: 'Quality Review', variant: 'neutral' };
    case 'CLIENT_FINAL_APPROVAL': return { label: 'Final Video Cut', variant: 'warning' };
    case 'SCHEDULE': return { label: 'Scheduled', variant: 'primary' };
    case 'PUBLISHED': return { label: 'Published Live', variant: 'success' };
    default: return { label: 'In Production', variant: 'neutral' };
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
    case 'EDITING': return 'Editing & Color';
    case 'SMM_REVIEW': return 'Social Lead Review';
    case 'FINAL_REVIEW': return 'Agency Final Polish';
    case 'CLIENT_FINAL_APPROVAL': return 'Final Sign-off';
    case 'SCHEDULE': return 'Scheduled to Post';
    case 'PUBLISHED': return 'Published Live';
    default: return 'Production';
  }
}

export function BriefsPage() {
  const [briefs, setBriefs] = useState<ClientBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [contentType, setContentType] = useState('REEL');
  const [targetPlatform, setTargetPlatform] = useState('INSTAGRAM');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBriefs = () => {
    setLoading(true);
    api.get('/briefs')
      .then((res) => setBriefs(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadBriefs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await api.post('/briefs', {
        title: title.trim(),
        objective: objective.trim() || undefined,
        contentType,
        targetPlatform,
        notes: notes.trim() || undefined,
      });
      setSuccess(true);
      setTitle('');
      setObjective('');
      setNotes('');
      setShowForm(false);
      loadBriefs();
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to submit brief.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Creative Requests & Briefs</h1>
          <p className="text-sm text-ink-2 mt-0.5">Submit new content ideas, upcoming product launches, or shoot requests</p>
        </div>

        <Button
          variant={showForm ? 'secondary' : 'primary'}
          onClick={() => setShowForm(!showForm)}
          icon={showForm ? undefined : <Plus size={16} />}
        >
          {showForm ? 'Cancel' : 'New Content Request'}
        </Button>
      </div>

      {success && (
        <Card className="p-4 bg-success-soft border-success/30 flex items-center gap-2.5 text-success-ink text-sm font-semibold animate-fade-in">
          <CheckCircle2 size={18} />
          <span>Brief submitted successfully! Our agency team has been notified.</span>
        </Card>
      )}

      {/* Brief Submission Form */}
      {showForm && (
        <Card className="p-6 border-line-strong space-y-4 animate-fade-in shadow-lift">
          <div className="flex items-center gap-2 text-sm font-bold text-ink uppercase tracking-wider border-b border-line pb-3">
            <Sparkles size={16} className="text-primary" /> Request New Creative Content
          </div>

          {error && (
            <div className="p-3 text-xs text-danger-ink bg-danger-soft rounded-xl border border-danger/20 flex items-center gap-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Content Title or Concept"
              placeholder="E.g., Diwali Festive Gift Box Reel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-2 mb-1.5">
                  Content Format
                </label>
                <select
                  value={contentType}
                  onChange={(e) => setContentType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="REEL">Instagram Reel</option>
                  <option value="POST">Static Post / Photo</option>
                  <option value="CAROUSEL">Educational Carousel</option>
                  <option value="STORY">Story Series</option>
                  <option value="SHORT">YouTube Short</option>
                  <option value="AD">Paid Ad Creative</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-2 mb-1.5">
                  Target Platform
                </label>
                <select
                  value={targetPlatform}
                  onChange={(e) => setTargetPlatform(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-line bg-surface text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="INSTAGRAM">Instagram</option>
                  <option value="YOUTUBE">YouTube</option>
                  <option value="FACEBOOK">Facebook</option>
                  <option value="LINKEDIN">LinkedIn</option>
                  <option value="MULTI">Cross-Platform</option>
                </select>
              </div>
            </div>

            <Textarea
              label="Goal & Key Message"
              placeholder="What should the viewer do or feel? E.g., Showcase the craft of our gold necklaces for the wedding season."
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
            />

            <Textarea
              label="Specific Notes & Instructions"
              placeholder="Mention product names, pricing, required hashtags, or reference links..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={submitting} icon={<Send size={15} />}>
                Submit to Agency
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Previously Submitted Briefs List */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-2">Your Submitted Briefs</h2>

        {loading ? (
          <div className="flex justify-center py-20"><Spinner size={32} /></div>
        ) : briefs.length === 0 ? (
          <Card className="p-8 text-center text-ink-3">
            <Send size={36} className="mx-auto mb-2 text-ink-3" />
            <h3 className="text-base font-bold text-ink">No briefs submitted yet</h3>
            <p className="text-xs text-ink-3 mt-1">Have an idea or upcoming promotion? Submit a request above!</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {briefs.map((b) => {
              const c = b.contentId;
              const stageInfo = c ? getStageDisplay(c.stage) : { label: b.status, variant: (b.status === 'ACCEPTED' ? 'success' : b.status === 'IN_REVIEW' ? 'warning' : 'neutral') as any };
              const progress = c?.progress ?? (b.status === 'ACCEPTED' ? 100 : 8);

              return (
                <Card key={b._id} className="p-5 space-y-3 hover:border-line-strong transition-all shadow-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                        {b.targetPlatform} • {b.contentType}
                      </span>
                      {c?.contentId && (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary-soft text-primary-ink">
                          {c.contentId}
                        </span>
                      )}
                      <Badge variant={stageInfo.variant}>
                        {stageInfo.label}
                      </Badge>
                    </div>
                    <span className="text-xs text-ink-3">
                      {new Date(b.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-ink">{b.title}</h3>
                    {b.objective && <p className="text-xs text-ink-2 mt-1 leading-relaxed">{b.objective}</p>}
                    {b.notes && (
                      <div className="text-xs text-ink-3 bg-surface-2 p-2.5 rounded-xl mt-2">
                        <span className="font-semibold text-ink-2">Notes: </span>{b.notes}
                      </div>
                    )}
                  </div>

                  {/* Production Workflow Tracker */}
                  <div className="pt-3 border-t border-line/60">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-semibold text-ink-2 flex items-center gap-1.5">
                        <Clock size={13} className="text-primary" /> Production Stage:
                      </span>
                      <span className="font-bold text-ink">
                        {c ? getStageDetailedName(c.stage) : 'In Agency Queue'} ({progress}%)
                      </span>
                    </div>

                    <div className="h-2 w-full rounded-full bg-line overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-emerald-500 transition-all duration-500"
                        style={{ width: `${Math.max(6, progress)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-1 text-xs text-ink-3">
                      <span>Submitted by {b.submittedBy?.name || 'You'}</span>
                      {c?.stage === 'CLIENT_REVIEW' || c?.stage === 'CLIENT_FINAL_APPROVAL' ? (
                        <Link to="/approvals">
                          <Button variant="primary" size="sm" icon={<ArrowRight size={13} />}>
                            Sign-off Now
                          </Button>
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
    </div>
  );
}
