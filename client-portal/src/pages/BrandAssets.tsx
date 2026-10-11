import { useEffect, useState } from 'react';
import { Download, Sparkles, FolderArchive, FileVideo, Palette, Type } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Spinner } from '@/components/Ui';

export function BrandAssetsPage() {
  const [data, setData] = useState<{ brand: any; masters: any[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/assets')
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, []);

  const fmtSize = (b: number) => {
    if (!b) return '0 MB';
    if (b > 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    return `${Math.round(b / 1e6)} MB`;
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Spinner size={32} /></div>;
  }

  const brand = data?.brand;
  const masters = data?.masters || [];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Brand Locker & Deliverables</h1>
        <p className="text-sm text-ink-2 mt-0.5">Download approved master videos, assets & view brand guidelines</p>
      </div>

      {/* Brand Kit Card */}
      <Card className="p-5 space-y-4 bg-gradient-to-br from-surface to-surface-2 border-line">
        <h2 className="text-sm font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles size={16} className="text-primary" /> Active Brand Identity
        </h2>

        {/* Colors */}
        {brand?.colors && brand.colors.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-ink-2 flex items-center gap-1.5 mb-2">
              <Palette size={14} /> Brand Colors
            </div>
            <div className="flex flex-wrap gap-2">
              {brand.colors.map((color: string, i: number) => (
                <div key={i} className="flex items-center gap-2 p-1.5 pr-3 rounded-xl bg-surface border border-line shadow-xs">
                  <span className="h-6 w-6 rounded-lg border border-line-strong shadow-xs" style={{ backgroundColor: color }} />
                  <span className="font-mono text-xs font-bold text-ink uppercase">{color}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fonts */}
        {brand?.fonts && brand.fonts.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-ink-2 flex items-center gap-1.5 mb-1.5">
              <Type size={14} /> Primary Typography
            </div>
            <div className="flex flex-wrap gap-2">
              {brand.fonts.map((f: string, i: number) => (
                <span key={i} className="px-3 py-1 rounded-lg bg-surface border border-line text-xs font-bold text-ink">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* High-Res Master Deliverables */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
          <FolderArchive size={15} /> Approved Deliverables ({masters.length})
        </h2>

        {masters.length === 0 ? (
          <Card className="p-8 text-center text-ink-3">
            <FileVideo size={36} className="mx-auto mb-2 text-ink-3" />
            <h3 className="text-base font-bold text-ink">No final exports yet</h3>
            <p className="text-xs text-ink-3 mt-1">Approved 4K/1080p final videos and photos will be archived here for direct download.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {masters.map((m) => (
              <Card key={m._id} className="p-3.5 flex items-center justify-between gap-3 hover:border-line-strong transition-all">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-primary">
                    <FileVideo size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink line-clamp-1">{m.fileName}</h3>
                    <div className="text-xs text-ink-3 mt-0.5">
                      <span>{fmtSize(m.size)}</span> • <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <a href={`/api/media/${m._id}/download`} download>
                  <Button variant="secondary" size="sm" icon={<Download size={14} />}>
                    Download
                  </Button>
                </a>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
