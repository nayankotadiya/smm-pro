import { useState, useEffect } from 'react';
import {
  Sparkles, Copy, Check, ArrowRight, Wand2, Lightbulb,
  Layers, MessageSquare, Tag, AlertCircle, RefreshCw
} from 'lucide-react';
import { Modal, Button, Input, Textarea, Field, Select, Badge, Spinner } from '@/components/ui';
import { post, get, errMsg } from '@/lib/api';
import { toast } from '@/store/ui';

interface AiScriptModalProps {
  open: boolean;
  onClose: () => void;
  content: any;
  currentScriptText?: string;
  onInsertScript: (text: string) => void;
  onInsertCaption?: (caption: string, hashtags: string[]) => void;
}

export function AiScriptModal({
  open,
  onClose,
  content,
  currentScriptText = '',
  onInsertScript,
  onInsertCaption,
}: AiScriptModalProps) {
  const [topic, setTopic] = useState('');
  const [niche, setNiche] = useState('');
  const [tone, setTone] = useState('Viral & High-Energy Reels');
  const [language, setLanguage] = useState('Gujarati & Hinglish (Spoken)');
  const [duration, setDuration] = useState('30 Seconds Reel');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedHook, setSelectedHook] = useState<number>(1);
  const [copiedHook, setCopiedHook] = useState<number | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [viewTab, setViewTab] = useState<'script' | 'hooks' | 'caption'>('script');

  useEffect(() => {
    if (open && content) {
      setTopic(content.title || '');
      const industry = content.clientId?.industry || content.clientId?.name || '';
      setNiche(industry || 'Commercial Brand');
      if (!result) {
        setViewTab('script');
      }
    }
  }, [open, content]);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error('Please enter a topic or concept.');
      return;
    }
    setLoading(true);
    try {
      const res = await post<any>('/ai/generate-script', {
        contentId: content?._id,
        topic: topic.trim(),
        niche: niche.trim(),
        tone,
        language,
        duration,
        clientName: content?.clientId?.name || 'Our Brand',
      });
      setResult(res);
      setSelectedHook(res.hooks?.[0]?.id || 1);
      toast.success('Viral script & hooks generated!');
    } catch (err: any) {
      toast.error(errMsg(err, 'Could not generate script'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyHook = (hook: any) => {
    navigator.clipboard.writeText(hook.text);
    setCopiedHook(hook.id);
    setTimeout(() => setCopiedHook(null), 2000);
    toast.success('Hook copied to clipboard!');
  };

  const handleApplyScript = (mode: 'replace' | 'append') => {
    if (!result?.fullScriptText) return;

    let finalScript = result.fullScriptText;
    // Prepend chosen hook if available
    const activeHook = result.hooks?.find((h: any) => h.id === selectedHook);
    if (activeHook && !finalScript.includes(activeHook.text)) {
      finalScript = `[HOOK: ${activeHook.text}]\n\n` + finalScript;
    }

    if (mode === 'append' && currentScriptText.trim()) {
      onInsertScript(currentScriptText.trim() + '\n\n' + finalScript);
      toast.success('AI script added to editor!');
    } else {
      onInsertScript(finalScript);
      toast.success('Script loaded into editor!');
    }

    // Also populate caption if handler passed
    if (onInsertCaption && result.caption) {
      onInsertCaption(result.caption, result.hashtags || []);
    }

    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-purple-500 to-indigo-600 text-white shadow-xs">
            <Sparkles size={15} />
          </span>
          <span className="font-bold">AI Content Studio (Optional Helper)</span>
        </div>
      }
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <div className="text-meta text-ink-3">
            {result?.poweredBy === 'gemini' ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-500 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Powered by Google Gemini AI
              </span>
            ) : (
              <span className="text-ink-3">Optional Creative Assistant</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Close</Button>
            {result && (
              <>
                {currentScriptText.trim() ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => handleApplyScript('append')}
                    >
                      Append to Script
                    </Button>
                    <Button
                      variant="primary"
                      icon={<ArrowRight size={14} />}
                      onClick={() => handleApplyScript('replace')}
                    >
                      Replace in Editor
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    icon={<ArrowRight size={14} />}
                    onClick={() => handleApplyScript('replace')}
                  >
                    Insert into Editor
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Setup / Generator Bar */}
        <div className="rounded-xl border border-line bg-surface-2 p-3 sm:p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Video Topic / Concept">
              <Input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Lightweight gold earrings under 25k"
              />
            </Field>
            <Field label="Client Niche / Industry">
              <Input
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                placeholder="e.g. Luxury Jewellery, Fashion, Real Estate"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tone & Energy">
              <Select value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="Viral & High-Energy Reels">Viral & High-Energy Reels</option>
                <option value="Relatable Storytelling & Emotional">Relatable Storytelling</option>
                <option value="Problem-Solving & Informative">Problem-Solving & Tips</option>
                <option value="Luxury & Aesthetic">Luxury & Aesthetic</option>
                <option value="Direct Offer / Promotional">Direct Offer / Sale</option>
              </Select>
            </Field>
            <Field label="Spoken Language">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="Gujarati & Hinglish (Spoken)">Gujarati & Hinglish (Spoken)</option>
                <option value="English (Modern / Casual)">English (Modern)</option>
                <option value="Hindi & Hinglish">Hindi & Hinglish</option>
                <option value="Pure Gujarati">Pure Gujarati</option>
              </Select>
            </Field>
            <Field label="Duration">
              <Select value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="15-30 Seconds Quick Reel">15-30s Quick Reel</option>
                <option value="30-60 Seconds Short / Reel">30-60s Short / Reel</option>
                <option value="60-90 Seconds Deep Dive">60-90s Deep Dive</option>
              </Select>
            </Field>
          </div>

          <div className="flex justify-end pt-1">
            <Button
              variant="primary"
              className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-sm"
              icon={loading ? <Spinner className="!h-3.5 !w-3.5" /> : <Wand2 size={15} />}
              loading={loading}
              onClick={handleGenerate}
            >
              {loading ? 'Generating with AI…' : 'Generate Viral Script & Hooks'}
            </Button>
          </div>
        </div>

        {/* Notice banner if offline fallback template */}
        {result?.notice && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[12.5px] text-amber-700 dark:text-amber-300">
            <Lightbulb size={16} className="shrink-0 text-amber-500" />
            <span>{result.notice}</span>
          </div>
        )}

        {/* Results Showcase Area */}
        {result && (
          <div className="space-y-4">
            {/* View Sub-Tabs */}
            <div className="flex gap-2 border-b border-line pb-2">
              <button
                type="button"
                onClick={() => setViewTab('script')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewTab === 'script'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
                }`}
              >
                <Layers size={14} /> Full Script ({result.scenes?.length || 0} Scenes)
              </button>
              <button
                type="button"
                onClick={() => setViewTab('hooks')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewTab === 'hooks'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
                }`}
              >
                <Lightbulb size={14} /> 5 Viral Hooks
              </button>
              <button
                type="button"
                onClick={() => setViewTab('caption')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewTab === 'caption'
                    ? 'bg-primary text-white shadow-xs'
                    : 'bg-surface-2 text-ink-2 hover:bg-surface-3'
                }`}
              >
                <Tag size={14} /> Caption & Hashtags
              </button>
            </div>

            {/* TAB 1: 5 Viral Hooks */}
            {viewTab === 'hooks' && (
              <div className="space-y-2.5">
                <p className="text-[12px] text-ink-2">
                  Select a hook to use as your opening line, or copy it directly:
                </p>
                <div className="grid gap-2">
                  {(result.hooks || []).map((h: any) => {
                    const isSelected = selectedHook === h.id;
                    return (
                      <div
                        key={h.id}
                        onClick={() => setSelectedHook(h.id)}
                        className={`group relative flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 transition-all ${
                          isSelected
                            ? 'border-primary/50 bg-primary/10 shadow-xs ring-1 ring-primary/40'
                            : 'border-line bg-surface hover:border-line-hover hover:bg-surface-2'
                        }`}
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10.5px] font-bold text-primary-ink uppercase">
                              Hook {h.id}: {h.style}
                            </span>
                            {isSelected && (
                              <span className="text-[11px] font-bold text-primary-ink">
                                ✓ Selected
                              </span>
                            )}
                          </div>
                          <p className="text-[13.5px] font-semibold text-ink leading-snug">
                            "{h.text}"
                          </p>
                          {h.tip && (
                            <p className="text-[11.5px] text-ink-3 italic">
                              💡 {h.tip}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyHook(h);
                          }}
                          className="shrink-0 rounded-lg p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink transition-colors"
                          title="Copy Hook"
                        >
                          {copiedHook === h.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 2: Full Scene-by-Scene Script */}
            {viewTab === 'script' && (
              <div className="space-y-3">
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {(result.scenes || []).map((s: any) => (
                    <div
                      key={s.scene}
                      className="rounded-xl border border-line bg-surface p-3 space-y-1.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between text-xs font-bold text-primary-ink">
                        <span>Scene {s.scene} · {s.timing}</span>
                        {s.onScreenText && (
                          <span className="rounded bg-amber-500/15 border border-amber-500/25 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
                            Text: "{s.onScreenText}"
                          </span>
                        )}
                      </div>
                      <div className="text-[12.5px] text-ink-2">
                        <span className="font-semibold text-ink">🎥 Visual:</span> {s.visual}
                      </div>
                      <div className="rounded-lg bg-surface-2 p-2 text-[13.5px] text-ink font-medium leading-relaxed">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">🎙️ Spoken:</span> "{s.voiceover}"
                      </div>
                    </div>
                  ))}
                </div>

                {result.cta && (
                  <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-2.5 text-xs text-indigo-700 dark:text-indigo-300 flex items-center justify-between">
                    <span><b>Call to Action:</b> {result.cta.speech}</span>
                    <span className="text-[11px] opacity-80">({result.cta.visual})</span>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Caption & Hashtags */}
            {viewTab === 'caption' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-ink">Instagram / YouTube Caption</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${result.caption}\n\n${(result.hashtags || []).join(' ')}`
                        );
                        setCopiedCaption(true);
                        setTimeout(() => setCopiedCaption(false), 2000);
                        toast.success('Caption & hashtags copied!');
                      }}
                      className="flex items-center gap-1 text-[11px] font-semibold text-primary-ink hover:underline"
                    >
                      {copiedCaption ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {copiedCaption ? 'Copied!' : 'Copy all'}
                    </button>
                  </div>
                  <Textarea
                    rows={6}
                    readOnly
                    value={result.caption}
                    className="w-full text-xs font-normal"
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="text-xs font-bold text-ink">
                    Trending Hashtags ({result.hashtags?.length || 0})
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {(result.hashtags || []).map((tag: string, i: number) => (
                      <span
                        key={i}
                        className="rounded-md border border-line bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
