import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Check, Clock, MessageSquarePlus, RotateCcw, X, AlertCircle } from 'lucide-react';
import { API_URL, DIRECT_URL } from '@/lib/api';
import { Button, Spinner, Textarea, Input } from '@/components/ui';
import { fmtTs } from '@/lib/format';

/**
 * The only screen a client ever sees. No login, no navigation, nothing beyond this one item.
 * Uses a plain axios instance so no staff session or token is ever attached.
 */
const pub = axios.create({ baseURL: `${API_URL}/api/public/approval` });
type Comment = { timestampSec?: number; comment: string };

// Defined at module level: a component declared inside render would remount the video and inputs on every keystroke
function Shell({ children, bar }: { children: React.ReactNode; bar?: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-canvas">
      <div className="mx-auto w-full max-w-xl animate-page px-4 pb-44" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 24px)' }}>{children}</div>
      {bar}
    </div>
  );
}

export default function PublicApproval() {
  const { token } = useParams(); const video = useRef<HTMLVideoElement>(null);
  const [d, setD] = useState<any>(null); const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [mode, setMode] = useState<'view' | 'changes' | 'confirm'>('view'); const [comments, setComments] = useState<Comment[]>([]); const [text, setText] = useState(''); const [useTs, setUseTs] = useState(true); const [now, setNow] = useState(0);
  const [name, setName] = useState(''); const [busy, setBusy] = useState(false); const [result, setResult] = useState<null | 'APPROVED' | 'CHANGES_REQUESTED'>(null); const [submitErr, setSubmitErr] = useState('');

  useEffect(() => {
    document.title = 'Review';
    pub.get(`/${token}`).then((r) => { setD(r.data); document.title = `Review — ${r.data.title}`; if (r.data.decided) setResult(r.data.status); else pub.post(`/${token}/open`).catch(() => undefined); })
      .catch((e) => setError({ code: e.response?.data?.error?.code || 'ERROR', message: e.response?.data?.error?.message || 'This review link could not be opened. Please check your connection and try again.' }));
  }, [token]);

  const addComment = () => { if (!text.trim()) return; setComments((c) => [...c, { comment: text.trim(), ...(d.hasVideo && useTs ? { timestampSec: Math.floor(video.current?.currentTime || 0) } : {}) }]); setText(''); };
  const submit = async (decision: 'approve' | 'request-changes') => {
    const list = decision === 'request-changes' && text.trim() ? [...comments, { comment: text.trim(), ...(d.hasVideo && useTs ? { timestampSec: Math.floor(video.current?.currentTime || 0) } : {}) }] : comments;
    if (decision === 'request-changes' && !list.length) { setSubmitErr('Please describe at least one change.'); return; }
    setBusy(true); setSubmitErr('');
    try { const r = await pub.post(`/${token}/${decision}`, { name: name.trim() || undefined, comments: decision === 'request-changes' ? list : undefined }); setResult(r.data.status); window.scrollTo({ top: 0 }); }
    catch (e: any) { if (e.response?.status === 409) setResult(d.status === 'CHANGES_REQUESTED' ? 'CHANGES_REQUESTED' : 'APPROVED'); else setSubmitErr(e.response?.data?.error?.message || 'Could not send your response. Please try again.'); }
    setBusy(false);
  };

  if (error) return <Shell><div className="card mt-10 p-6 text-center">{error.code === 'EXPIRED' ? <Clock size={28} className="mx-auto text-warning" /> : <AlertCircle size={28} className="mx-auto text-ink-3" />}<h1 className="mt-3 !text-[20px] !leading-7">{error.code === 'EXPIRED' ? 'This link has expired' : error.code === 'CANCELLED' ? 'This link is no longer active' : error.code === 'NOT_FOUND' ? 'Link not found' : 'Something went wrong'}</h1><p className="mt-2 text-ink-2">{error.code === 'NOT_FOUND' ? 'Please use the latest link you were sent, or contact your account manager.' : error.message}</p></div></Shell>;
  if (!d) return <Shell><div className="flex justify-center pt-24"><Spinner /></div></Shell>;
  const isScript = d.type === 'CLIENT_SCRIPT';

  if (result) return (
    <Shell><div className="card mt-10 animate-modal-in p-8 text-center shadow-lift">
      {result === 'APPROVED'
        ? <svg viewBox="0 0 52 52" className="mx-auto h-14 w-14" aria-hidden><circle cx="26" cy="26" r="24" fill="none" stroke="rgb(var(--success))" strokeWidth="3" strokeDasharray="151" strokeDashoffset="151" strokeLinecap="round" style={{ animation: 'draw 0.6s ease-out forwards' }} /><path d="M15 27l8 8 14-16" fill="none" stroke="rgb(var(--success))" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="36" strokeDashoffset="36" style={{ animation: 'draw 0.35s 0.5s ease-out forwards' }} /></svg>
        : <span className="mx-auto flex h-14 w-14 animate-badge-pop items-center justify-center rounded-full bg-primary-soft text-primary-ink"><RotateCcw size={26} /></span>}
      <h1 className="mt-3 !text-[22px] !leading-7">{result === 'APPROVED' ? 'Approved. Thank you.' : 'Your changes were sent'}</h1>
      <p className="mt-2 text-ink-2">{result === 'APPROVED' ? `Your approval of "${d.title}" (${d.version}) has been recorded. The team will take it from here.` : `The team has received your feedback on "${d.title}" and will share an updated version.`}</p>
      <p className="mt-4 text-meta text-ink-3">You can close this page. This link cannot be used again.</p>
    </div></Shell>
  );

  return (
    <Shell bar={
      <div className="fixed inset-x-0 bottom-0 animate-sheet-in border-t border-line bg-surface/95 shadow-pop backdrop-blur safe-b">
        <div key={mode} className="mx-auto flex w-full max-w-xl animate-fade-in flex-col gap-2 p-3">
          {mode === 'view' && <><Button variant="success" size="lg" className="w-full !text-[16px] font-semibold uppercase tracking-wide" icon={<Check size={18} />} onClick={() => setMode('confirm')}>Approve</Button><Button size="lg" className="w-full !text-[15px] font-semibold uppercase tracking-wide" icon={<RotateCcw size={16} />} onClick={() => { setMode('changes'); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50); }}>Request changes</Button></>}
          {mode === 'confirm' && <><p className="px-1 text-center text-[13px] text-ink-2">Approve <b className="text-ink">{d.version}</b> as final? This cannot be undone from this link.</p><Button variant="success" size="lg" className="w-full !text-[16px] font-semibold" loading={busy} onClick={() => submit('approve')}>Yes, approve</Button><Button size="lg" className="w-full" disabled={busy} onClick={() => setMode('view')}>Go back</Button></>}
          {mode === 'changes' && <><Button variant="primary" size="lg" className="w-full !text-[16px] font-semibold" loading={busy} onClick={() => submit('request-changes')}>Send change request{comments.length + (text.trim() ? 1 : 0) > 0 ? ` (${comments.length + (text.trim() ? 1 : 0)})` : ''}</Button><Button size="lg" className="w-full" disabled={busy} onClick={() => setMode('view')}>Cancel</Button></>}
        </div>
      </div>
    }>
      <header className="mb-4"><div className="text-meta font-medium uppercase tracking-wide text-ink-2">{d.brand}</div><h1 className="mt-1 !text-[22px] !leading-7">{d.title}</h1><div className="mt-1 text-ink-2">{d.version} · {isScript ? 'Script for your review' : 'Video for your approval'}</div></header>

      {d.hasVideo && <video ref={video} controls playsInline preload="metadata" poster={d.hasThumbnail ? `${DIRECT_URL}/api/public/approval/${token}/thumbnail` : undefined} src={`${DIRECT_URL}/api/public/approval/${token}/video`} onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)} className="mb-4 max-h-[70dvh] w-full rounded-xl bg-black shadow-lift" />}
      {!d.hasVideo && d.hasThumbnail && <img src={`${DIRECT_URL}/api/public/approval/${token}/thumbnail`} alt="" className="mb-4 w-full rounded-lg" />}

      {isScript && d.script && (
        <section className="card mb-4 p-5">
          <div className="mb-2 text-meta font-semibold uppercase tracking-wider text-ink-2">Script</div>
          <div className="rounded-xl border border-line/60 bg-surface-2/40 p-4 font-normal text-[15px] leading-relaxed text-ink whitespace-pre-wrap">
            {d.script.body || d.script.dialogue || [d.script.hook, ...(d.script.scenes || []).filter((s: any) => s.dialogue || s.visual).map((s: any, i: number) => [s.title ? `--- ${s.title} ---` : `--- Scene ${i + 1} ---`, s.dialogue, s.visual ? `[Visual: ${s.visual}]` : ''].filter(Boolean).join('\n')), d.script.cta ? `CTA: ${d.script.cta}` : ''].filter(Boolean).join('\n\n')}
          </div>
        </section>
      )}

      {(d.caption || d.hashtags || d.description) && <section className="card mb-4 space-y-3 p-4">
        {d.description && <div><div className="text-meta font-medium text-ink-2">Description</div><p className="mt-1 whitespace-pre-wrap font-medium text-ink">{d.description}</p></div>}
        {d.caption && <div><div className="text-meta font-medium text-ink-2">Caption</div><p className="mt-1 whitespace-pre-wrap font-medium text-ink">{d.caption}</p></div>}
        {d.hashtags && <div><div className="text-meta font-medium text-ink-2">Hashtags</div><p className="mt-1 font-medium text-primary-ink">{d.hashtags}</p></div>}
      </section>}

      {mode === 'changes' && <section className="card mb-4 animate-rise p-4">
        <h2 className="text-[16px] font-semibold text-ink">What should we change?</h2>
        {comments.length > 0 && <ul className="mt-3 space-y-2">{comments.map((c, i) => <li key={i} className="flex animate-rise items-start gap-2 rounded border border-line p-2.5">{c.timestampSec != null && <button onClick={() => { if (video.current) video.current.currentTime = c.timestampSec!; }} className="rounded bg-inverse px-1.5 py-0.5 text-meta font-medium tabular text-inverse-ink">{fmtTs(c.timestampSec)}</button>}<span className="flex-1 font-medium text-ink">{c.comment}</span><button aria-label="Remove comment" className="p-1 text-ink-3 hover:text-danger" onClick={() => setComments((x) => x.filter((_, n) => n !== i))}><X size={16} /></button></li>)}</ul>}
        <Textarea className="mt-3" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={d.hasVideo ? 'Pause the video where the change is needed, then describe it' : 'Describe the change'} />
        <div className="mt-2 flex items-center justify-between gap-2">{d.hasVideo ? <label className="flex min-h-[40px] items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" className="h-4 w-4" checked={useTs} onChange={(e) => setUseTs(e.target.checked)} />Attach time {fmtTs(now)}</label> : <span />}<Button onClick={addComment} disabled={!text.trim()} icon={<MessageSquarePlus size={15} />}>Add another</Button></div>
        <Input className="mt-3" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      </section>}
      {submitErr && <p role="alert" className="mb-4 rounded bg-danger-soft px-3 py-2 text-[13px] text-danger-ink">{submitErr}</p>}

    </Shell>
  );
}
