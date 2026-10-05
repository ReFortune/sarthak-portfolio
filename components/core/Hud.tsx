"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ScrollTrigger } from "@/lib/gsap";
import { chapterStore, sectionStore, useStore } from "@/lib/store";
import { profile, sections } from "@/data/profile";

/**
 * Instrument HUD — four viewfinder ticks, a section + progress readout (bottom-left)
 * and a live local clock (bottom-right). Also the single owner of "which section
 * is active", which the header and menu read from `sectionStore`.
 */
export default function Hud() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const section = useStore(sectionStore);
  const chapter = useStore(chapterStore);
  const bar = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);

  /* active-section tracking (home only) */
  useEffect(() => {
    if (!isHome) {
      sectionStore.set({ id: "top", index: 0, progress: 0 });
      return;
    }
    const triggers: ScrollTrigger[] = [];
    const t = window.setTimeout(() => {
      document.querySelectorAll<HTMLElement>("[data-section]").forEach((el) => {
        const id = el.dataset.section!;
        const index = sections.findIndex((s) => s.id === id);
        triggers.push(
          ScrollTrigger.create({
            trigger: el,
            start: "top 55%",
            end: "bottom 55%",
            onToggle: (self) => {
              if (self.isActive) sectionStore.set((s) => ({ ...s, id, index }));
            },
          })
        );
      });
    }, 400);
    return () => {
      window.clearTimeout(t);
      triggers.forEach((tr) => tr.kill());
    };
  }, [isHome, pathname]);

  /* active-chapter tracking (case studies) */
  useEffect(() => {
    chapterStore.set(null);
    if (isHome) return;
    const triggers: ScrollTrigger[] = [];
    const t = window.setTimeout(() => {
      const els = [...document.querySelectorAll<HTMLElement>("[data-chapter]")];
      els.forEach((el, index) => {
        triggers.push(
          ScrollTrigger.create({
            trigger: el,
            start: "top 55%",
            end: "bottom 55%",
            onToggle: (self) => {
              if (self.isActive) chapterStore.set({ n: el.dataset.chapterN ?? String(index + 1).padStart(2, "0"), label: el.dataset.chapter ?? "", index, total: els.length });
            },
            // above the first chapter and below the last one, the page is just "a case study" again
            onLeaveBack: () => index === 0 && chapterStore.set(null),
            onLeave: () => index === els.length - 1 && chapterStore.set(null),
          })
        );
      });
    }, 400);
    return () => {
      window.clearTimeout(t);
      triggers.forEach((tr) => tr.kill());
      chapterStore.set(null);
    };
  }, [isHome, pathname]);

  /* scroll progress — DOM writes only, no React renders */
  useEffect(() => {
    const update = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
      if (pct.current) pct.current.textContent = `${String(Math.round(p * 100)).padStart(3, "0")}%`;
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  /* local clock */
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: profile.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const tz = new Intl.DateTimeFormat("en-CA", { timeZone: profile.timezone, timeZoneName: "short" });
    const tick = () => {
      if (!clock.current) return;
      const now = new Date();
      const zone = tz.formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "";
      clock.current.textContent = `${fmt.format(now)} ${zone}`;
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const s = sections.find((x) => x.id === section.id);

  return (
    <>
      {/* fade scrims: scrolling content dissolves under the header / HUD instead of colliding with it */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[54] h-24 bg-gradient-to-b from-ink via-ink/60 to-transparent md:h-28" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-[54] hidden h-16 bg-gradient-to-t from-ink via-ink/55 to-transparent md:block" />
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55] text-white mix-blend-difference">
      {/* viewfinder ticks */}
      {["left-3.5 top-3.5", "right-3.5 top-3.5 rotate-90", "right-3.5 bottom-3.5 rotate-180", "left-3.5 bottom-3.5 -rotate-90"].map((c) => (
        <span
          key={c}
          className={`absolute hidden h-3 w-3 border-l border-t border-white/45 md:block ${c}`}
        />
      ))}

      {/* bottom-left: where am I */}
      <div className="absolute bottom-5 left-[var(--gutter)] hidden items-center gap-4 md:flex">
        <span className="label !text-white/80 tnum">
          {isHome && s ? `${s.n} / 09 — ${s.label}` : isHome ? "00 / 09" : chapter ? `${chapter.n} / ${String(chapter.total).padStart(2, "0")} — ${chapter.label}` : "Case study"}
        </span>
        <span className="relative block h-px w-24 bg-white/20">
          <span ref={bar} className="absolute inset-0 origin-left scale-x-0 bg-white" />
        </span>
        <span ref={pct} className="label !text-white/60 tnum">000%</span>
      </div>

      {/* bottom-right: clock */}
      <div className="absolute bottom-5 right-[var(--gutter)] hidden md:block">
        <span className="label !text-white/80 tnum">
          ET · <span ref={clock}>--:--:--</span>
        </span>
      </div>
    </div>
    </>
  );
}
