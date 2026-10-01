"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Scales a single line of text so it spans its container (re-fits on resize and after fonts load). */
export default function FitText({
  children,
  className = "",
  fill = 0.985,
}: {
  children: ReactNode;
  className?: string;
  fill?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const w = wrap.current, t = text.current;
    if (!w || !t) return;
    const fit = () => {
      t.style.fontSize = "100px";
      const tw = t.getBoundingClientRect().width;
      if (tw > 0) t.style.fontSize = `${(100 * w.clientWidth * fill) / tw}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    return () => ro.disconnect();
  }, [fill]);

  return (
    <div ref={wrap} className="w-full overflow-hidden">
      <span ref={text} className={`inline-block whitespace-nowrap ${className}`}>
        {children}
      </span>
    </div>
  );
}
