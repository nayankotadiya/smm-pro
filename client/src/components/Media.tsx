import { useEffect, useRef, useState, ChangeEvent, ReactNode, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download, ExternalLink, Play, Pause, FileText, Film, Image as ImageIcon,
  Music, Upload, Camera, MessageSquarePlus, X, ZoomIn, File,
} from 'lucide-react';
import { Button, Modal, Badge, Spinner, Textarea } from './ui';
import { fmtSize, fmtDateTime, fmtTs } from '@/lib/format';
import { mediaLinks, startUpload } from '@/lib/upload';
import { get, post, errMsg } from '@/lib/api';
import { toast } from '@/store/ui';

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic'];
const VID_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
const AUD_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

// ─── Mime helpers ─────────────────────────────────────────────────────────────
export const isImg  = (m = '', name = '') => m.startsWith('image/') || IMG_EXTS.some((x) => (name || '').toLowerCase().endsWith(x));
export const isVid  = (m = '', name = '') => m.startsWith('video/') || VID_EXTS.some((x) => (name || '').toLowerCase().endsWith(x));
export const isAud  = (m = '', name = '') => m.startsWith('audio/') || AUD_EXTS.some((x) => (name || '').toLowerCase().endsWith(x));
export const isPDF  = (m = '', name = '') => m === 'application/pdf' || (name || '').toLowerCase().endsWith('.pdf');

/** Legacy icon used in tables and inline text (no background) */
export const fileIcon = (mime = '', name = '') =>
  isVid(mime, name) ? <Film size={18} /> : isImg(mime, name) ? <ImageIcon size={18} /> :
  isAud(mime, name) ? <Music size={18} /> : <FileText size={18} />;

// ─── Ext → color ──────────────────────────────────────────────────────────────
const EXT_COLOR: Record<string, string> = {
  PDF: 'bg-red-500', DOC: 'bg-blue-500', DOCX: 'bg-blue-500',
  XLS: 'bg-green-600', XLSX: 'bg-green-600', PPT: 'bg-orange-500',
  PPTX: 'bg-orange-500', ZIP: 'bg-yellow-600', RAR: 'bg-yellow-600',
  TXT: 'bg-slate-500', CSV: 'bg-teal-600', MP3: 'bg-purple-500',
  WAV: 'bg-purple-600', WEBM: 'bg-indigo-500', MP4: 'bg-rose-500',
  MOV: 'bg-rose-600',
};
function extOf(name = '') { return (name.split('.').pop() || 'FILE').toUpperCase(); }
function extColor(name = '') { return EXT_COLOR[extOf(name)] ?? 'bg-ink-3'; }

// ─── useStreamSrc — loads signed URL lazily ───────────────────────────────────
function useStreamSrc(mediaId: string | undefined) {
  const [src, setSrc] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!mediaId) return;
    setLoading(true);
    mediaLinks(mediaId).then((l) => {
      setSrc(l.stream);
      setDriveUrl(l.drive);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [mediaId]);
  return { src, driveUrl, loading };
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/92 backdrop-blur-md" onClick={onClose}>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
      >
        <X size={18} />
      </button>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-[13px] text-white/80 backdrop-blur-sm">
        {name}
      </div>
      <img
        src={src}
        alt={name}
        className="max-h-[90dvh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ─── ImageThumb ───────────────────────────────────────────────────────────────
function ImageThumb({ mediaId, fileName, size = 'md' }: { mediaId: string; fileName: string; size?: 'sm' | 'md' | 'lg' }) {
  const { src, driveUrl, loading } = useStreamSrc(mediaId);
  const [lightbox, setLightbox] = useState(false);
  const [err, setErr] = useState(false);
  const h = size === 'sm' ? 'h-28' : size === 'lg' ? 'h-56' : 'h-44';
  return (
    <>
      <button
        onClick={() => src && !err && setLightbox(true)}
        className={`group relative w-full overflow-hidden rounded-xl bg-surface-3 ${h}`}
        aria-label={`View ${fileName}`}
      >
        {loading && <div className="flex h-full items-center justify-center"><Spinner /></div>}
        {src && !err && (
          <>
            <img
              src={src}
              alt={fileName}
              onError={() => setErr(true)}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors duration-200 group-hover:bg-black/25 rounded-xl">
              <ZoomIn size={26} className="text-white opacity-0 drop-shadow-xl transition-opacity duration-200 group-hover:opacity-100" />
            </div>
          </>
        )}
        {(!loading && (!src || err)) && (
          <div className="flex h-full flex-col items-center justify-center p-2 text-center text-ink-3">
            <ImageIcon size={26} />
            <span className="mt-1 text-[11px] truncate max-w-[90%]">{fileName}</span>
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:underline"
              >
                Open in Drive <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}
      </button>
      {lightbox && src && !err && <Lightbox src={src} name={fileName} onClose={() => setLightbox(false)} />}
    </>
  );
}

// ─── VideoThumb ───────────────────────────────────────────────────────────────
function VideoThumb({ mediaId, fileName, size = 'md' }: { mediaId: string; fileName: string; size?: 'sm' | 'md' | 'lg' }) {
  const { src, driveUrl, loading } = useStreamSrc(mediaId);
  const [playing, setPlaying] = useState(false);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const h = size === 'sm' ? 'h-28' : size === 'lg' ? 'h-56' : 'h-44';
  const toggle = () => {
    if (!ref.current || err) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play().catch(() => setErr(true)); setPlaying(true); }
  };
  return (
    <div className={`group relative w-full overflow-hidden rounded-xl bg-black ${h}`}>
      {loading && <div className="flex h-full items-center justify-center"><Spinner className="text-white" /></div>}
      {src && !err && (
        <video
          ref={ref}
          src={src}
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
          playsInline preload="metadata"
          onEnded={() => setPlaying(false)}
          onClick={toggle}
        />
      )}
      {!loading && !err && (
        <button
          onClick={toggle}
          aria-label={playing ? 'Pause' : 'Play'}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${playing ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 backdrop-blur-sm shadow-xl">
            {playing ? <Pause size={22} className="text-white" /> : <Play size={22} className="text-white ml-0.5" />}
          </span>
        </button>
      )}
      {err && (
        <div className="flex h-full flex-col items-center justify-center p-2 text-center text-white/80">
          <Film size={26} />
          <span className="mt-1 text-[11px] truncate max-w-[90%]">{fileName}</span>
          {driveUrl ? (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30"
            >
              Watch on Drive <ExternalLink size={11} />
            </a>
          ) : (
            <span className="mt-1 text-[10px] text-white/50">Re-upload to view</span>
          )}
        </div>
      )}
      {!err && (
        <div className="absolute bottom-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] text-white backdrop-blur-sm truncate max-w-[80%]">
          {fileName}
        </div>
      )}
    </div>
  );
}

// ─── AudioThumb ───────────────────────────────────────────────────────────────
function AudioThumb({ mediaId, fileName }: { mediaId: string; fileName: string }) {
  const { src } = useStreamSrc(mediaId);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const ref = useRef<HTMLAudioElement>(null);
  const fmtDur = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    ref.current.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-3 px-3 py-3">
      {src && <audio ref={ref} src={src} preload="metadata"
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setProgress(0); }} />}
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow hover:bg-primary/90 transition-colors"
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div
          className="relative h-7 flex cursor-pointer items-center gap-[2px]"
          onClick={seek}
          role="slider" aria-label="Audio progress"
          aria-valuenow={Math.round(progress)} aria-valuemax={Math.round(duration)}
        >
          {Array.from({ length: 32 }).map((_, i) => {
            const hh = 4 + Math.abs(Math.sin(i * 0.85)) * 8 + Math.abs(Math.sin(i * 1.9)) * 5;
            const filled = duration > 0 && (i / 32) <= (progress / duration);
            return (
              <span key={i}
                className={`rounded-full transition-colors duration-75 ${filled ? 'bg-primary' : 'bg-ink-3/40'}`}
                style={{ width: 3, height: hh }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-3">
          <span className="truncate">{fileName.length > 24 ? fileName.slice(0, 22) + '…' : fileName}</span>
          <span className="tabular shrink-0">{duration > 0 ? `${fmtDur(progress)} / ${fmtDur(duration)}` : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ─── DocumentThumb ────────────────────────────────────────────────────────────
function DocumentThumb({ m }: { m: any }) {
  const ext = extOf(m.fileName);
  const color = extColor(m.fileName);
  const download = async () => {
    try {
      const l = await mediaLinks(m._id);
      const a = document.createElement('a'); a.href = l.download; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast.error('Download failed.'); }
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 hover:border-line-strong transition-colors">
      {/* Colored ext badge */}
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white text-[11px] font-bold shadow ${color}`}>
        {ext.slice(0, 4)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink" title={m.fileName}>{m.fileName}</div>
        <div className="text-[11px] text-ink-3">
          {m.size ? fmtSize(m.size) : ext}
          {m.uploadedBy?.name ? ` · ${m.uploadedBy.name}` : ''}
        </div>
      </div>
      <button onClick={download} aria-label="Download" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-2 hover:text-ink hover:bg-surface-3 transition-colors">
        <Download size={15} />
      </button>
    </div>
  );
}

// ─── MediaThumb (auto-detects type) ──────────────────────────────────────────
/** Drop-in thumbnail: auto-detects image / video / audio / document and renders accordingly. */
export function MediaThumb({ m, size = 'md' }: { m: any; size?: 'sm' | 'md' | 'lg' }) {
  if (!m) return null;
  const mime = m.mimeType || '';
  const name = m.fileName || '';
  if (isImg(mime, name)) return <ImageThumb mediaId={m._id} fileName={name} size={size} />;
  if (isVid(mime, name)) return <VideoThumb mediaId={m._id} fileName={name} size={size} />;
  if (isAud(mime, name)) return <AudioThumb mediaId={m._id} fileName={name} />;
  return <DocumentThumb m={m} />;
}

// ─── MediaActions (unchanged API) ────────────────────────────────────────────
export function useMediaActions() {
  const [preview, setPreview] = useState<any | null>(null);
  const download = async (m: any) => {
    try {
      const l = await mediaLinks(m._id);
      const a = document.createElement('a'); a.href = l.download; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { toast.error(errMsg(e, 'Download failed. Retry.')); }
  };
  const openDrive = async (m: any) => {
    if (m.webViewLink) return window.open(m.webViewLink, '_blank', 'noopener');
    try {
      const l = await mediaLinks(m._id);
      if (l.drive) window.open(l.drive, '_blank', 'noopener');
      else toast.info('This file is not stored in Google Drive.');
    } catch (e) { toast.error(errMsg(e)); }
  };
  const modal = preview && <PreviewModal media={preview} onClose={() => setPreview(null)} />;
  return { setPreview, download, openDrive, modal };
}

// ─── MediaButtons ─────────────────────────────────────────────────────────────
export function MediaButtons({ m, a, compact }: { m: any; a: ReturnType<typeof useMediaActions>; compact?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Button size="sm" onClick={() => a.setPreview(m)} icon={<Play size={14} />}>{compact ? '' : 'Preview'}</Button>
      <Button size="sm" onClick={() => a.download(m)} icon={<Download size={14} />}>{compact ? '' : 'Download'}</Button>
      {m.storage === 'DRIVE' && <Button size="sm" onClick={() => a.openDrive(m)} icon={<ExternalLink size={14} />}>{compact ? '' : 'Open Drive'}</Button>}
    </div>
  );
}

// ─── FileCard — now with auto-thumbnail ──────────────────────────────────────
/** File card used in chat, content and media library. Auto-shows thumbnail for images, video, audio and documents. */
export function FileCard({ m, a, by }: { m: any; a: ReturnType<typeof useMediaActions>; by?: string }) {
  if (!m) return null;
  const mime = m.mimeType || '';
  const name = m.fileName || '';
  const showThumb = isImg(mime, name) || isVid(mime, name) || isAud(mime, name);
  const ext = extOf(m.fileName);
  const color = extColor(m.fileName);

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-lift">
      {/* ── Thumbnail area ── */}
      {isImg(mime, name) && <ImageThumb mediaId={m._id} fileName={name} size="md" />}
      {isVid(mime, name) && <VideoThumb mediaId={m._id} fileName={name} size="md" />}
      {isAud(mime, name) && <div className="p-3 pb-0"><AudioThumb mediaId={m._id} fileName={name} /></div>}
      {!showThumb && (
        <div className="flex items-center gap-3 px-3 pt-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white text-[12px] font-bold shadow ${color}`}>
            {ext.slice(0, 4)}
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold text-ink text-[13px]" title={name}>{name}</div>
            <div className="text-[11px] font-medium text-ink-2">{ext} {m.size ? `· ${fmtSize(m.size)}` : ''}</div>
          </div>
        </div>
      )}

      {/* ── Meta + actions ── */}
      <div className="px-3 py-2.5">
        {showThumb && (
          <div className="mb-1.5 truncate font-semibold text-[13px] text-ink" title={name}>{name}</div>
        )}
        <div className="text-[11px] font-medium text-ink-2">
          {fmtSize(m.size)}
          {(by || m.uploadedBy?.name) ? ` · ${by || m.uploadedBy?.name}` : ''}
          {` · ${fmtDateTime(m.uploadedAt || m.createdAt)}`}
        </div>
        <div className="mt-2.5">
          <MediaButtons m={m} a={a} />
        </div>
      </div>
    </div>
  );
}

// ─── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ media, onClose }: { media: any; onClose: () => void }) {
  const isVideo = (media.mimeType || '').startsWith('video/');
  return (
    <Modal open onClose={onClose} title={media.fileName} wide>
      {isVideo ? <VideoReview mediaId={media._id} /> : <StaticPreview media={media} />}
    </Modal>
  );
}

function StaticPreview({ media }: { media: any }) {
  const q = useQuery({ queryKey: ['media-link', media._id], queryFn: () => mediaLinks(media._id), staleTime: 4 * 60_000 });
  if (q.isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (!q.data) return <p className="text-ink-2">Preview is not available.</p>;
  const mime = media.mimeType || '';
  if (mime.startsWith('image/')) return <img src={q.data.stream} alt={media.fileName} className="mx-auto max-h-[70dvh] rounded-xl" />;
  if (mime.startsWith('audio/')) return <audio src={q.data.stream} controls className="w-full" />;
  if (mime === 'application/pdf') return <iframe src={q.data.stream} title={media.fileName} className="h-[70dvh] w-full rounded-xl border border-line" />;
  return <p className="text-ink-2">This file type cannot be previewed. Use Download{q.data.drive ? ' or Open Drive' : ''}.</p>;
}

// ─── VideoReview (unchanged) ──────────────────────────────────────────────────
export function VideoReview({ mediaId, allowComment = true, pending, onPendingChange }: { mediaId: string; allowComment?: boolean; pending?: { timestampSec?: number; comment: string }[]; onPendingChange?: (c: { timestampSec?: number; comment: string }[]) => void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLVideoElement>(null);
  const link = useQuery({ queryKey: ['media-link', mediaId], queryFn: () => mediaLinks(mediaId), staleTime: 4 * 60_000 });
  const meta = useQuery({ queryKey: ['media', 'one', mediaId], queryFn: () => get(`/media/${mediaId}`) });
  const [text, setText] = useState(''); const [useTs, setUseTs] = useState(true); const [now, setNow] = useState(0);
  const add = useMutation({ mutationFn: (b: any) => post(`/media/${mediaId}/feedback`, b), onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['media', 'one', mediaId] }); qc.invalidateQueries({ queryKey: ['content-detail'] }); }, onError: (e) => toast.error(errMsg(e)) });
  const seek = (s?: number) => { if (s != null && ref.current) { ref.current.currentTime = s; ref.current.play().catch(() => undefined); } };
  const submit = () => {
    if (!text.trim()) return;
    const c = { comment: text.trim(), ...(useTs ? { timestampSec: Math.floor(ref.current?.currentTime || 0) } : {}) };
    if (onPendingChange) { onPendingChange([...(pending || []), c]); setText(''); } else add.mutate(c);
  };
  const fb: any[] = meta.data?.feedback || [];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div>
        {link.isLoading
          ? <div className="flex aspect-video items-center justify-center rounded-xl bg-black"><Spinner className="text-white" /></div>
          : <video ref={ref} src={link.data?.stream} controls playsInline preload="metadata" onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} className="max-h-[60dvh] w-full rounded-xl bg-black" />}
        {meta.data && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-meta text-ink-2">
            <span className="font-medium text-ink">{meta.data.fileName}</span>
            <span>{fmtSize(meta.data.size)}</span>
            {meta.data.version && <Badge t="neutral">{meta.data.version.replace('_', ' ')}</Badge>}
          </div>
        )}
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="mb-2 text-meta font-medium text-ink-2">Comments</div>
        <ul className="max-h-64 space-y-1.5 overflow-y-auto lg:max-h-[46dvh]">
          {[...(pending || []).map((p, i) => ({ ...p, _id: `p${i}`, pending: true })), ...fb].map((f: any) => (
            <li key={f._id} className="animate-rise">
              <button onClick={() => seek(f.timestampSec)} className="w-full rounded-xl border border-line p-2 text-left transition-[background-color,border-color] duration-150 hover:border-line-strong hover:bg-surface-2">
                <div className="flex items-center gap-2 text-meta">
                  {f.timestampSec != null && <span className="rounded bg-inverse px-1.5 py-0.5 font-medium tabular text-inverse-ink">{fmtTs(f.timestampSec)}</span>}
                  <span className="text-ink-2">{f.pending ? 'Will be sent with your decision' : `${f.authorName || 'Reviewer'}${f.authorType === 'CLIENT' ? ' (client)' : ''}`}</span>
                </div>
                <div className="mt-1 text-[13px]">{f.comment}</div>
              </button>
            </li>
          ))}
          {!fb.length && !(pending || []).length && <li className="text-meta text-ink-3">No comments yet.</li>}
        </ul>
        {allowComment && (
          <div className="mt-3 border-t border-line pt-3">
            <Textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment" />
            <div className="mt-2 flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-meta text-ink-2">
                <input type="checkbox" checked={useTs} onChange={(e) => setUseTs(e.target.checked)} /> At {fmtTs(now)}
              </label>
              <Button size="sm" variant="primary" onClick={submit} loading={add.isPending} icon={<MessageSquarePlus size={14} />}>Add</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── UploadButton (unchanged) ─────────────────────────────────────────────────
export function UploadButton({ label, category, contentId, clientId, accept, variant = 'primary', onDone, camera, icon, size }: { label: string; category: string; contentId?: string; clientId?: string; accept?: string; variant?: any; onDone?: (m: any) => void; camera?: boolean; icon?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLInputElement>(null); const cam = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    files.forEach((file) => startUpload({ file, category, contentId, clientId, onDone: (m) => { qc.invalidateQueries({ queryKey: ['content-detail'] }); qc.invalidateQueries({ queryKey: ['media'] }); onDone?.(m); } }).catch(() => undefined));
  };
  const isTouch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const computedAccept = accept || (
    ['RAW', 'EDIT', 'FINAL'].includes(category)
      ? 'video/*,.mp4,.mov,.mkv,.avi,.webm,.m4v,.wmv,.mts,.m2ts'
      : ['THUMBNAIL', 'IMAGE'].includes(category)
      ? 'image/*,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.svg'
      : undefined
  );
  return (
    <span className="inline-flex gap-1.5">
      <input ref={ref} type="file" hidden accept={computedAccept} onChange={pick} />
      <Button variant={variant} size={size} onClick={() => ref.current?.click()} icon={icon ?? <Upload size={15} />}>{label}</Button>
      {camera && isTouch && <><input ref={cam} type="file" hidden accept={computedAccept} capture="environment" onChange={pick} /><Button size={size} onClick={() => cam.current?.click()} icon={<Camera size={15} />}>Camera</Button></>}
    </span>
  );
}

export function useEscape(fn: () => void) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && fn(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [fn]);
}
