import React, { useEffect, useState } from 'react';
import { Send, CheckCircle2, Clock, Sparkles, Plus, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { ClientBrief } from '@/lib/types';
import { Card, Button, Input, Textarea, Badge, Spinner } from '@/components/Ui';

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
            {briefs.map((b) => (
              <Card key={b._id} className="p-4 space-y-2 hover:border-line-strong transition-all">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      {b.targetPlatform} • {b.contentType}
                    </span>
                    <Badge variant={b.status === 'ACCEPTED' ? 'success' : b.status === 'IN_REVIEW' ? 'warning' : 'neutral'}>
                      {b.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-ink-3">
                    {new Date(b.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-ink">{b.title}</h3>
                {b.objective && <p className="text-xs text-ink-2 line-clamp-2">{b.objective}</p>}
                {b.notes && (
                  <p className="text-xs text-ink-3 bg-surface-2 p-2 rounded-lg line-clamp-1">
                    Notes: {b.notes}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
