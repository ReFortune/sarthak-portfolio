import type { ReactNode } from "react";

/**
 * Seamless CSS marquee (two identical tracks, compositor-only transform).
 * Pauses on hover; reduced-motion users get a static row via the global media query.
 */
export default function Marquee({
  children,
  duration = 60,
  reverse = false,
  className = "",
}: {
  children: ReactNode;
  /** Seconds for one full loop. */
  duration?: number;
  reverse?: boolean;
  className?: string;
}) {
  const style = { animationDuration: `${duration}s`, animationDirection: reverse ? "reverse" : "normal" } as const;
  return (
    <div className={`marquee flex overflow-hidden ${className}`}>
      <div className="marquee-track flex min-w-full shrink-0 items-center" style={style}>
        {children}
      </div>
      <div className="marquee-track flex min-w-full shrink-0 items-center" style={style} aria-hidden="true">
        {children}
      </div>
    </div>
  );
}
