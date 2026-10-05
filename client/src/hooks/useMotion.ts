import { useEffect, useRef, useState } from 'react';

/** Keeps something mounted while its exit animation plays. Returns [mounted, closing]. */
export function usePresence(open: boolean, exitMs = 160): [boolean, boolean] {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return; }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => { setMounted(false); setClosing(false); }, exitMs);
    return () => window.clearTimeout(t);
  }, [open]); // eslint-disable-line
  return [mounted, closing];
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Animates a number towards its target (KPI tiles). Jumps straight there when reduced motion is requested. */
export function useCountUp(target: number, ms = 600) {
  const [v, setV] = useState(reduced() ? target : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced() || !Number.isFinite(target)) { setV(target); from.current = target; return; }
    const start = performance.now(); const a = from.current; let raf = 0;
    const tick = (now: number) => { const t = Math.min(1, (now - start) / ms); const e = 1 - Math.pow(1 - t, 3); setV(Math.round(a + (target - a) * e)); if (t < 1) raf = requestAnimationFrame(tick); else from.current = target; };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = target; };
  }, [target, ms]);
  return v;
}
