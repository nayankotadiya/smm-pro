import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  Send, Reply, ThumbsUp, Check, CheckCheck, HelpCircle, AlertCircle,
  CheckSquare, AlarmClock, Pin, X, Search, Clock, Trash2, MoreHorizontal,
  Image as ImageIcon, Film, FileText, Music, Mic, MicOff, Paperclip,
  Camera, Play, Pause, Download, ChevronLeft, ChevronRight, ChevronDown, ZoomIn,
  File, AtSign, Bell, Maximize2, ExternalLink,
} from 'lucide-react';
import { get, post, del, errMsg, DIRECT_URL } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/store/auth';
import { useUI, toast } from '@/store/ui';
import { Avatar, Button, Empty, IconButton, Spinner, Input } from '@/components/ui';
import { useMediaActions } from '@/components/Media';
import { ReminderFormModal } from '@/components/Forms';
import { fmtDate, fmtTime, roleLabel, ago, formatLastSeen } from '@/lib/format';
import { startUpload } from '@/lib/upload';
import { mediaLinks } from '@/lib/upload';
import { useTeam } from '@/hooks/useData';

// ─── Reaction definitions (Zero emojis, SVG icons) ───────────────────────────
const REACTIONS: Record<string, { label: string; icon: any; color: string }> = {
  ack:   { label: 'Acknowledge', icon: ThumbsUp, color: 'text-blue-500' },
  done:  { label: 'Done', icon: Check, color: 'text-emerald-500' },
  star:  { label: 'Pinned', icon: Pin, color: 'text-amber-500' },
  alert: { label: 'Urgent', icon: AlertCircle, color: 'text-rose-500' },
};


function getParticipantColor(name = '') {
  const colors = [
    'text-[#1f7aec] dark:text-[#53bdeb]', // Blue
    'text-[#df3f40] dark:text-[#ff6b6b]', // Red
    'text-[#07bc0c] dark:text-[#2ecc71]', // Green
    'text-[#e58a00] dark:text-[#ffa502]', // Orange
    'text-[#a033c9] dark:text-[#c56cf0]', // Purple
    'text-[#00a884] dark:text-[#25d366]', // Teal
    'text-[#e84393] dark:text-[#fd79a8]', // Pink
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function OutgoingTail() {
  return (
    <span className="absolute top-0 -right-2 text-[#d9fdd3] dark:text-[#005c4b] pointer-events-none drop-shadow-[0_1px_0.5px_rgba(11,20,26,0.06)]" aria-hidden="true">
      <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="xMidYMid meet">
        <path fill="currentColor" d="M5.188,0H0v11.193l6.467-8.625C7.526,1.156,6.958,0,5.188,0z" />
      </svg>
    </span>
  );
}

function IncomingTail() {
  return (
    <span className="absolute top-0 -left-2 text-white dark:text-[#202c33] pointer-events-none drop-shadow-[0_1px_0.5px_rgba(11,20,26,0.06)]" aria-hidden="true">
      <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="xMidYMid meet">
        <path fill="currentColor" d="M1.533,1.568L8,10.193V0H2.812C1.042,0,0.474,1.156,1.533,1.568z" />
      </svg>
    </span>
  );
}

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic'];
const VID_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'];
const AUD_EXTS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];

// ─── Helpers ────────────────────────────────────────────────────────────────
function isImage(mime = '', name = '') {
  return mime.startsWith('image/') || IMG_EXTS.some((x) => (name || '').toLowerCase().endsWith(x));
}
function isVideo(mime = '', name = '') {
  return mime.startsWith('video/') || VID_EXTS.some((x) => (name || '').toLowerCase().endsWith(x));
}
function isAudio(mime = '', name = '') {
  return mime.startsWith('audio/') || AUD_EXTS.some((x) => (name || '').toLowerCase().endsWith(x));
}
function isPdf(mime = '', name = '') {
  return mime === 'application/pdf' || (name || '').toLowerCase().endsWith('.pdf');
}
function fmtDur(sec: number) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Full Media Lightbox (Image & Video Full View) ──────────────────────────
interface MediaLightboxProps {
  type: 'image' | 'video';
  src: string;
  fileName: string;
  downloadUrl?: string;
  driveUrl?: string | null;
  onClose: () => void;
}
function MediaLightbox({ type, src, fileName, downloadUrl, driveUrl, onClose }: MediaLightboxProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col bg-black/95 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <header
        className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-3 sm:px-5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
            {type === 'video' ? <Film size={16} /> : <ImageIcon size={16} />}
          </div>
          <span className="truncate font-medium text-[13.5px] sm:text-[14px]" title={fileName}>
            {fileName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {driveUrl && (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-xl bg-white/10 px-2.5 sm:px-3 text-[12px] font-semibold text-white hover:bg-white/20 transition-colors"
              title="Open in Google Drive"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Drive</span>
            </a>
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={fileName}
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-xl bg-primary px-2.5 sm:px-3 text-[12px] font-semibold text-white hover:brightness-110 transition-colors"
              title="Download original file"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Download</span>
            </a>
          )}
          <button
            onClick={onClose}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Close full preview"
          >
            <X size={19} />
          </button>
        </div>
      </header>

      {/* Main Preview Area */}
      <div
        className="flex flex-1 items-center justify-center p-2 sm:p-6 overflow-hidden"
        onClick={onClose}
      >
        {type === 'video' ? (
          <div
            className="relative flex max-h-[85dvh] max-w-[96vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={src}
              controls
              autoPlay
              playsInline
              className="max-h-[82dvh] max-w-[96vw] rounded-2xl bg-black shadow-2xl object-contain ring-1 ring-white/15"
            />
          </div>
        ) : (
          <img
            src={src}
            alt={fileName}
            className="max-h-[85dvh] max-w-[96vw] rounded-2xl object-contain shadow-2xl ring-1 ring-white/15"
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    </div>
  );
}

// ─── Inline Image ────────────────────────────────────────────────────────────
function InlineImage({ mediaId, fileName }: { mediaId: string; fileName: string }) {
  const [links, setLinks] = useState<{ stream: string; download: string; drive: string | null } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const l = await mediaLinks(mediaId);
      setLinks(l);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  if (loading) {
    return (
      <div className="flex h-40 w-64 items-center justify-center rounded-2xl bg-surface-3">
        <Spinner />
      </div>
    );
  }

  if (error || !links) {
    return (
      <div className="flex h-32 w-64 flex-col items-center justify-center rounded-2xl bg-surface-3 p-3 text-center">
        <p className="text-[12px] text-ink-3">Image preview unavailable</p>
        <button onClick={fetchLinks} className="mt-1 text-[11px] text-primary font-semibold hover:underline">
          Tap to retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="group relative block w-full min-w-[240px] max-w-[340px] sm:max-w-[360px] overflow-hidden rounded-xl cursor-pointer shadow-xs bg-black/5 dark:bg-black/30"
        onClick={() => setFullscreen(true)}
      >
        <img
          src={links.stream}
          alt={fileName}
          className="w-full max-h-[380px] rounded-xl object-contain bg-black/5 dark:bg-black/40 transition-transform duration-200 group-hover:scale-[1.01] block"
          onError={() => fetchLinks()}
        />
        {/* Fullscreen icon overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/0 transition-colors duration-200 group-hover:bg-black/20">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 shadow-xl">
            <Maximize2 size={18} />
          </span>
        </div>
      </div>

      {fullscreen && (
        <MediaLightbox
          type="image"
          src={links.stream}
          fileName={fileName}
          downloadUrl={links.download}
          driveUrl={links.drive}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}

// ─── Inline Video ────────────────────────────────────────────────────────────
function InlineVideo({ mediaId, fileName }: { mediaId: string; fileName: string }) {
  const [links, setLinks] = useState<{ stream: string; download: string; drive: string | null } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchLinks = useCallback(async () => {
    try {
      setLoading(true);
      setError(false);
      const l = await mediaLinks(mediaId);
      setLinks(l);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  if (loading) {
    return (
      <div className="flex h-52 w-full min-w-[240px] max-w-[340px] sm:max-w-[360px] items-center justify-center rounded-xl bg-black">
        <Spinner className="text-white" />
      </div>
    );
  }

  if (error || !links) {
    return (
      <div className="flex h-36 w-full min-w-[240px] max-w-[340px] flex-col items-center justify-center rounded-xl bg-surface-3 p-3 text-center">
        <p className="text-[12px] text-ink-3">Video unavailable</p>
        <button onClick={fetchLinks} className="mt-1 text-[11px] text-primary font-semibold hover:underline">
          Tap to retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        className="group relative block w-full min-w-[240px] max-w-[340px] sm:max-w-[360px] overflow-hidden rounded-xl bg-black cursor-pointer shadow-xs"
        onClick={() => setFullscreen(true)}
      >
        <video
          src={links.stream}
          playsInline
          preload="metadata"
          className="w-full max-h-[380px] rounded-xl object-contain bg-black block"
          onError={() => fetchLinks()}
        />

        {/* Center Play Button Overlay (WhatsApp style) */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 group-hover:bg-black/40 transition-colors">
          <span className="flex h-13 w-13 items-center justify-center rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/30 text-white shadow-2xl transition-transform duration-200 group-hover:scale-110 active:scale-95">
            <Play size={24} className="ml-0.5 fill-white" />
          </span>
        </div>

        {/* Top-Right Fullscreen / Expand Badge */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setFullscreen(true);
          }}
          className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-black/70 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-sm hover:bg-black/90 transition-colors shadow-xs"
          title="Open Fullscreen Player"
        >
          <Maximize2 size={13} />
          <span>Full view</span>
        </button>

        {/* Bottom video name pill */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-xs shadow-xs max-w-[70%]">
          <Film size={12} className="shrink-0" />
          <span className="truncate">{fileName}</span>
        </div>
      </div>

      {fullscreen && (
        <MediaLightbox
          type="video"
          src={links.stream}
          fileName={fileName}
          downloadUrl={links.download}
          driveUrl={links.drive}
          onClose={() => setFullscreen(false)}
        />
      )}
    </>
  );
}

// ─── Inline Audio (WhatsApp Voice Note style) ────────────────────────────────
function InlineAudio({ mediaId, fileName, isMine }: { mediaId: string; fileName: string; isMine: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    mediaLinks(mediaId).then((l) => setSrc(l.stream)).catch(() => undefined);
  }, [mediaId]);

  const toggle = () => {
    if (!ref.current) return;
    if (playing) { ref.current.pause(); setPlaying(false); }
    else { ref.current.play(); setPlaying(true); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    ref.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const cycleRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ref.current) return;
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    ref.current.playbackRate = next;
    setRate(next);
  };

  return (
    <div className="flex items-center gap-3 py-1 min-w-[240px] max-w-sm">
      {src && (
        <audio
          ref={ref}
          src={src}
          preload="metadata"
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onEnded={() => { setPlaying(false); setProgress(0); }}
        />
      )}
      <button
        onClick={toggle}
        aria-label={playing ? 'Pause audio' : 'Play audio'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-xs hover:bg-[#008f6f] transition-transform active:scale-95"
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        {/* Waveform progress bar */}
        <div
          className="relative h-6 flex cursor-pointer items-center gap-[2.5px]"
          onClick={seek}
          role="slider"
          aria-label="Audio progress"
          aria-valuenow={Math.round(progress)}
          aria-valuemax={Math.round(duration)}
        >
          {Array.from({ length: 30 }).map((_, i) => {
            const h = 4 + Math.sin(i * 0.8) * 6 + Math.abs(Math.sin(i * 1.7)) * 7;
            const filled = duration > 0 && (i / 30) <= (progress / duration);
            return (
              <span
                key={i}
                className={clsx(
                  'rounded-full transition-colors duration-75',
                  filled
                    ? 'bg-[#00a884]'
                    : isMine
                      ? 'bg-[#8696a0]/50 dark:bg-[#8696a0]/40'
                      : 'bg-[#8696a0]/50 dark:bg-[#8696a0]/40'
                )}
                style={{ width: 3, height: h }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[11px] tabular text-[#667781] dark:text-[#8696a0]">
          <span>{duration > 0 ? `${fmtDur(progress)} / ${fmtDur(duration)}` : fileName.slice(0, 20)}</span>
          {playing && (
            <button
              onClick={cycleRate}
              className="rounded-full bg-black/5 dark:bg-white/10 px-1.5 py-0.2 text-[10px] font-bold text-[#00a884] hover:bg-black/10"
              title="Playback speed"
            >
              {rate}x
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Document Card (WhatsApp Web style) ───────────────────────────────────────
function DocumentCard({ m, isMine }: { m: any; isMine: boolean }) {
  const download = async () => {
    try {
      const l = await mediaLinks(m._id);
      const a = document.createElement('a'); a.href = l.download; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    } catch { toast.error('Download failed.'); }
  };
  const ext = (m.fileName || '').split('.').pop()?.toUpperCase() || 'FILE';
  const extColor: Record<string, string> = {
    PDF: 'bg-red-500', DOC: 'bg-blue-600', DOCX: 'bg-blue-600',
    XLS: 'bg-emerald-600', XLSX: 'bg-emerald-600', PPT: 'bg-orange-500',
    PPTX: 'bg-orange-500', ZIP: 'bg-amber-600', RAR: 'bg-amber-600',
  };
  const color = extColor[ext] || 'bg-[#54656f]';
  return (
    <div className={clsx(
      'flex items-center gap-3 rounded-lg p-2.5 min-w-[220px] max-w-sm',
      isMine
        ? 'bg-black/5 dark:bg-black/20'
        : 'bg-[#f0f2f5] dark:bg-[#111b21]/50'
    )}>
      <div className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white text-[11px] font-bold shadow-xs', color)}>
        {ext.slice(0, 4)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium text-[#111b21] dark:text-[#e9edef]" title={m.fileName}>
          {m.fileName}
        </div>
        <div className="text-[11px] text-[#667781] dark:text-[#8696a0]">
          {m.size ? `${(m.size / 1024 / 1024).toFixed(1)} MB` : ext} · {ext}
        </div>
      </div>
      <button
        onClick={download}
        aria-label="Download"
        title="Download file"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#54656f] dark:text-[#8696a0] hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
      >
        <Download size={18} />
      </button>
    </div>
  );
}

// ─── Attachment renderer ──────────────────────────────────────────────────────
function AttachmentBubble({ file, isMine }: { file: any; isMine: boolean }) {
  const mime = file.mimeType || '';
  const name = file.fileName || '';
  if (isImage(mime, name)) return <InlineImage mediaId={file._id} fileName={file.fileName} />;
  if (isVideo(mime, name)) return <InlineVideo mediaId={file._id} fileName={file.fileName} />;
  if (isAudio(mime, name)) return <InlineAudio mediaId={file._id} fileName={file.fileName} isMine={isMine} />;
  return <DocumentCard m={file} isMine={isMine} />;
}

// ─── Pending file preview chip ─────────────────────────────────────────────
function PendingChip({ pf, onRemove }: { pf: any; onRemove: () => void }) {
  const mime = pf.file?.type || '';
  const name = pf.file?.name || pf.name || '';
  const [thumbSrc, setThumbSrc] = useState<string | null>(null);

  useEffect(() => {
    if (pf.file && (isImage(mime, name) || isVideo(mime, name))) {
      const url = URL.createObjectURL(pf.file);
      setThumbSrc(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [pf.file, mime, name]);

  const vid = isVideo(mime, name);
  const img = isImage(mime, name);

  return (
    <div className="relative flex flex-col items-center gap-1">
      <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-line bg-surface-3 shadow-xs">
        {thumbSrc && img ? (
          <img src={thumbSrc} alt={pf.name} className="h-full w-full object-cover" />
        ) : thumbSrc && vid ? (
          <div className="relative h-full w-full">
            <video src={thumbSrc} className="h-full w-full object-cover pointer-events-none" muted preload="metadata" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Film size={18} className="text-white drop-shadow" />
            </div>
          </div>
        ) : vid ? (
          <div className="flex h-full w-full items-center justify-center text-primary-ink"><Film size={24} /></div>
        ) : isAudio(mime, name) ? (
          <div className="flex h-full w-full items-center justify-center text-primary-ink"><Music size={24} /></div>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-ink-2 bg-slate-100 dark:bg-surface-2 p-1">
            <FileText size={20} className="text-red-500" />
            <span className="text-[9px] font-bold uppercase mt-0.5 text-ink-2">{name.split('.').pop()?.slice(0, 4)}</span>
          </div>
        )}
        {!pf.media && !pf.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
            <Spinner className="!h-4 !w-4 text-white" />
          </div>
        )}
        {pf.error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/40 rounded-xl">
            <AlertCircle size={18} className="text-white" />
          </div>
        )}
      </div>
      <span className="max-w-[64px] truncate text-[10px] font-medium text-ink-2">{pf.name}</span>
      <button
        onClick={onRemove}
        aria-label="Remove"
        className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-white shadow hover:scale-110 active:scale-95 transition-transform"
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ─── Audio recorder ──────────────────────────────────────────────────────────
function useAudioRecorder(onDone: (file: File) => void) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const timer = useRef<any>(null);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      mr.current = rec;
      rec.ondataavailable = (e) => chunks.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: 'audio/webm' });
        // File constructor with options isn't in all TS lib versions — cast via unknown
        const voiceFile = new (File as any)([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' }) as File;
        onDone(voiceFile);
      };
      rec.start();
      setRecording(true);
      setDuration(0);
      timer.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch {
      toast.error('Microphone access denied.');
    }
  };

  const stop = () => {
    mr.current?.stop();
    setRecording(false);
    clearInterval(timer.current);
  };

  const cancel = () => {
    if (mr.current) { mr.current.ondataavailable = null; mr.current.onstop = null; mr.current.stop(); }
    setRecording(false);
    clearInterval(timer.current);
    setDuration(0);
  };

  return { recording, duration, start, stop, cancel };
}

// ─── WhatsApp Media picker popup ─────────────────────────────────────────────
function MediaPicker({ onClose, onPickImages, onPickVideos, onPickAudio, onPickDocs, onPickCam }: {
  onClose: () => void;
  onPickImages: () => void;
  onPickVideos: () => void;
  onPickAudio: () => void;
  onPickDocs: () => void;
  onPickCam: () => void;
}) {
  const items = [
    { icon: <FileText size={20} className="text-white" />, label: 'Document', bg: 'bg-[#7f66ff]', fn: onPickDocs },
    { icon: <ImageIcon size={20} className="text-white" />, label: 'Photos & videos', bg: 'bg-[#007bfc]', fn: onPickImages },
    { icon: <Camera size={20} className="text-white" />, label: 'Camera', bg: 'bg-[#ff2e74]', fn: onPickCam },
    { icon: <Music size={20} className="text-white" />, label: 'Audio', bg: 'bg-[#ff8f00]', fn: onPickAudio },
  ];
  return (
    <div className="absolute bottom-[calc(100%+12px)] left-0 z-50 animate-pop-in">
      <div className="flex flex-col gap-1.5 rounded-2xl bg-white dark:bg-[#233138] p-2.5 shadow-[0_4px_24px_rgba(11,20,26,0.28)] border border-[#e9edef] dark:border-[#2a3942] min-w-[210px]">
        {items.map(({ icon, label, bg, fn }) => (
          <button
            key={label}
            onClick={() => { fn(); onClose(); }}
            className="flex items-center gap-3.5 rounded-xl px-3 py-2 text-left hover:bg-[#f0f2f5] dark:hover:bg-[#182229] transition-colors"
          >
            <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-xs', bg)}>
              {icon}
            </span>
            <span className="text-[14px] font-medium text-[#111b21] dark:text-[#e9edef]">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


// ─── WhatsApp Mention (@tag) Autocomplete Popover ─────────────────────────────
function MentionPicker({
  members,
  query,
  selectedIndex,
  onSelect,
  onClose,
}: {
  members: any[];
  query: string;
  selectedIndex: number;
  onSelect: (member: any) => void;
  onClose: () => void;
}) {
  const filtered = members.filter((m) =>
    !query ||
    m.name?.toLowerCase().includes(query.toLowerCase()) ||
    m.role?.toLowerCase().includes(query.toLowerCase())
  );

  if (!filtered.length) return null;

  return (
    <div className="absolute bottom-[calc(100%+8px)] left-2 right-2 sm:left-4 sm:right-auto z-50 animate-pop-in">
      <div className="flex flex-col rounded-2xl bg-white dark:bg-[#233138] shadow-[0_8px_30px_rgba(11,20,26,0.32)] border border-[#e9edef] dark:border-[#2a3942] sm:w-[320px] max-h-[280px] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#e9edef] dark:border-[#2a3942] px-3.5 py-2 text-xs font-bold text-[#00a884] uppercase tracking-wider bg-[#f0f2f5]/80 dark:bg-[#182229]/80">
          <span className="flex items-center gap-1.5">
            <AtSign size={13} strokeWidth={2.5} />
            Tag Team Member
          </span>
          <button type="button" onClick={onClose} className="text-[#8696a0] hover:text-ink">
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto p-1.5 space-y-0.5 max-h-[230px]">
          {filtered.map((m, idx) => {
            const isSel = idx === selectedIndex;
            return (
              <button
                key={m._id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(m);
                }}
                className={clsx(
                  'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                  isSel
                    ? 'bg-[#00a884]/15 text-[#00a884] dark:bg-[#00a884]/25 dark:text-[#25d366]'
                    : 'hover:bg-[#f0f2f5] dark:hover:bg-[#182229] text-ink'
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={m.name} size={28} />
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold text-[#111b21] dark:text-[#e9edef] leading-tight">
                      {m.name}
                    </div>
                    <div className="text-[11px] font-medium text-[#8696a0] leading-none mt-0.5">
                      @{m.name.split(' ')[0]}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded-md bg-[#e9edef] dark:bg-[#2a3942] px-1.5 py-0.5 text-[10.5px] font-bold text-[#54656f] dark:text-[#8696a0]">
                  {roleLabel(m.role)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── WhatsApp Reaction & Action Bar ──────────────────────────────────────────
function ReactionBar({ onReact, onReply, onTask, onReminder, onPin, onTagAlert, onDelete, isMine, hasMention }: {
  onReact: (key: string) => void;
  onReply: () => void;
  onTask: () => void;
  onReminder: () => void;
  onPin: () => void;
  onTagAlert?: () => void;
  onDelete?: () => void;
  isMine: boolean;
  hasMention?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {Object.entries(REACTIONS).map(([k, r]) => {
        const Icon = r.icon;
        return (
          <button
            key={k}
            title={r.label}
            onClick={() => onReact(k)}
            className={clsx("flex h-7 w-7 items-center justify-center rounded-full transition-all hover:bg-black/5 dark:hover:bg-white/10 hover:scale-115 active:scale-95", r.color)}
          >
            <Icon size={14} />
          </button>
        );
      })}
      <div className="mx-1 h-4 w-px bg-[#e9edef] dark:bg-[#2a3942]" />
      <button
        onClick={onReply}
        title="Reply"
        aria-label="Reply"
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <Reply size={14} />
      </button>
      <button
        onClick={onTask}
        title="Create task"
        aria-label="Create task"
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <CheckSquare size={14} />
      </button>
      <button
        onClick={onReminder}
        title="Remind me"
        aria-label="Remind me"
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <AlarmClock size={14} />
      </button>
      {hasMention && onTagAlert && (
        <button
          onClick={onTagAlert}
          title="Tag follow-up alert"
          aria-label="Tag follow-up alert"
          className="flex h-7 w-7 items-center justify-center rounded-full text-amber-500 hover:bg-amber-500/10 transition-colors"
        >
          <Bell size={14} />
        </button>
      )}
      <button
        onClick={onPin}
        title="Pin message"
        aria-label="Pin message"
        className="flex h-7 w-7 items-center justify-center rounded-full text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
      >
        <Pin size={14} />
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          title="Delete message"
          aria-label="Delete message"
          className="flex h-7 w-7 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function ActionButtons({ act, onExecute, onDismiss }: { act: any; onExecute: (dec?: string) => void; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {(act.actionType === 'APPROVE_SCRIPT' || act.actionType === 'SMM_REVIEW' || act.actionType === 'FINAL_REVIEW') && (
        <>
          <button
            onClick={() => onExecute('APPROVE')}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all"
          >
            Approve
          </button>
          <button
            onClick={() => onExecute('CHANGES')}
            className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all"
          >
            Request Changes
          </button>
        </>
      )}
      {act.actionType === 'SEND_CLIENT_REVIEW' && (
        <button
          onClick={() => onExecute()}
          className="rounded-lg bg-primary hover:bg-primary-hover px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all"
        >
          Send to Client
        </button>
      )}
      {act.actionType === 'MARK_APPROVED' && (
        <button
          onClick={() => onExecute('APPROVE')}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all"
        >
          Mark Approved
        </button>
      )}
      {act.actionType === 'CREATE_CHANGE_REQUEST' && (
        <button
          onClick={() => onExecute('CHANGES')}
          className="rounded-lg bg-rose-600 hover:bg-rose-700 px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all"
        >
          Request Changes
        </button>
      )}
      {act.actionType === 'ASSIGN_SHOOTER' && (
        <a
          href={`/content/${act.contentId}?tab=shooting`}
          className="rounded-lg bg-primary hover:bg-primary-hover px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all inline-flex items-center gap-1"
        >
          Schedule Shoot
        </a>
      )}
      {(act.actionType === 'CREATE_TASK' || act.actionType === 'UPLOAD_EDIT') && (
        <button
          onClick={() => onExecute()}
          className="rounded-lg bg-primary hover:bg-primary-hover px-2.5 py-1 text-[11.5px] font-bold text-white shadow-xs active:scale-95 transition-all"
        >
          {act.actionType === 'UPLOAD_EDIT' ? 'Acknowledge' : 'Create Task'}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-surface-3 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
        title="Dismiss action"
        aria-label="Dismiss action"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Main ChatThread ─────────────────────────────────────────────────────────
export function ChatThread({ roomId, embedded }: { roomId: string; embedded?: boolean }) {
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const a = useMediaActions();
  const { data: teamMembers = [] } = useTeam();

  const [msgs, setMsgs] = useState<any[]>([]);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<any>(null);
  const [pendingFiles, setPendingFiles] = useState<any[]>([]);
  const [search, setSearch] = useState<string | null>(null);
  const [reminderFor, setReminderFor] = useState<any>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pinned, setPinned] = useState<any[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onToggleSearch = () => setSearch((s) => (s === null ? '' : null));
    window.addEventListener('toggle-chat-search', onToggleSearch);
    return () => window.removeEventListener('toggle-chat-search', onToggleSearch);
  }, []);

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const typingTimer = useRef<any>();
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const audRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  const q = useQuery({
    queryKey: ['chat', roomId, search || ''],
    queryFn: () => get(`/chat/${roomId}/messages`, search ? { q: search, limit: 100 } : { limit: 50 }),
    refetchOnWindowFocus: false,
  });
  const room = q.data?.room;

  const markRead = useCallback(() => {
    if (document.visibilityState === 'visible') getSocket()?.emit('message:read', { roomId });
  }, [roomId]);

  useEffect(() => {
    if (q.data) {
      setMsgs(q.data.messages);
      setPinned(q.data.pinned || []);
      setHasMore(q.data.messages.length >= 50 && !search);
      atBottom.current = true;
      markRead();
    }
  }, [q.data, search, markRead]);

  useEffect(() => {
    const onFocus = () => markRead();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [markRead]);

  useEffect(() => {
    const s = getSocket(); if (!s) return;
    const join = () => s.emit('chat:join', roomId, (ok: boolean) => { if (ok) markRead(); });
    join(); s.on('connect', join);
    const onNew = (m: any) => {
      if (m.roomId !== roomId) return;
      setMsgs((cur) => (cur.some((x) => x._id === m._id) ? cur : [
        ...cur.filter((x) => !(x.sending && x.clientNonce && m.senderId?._id === me._id && x.message === m.message)),
        m,
      ]));
      if (m.senderId?._id !== me._id) markRead();
    };
    const onTyping = (d: any) => {
      if (d.roomId !== roomId) return;
      setTyping((t) => { const n = { ...t }; if (d.typing) n[d.userId] = d.name; else delete n[d.userId]; return n; });
      if (d.typing) setTimeout(() => setTyping((t) => { const n = { ...t }; delete n[d.userId]; return n; }), 4000);
    };
    const onRead = (d: any) => {
      if (d.roomId === roomId) {
        setMsgs((cur) => cur.map((m) => {
          const readIds = (m.readBy || []).map((x: any) => String(x?._id || x));
          const uStr = String(d.userId);
          if (readIds.includes(uStr)) return m;
          return {
            ...m,
            readBy: [...(m.readBy || []), d.userId],
            deliveredTo: [...new Set([...(m.deliveredTo || []), d.userId])],
          };
        }));
      }
    };
    const onDelivered = (d: any) => {
      if (d.roomId === roomId) {
        setMsgs((cur) => cur.map((m) => {
          const delivIds = (m.deliveredTo || []).map((x: any) => String(x?._id || x));
          const uStr = String(d.userId);
          if (delivIds.includes(uStr)) return m;
          return {
            ...m,
            deliveredTo: [...(m.deliveredTo || []), d.userId],
          };
        }));
      }
    };
    const onReaction = (d: any) => {
      if (d.roomId === roomId) setMsgs((cur) => cur.map((m) => (m._id === d.messageId ? { ...m, reactions: d.reactions } : m)));
    };
    const onDeleted = (d: any) => {
      if (d.roomId === roomId) setMsgs((cur) => cur.filter((m) => m._id !== d.messageId));
    };
    const onCleared = (d: any) => {
      if (d.roomId === roomId) {
        setMsgs([]);
        qc.invalidateQueries({ queryKey: ['chat', roomId] });
      }
    };
    const onPinned = (d: any) => {
      if (d.roomId === roomId) qc.invalidateQueries({ queryKey: ['chat', roomId] });
    };
    s.on('message:new', onNew);
    s.on('message:typing', onTyping);
    s.on('message:read', onRead);
    s.on('message:delivered', onDelivered);
    s.on('message:reaction', onReaction);
    s.on('message:deleted', onDeleted);
    s.on('chat:cleared', onCleared);
    s.on('message:pinned', onPinned);
    s.emit('message:delivered', { roomId });
    const vis = () => markRead();
    document.addEventListener('visibilitychange', vis);
    return () => {
      s.emit('chat:leave', roomId);
      s.off('connect', join);
      s.off('message:new', onNew);
      s.off('message:typing', onTyping);
      s.off('message:read', onRead);
      s.off('message:delivered', onDelivered);
      s.off('message:reaction', onReaction);
      s.off('message:deleted', onDeleted);
      s.off('chat:cleared', onCleared);
      s.off('message:pinned', onPinned);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [roomId, me._id, markRead, qc]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [msgs, typing]);

  const onScroll = async () => {
    const el = scroller.current!;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && hasMore && !loadingMore && msgs.length && !search) {
      setLoadingMore(true);
      const prev = el.scrollHeight;
      try {
        const r = await get(`/chat/${roomId}/messages`, { before: msgs[0].createdAt, limit: 50 });
        setHasMore(r.messages.length >= 50);
        setMsgs((cur) => [...r.messages, ...cur]);
        requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - prev; });
      } finally { setLoadingMore(false); }
    }
  };

  const emitTyping = (on: boolean) => getSocket()?.emit('message:typing', { roomId, typing: on });

  const allMembers = useMemo(() => {
    const list: any[] = [];
    const seen = new Set<string>();
    for (const p of (room?.participants || [])) {
      if (p?._id && !seen.has(p._id)) {
        seen.add(p._id);
        list.push(p);
      }
    }
    for (const t of teamMembers) {
      if (t?._id && !seen.has(t._id)) {
        seen.add(t._id);
        list.push(t);
      }
    }
    return list;
  }, [room?.participants, teamMembers]);

  const filteredMembers = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return allMembers.filter((m) =>
      !q ||
      m.name?.toLowerCase().includes(q) ||
      m.role?.toLowerCase().includes(q)
    );
  }, [allMembers, mentionQuery]);

  const checkMentionTrigger = (val: string, cursorPos: number) => {
    const textBefore = val.slice(0, cursorPos);
    const match = textBefore.match(/(?:^|\s)@([a-zA-Z0-9_]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const onType = (v: string, target?: HTMLTextAreaElement) => {
    setText(v);
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 2500);

    const pos = target ? target.selectionStart : v.length;
    checkMentionTrigger(v, pos);
  };

  const openMentionPicker = () => {
    const el = textareaRef.current;
    const cur = text;
    const pos = el ? el.selectionStart ?? cur.length : cur.length;
    const needsSpace = pos > 0 && cur[pos - 1] !== ' ' && cur[pos - 1] !== '\n';
    const insert = (needsSpace ? ' ' : '') + '@';
    const nextText = cur.slice(0, pos) + insert + cur.slice(pos);
    setText(nextText);
    setMentionQuery('');
    setMentionIndex(0);
    setTimeout(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(pos + insert.length, pos + insert.length);
      }
    }, 10);
  };

  const insertMention = (member: any) => {
    const el = textareaRef.current;
    const firstName = member.name.split(' ')[0];
    const mentionTag = `@${firstName} `;
    if (!el) {
      setText((t) => `${t}${mentionTag}`);
      setMentionQuery(null);
      return;
    }
    const pos = el.selectionStart ?? text.length;
    const textBefore = text.slice(0, pos);
    const textAfter = text.slice(pos);
    const replaced = textBefore.replace(/(?:^|\s)@([a-zA-Z0-9_]*)$/, (match) => {
      const leadingSpace = match.startsWith(' ') ? ' ' : '';
      return `${leadingSpace}${mentionTag}`;
    });
    const newText = replaced + textAfter;
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      el.focus();
      const newPos = replaced.length;
      el.setSelectionRange(newPos, newPos);
    }, 10);
  };

  const onTagAlert = async (m: any) => {
    try {
      await post('/reminders', {
        title: `Tag Follow-up: "${(m.message || '').slice(0, 60)}"`,
        dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        priority: 'HIGH',
        category: 'CHAT',
        metadata: { roomId, messageId: m._id },
      });
      qc.invalidateQueries({ queryKey: ['reminders'] });
      toast.success('High-priority tag follow-up reminder created (2h alert).');
    } catch {
      setReminderFor(m);
    }
  };

  const send = async () => {
    const body = text.trim();
    const ready = pendingFiles.filter((f) => f.media);
    if (!body && !ready.length) return;
    if (pendingFiles.some((f) => !f.media && !f.error)) return toast.info('Wait for uploads to finish.');
    const nonce = `${Date.now()}`;
    const optimistic = {
      _id: `tmp-${nonce}`, clientNonce: nonce, sending: true, roomId,
      kind: 'USER', message: body, senderId: { _id: me._id, name: me.name },
      attachments: ready.map((f) => f.media), replyTo, createdAt: new Date().toISOString(),
      readBy: [me._id], reactions: [],
    };
    setMsgs((cur) => [...cur, optimistic]);
    atBottom.current = true;
    setText(''); setReplyTo(null); setPendingFiles([]); setMentionQuery(null);
    emitTyping(false);
    try {
      const saved = await post(`/chat/${roomId}/messages`, {
        message: body,
        attachments: ready.map((f) => f.media._id),
        replyTo: replyTo?._id,
        clientNonce: nonce,
      });
      setMsgs((cur) => (cur.some((x) => x._id === saved._id)
        ? cur.filter((x) => x._id !== optimistic._id)
        : cur.map((x) => (x._id === optimistic._id ? saved : x))));
      qc.invalidateQueries({ queryKey: ['chat-rooms'] });
    } catch (e) {
      setMsgs((cur) => cur.map((x) => (x._id === optimistic._id ? { ...x, sending: false, failed: true } : x)));
      toast.error(errMsg(e, 'Message not sent.'));
    }
  };

  const attach = (files: FileList | null) => {
    Array.from(files || []).forEach((file) => {
      const key = `${file.name}-${Date.now()}`;
      setPendingFiles((p) => [...p, { key, name: file.name, file }]);
      startUpload({ file, category: 'CHAT', contentId: room?.contentId?._id, clientId: room?.clientId?._id, silent: true })
        .then((media) => setPendingFiles((p) => p.map((x) => (x.key === key ? { ...x, media } : x))))
        .catch(() => setPendingFiles((p) => p.map((x) => (x.key === key ? { ...x, error: true } : x))));
    });
  };

  const react = (m: any, key: string) =>
    post(`/chat/message/${m._id}/reaction`, { key }).catch((e) => toast.error(errMsg(e)));

  const toTask = async (m: any) => {
    try {
      const t = await post(`/chat/message/${m._id}/task`, {});
      qc.invalidateQueries({ queryKey: ['tasks'] });
      useUI.getState().toast('success', 'Task created from message.', { label: 'Open', run: () => (window.location.href = `/tasks/${t._id}`) });
    } catch (e) { toast.error(errMsg(e)); }
  };
  const pin = (m: any) => post(`/chat/message/${m._id}/pin`).catch((e) => toast.error(errMsg(e)));
  const remove = (m: any) => {
    if (!window.confirm('Delete this message permanently?')) return;
    del(`/chat/message/${m._id}`)
      .then(() => {
        setMsgs((cur) => cur.filter((x) => x._id !== m._id));
        toast.success('Message deleted');
        qc.invalidateQueries({ queryKey: ['chat-messages', roomId] });
        qc.invalidateQueries({ queryKey: ['chat-rooms'] });
      })
      .catch((e) => toast.error(errMsg(e)));
  };

  const others = useMemo(() => (room?.participants || []).filter((p: any) => String(p?._id || p) !== me._id), [room, me._id]);
  const stateOf = (m: any) => {
    if (m.failed) return 'Not sent';
    if (m.sending) return 'Sending';
    const readIds = (m.readBy || []).map((x: any) => String(x?._id || x));
    const delivIds = (m.deliveredTo || []).map((x: any) => String(x?._id || x));
    const o = others.map((p: any) => String(p?._id || p));
    if (!o.length) return 'Sent';
    if (o.every((id: string) => readIds.includes(id))) return 'Read';
    if (o.some((id: string) => delivIds.includes(id) || readIds.includes(id))) return 'Delivered';
    return 'Sent';
  };
  const seenTitle = (m: any) => {
    if (m.failed) return 'Failed to send';
    if (m.sending) return 'Sending...';
    const readIds = (m.readBy || []).map((x: any) => String(x?._id || x));
    const delivIds = (m.deliveredTo || []).map((x: any) => String(x?._id || x));
    const readOthers = others.filter((p: any) => readIds.includes(String(p?._id || p)));
    if (readOthers.length > 0) {
      if (room?.type === 'DIRECT') return 'Seen';
      return `Seen by ${readOthers.map((p: any) => p.name || 'Member').join(', ')}`;
    }
    const delivOthers = others.filter((p: any) => delivIds.includes(String(p?._id || p)));
    if (delivOthers.length > 0) {
      if (room?.type === 'DIRECT') return 'Delivered';
      return `Delivered to ${delivOthers.map((p: any) => p.name || 'Member').join(', ')}`;
    }
    return 'Sent';
  };
  const globalTyping = useUI((s) => s.typing);
  const typingNames = useMemo(() => {
    const fromGlobal = Object.values(globalTyping || {})
      .filter((t) => t.roomId === roomId && t.userId !== me._id)
      .map((t) => t.name);
    const fromLocal = Object.entries(typing)
      .filter(([uid]) => uid !== me._id)
      .map(([, name]) => name);
    return [...new Set([...fromGlobal, ...fromLocal])];
  }, [globalTyping, typing, roomId, me._id]);

  const actionsQ = useQuery({
    queryKey: ['chat-actions', roomId],
    queryFn: () => get(`/chat/${roomId}/actions`),
    enabled: !!roomId,
  });
  const pendingActions = (actionsQ.data || []).filter((a: any) => a.status === 'PENDING');

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onAct = () => {
      qc.invalidateQueries({ queryKey: ['chat-actions', roomId] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['content'] });
    };
    s.on('chat:action_executed', onAct);
    return () => { s.off('chat:action_executed', onAct); };
  }, [roomId, qc]);

  const executeAction = async (actionId: string, decision?: string) => {
    try {
      await post(`/chat/action/${actionId}/execute`, { decision });
      toast.success(decision === 'APPROVE' ? 'Approved successfully' : 'Action executed');
      qc.invalidateQueries({ queryKey: ['chat-actions', roomId] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['content'] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not execute action');
    }
  };

  const [actionsExpanded, setActionsExpanded] = useState(false);

  const dismissAction = async (actionId: string) => {
    try {
      await post(`/chat/action/${actionId}/dismiss`);
      toast.success('Action dismissed');
      qc.invalidateQueries({ queryKey: ['chat-actions', roomId] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not dismiss action');
    }
  };

  const clearAllActions = async () => {
    try {
      await post(`/chat/${roomId}/actions/clear-all`);
      toast.success('All actions cleared');
      qc.invalidateQueries({ queryKey: ['chat-actions', roomId] });
    } catch (err: any) {
      toast.error(err?.message || 'Could not clear actions');
    }
  };

  // Audio recorder integration
  const recorder = useAudioRecorder((file) => attach(Object.assign(new DataTransfer(), { files: (() => { const dt = new DataTransfer(); dt.items.add(file); return dt.files; })() }).files));

  if (q.isLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>;
  if (q.isError) return <Empty title="This chat is not available" hint={errMsg(q.error)} />;

  let lastDay = '';
  return (
    <div className={clsx(
      'flex min-h-0 flex-col',
      embedded ? 'h-[70dvh] overflow-hidden rounded-2xl border border-line shadow-card bg-canvas' : 'h-full bg-canvas'
    )}>
      {/* WhatsApp Web conversation search bar */}
      {search !== null && (
        <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-2">
          <Search size={17} className="text-ink-2 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search in conversation"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-[14px] text-ink placeholder-ink-3 focus:outline-none"
          />
          <button
            onClick={() => setSearch(null)}
            className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Pinned message banner */}
      {pinned.length > 0 && search === null && (
        <div className="flex animate-slide-down items-center gap-2 border-b border-line bg-surface-2/90 px-3 py-2 text-meta backdrop-blur-sm">
          <Pin size={13} className="shrink-0 text-primary" />
          <span className="truncate text-ink-2"><b className="text-ink">{pinned[pinned.length - 1].senderId?.name}:</b> {pinned[pinned.length - 1].message}</span>
          {pinned.length > 1 && <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-primary-ink text-[11px] font-semibold">+{pinned.length - 1}</span>}
        </div>
      )}

      {/* Persistent Workflow Actions Banner — Sleek & Collapsible */}
      {pendingActions.length > 0 && search === null && (
        <div className="border-b border-line bg-surface/95 backdrop-blur-md transition-all shadow-xs shrink-0 z-10">
          {/* Main / Primary Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                <CheckSquare size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12.5px] font-bold text-ink truncate">
                    {pendingActions[0].title}
                  </span>
                  {pendingActions.length > 1 && (
                    <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.2 text-[10.5px] font-bold text-primary-ink">
                      +{pendingActions.length - 1} more
                    </span>
                  )}
                </div>
                {pendingActions[0].description && (
                  <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                    {pendingActions[0].description}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Actions for primary action */}
            <div className="flex items-center gap-2 shrink-0">
              <ActionButtons
                act={pendingActions[0]}
                onExecute={(dec) => executeAction(pendingActions[0]._id, dec)}
                onDismiss={() => dismissAction(pendingActions[0]._id)}
              />

              {pendingActions.length > 1 && (
                <button
                  onClick={() => setActionsExpanded(!actionsExpanded)}
                  className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 hover:bg-surface-3 hover:text-ink transition-colors"
                >
                  <span>{actionsExpanded ? 'Hide' : `View all (${pendingActions.length})`}</span>
                  <ChevronDown size={13} className={clsx('transition-transform', actionsExpanded && 'rotate-180')} />
                </button>
              )}
            </div>
          </div>

          {/* Expanded Drawer for older/other actions */}
          {actionsExpanded && pendingActions.length > 1 && (
            <div className="border-t border-line/70 bg-slate-50/90 dark:bg-surface-2/60 px-4 py-2.5 max-h-56 overflow-y-auto space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  All Pending Actions ({pendingActions.length})
                </span>
                <button
                  onClick={clearAllActions}
                  className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                >
                  Clear all actions
                </button>
              </div>
              {pendingActions.slice(1).map((act: any) => (
                <div
                  key={act._id}
                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-line/80 bg-surface px-3 py-2 text-meta shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-ink text-[12px]">{act.title}</span>
                    {act.description && (
                      <span className="text-slate-500 dark:text-slate-400 text-[11.5px] block truncate">
                        {act.description}
                      </span>
                    )}
                  </div>
                  <ActionButtons
                    act={act}
                    onExecute={(dec) => executeAction(act._id, dec)}
                    onDismiss={() => dismissAction(act._id)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages scroller with authentic WhatsApp doodle wallpaper */}
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3 sm:px-6 whatsapp-wallpaper select-text"
        onClick={() => { setMenu(null); setShowPicker(false); }}
      >
        {loadingMore && <div className="flex justify-center py-2"><Spinner /></div>}
        {!msgs.length && (
          <div className="flex h-full items-center justify-center">
            <div className="rounded-xl bg-white/90 dark:bg-[#182229]/95 px-4 py-3 shadow-[0_1px_1px_rgba(11,20,26,0.12)] border border-black/5 dark:border-white/5 text-center max-w-sm backdrop-blur-sm">
              <div className="text-[13px] font-medium text-[#111b21] dark:text-[#e9edef]">
                {search ? 'No messages match your search' : 'No messages here yet'}
              </div>
              <div className="mt-1 text-[12px] text-[#667781] dark:text-[#8696a0]">
                {search ? 'Try searching for a different keyword.' : 'Send a message, photo, audio, or document to start chatting!'}
              </div>
            </div>
          </div>
        )}
        {msgs.map((m, i) => {
          const day = new Date(m.createdAt).toDateString();
          const showDay = day !== lastDay; lastDay = day;
          const mine = m.senderId?._id === me._id;
          const prev = msgs[i - 1];
          const grouped = !showDay && prev && prev.kind === 'USER' && m.kind === 'USER'
            && prev.senderId?._id === m.senderId?._id
            && +new Date(m.createdAt) - +new Date(prev.createdAt) < 5 * 60_000;
          const hasMedia = (m.attachments || []).length > 0;
          const hasOnlyMedia = !m.message && hasMedia;
          const singleMedia = hasOnlyMedia && m.attachments?.length === 1 && (isImage(m.attachments[0]?.mimeType, m.attachments[0]?.fileName) || isVideo(m.attachments[0]?.mimeType, m.attachments[0]?.fileName));

          return (
            <div key={m._id}>
              {/* Day separator */}
              {showDay && (
                <div className="my-3 flex justify-center sticky top-2 z-10 pointer-events-none">
                  <span className="rounded-lg bg-white/95 dark:bg-[#182229]/95 px-3 py-1 text-[12px] font-medium text-[#54656f] dark:text-[#8696a0] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] border border-black/5 dark:border-white/5 uppercase tracking-wider backdrop-blur-sm pointer-events-auto">
                    {new Date(m.createdAt).toDateString() === new Date().toDateString() ? 'Today' : fmtDate(m.createdAt)}
                  </span>
                </div>
              )}

              {/* WhatsApp System announcement pill */}
              {m.kind === 'SYSTEM' ? (
                <div className="my-2.5 flex justify-center">
                  <div className="max-w-[90%] sm:max-w-md rounded-lg bg-white/95 dark:bg-[#182229]/95 px-3.5 py-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.12)] border border-black/5 dark:border-white/5 text-center backdrop-blur-sm">
                    <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#00a884] dark:text-[#25d366]">
                      {m.system?.title}
                    </div>
                    {m.system?.mediaId ? (
                      <div className="mt-1.5"><DocumentCard m={m.system.mediaId} isMine={false} /></div>
                    ) : (
                      <div className="mt-0.5 space-y-0.5 text-[12.5px] text-[#54656f] dark:text-[#8696a0]">
                        {(m.system?.lines || []).filter(Boolean).map((l: string, k: number) => <div key={k}>{l}</div>)}
                      </div>
                    )}
                    <div className="mt-1 text-[10.5px] text-[#8696a0] dark:text-[#667781]">
                      System · {fmtTime(m.createdAt)}
                    </div>
                  </div>
                </div>
              ) : (
                /* User message — WhatsApp Web bubbles */
                <div className={clsx(
                  'group relative flex animate-rise px-1 sm:px-2',
                  grouped ? 'mt-0.5' : 'mt-2.5',
                  mine ? 'justify-end' : 'justify-start',
                  m.sending && 'opacity-70'
                )}>
                  {/* Bubble wrapper */}
                  <div className={clsx(
                    'relative',
                    hasMedia ? 'w-full max-w-[340px] sm:max-w-[360px]' : 'max-w-[85%] sm:max-w-[68%]',
                    mine ? 'items-end flex flex-col' : 'items-start flex flex-col'
                  )}>
                    {/* SVG Tails (only shown when not grouped) */}
                    {!grouped && (mine ? <OutgoingTail /> : <IncomingTail />)}

                    {/* Bubble body */}
                    <div className={clsx(
                      'relative shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] w-full',
                      mine
                        ? clsx('bg-[#d9fdd3] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-lg', !grouped && 'rounded-tr-none')
                        : clsx('bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-lg', !grouped && 'rounded-tl-none'),
                      singleMedia ? 'overflow-hidden p-0.5' : hasOnlyMedia ? 'p-1 overflow-hidden' : hasMedia ? 'p-1 overflow-hidden' : 'px-2.5 pt-1.5 pb-1'
                    )}>
                      {/* Sender name for incoming messages */}
                      {!grouped && !mine && (
                        <div className={clsx('text-[12.5px] font-semibold mb-0.5 select-none leading-tight px-1 pt-0.5', getParticipantColor(m.senderId?.name))}>
                          {m.senderId?.name || 'User'}
                        </div>
                      )}

                      {/* Reply quote */}
                      {m.replyTo && (
                        <div className={clsx(
                          'mb-1.5 rounded-md px-2.5 py-1 text-[12px]',
                          mine
                            ? 'border-l-[3.5px] border-[#00a884] bg-black/5 dark:bg-black/25'
                            : 'border-l-[3.5px] border-[#53bdeb] bg-[#f0f2f5] dark:bg-[#111b21]/50'
                        )}>
                          <span className={clsx('font-semibold block', mine ? 'text-[#00a884]' : 'text-[#53bdeb]')}>
                            {m.replyTo.senderId?.name || 'System'}
                          </span>
                          <div className="truncate text-[#54656f] dark:text-[#8696a0]">
                            {(m.replyTo.message || m.replyTo.system?.title || '').slice(0, 90)}
                          </div>
                        </div>
                      )}

                      {/* WhatsApp style: Attachments rendered FIRST at the top */}
                      {(m.attachments || []).length > 0 && (
                        <div className={clsx('flex flex-col gap-1 w-full', m.message && 'mb-1')}>
                          {(m.attachments || []).map((f: any) => (
                            <AttachmentBubble key={f._id} file={f} isMine={mine} />
                          ))}
                        </div>
                      )}

                      {/* Text (WhatsApp style: caption rendered below media) */}
                      {m.message && (
                        <div className={clsx('whitespace-pre-wrap break-words text-[14.2px] leading-[1.42] select-text', hasMedia ? 'px-1.5 pt-0.5 pb-0.5' : '')}>
                          {renderMentions(m.message, mine, me.name)}
                        </div>
                      )}

                      {/* Time + status checkmarks */}
                      <div className={clsx(
                        'flex items-center gap-1 text-[11px] tabular select-none leading-none',
                        singleMedia
                          ? 'absolute bottom-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-white backdrop-blur-xs shadow-xs'
                          : 'float-right ml-2.5 mt-1',
                        !singleMedia && (mine ? 'text-[#667781] dark:text-[#ffffff]/65' : 'text-[#667781] dark:text-[#8696a0]')
                      )}>
                        <span>{fmtTime(m.createdAt)}</span>
                        {mine && (
                          m.failed ? (
                            <span className="text-red-500 font-bold" title="Failed to send">!</span>
                          ) : stateOf(m) === 'Read' ? (
                            <span title={seenTitle(m)} className="cursor-help"><CheckCheck size={15} className="text-[#53bdeb]" /></span>
                          ) : stateOf(m) === 'Delivered' ? (
                            <span title={seenTitle(m)} className="cursor-help"><CheckCheck size={15} className="text-[#667781] dark:text-[#ffffff]/65" /></span>
                          ) : stateOf(m) === 'Sending' ? (
                            <span title="Sending..."><Clock size={11} className="text-[#667781] dark:text-[#ffffff]/65" /></span>
                          ) : (
                            <span title={seenTitle(m)} className="cursor-help"><Check size={15} className={singleMedia ? 'text-white' : 'text-[#667781] dark:text-[#ffffff]/65'} /></span>
                          )
                        )}
                      </div>
                    </div>

                    {/* Reactions pill */}
                    {(m.reactions || []).length > 0 && (
                      <div className={clsx('relative z-10 -mt-2 flex flex-wrap gap-1', mine ? 'justify-end pr-1' : 'justify-start pl-1')}>
                        {Object.entries(REACTIONS).map(([k, r]) => {
                          const n = m.reactions.filter((x: any) => x.key === k);
                          if (!n.length) return null;
                          const on = n.some((x: any) => String(x.userId) === me._id);
                          const Icon = r.icon;
                          return (
                            <button
                              key={k}
                              title={r.label}
                              onClick={() => react(m, k)}
                              className={clsx(
                                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] tabular shadow-[0_1px_1px_rgba(11,20,26,0.18)] transition-all duration-150 hover:scale-105 active:scale-95',
                                on
                                  ? 'bg-[#d9fdd3] dark:bg-[#005c4b] border border-[#00a884]/40 text-[#111b21] dark:text-white'
                                  : 'bg-white dark:bg-[#202c33] border border-[#e9edef] dark:border-[#2a3942] text-[#111b21] dark:text-[#e9edef]'
                              )}
                            >
                              <Icon size={12} className={r.color} />
                              {n.length > 1 && <span className="text-[10px] font-bold opacity-80">{n.length}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* WhatsApp Quick Action Toolbar (revealed on hover) */}
                  {!m.sending && !m.failed && (
                    <div className={clsx(
                      'absolute top-[-36px] z-20 hidden group-hover:flex items-center rounded-full bg-white dark:bg-[#202c33] px-2 py-1 shadow-[0_2px_8px_rgba(11,20,26,0.18)] border border-[#e9edef] dark:border-[#2a3942]',
                      mine ? 'right-2' : 'left-2'
                    )}>
                      <ReactionBar
                        onReact={(k) => react(m, k)}
                        onReply={() => setReplyTo(m)}
                        onTask={() => toTask(m)}
                        onReminder={() => setReminderFor(m)}
                        onPin={() => pin(m)}
                        onTagAlert={() => onTagAlert(m)}
                        onDelete={(mine || me.role === 'SUPER_ADMIN') ? () => remove(m) : undefined}
                        isMine={mine}
                        hasMention={Boolean(m.message && m.message.includes('@'))}
                      />
                    </div>
                  )}

                  {/* Mobile 3-dot menu */}
                  {!m.sending && !m.failed && (
                    <button
                      className={clsx(
                        'absolute top-0 p-1 text-[#8696a0] sm:hidden',
                        mine ? 'left-0' : 'right-0'
                      )}
                      aria-label="Message actions"
                      onClick={(e) => { e.stopPropagation(); setMenu(menu === m._id ? null : m._id); }}
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Typing indicator */}
        <div className="h-8 pl-4 pt-1.5 text-meta text-[#54656f] dark:text-[#8696a0]">
          {typingNames.length > 0 && (
            <span className="inline-flex animate-fade-in items-center gap-2">
              <span className="inline-flex items-center gap-[3px] rounded-full bg-white/80 dark:bg-[#202c33]/80 px-2.5 py-1.5 shadow-xs">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-[#00a884]" style={{ animation: 'bounce3 1.2s ease-in-out infinite', animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
              <span className="text-[12.5px] italic text-[#00a884] dark:text-[#25d366] font-medium">{typingNames.join(', ')} {typingNames.length > 1 ? 'are' : 'is'} typing…</span>
            </span>
          )}
        </div>
      </div>

      {/* ── WhatsApp Web Composer ── */}
      <div className="relative border-t border-[#e9edef] dark:border-[#222d34] bg-[#f0f2f5] dark:bg-[#202c33] px-3 py-2 safe-b-3">
        {/* WhatsApp Tag Autocomplete Popover */}
        {mentionQuery !== null && (
          <MentionPicker
            members={filteredMembers}
            query={mentionQuery}
            selectedIndex={mentionIndex}
            onSelect={insertMention}
            onClose={() => setMentionQuery(null)}
          />
        )}

        {/* Reply banner */}
        {replyTo && (
          <div className="mb-2 flex animate-rise items-center justify-between gap-3 rounded-lg border-l-[3.5px] border-[#00a884] bg-white/95 dark:bg-[#111b21]/75 px-3 py-2 text-[13px] shadow-[0_1px_1px_rgba(11,20,26,0.08)]">
            <div className="truncate">
              <span className="font-semibold text-[#00a884] block">{replyTo.senderId?.name || 'System'}</span>
              <div className="truncate text-[#54656f] dark:text-[#8696a0]">
                {replyTo.message || replyTo.system?.title || 'Attachment'}
              </div>
            </div>
            <button aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="shrink-0 p-1 text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef]">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Audio recording bar */}
        {recorder.recording && (
          <div className="mb-2 flex animate-rise items-center gap-3 rounded-xl bg-red-500/10 dark:bg-red-500/20 px-3 py-2 border border-red-500/20">
            <span className="flex h-3 w-3 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" style={{ animation: 'pulse 1s ease-in-out infinite' }} />
            <span className="flex-1 font-semibold text-red-600 dark:text-red-400 tabular text-[14px]">{fmtDur(recorder.duration)}</span>
            <button
              onClick={recorder.cancel}
              className="rounded-full px-3 py-1 text-[13px] font-medium text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              onClick={recorder.stop}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00a884] text-white hover:bg-[#008f6f] shadow-sm"
              title="Send voice message"
            >
              <Send size={15} />
            </button>
          </div>
        )}

        {/* Pending file thumbnails */}
        {pendingFiles.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingFiles.map((f) => (
              <PendingChip key={f.key} pf={f} onRemove={() => setPendingFiles((p) => p.filter((x) => x.key !== f.key))} />
            ))}
          </div>
        )}

        {/* Composer controls row */}
        <div className="flex items-end gap-2 pb-0.5">

          {/* Hidden file inputs */}
          <input ref={fileRef} type="file" hidden multiple onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
          <input ref={imgRef} type="file" hidden multiple accept="image/*,.png,.jpg,.jpeg,.webp,.heic,.heif,.gif,.svg" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
          <input ref={vidRef} type="file" hidden multiple accept="video/*,.mp4,.mov,.mkv,.avi,.webm,.m4v,.wmv,.mts,.m2ts" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
          <input ref={audRef} type="file" hidden multiple accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
          <input ref={docRef} type="file" hidden multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
          <input ref={camRef} type="file" hidden accept="image/*,video/*" capture="environment" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />

          {/* Attach / media picker */}
          <div className="relative">
            <button
              type="button"
              aria-label="Attach file"
              title="Attach"
              onClick={(e) => { e.stopPropagation(); setShowPicker((v) => !v); }}
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
                showPicker
                  ? 'bg-black/5 dark:bg-white/10 text-[#00a884]'
                  : 'text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#111b21] dark:hover:text-[#e9edef]'
              )}
            >
              <Paperclip size={22} />
            </button>
            {showPicker && (
              <MediaPicker
                onClose={() => setShowPicker(false)}
                onPickImages={() => imgRef.current?.click()}
                onPickVideos={() => vidRef.current?.click()}
                onPickAudio={() => audRef.current?.click()}
                onPickDocs={() => docRef.current?.click()}
                onPickCam={() => camRef.current?.click()}
              />
            )}
          </div>

          {/* Quick @ Mention Tag Button (1-tap for mobile & desktop) */}
          <button
            type="button"
            aria-label="Tag team member"
            title="Tag team member (@)"
            onClick={openMentionPicker}
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
              mentionQuery !== null
                ? 'bg-[#00a884]/15 text-[#00a884] dark:bg-[#00a884]/25 dark:text-[#25d366]'
                : 'text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10 hover:text-[#00a884]'
            )}
          >
            <AtSign size={20} />
          </button>

          {/* Message input */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => onType(e.target.value, e.target)}
            onKeyDown={(e) => {
              if (mentionQuery !== null && filteredMembers.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % filteredMembers.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + filteredMembers.length) % filteredMembers.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  const sel = filteredMembers[mentionIndex] || filteredMembers[0];
                  if (sel) insertMention(sel);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setMentionQuery(null);
                  return;
                }
              }
              if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer: coarse)').matches) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Type a message or @ to tag team..."
            aria-label="Type a message"
            className="flex-1 max-h-32 min-h-[42px] resize-none rounded-lg bg-white dark:bg-[#2a3942] px-4 py-2.5 text-[15px] text-[#111b21] dark:text-[#d1d7db] placeholder:text-[#8696a0] focus:outline-none shadow-[0_1px_0.5px_rgba(11,20,26,0.08)] leading-[1.4]"
            style={{ height: Math.min(128, 42 + (text.split('\n').length - 1) * 20) }}
          />

          {/* Send / Mic Button */}
          {!text.trim() && !pendingFiles.length ? (
            <button
              type="button"
              aria-label={recorder.recording ? 'Stop recording' : 'Voice message'}
              title="Voice message"
              onClick={() => (recorder.recording ? recorder.stop() : recorder.start())}
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all active:scale-95',
                recorder.recording
                  ? 'bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.6)]'
                  : 'text-[#54656f] dark:text-[#8696a0] hover:bg-black/5 dark:hover:bg-white/10'
              )}
            >
              {recorder.recording ? <MicOff size={20} /> : <Mic size={22} />}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              title="Send"
              onClick={send}
              disabled={!text.trim() && !pendingFiles.some((f) => f.media)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] hover:bg-[#008f6f] active:scale-95 text-white shadow-sm transition-all disabled:opacity-50"
            >
              <Send size={18} className="translate-x-0.5" />
            </button>
          )}
        </div>
      </div>

      {a.modal}
      <ReminderFormModal
        open={!!reminderFor}
        onClose={() => setReminderFor(null)}
        preset={{ messageId: reminderFor?._id, title: reminderFor?.message?.slice(0, 120) }}
      />
    </div>
  );
}

function renderMentions(t: string, isMine = false, myName = '') {
  const myFirst = myName ? myName.split(' ')[0].toLowerCase() : '';
  return t.split(/(@[a-zA-Z0-9_]+)/g).map((p, i) => {
    if (!p.startsWith('@')) return p;
    const tag = p.slice(1).toLowerCase();
    const isMe = myFirst && tag === myFirst;
    return (
      <span
        key={i}
        className={clsx(
          'inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold text-[13.5px] transition-all align-baseline',
          isMe
            ? 'bg-amber-400/30 text-amber-900 dark:text-amber-200 ring-1 ring-amber-400/60 shadow-xs'
            : isMine
              ? 'bg-white/30 text-white underline decoration-white/50'
              : 'bg-[#00a884]/20 text-[#008f6f] dark:bg-[#00a884]/30 dark:text-[#25d366]'
        )}
      >
        <span className="opacity-75 font-normal">@</span>
        {p.slice(1)}
        {isMe && (
          <span className="ml-1 rounded bg-amber-500 text-white text-[8.5px] px-1 py-0.5 uppercase font-black tracking-wider leading-none">
            YOU
          </span>
        )}
      </span>
    );
  });
}

export function roomTitle(r: any, meId: string) {
  return r.type === 'DIRECT' ? r.participants?.find((p: any) => String(p?._id || p) !== meId)?.name || 'Direct chat' : r.name;
}

export function RoomSub({ r, meId }: { r: any; meId: string }) {
  const globalTyping = useUI((s) => s.typing);
  const presence = useUI((s) => s.presence);

  // Check if anyone in this room is typing
  const typingUser = Object.values(globalTyping || {}).find(
    (t) => t.roomId === r._id && t.userId !== meId
  );

  if (typingUser) {
    return (
      <span className="inline-flex items-center gap-1.5 font-medium text-[#00a884] dark:text-[#25d366] animate-pulse">
        <span>{r.type === 'DIRECT' ? 'typing' : `${typingUser.name.split(' ')[0]} is typing`}</span>
        <span className="inline-flex items-center gap-[2px]">
          <span className="h-1 w-1 rounded-full bg-[#00a884] dark:bg-[#25d366] animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-1 w-1 rounded-full bg-[#00a884] dark:bg-[#25d366] animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-1 w-1 rounded-full bg-[#00a884] dark:bg-[#25d366] animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </span>
    );
  }

  const other = r.type === 'DIRECT' ? r.participants?.find((p: any) => String(p?._id || p) !== meId) : null;
  if (other) {
    const otherId = String(other._id || other);
    const pres = presence[otherId];
    const st = pres?.status;
    if (st === 'ONLINE') {
      return (
        <span className="inline-flex items-center gap-1.5 text-[#00a884] dark:text-[#25d366] font-medium">
          <span className="h-2 w-2 rounded-full bg-[#00a884] dark:bg-[#25d366] animate-pulse" />
          online
        </span>
      );
    }
    if (st === 'AWAY') {
      return (
        <span className="inline-flex items-center gap-1.5 text-amber-500 font-medium">
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          away{pres?.lastActive ? ` · active ${ago(pres.lastActive)}` : ''}
        </span>
      );
    }
    if (st === 'DND') {
      return (
        <span className="inline-flex items-center gap-1.5 text-rose-500 font-medium">
          <span className="h-2 w-2 rounded-full bg-rose-500" />
          do not disturb
        </span>
      );
    }
    return (
      <span className="text-ink-2">
        {formatLastSeen(pres?.lastSeen || pres?.lastActive)}
      </span>
    );
  }

  const onlineCount = (r.participants || []).filter((p: any) => {
    const pId = String(p?._id || p);
    return pId !== meId && presence[pId]?.status === 'ONLINE';
  }).length;

  const onlineSuffix = onlineCount > 0 ? ` · ${onlineCount} online` : '';

  if (r.type === 'CONTENT' && r.contentId) {
    return (
      <span className="truncate">
        <Link to={`/content/${r.contentId._id || r.contentId}`} className="hover:text-primary-ink font-medium">
          Content chat · {r.contentId.contentId || ''}
        </Link>
        <span className="text-ink-3">{onlineSuffix}</span>
      </span>
    );
  }
  if (r.type === 'CLIENT') {
    return <span>Client workspace · {r.participants?.length || 0} members{onlineSuffix}</span>;
  }
  return <span>Team chat · {r.participants?.length || 0} members{onlineSuffix}</span>;
}
