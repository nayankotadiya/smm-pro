/**
 * Bulletproof Brands official logo components
 * Shield mark with red lightning bolt & "IMPOSSIBLE TO IGNORE" typography
 */

interface LogoMarkProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function LogoMark({ size = 32, className = '', glow = true }: LogoMarkProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative flex shrink-0 items-center justify-center transition-transform duration-300 hover:scale-105 active:scale-95 ${className}`}
    >
      {/* Subtle crimson neon glow behind shield */}
      {glow && (
        <div
          className="absolute inset-0 rounded-full bg-red-600/30 blur-md pointer-events-none -z-10 animate-pulse"
          style={{ animationDuration: '3s' }}
        />
      )}
      <img
        src="/brand/bulletproof-shield.png"
        alt="Bulletproof Brands Shield"
        className="h-full w-full object-contain"
        style={{ filter: 'drop-shadow(0 2px 6px rgba(239,68,68,0.45)) drop-shadow(0 0 1px rgba(255,255,255,0.35))' }}
        loading="eager"
        decoding="sync"
      />
    </div>
  );
}

export function Logo({ size = 36, showTagline = true }: { size?: number; showTagline?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="flex flex-col select-none leading-none">
        <span className="text-[12.5px] font-black uppercase tracking-tight text-white font-sans">
          BULLETPROOF
        </span>
        <span className="text-[12.5px] font-black uppercase tracking-tight text-white font-sans mt-0.5">
          BRANDS
        </span>
        {showTagline && (
          <span className="text-[7px] font-extrabold uppercase tracking-[0.22em] text-red-400 mt-1">
            IMPOSSIBLE TO IGNORE
          </span>
        )}
      </div>
    </span>
  );
}

export default Logo;
