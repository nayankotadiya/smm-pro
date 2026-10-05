/** Brand mark drawn inline with iOS 27 liquid squircle and neon holographic gradient */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] p-0.5 shadow-[0_4px_16px_-2px_rgba(124,58,237,0.55)] ring-1 ring-white/25 transition-transform duration-300 hover:scale-105 active:scale-95"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/30" />
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 24 24" fill="none" className="relative z-10 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
        <path d="M4 18V6h3.5l4.5 7 4.5-7H20v12h-3v-6.5l-4.5 7-4.5-7V18H4z" fill="currentColor" />
      </svg>
    </div>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="flex items-center gap-3">
      <LogoMark size={size} />
      <div className="flex flex-col">
        <span className="text-[15px] font-extrabold tracking-tight text-white">
          SMM PRO
        </span>
        <span className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
          Live
        </span>
      </div>
    </span>
  );
}

