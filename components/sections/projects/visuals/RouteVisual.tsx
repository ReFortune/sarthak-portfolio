"use client";

import { useEffect, useRef, useState } from "react";
import type { MarsScene, MarsStats } from "./marsScene";

/** Drag-to-rotate point-cloud Mars with the two ROUTE-M orbiters accumulating ground-track coverage. */
export default function RouteVisual() {
  const root = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const [ok, setOk] = useState(true);

  useEffect(() => {
    const el = host.current;
    const rootEl = root.current;
    if (!el || !rootEl) return;
    let disposed = false;
    let scene: MarsScene | null = null;
    const cleanups: Array<() => void> = [];

    const canvas = document.createElement("canvas");
    canvas.className = "absolute inset-0 h-full w-full";
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.cursor = "drag";
    el.appendChild(canvas);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 820;

    (async () => {
      try {
        const mod = await import("./marsScene");
        if (disposed) return;
        scene = mod.createMars(canvas, { reduced, lowPower });
        if (process.env.NODE_ENV !== "production") (window as unknown as { __mars?: MarsScene }).__mars = scene;
        scene.onStats((s: MarsStats) => {
          if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, s.coverage / 0.95)})`;
          if (pct.current) pct.current.textContent = `${Math.round(s.coverage * 100)}%`;
        });
        const io = new IntersectionObserver(([e]) => scene?.setVisible(e.isIntersecting), { rootMargin: "80px" });
        io.observe(rootEl);
        const ro = new ResizeObserver(() => scene?.resize());
        ro.observe(el);
        cleanups.push(() => { io.disconnect(); ro.disconnect(); });
      } catch (err) {
        console.warn("Mars scene unavailable:", err);
        setOk(false);
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      scene?.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div ref={root} className="absolute inset-0 bg-ink">
      <div ref={host} className="absolute inset-0" />
      {!ok && (
        <p className="label absolute inset-0 grid place-items-center px-8 text-center">
          WebGL is unavailable in this browser.
        </p>
      )}

      <div className="pointer-events-none absolute left-4 top-4 md:left-5 md:top-5">
        <p className="label">Mars · low orbit</p>
        <p className="h-display mt-1 text-[clamp(1.3rem,2vw,1.9rem)]">
          300 km <span className="serif text-[0.55em] text-bone-dim">altitude</span>
        </p>
        <p className="label mt-1 tnum">Period ≈ 113.4 min</p>
      </div>

      <ul className="pointer-events-none absolute right-4 top-4 space-y-2 text-right md:right-5 md:top-5">
        <li className="label flex items-center justify-end gap-2.5">
          ~93° near-polar · global coverage <span className="h-2 w-2 rounded-full bg-[#a8d8ff] shadow-[0_0_10px_#a8d8ff]" />
        </li>
        <li className="label flex items-center justify-end gap-2.5">
          ~45° · complementary passes <span className="h-2 w-2 rounded-full bg-laser shadow-[0_0_10px_rgb(var(--laser))]" />
        </li>
      </ul>

      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex items-end justify-between gap-6 md:inset-x-5 md:bottom-5">
        <div className="w-full max-w-[16rem]">
          <p className="label mb-2 flex items-center justify-between">
            <span>Ground-track coverage</span>
            <span ref={pct} className="label-strong tnum">0%</span>
          </p>
          <span className="relative block h-px bg-bone/20">
            <span ref={bar} className="absolute inset-0 origin-left scale-x-0 bg-laser" />
          </span>
          <p className="label mt-2 !normal-case !tracking-normal !text-bone/60">Illustrative · swath exaggerated</p>
        </div>
        <p className="label hidden !text-bone/60 sm:block">Drag to rotate</p>
      </div>
    </div>
  );
}
