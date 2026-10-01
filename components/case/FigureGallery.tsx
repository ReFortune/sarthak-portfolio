"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { startScroll, stopScroll } from "@/lib/scroll";

export type Fig = {
  src: string;
  alt: string;
  caption: string;
  w: number;
  h: number;
  /** Print on cream paper (white-background engineering figures). Dark images set this false. */
  paper?: boolean;
};

/** Masonry of figures with an accessible lightbox (Esc closes, ←/→ navigate, focus is trapped). */
export default function FigureGallery({ items }: { items: Fig[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const step = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + items.length) % items.length)), [items.length]);

  useEffect(() => {
    if (open === null) return;
    stopScroll();
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "Tab") {
        const f = document.querySelectorAll<HTMLElement>("#lightbox button");
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      startScroll();
      opener.current?.focus({ preventScroll: true });
    };
  }, [open, close, step]);

  const cur = open !== null ? items[open] : null;

  return (
    <>
      <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3 [&>li]:mb-4">
        {items.map((f, i) => (
          <li key={f.src} className="break-inside-avoid">
            <figure>
              <button
                type="button"
                onClick={(e) => { opener.current = e.currentTarget; setOpen(i); }}
                aria-label={`Enlarge figure: ${f.caption}`}
                data-cursor="view"
                data-cursor-label="Enlarge"
                className={`group relative block w-full overflow-hidden ${f.paper === false ? "bg-ink-3" : "paper-fig"} ticks`}
              >
                <Image
                  src={f.src}
                  alt={f.alt}
                  width={f.w}
                  height={f.h}
                  sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                  className="h-auto w-full transition-transform duration-[900ms] ease-out group-hover:scale-[1.03]"
                />
              </button>
              <figcaption className="label mt-2.5 flex gap-3 !leading-snug">
                <span className="text-laser tnum">{String(i + 1).padStart(2, "0")}</span>
                {f.caption}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>

      {cur && (
        <div
          id="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Figure viewer"
          className="fixed inset-0 z-[80] grid grid-rows-[auto_1fr_auto] bg-ink/[0.97] backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="flex items-center justify-between px-[var(--gutter)] py-5">
            <p className="label tnum">
              {String((open ?? 0) + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
            </p>
            <button ref={closeBtn} type="button" onClick={close} className="label link !text-bone">
              Close ✕
            </button>
          </div>
          <div className="relative mx-auto flex min-h-0 w-full max-w-[1500px] items-center justify-center px-[var(--gutter)]" onClick={(e) => e.target === e.currentTarget && close()}>
            <div className={`relative max-h-full max-w-full ${cur.paper === false ? "bg-ink-3" : "paper-fig"}`}>
              <Image
                key={cur.src}
                src={cur.src}
                alt={cur.alt}
                width={cur.w}
                height={cur.h}
                sizes="92vw"
                priority
                className="max-h-[calc(100svh-11rem)] w-auto max-w-full object-contain"
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-6 px-[var(--gutter)] py-5">
            <button type="button" onClick={() => step(-1)} className="label link !text-bone" aria-label="Previous figure">← Prev</button>
            <p className="label max-w-[60ch] text-center !leading-snug">{cur.caption}</p>
            <button type="button" onClick={() => step(1)} className="label link !text-bone" aria-label="Next figure">Next →</button>
          </div>
        </div>
      )}
    </>
  );
}
