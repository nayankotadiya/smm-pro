import { useEffect, useState } from 'react';
import { Calendar as CalendarIcon, Grid, List, Video, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Badge, Spinner } from '@/components/Ui';

export function ContentCalendarPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');

  useEffect(() => {
    api.get('/calendar')
      .then((res) => setItems(res.data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Content Schedule</h1>
          <p className="text-sm text-ink-2 mt-0.5">Planned, scheduled, and published content calendar</p>
        </div>

        {/* View Switcher */}
        <div className="flex rounded-xl bg-surface-2 p-1 border border-line self-start sm:self-auto">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === 'list' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <List size={14} /> Schedule List
          </button>
          <button
            onClick={() => setView('grid')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === 'grid' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'
            }`}
          >
            <Grid size={14} /> Grid Preview
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner size={32} /></div>
      ) : items.length === 0 ? (
        <Card className="p-8 text-center text-ink-3">
          <CalendarIcon size={36} className="mx-auto mb-2 text-ink-3" />
          <h3 className="text-base font-bold text-ink">No scheduled posts</h3>
          <p className="text-xs text-ink-3 mt-1">Once posts are approved, they will appear on your schedule.</p>
        </Card>
      ) : view === 'list' ? (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4 flex items-center justify-between gap-3 hover:border-line-strong transition-all">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary font-bold">
                  <Video size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      {item.platform || 'INSTAGRAM'} • {item.type}
                    </span>
                    {item.isPublished ? (
                      <Badge variant="success">Published</Badge>
                    ) : item.isScheduled ? (
                      <Badge variant="warning">Scheduled</Badge>
                    ) : (
                      <Badge variant="neutral">In Production</Badge>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-ink mt-0.5">{item.title}</h3>
                  {item.date && (
                    <div className="flex items-center gap-1 text-xs text-ink-3 mt-1">
                      <Clock size={12} />
                      <span>{new Date(item.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Instagram 3-Column Visual Grid Mockup */
        <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="aspect-square rounded-2xl bg-surface-2 border border-line p-3 flex flex-col justify-between hover:shadow-card transition-all cursor-pointer group"
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-ink-3">#{idx + 1}</span>
                <span className="text-[9px] font-bold uppercase bg-surface px-1.5 py-0.5 rounded border border-line">
                  {item.type}
                </span>
              </div>
              <div>
                <p className="text-xs font-bold text-ink line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title}
                </p>
                <div className="text-[10px] text-ink-3 mt-1">
                  {item.isPublished ? '✓ Live' : item.isScheduled ? '🕒 Ready' : '⚙️ Drafting'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
