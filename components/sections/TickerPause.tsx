"use client";

import { useState } from "react";

/** WCAG 2.2.2: a button that stops the scrolling ticker (it also pauses on hover). Toggles a class on the section, so the marquee stays a server component. */
export default function TickerPause() {
  const [paused, setPaused] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={paused}
      onClick={(e) => {
        const next = !paused;
        setPaused(next);
        e.currentTarget.closest("section")?.classList.toggle("ticker-paused", next);
      }}
      className="ticker-pause label absolute right-3 top-1/2 z-10 inline-flex min-h-11 -translate-y-1/2 items-center gap-2 border border-bone/20 bg-ink/90 px-3 !text-bone hover:border-bone/50 md:right-6"
    >
      <span aria-hidden="true">{paused ? "▶" : "❚❚"}</span>
      {paused ? "Play" : "Pause"}
    </button>
  );
}
