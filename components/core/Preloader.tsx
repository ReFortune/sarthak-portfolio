"use client";

import { useEffect, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { bootStore, markBoot } from "@/lib/store";
import { getLenis } from "@/lib/scroll";

const STATUS = [
  "Initialising scan head",
  "Calibrating 905 nm emitter",
  "Loading terrain model",
  "Locking range gate",
  "Scan ready",
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * First-visit boot sequence. Progress is honest about the two things that matter —
 * web fonts and the terrain point cloud — and never blocks longer than 4.5 s.
 * Skipped for returning visitors (same session) and reduced-motion users.
 */
export default function Preloader() {
  const root = useRef<HTMLDivElement>(null);
  const num = useRef<HTMLSpanElement>(null);
  const status = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const el = root.current;
    if (!el) return;

    const finish = () => {
      el.style.display = "none";
      html.classList.remove("is-booting");
      try { sessionStorage.setItem("ss_booted", "1"); } catch { /* private mode */ }
      markBoot("done");
    };

    if (html.dataset.booted === "1" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    let cancelled = false;
    getLenis()?.stop();

    // Readiness signals
    const onHome = window.location.pathname === "/";
    if (!onHome) markBoot("scene");
    document.fonts?.ready.then(() => markBoot("fonts"));
    const ready = new Promise<void>((resolve) => {
      const check = () => {
        const s = bootStore.get();
        if (s.fonts && s.scene) resolve();
      };
      check();
      bootStore.subscribe(check);
    });

    const state = { p: 0 };
    let lastPhase = -1;
    const render = () => {
      const v = Math.min(1, state.p);
      if (num.current) num.current.textContent = String(Math.round(v * 100)).padStart(3, "0");
      if (fill.current) fill.current.style.transform = `scaleX(${v})`;
      const phase = Math.min(STATUS.length - 1, Math.floor(v * STATUS.length * 0.999));
      if (phase !== lastPhase && status.current) {
        lastPhase = phase;
        status.current.textContent = STATUS[phase];
      }
    };
    render();

    (async () => {
      // Phase 1: a believable run-up to ~80 %
      const run = gsap.to(state, { p: 0.8, duration: onHome ? 1.5 : 0.8, ease: "power2.out", onUpdate: render });
      await new Promise<void>((r) => run.eventCallback("onComplete", () => r()));
      // Phase 2: creep while the real work finishes
      const creep = gsap.to(state, { p: 0.96, duration: 4, ease: "none", onUpdate: render });
      await Promise.race([ready, sleep(4500)]);
      creep.kill();
      if (cancelled) return;
      // Phase 3: complete, then open
      await new Promise<void>((r) => gsap.to(state, { p: 1, duration: 0.45, ease: "power2.inOut", onUpdate: render, onComplete: () => r() }));
      if (cancelled) return;
      await sleep(180);

      const exit = gsap.timeline({
        onComplete: () => {
          finish();
          getLenis()?.start();
        },
      });
      exit
        .to(content.current, { yPercent: -18, autoAlpha: 0, duration: 0.55, ease: "power3.in" })
        .to(top.current, { yPercent: -100, duration: 1.05, ease: "expo.inOut" }, 0.3)
        .to(bottom.current, { yPercent: 100, duration: 1.05, ease: "expo.inOut" }, 0.3)
        .add(() => markBoot("done"), 0.62);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div ref={root} className="preloader fixed inset-0 z-[100]" role="status" aria-live="polite" aria-label="Loading">
      <div ref={top} className="absolute inset-x-0 top-0 h-1/2 bg-ink" />
      <div ref={bottom} className="absolute inset-x-0 bottom-0 h-1/2 bg-ink" />
      <div ref={content} className="absolute inset-0 flex flex-col justify-between p-[var(--gutter)]">
        <div className="flex items-start justify-between">
          <p className="label label-strong">
            Sarthak <span className="serif lowercase">Sahai</span>
          </p>
          <p className="label">Portfolio · 2026</p>
        </div>

        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="label mb-3 flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-laser [animation:blink_1s_infinite]" />
              <span ref={status}>{STATUS[0]}</span>
            </p>
            <p className="h-display tnum text-[clamp(5.5rem,24vw,20rem)] leading-[0.78]">
              <span ref={num}>000</span>
              <span className="serif align-top text-[0.28em] text-laser">%</span>
            </p>
          </div>
          <p className="label hidden max-w-[16rem] text-right sm:block">
            Space engineering. LiDAR surface mapping, stratospheric payloads, mission design.
          </p>
        </div>

        <div className="relative h-px bg-bone/15">
          <div ref={fill} className="absolute inset-0 origin-left scale-x-0 bg-laser" />
        </div>
      </div>
    </div>
  );
}
