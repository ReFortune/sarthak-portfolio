"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { gsap } from "@/lib/gsap";
import { useGsap } from "@/lib/hooks";

/**
 * Sticky card stack: each card pins near the top while the next slides over it; the buried
 * cards recede (scale + dim) in proportion to how far the next card has travelled.
 * Only on roomy desktop viewports — elsewhere cards simply flow.
 */
export default function ProjectStack({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGsap(root, ({ motion }) => {
    if (!motion) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px) and (min-height: 600px)", () => {
      const cards = gsap.utils.toArray<HTMLElement>("[data-stack-card]", root.current!);
      // Publish each card's height so CSS can bottom-align cards taller than the viewport
      // (sticky `top` = min(normal offset, viewport − card height − gap)).
      const ro = new ResizeObserver((entries) => {
        for (const e of entries) (e.target as HTMLElement).style.setProperty("--card-h", `${Math.round(e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height)}px`);
      });
      cards.forEach((c) => ro.observe(c));
      cards.forEach((card, i) => {
        const next = cards[i + 1];
        if (!next) return;
        const inner = card.querySelector<HTMLElement>("[data-card-inner]");
        const dim = card.querySelector<HTMLElement>("[data-card-dim]");
        const trigger = { trigger: next, start: "top 92%", end: "top 14%", scrub: true };
        // The card stays fully opaque (so the card beneath never ghosts through); it recedes by
        // shrinking slightly, softening, and being veiled by a dark overlay.
        gsap.to(inner, { scale: 0.94, filter: "blur(1.5px)", ease: "none", transformOrigin: "50% 0%", scrollTrigger: trigger });
        gsap.to(dim, { opacity: 0.62, ease: "none", scrollTrigger: trigger });
      });
      return () => ro.disconnect();
    });
    return () => mm.revert();
  }, []);

  /* Keyboard: a control inside a pinned card can end up under the card that slides over it. When focus lands on
     one that is covered, scroll back just far enough to uncover it. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onFocus = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !window.matchMedia("(min-width: 1024px) and (min-height: 600px)").matches) return;
      window.requestAnimationFrame(() => {
        const card = t.closest<HTMLElement>("[data-stack-card]");
        const r = t.getBoundingClientRect();
        if (!card || r.width === 0) return;
        const top = document.elementFromPoint(r.left + r.width / 2, Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1));
        const cover = top?.closest<HTMLElement>("[data-stack-card]");
        if (cover && cover !== card) {
          // the covering card's top edge must drop below this control (plus a little air)
          const delta = r.bottom - cover.getBoundingClientRect().top + 32;
          if (delta > 0) window.scrollTo({ top: window.scrollY - delta, behavior: "instant" as ScrollBehavior });
        }
      });
    };
    el.addEventListener("focusin", onFocus);
    return () => el.removeEventListener("focusin", onFocus);
  }, []);

  return (
    <div ref={root} className="stack space-y-10 lg:space-y-[14vh]">
      {children}
    </div>
  );
}
