import { useState } from 'react';
import clsx from 'clsx';
import { GitCompare, Eye, Split, FileText, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Badge, Button, Modal, Select } from '@/components/ui';

export function diffTokens(str1: string = '', str2: string = '') {
  if (!str1 && !str2) return [];
  if (!str1) return [{ type: 'added' as const, val: str2 }];
  if (!str2) return [{ type: 'removed' as const, val: str1 }];

  const a = str1.split(/(\s+)/);
  const b = str2.split(/(\s+)/);
  const n = a.length;
  const m = b.length;

  if (n > 600 || m > 600) {
    return [{ type: 'same' as const, val: str2 }];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (a[i] === b[j]) dp[i + 1][j + 1] = dp[i][j] + 1;
      else dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  let i = n;
  let j = m;
  const res: { type: 'same' | 'added' | 'removed'; val: string }[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      res.unshift({ type: 'same', val: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      res.unshift({ type: 'added', val: b[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      res.unshift({ type: 'removed', val: a[i - 1] });
      i--;
    }
  }
  return res;
}

export function DiffDisplay({ tokens }: { tokens: { type: 'same' | 'added' | 'removed'; val: string }[] }) {
  return (
    <div className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">
      {tokens.map((t, idx) => {
        if (t.type === 'added') {
          return (
            <ins
              key={idx}
              className="bg-emerald-500/25 text-emerald-300 font-semibold px-0.5 rounded no-underline"
            >
              {t.val}
            </ins>
          );
        }
        if (t.type === 'removed') {
          return (
            <del
              key={idx}
              className="bg-rose-500/25 text-rose-300 line-through px-0.5 rounded opacity-80"
            >
              {t.val}
            </del>
          );
        }
        return <span key={idx}>{t.val}</span>;
      })}
    </div>
  );
}

export function ScriptDiffModal({
  open,
  onClose,
  versions,
}: {
  open: boolean;
  onClose: () => void;
  versions: any[];
}) {
  const sorted = [...versions].sort((a, b) => a.version - b.version);
  const defaultA = sorted.length > 1 ? sorted[sorted.length - 2].version : sorted[0]?.version || 1;
  const defaultB = sorted[sorted.length - 1]?.version || 1;

  const [verA, setVerA] = useState<number>(defaultA);
  const [verB, setVerB] = useState<number>(defaultB);
  const [mode, setMode] = useState<'unified' | 'split'>('unified');

  if (!open || !versions.length) return null;

  const scriptA = sorted.find((x) => x.version === verA) || sorted[0];
  const scriptB = sorted.find((x) => x.version === verB) || sorted[sorted.length - 1];

  const versionOptions = sorted.map((v) => ({
    value: String(v.version),
    label: `${v.label} (by ${v.createdBy?.name || 'Writer'})`,
  }));

  const hookDiff = diffTokens(scriptA?.hook || '', scriptB?.hook || '');
  const addedCount = hookDiff.filter((t) => t.type === 'added').length;
  const removedCount = hookDiff.filter((t) => t.type === 'removed').length;

  const maxScenes = Math.max(scriptA?.scenes?.length || 0, scriptB?.scenes?.length || 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary-ink">
            <GitCompare size={16} />
          </span>
          <span>Script Version Comparison &amp; Diff</span>
        </div>
      }
      wide
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3 text-meta text-ink-2">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded bg-emerald-500/30 ring-1 ring-emerald-500" />
              <b className="text-emerald-400">Green</b> = Added in {scriptB?.label}
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded bg-rose-500/30 ring-1 ring-rose-500" />
              <b className="text-rose-400">Red Strikethrough</b> = Removed from {scriptA?.label}
            </span>
          </div>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Controls */}
        <div className="grid gap-3 rounded-2xl border border-line/60 bg-surface-2/40 p-3.5 backdrop-blur-md sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-meta font-bold text-ink-2">Base Version (Old)</label>
            <Select
              value={String(verA)}
              onChange={(e) => setVerA(Number(e.target.value))}
            >
              {versionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-meta font-bold text-ink-2">Comparison Version (New)</label>
            <Select
              value={String(verB)}
              onChange={(e) => setVerB(Number(e.target.value))}
            >
              {versionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-meta font-bold text-ink-2">View Format</label>
            <div className="flex rounded-xl bg-surface/60 p-1 border border-line/60">
              <button
                type="button"
                onClick={() => setMode('unified')}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-all ${
                  mode === 'unified'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Unified Diff
              </button>
              <button
                type="button"
                onClick={() => setMode('split')}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition-all ${
                  mode === 'split'
                    ? 'bg-primary text-white shadow-xs'
                    : 'text-ink-2 hover:text-ink'
                }`}
              >
                Side-by-Side
              </button>
            </div>
          </div>
        </div>

        {scriptB?.changes && (
          <div className="rounded-xl border border-primary/30 bg-primary-soft/40 p-3 text-[13px] text-ink">
            <span className="font-bold text-primary-ink">Writer's change notes for {scriptB.label}:</span>{' '}
            {scriptB.changes}
          </div>
        )}

        {/* Hook Diff */}
        <div className="rounded-2xl border border-line/60 bg-surface p-4">
          <div className="mb-2 flex items-center justify-between border-b border-line/50 pb-2">
            <span className="font-bold text-[14px] text-ink">Hook (First 3 Seconds)</span>
            <div className="flex gap-2">
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                +{addedCount} additions
              </span>
              <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[11px] font-bold text-rose-300">
                -{removedCount} removals
              </span>
            </div>
          </div>

          {mode === 'unified' ? (
            <div className="rounded-xl bg-surface-2/60 p-3.5 border border-line/40">
              <DiffDisplay tokens={hookDiff} />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-surface-2/60 p-3 border border-line/40">
                <div className="mb-1 text-[11px] font-bold text-ink-3 uppercase">{scriptA.label} (Original)</div>
                <div className="text-[13px] text-ink">{scriptA.hook || '—'}</div>
              </div>
              <div className="rounded-xl bg-primary-soft/30 p-3 border border-primary/30">
                <div className="mb-1 text-[11px] font-bold text-primary-ink uppercase">{scriptB.label} (Revised)</div>
                <div className="text-[13px] text-ink">{scriptB.hook || '—'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Scenes Diff */}
        <div className="space-y-3">
          <div className="font-bold text-[14px] text-ink">Scenes Comparison</div>

          {Array.from({ length: maxScenes }).map((_, idx) => {
            const scnA = scriptA?.scenes?.[idx];
            const scnB = scriptB?.scenes?.[idx];

            const diaDiff = diffTokens(scnA?.dialogue || '', scnB?.dialogue || '');
            const visDiff = diffTokens(scnA?.visual || '', scnB?.visual || '');

            return (
              <div
                key={idx}
                className="rounded-2xl border border-line/60 bg-surface p-4 transition-all"
              >
                <div className="mb-3 flex items-center justify-between border-b border-line/50 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary-ink">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-[13px] text-ink">
                      {scnB?.title || scnA?.title || `Scene ${idx + 1}`}
                    </span>
                  </div>
                  {!scnA && <Badge t="green">Added in {scriptB.label}</Badge>}
                  {!scnB && <Badge t="red">Removed in {scriptB.label}</Badge>}
                </div>

                {mode === 'unified' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-surface-2/50 p-3 border border-line/40">
                      <div className="mb-1.5 text-meta font-bold text-ink-2">Dialogue / Voiceover</div>
                      <DiffDisplay tokens={diaDiff} />
                    </div>
                    <div className="rounded-xl bg-surface-2/50 p-3 border border-line/40">
                      <div className="mb-1.5 text-meta font-bold text-ink-2">Visual Action</div>
                      <DiffDisplay tokens={visDiff} />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-surface-2/60 p-3 border border-line/40">
                      <div className="mb-1 text-[11px] font-bold text-ink-3 uppercase">{scriptA.label}</div>
                      <div className="text-[12px] text-ink-2 mb-1"><b>Dialogue:</b> {scnA?.dialogue || '—'}</div>
                      <div className="text-[12px] text-ink-2"><b>Visual:</b> {scnA?.visual || '—'}</div>
                    </div>
                    <div className="rounded-xl bg-primary-soft/30 p-3 border border-primary/30">
                      <div className="mb-1 text-[11px] font-bold text-primary-ink uppercase">{scriptB.label}</div>
                      <div className="text-[12px] text-ink mb-1"><b>Dialogue:</b> {scnB?.dialogue || '—'}</div>
                      <div className="text-[12px] text-ink"><b>Visual:</b> {scnB?.visual || '—'}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Direction, CTA, Duration comparison */}
        <div className="rounded-2xl border border-line/60 bg-surface p-4">
          <div className="mb-2 font-bold text-[14px] text-ink">Details &amp; Direction</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-2/40 p-2.5">
              <div className="text-meta font-bold text-ink-3">CTA</div>
              <div className="text-[13px] text-ink font-semibold">{scriptB.cta || scriptA.cta || '—'}</div>
            </div>
            <div className="rounded-xl bg-surface-2/40 p-2.5">
              <div className="text-meta font-bold text-ink-3">Music</div>
              <div className="text-[13px] text-ink font-semibold">{scriptB.music || scriptA.music || '—'}</div>
            </div>
            <div className="rounded-xl bg-surface-2/40 p-2.5">
              <div className="text-meta font-bold text-ink-3">Estimated Duration</div>
              <div className="text-[13px] text-ink font-semibold">{scriptB.duration || scriptA.duration || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
