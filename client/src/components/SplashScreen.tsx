import { useEffect, useState } from 'react';
import { Sparkles, Shield, Film } from 'lucide-react';
import { LogoMark } from './Logo';

interface SplashScreenProps {
  /** If the background initialization (auth/session) is ready */
  ready: boolean;
  /** Called after fade-out transition finishes to unmount */
  onFinish?: () => void;
  /** Minimum time to show splash in ms (defaults to 1100ms) */
  minDurationMs?: number;
}

export function SplashScreen({ ready, onFinish, minDurationMs = 1100 }: SplashScreenProps) {
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [fading, setFading] = useState(false);
  const [unmounted, setUnmounted] = useState(false);
  const [progress, setProgress] = useState(15);
  const [statusText, setStatusText] = useState('Initializing production studio...');

  // Smoothly increment progress
  useEffect(() => {
    const t1 = setTimeout(() => {
      setProgress(45);
      setStatusText('Syncing agency workflows...');
    }, 300);

    const t2 = setTimeout(() => {
      setProgress(78);
      setStatusText('Loading scripts & assets...');
    }, 650);

    const t3 = setTimeout(() => {
      setMinTimeElapsed(true);
    }, minDurationMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [minDurationMs]);

  // When both min time elapsed and app ready, finish progress and trigger fade-out
  useEffect(() => {
    if (minTimeElapsed && ready) {
      setProgress(100);
      setStatusText('Ready.');
      const fadeTimer = setTimeout(() => {
        setFading(true);
      }, 150);

      const unmountTimer = setTimeout(() => {
        setUnmounted(true);
        onFinish?.();
      }, 750); // matches fade transition duration

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [minTimeElapsed, ready, onFinish]);

  if (unmounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden bg-[#070A12] select-none transition-all duration-700 ease-out ${
        fading ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
      aria-label="Loading Bulletproof Brands"
    >
      {/* Background Animated Aurora Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-28 -top-28 h-[500px] w-[500px] rounded-full bg-red-600/20 blur-[130px] animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute -right-20 top-1/4 h-[420px] w-[420px] rounded-full bg-rose-500/18 blur-[130px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
        <div className="absolute bottom-0 left-1/3 h-[460px] w-[460px] rounded-full bg-amber-600/15 blur-[140px]" />
      </div>

      {/* Subtle Grid Texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Main Content Card */}
      <div className="relative z-10 flex flex-col items-center px-6 text-center max-w-sm">
        {/* Animated Brand Shield Logo with Crimson Halo */}
        <div className="relative mb-6 flex items-center justify-center">
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 opacity-40 blur-xl animate-pulse" style={{ animationDuration: '2.5s' }} />
          <div className="relative rounded-2xl p-2 ring-1 ring-white/20 shadow-[0_0_35px_rgba(239,68,68,0.45)] bg-white/5 backdrop-blur-xl">
            <LogoMark size={76} />
          </div>
        </div>

        {/* Title & Slogan */}
        <div className="flex flex-col items-center select-none mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white font-sans">
              BULLETPROOF <span className="text-red-500">BRANDS</span>
            </span>
          </div>
          <span className="mt-1 text-[10px] sm:text-[11px] font-extrabold uppercase tracking-[0.24em] text-red-400">
            IMPOSSIBLE TO IGNORE
          </span>
        </div>

        {/* System Subtitle */}
        <p className="text-[10px] font-semibold tracking-[0.16em] uppercase text-white/50 mb-7">
          BULLETPROOF SCRIPT MANAGEMENT SYSTEM
        </p>

        {/* Loading Progress Bar Container */}
        <div className="w-56 sm:w-64">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10 p-0.5 backdrop-blur-md shadow-inner">
            <div
              className="h-full rounded-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 shadow-[0_0_12px_rgba(239,68,68,0.8)] transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Micro Status Text */}
          <div className="mt-3 flex items-center justify-between text-[11px] text-white/40 font-medium">
            <span className="truncate max-w-[170px] text-left transition-all duration-200">
              {statusText}
            </span>
            <span className="font-mono text-white/50">{progress}%</span>
          </div>
        </div>

        {/* Feature Badges Footer */}
        <div className="mt-10 flex items-center gap-4 text-[11px] text-white/35 font-medium">
          <span className="flex items-center gap-1.5">
            <Film size={12} className="text-violet-400/70" />
            Scripts & Shoots
          </span>
          <span className="h-1 w-1 rounded-full bg-white/20" />
          <span className="flex items-center gap-1.5">
            <Shield size={12} className="text-indigo-400/70" />
            Role Protected
          </span>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
