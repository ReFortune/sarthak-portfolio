"use client";

import { useEffect, useRef } from "react";
import type { Label } from "@/components/world/acts/types";

/**
 * Small tags the world asks for at points of its 3-D scene: a callout on an instrument, a star's name, a year over
 * its gate. They are drawn here, in the page, so the type is the site's own and stays crisp. Each frame the world's
 * list is matched to a pool of elements by id; nothing is rendered by React.
 */
export default function Labels({ source }: { source: () => Label[] }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    const els = new Map<string, HTMLDivElement>();
    let raf = 0;

    const make = (l: Label) => {
      const el = document.createElement("div");
      const kind = l.kind ?? "tag";
      el.className = `wl wl-${kind}${kind === "tag" && l.minor ? " wl-star" : ""}`;
      el.dataset.side = l.side ?? "right";
      if (kind === "year") {
        el.innerHTML = '<span class="wl-big"></span><span class="wl-items"></span>';
      } else {
        el.innerHTML = '<span class="wl-pin"></span><span class="wl-line"></span><span class="wl-text"></span>';
      }
      return el;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden) return;
      const narrow = host.clientWidth < 900;
      const seen = new Set<string>();
      for (const l of source()) {
        const alpha = l.alpha ?? 1;
        if (!l.visible || alpha < 0.02 || (narrow && l.minor)) continue;
        seen.add(l.id);
        let el = els.get(l.id);
        if (!el) {
          el = make(l);
          host.appendChild(el);
          els.set(l.id, el);
        }
        el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`;
        el.style.opacity = alpha.toFixed(2);
        if (l.kind === "year") {
          const big = el.firstElementChild as HTMLElement, items = el.lastElementChild as HTMLElement;
          if (big.textContent !== l.text) big.textContent = l.text ?? "";
          const lines = (l.lines ?? []).join("\n");
          if (items.textContent !== lines) items.textContent = lines;
        } else {
          const t = el.lastElementChild as HTMLElement;
          const text = (narrow && l.short) || l.text || "";
          if (t.textContent !== text) t.textContent = text;
        }
      }
      for (const [id, el] of els) {
        if (!seen.has(id)) {
          el.remove();
          els.delete(id);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      host.replaceChildren();
    };
  }, [source]);

  return <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" />;
}
